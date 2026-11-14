"""Import Synthea FHIR R4 patient bundles into the patient tables.

From backend/:  python -m patients.fhir_import path/to/fhir/            (folder of bundles)
                python -m patients.fhir_import one.json two.json

Each bundle becomes one record in the same shape as seed_patients.json and goes
through repo.create_patient, so the same rules apply. Re-running skips bundles
whose Patient.id is already imported. Synthea's hospital/practitioner bundles
(no Patient resource) are skipped.
"""
import json
import pathlib
import re
import sys

from . import repo
from .db import SCHEMA, session

RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm"

# LOINC codes for the four vitals the summary card shows.
BP_PANEL, SYSTOLIC, DIASTOLIC = "85354-9", "8480-6", "8462-4"
VITAL_LOINC = {"8867-4": ("heart_rate", "bpm"), "8310-5": ("temperature_c", "°C"),
               "2708-6": ("oxygen_saturation", "%"), "59408-5": ("oxygen_saturation", "%")}
LAB_NAMES = {"6301-6": "inr"}  # friendly names for labs the app looks for

# Synthea records social/administrative items as findings or situations
# ('Full-time employment (finding)', 'Medication review due (situation)'); keep disorders.
SKIP_CONDITION_TAGS = ("(finding)", "(situation)")
SEMANTIC_TAG = re.compile(r"\s*\((disorder|finding|situation|procedure|regime/therapy)\)$")
MAX_ENCOUNTERS = 10
MAX_HISTORY = 10
PERIOD_UNITS = {"h": "hour", "d": "day", "wk": "week", "mo": "month"}


def _coding(concept, system=None):
    for c in (concept or {}).get("coding", []):
        if system is None or c.get("system") == system:
            return c
    return {}


def _display(concept):
    return (concept or {}).get("text") or _coding(concept).get("display") or ""


def _clean(text):
    return SEMANTIC_TAG.sub("", text).strip()


def _date(value):
    return value[:10] if value else None


def _name(patient):
    n = (patient.get("name") or [{}])[0]
    parts = n.get("given", []) + [n.get("family", "")]
    return " ".join(re.sub(r"\d+", "", p) for p in parts if p).strip() or "Unknown"


def _frequency(dosage):
    if dosage.get("asNeededBoolean"):
        return "As needed"
    rep = dosage.get("timing", {}).get("repeat", {})
    if not rep.get("frequency"):
        return None
    period = rep.get("period", 1)
    unit = PERIOD_UNITS.get(rep.get("periodUnit"), rep.get("periodUnit", ""))
    every = unit if period == 1 else f"{period:g} {unit}s"
    return f"{rep['frequency']} time(s) per {every}"


def _dose(dosage):
    q = ((dosage.get("doseAndRate") or [{}])[0]).get("doseQuantity") or {}
    if "value" not in q:
        return None
    return f"{q['value']:g} {q.get('unit', '')}".strip()


def _medications(resources, by_ref):
    meds = {}
    for r in sorted(resources.get("MedicationRequest", []), key=lambda r: r.get("authoredOn", "")):
        concept = r.get("medicationCodeableConcept")
        if not concept and "medicationReference" in r:
            concept = by_ref.get(r["medicationReference"].get("reference"), {}).get("code")
        rx = _coding(concept, RXNORM)
        name = rx.get("display") or _display(concept)
        if not name:
            continue
        dosage = (r.get("dosageInstruction") or [{}])[0]
        status = "active" if r.get("status") == "active" else "stopped"
        key = rx.get("code") or name
        prev = meds.get(key)
        meds[key] = {  # Synthea repeats a request per refill: keep the latest, active if any is
            "name": name, "rxcui": rx.get("code"), "dose": _dose(dosage), "frequency": _frequency(dosage),
            "status": "active" if status == "active" or (prev and prev["status"] == "active") else "stopped",
            "startedOn": (prev or {}).get("startedOn") or _date(r.get("authoredOn")),
        }
    return list(meds.values())


def _allergies(resources):
    items = []
    for r in resources.get("AllergyIntolerance", []):
        reaction = (r.get("reaction") or [{}])[0]
        manifest = _display((reaction.get("manifestation") or [{}])[0])
        items.append({
            "substance": _clean(_display(r.get("code"))) or "Unknown substance",
            "reaction": _clean(manifest) or None,
            "severity": {"high": "high", "low": "low"}.get(r.get("criticality")),
        })
    # No AllergyIntolerance resources does not prove there are none, so it stays 'unknown'.
    return {"status": "documented", "items": items} if items else {"status": "unknown", "items": []}


def _conditions(resources):
    out = {}
    for r in resources.get("Condition", []):
        raw = _display(r.get("code"))
        if not raw or raw.endswith(SKIP_CONDITION_TAGS):
            continue
        status = _coding(r.get("clinicalStatus")).get("code", "active")
        status = "active" if status in ("active", "recurrence", "relapse") else "resolved"
        name = _clean(raw)
        if name in out and out[name]["status"] == "active":
            continue
        out[name] = {"name": name, "status": status, "onsetDate": _date(r.get("onsetDateTime")),
                     "code": _coding(r.get("code")).get("code")}
    return list(out.values())


def _history(resources):
    latest = {}
    for r in resources.get("Procedure", []):
        name = _clean(_display(r.get("code")))
        when = _date(r.get("performedDateTime") or (r.get("performedPeriod") or {}).get("start"))
        if name and (name not in latest or (when or "") > (latest[name] or "")):
            latest[name] = when
    recent = sorted(latest.items(), key=lambda kv: kv[1] or "", reverse=True)[:MAX_HISTORY]
    return [{"description": f"{name} ({when})" if when else name, "occurredOn": when} for name, when in recent]


def _encounters(resources):
    out = []
    for r in resources.get("Encounter", []):
        start = _date((r.get("period") or {}).get("start"))
        if not start:
            continue
        reason = _display((r.get("reasonCode") or [{}])[0]) or _display((r.get("type") or [{}])[0])
        out.append({"date": start, "reason": _clean(reason) or "Encounter", "outcome": None})
    return sorted(out, key=lambda e: e["date"], reverse=True)[:MAX_ENCOUNTERS]


def _observations(resources):
    """Latest reading per code. Vitals use the names the summary card pivots on."""
    latest = {}
    for r in resources.get("Observation", []):
        cats = {_coding(c).get("code") for c in r.get("category", [])}
        category = "vital" if "vital-signs" in cats else "lab" if "laboratory" in cats else None
        when = r.get("effectiveDateTime") or r.get("issued")
        code = _coding(r.get("code")).get("code")
        if not category or not when or not code:
            continue
        if code == BP_PANEL:
            comps = {_coding(c.get("code")).get("code"): c.get("valueQuantity", {}).get("value")
                     for c in r.get("component", [])}
            if comps.get(SYSTOLIC) is None or comps.get(DIASTOLIC) is None:
                continue
            obs = ("blood_pressure", f"{comps[SYSTOLIC]:g}/{comps[DIASTOLIC]:g}", "mmHg")
        else:
            q = r.get("valueQuantity")
            if not q or "value" not in q:
                continue
            name, unit = VITAL_LOINC.get(code, (LAB_NAMES.get(code) or _display(r.get("code")).lower(), q.get("unit")))
            obs = (name, f"{q['value']:g}", unit)
        if code not in latest or when > latest[code]["recordedAt"]:
            latest[code] = {"recordedAt": when, "category": category, "name": obs[0],
                            "value": obs[1], "unit": obs[2]}
    return list(latest.values())


def bundle_to_record(bundle):
    """FHIR R4 Bundle -> record for repo.create_patient, or None if it has no Patient."""
    resources, by_ref = {}, {}
    for entry in bundle.get("entry", []):
        r = entry.get("resource", {})
        resources.setdefault(r.get("resourceType"), []).append(r)
        if entry.get("fullUrl"):
            by_ref[entry["fullUrl"]] = r
        if r.get("id"):
            by_ref[f"{r.get('resourceType')}/{r['id']}"] = r
    patients = resources.get("Patient", [])
    if not patients:
        return None
    p = patients[0]
    return {
        "name": _name(p),
        "dateOfBirth": p["birthDate"],
        "sex": {"male": "Male", "female": "Female"}.get(p.get("gender"), p.get("gender")),
        "allergies": _allergies(resources),
        "medications": _medications(resources, by_ref),
        "conditions": _conditions(resources),
        "history": _history(resources),
        "encounters": _encounters(resources),
        "observations": _observations(resources),
        "fhirId": p.get("id"),
    }


def import_bundle(conn, bundle):
    """Returns the new patient id, or None when skipped (no Patient, or already imported)."""
    record = bundle_to_record(bundle)
    if record is None:
        return None
    if record["fhirId"] and conn.execute("SELECT 1 FROM patients WHERE fhir_id = ?", (record["fhirId"],)).fetchone():
        return None
    return repo.create_patient(conn, record, source="synthea")


def _files(paths):
    for path in map(pathlib.Path, paths):
        yield from sorted(path.glob("*.json")) if path.is_dir() else [path]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    with session() as conn:
        conn.executescript(SCHEMA.read_text())
        for f in _files(sys.argv[1:]):
            pid = import_bundle(conn, json.loads(f.read_text()))
            print(f"{f.name}: {'imported as ' + pid if pid else 'skipped'}")
