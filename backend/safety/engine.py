"""Medication safety engine: interaction + allergy checks, ranking, alternatives.

Deterministic code makes every safety decision. The LLM (owned by Person C)
only rephrases the alert JSON this module returns.
"""
import json
import os
import pathlib
import re
import sqlite3

from .rx import atc_level3, ingredient_from_rxcui, to_ingredient

DATA = pathlib.Path(__file__).parent / "data"
DB_PATH = os.getenv("MEDPROFILE_DB", str(pathlib.Path(__file__).parents[1] / "medprofile.db"))
DB = sqlite3.connect(DB_PATH, check_same_thread=False)
DB.execute("create table if not exists drug_interactions(a text, b text, severity text, source_id text)")

CURATED = {frozenset((c["a"], c["b"])): c for c in json.loads((DATA / "curated.json").read_text())}
ALTS = json.loads((DATA / "alternatives.json").read_text())

RANK = {"contraindicated": 0, "major": 1, "moderate": 2, "minor": 3}
SALTS = re.compile(r"\s+(hydrochloride|hcl|sodium|potassium|sulfate|maleate|besylate|tartrate|succinate|citrate)\b")
NSAIDS = {"ibuprofen", "naproxen", "diclofenac", "ketorolac", "meloxicam"}
BLEED = NSAIDS | {"warfarin", "aspirin", "clopidogrel", "apixaban", "rivaroxaban",
                  "sertraline", "fluoxetine", "citalopram", "escitalopram", "paroxetine"}
ALLERGY_GROUPS = {  # allergy to any member (or the group name) flags every member
    "penicillin": {"penicillin", "amoxicillin", "ampicillin", "piperacillin", "dicloxacillin", "nafcillin"},
    "nsaid": {"ibuprofen", "naproxen", "diclofenac", "ketorolac", "meloxicam", "aspirin"},
}


def same_group(allergen, drug):
    return any((allergen == g or allergen in m) and drug in m for g, m in ALLERGY_GROUPS.items())
DISCLAIMER = ("No interaction found in our dataset "
              "does not mean a combination is safe.")


FORMS = re.compile(r"\b(inhaler|tablets?|capsules?|oral|injection|solution|suspension|cream|ointment|patch|spray)\b")


def key(name):
    n = SALTS.sub("", name.lower().strip())
    return re.sub(r"\s+", " ", FORMS.sub("", n)).strip()


def med_ingredient(m):
    if m.get("rxcui"):
        _, name = ingredient_from_rxcui(m["rxcui"])
        if name:
            return key(name)
    return key(to_ingredient(m["name"])[1])


def lookup_pair(a, b):
    """DDInter first, curated table second. Curated text fills in explanation/management."""
    a, b = key(a), key(b)
    r = DB.execute(
        "select severity, source_id from drug_interactions where (a=? and b=?) or (a=? and b=?)",
        (a, b, b, a),
    ).fetchone()
    c = CURATED.get(frozenset((a, b)))
    if not r and not c:
        return None
    if c and c["severity"] == "contraindicated":
        sev = "contraindicated"
    else:
        sev = r[0] if r else c["severity"]
    return {
        "severity": sev,
        "explanation": (c or {}).get("explanation") or f"DDInter lists this combination as {sev}.",
        "management": (c or {}).get("management", "See source."),
        "source": "DDInter (CC BY-NC-SA 4.0)" if r else c["source"],
        "source_id": r[1] if r else None,
        "verified": c.get("verified", False) if c else bool(r),
    }


def interaction_alerts(med_names, drug):
    out = []
    for m in med_names:
        if m == drug:
            out.append({
                "severity": "moderate", "type": "duplication", "drugs": [drug, m],
                "explanation": f"Patient already takes {m}.",
                "management": "Confirm a second prescription is intended.",
                "source": "Therapeutic duplication check", "source_id": None, "verified": True,
            })
            continue
        hit = lookup_pair(drug, m)
        if hit:
            out.append({**hit, "type": "interaction", "drugs": [drug, m],
                        "explanation": f"{drug.title()} with {m}: {hit['explanation']}"})
    return out


def allergy_alerts(allergies, drug, drug_rx):
    out = []
    drug_cls = atc_level3(drug_rx) if drug_rx else set()
    for al in allergies:
        a_rx, a_name = to_ingredient(al["allergen"])
        a_name = key(a_name)
        exact = a_name == drug
        hit = exact or same_group(a_name, drug) or bool(drug_cls and a_rx and drug_cls & atc_level3(a_rx))
        if hit:
            sev = {"high": "major", "low": "moderate"}.get(str(al.get("severity") or "high").lower(), "major")
            reaction = f" (reaction: {al['reaction']})" if al.get("reaction") else ""
            why = "" if exact else f" {drug.title()} is in the same drug group."
            out.append({
                "severity": sev, "type": "allergy", "drugs": [drug],
                "explanation": f"Patient has a recorded allergy to {al['allergen']}{reaction}.{why}",
                "management": "Avoid unless the allergy has been evaluated.",
                "source": "Patient record (allergy list)", "source_id": None, "verified": True,
            })
    return out


def context_notes(drug, patient, med_names):
    """Explainable, patient-specific notes. They never change severity."""
    notes = []
    n = sum(m in BLEED for m in med_names)
    if drug in BLEED and n >= 2:
        notes.append(f"Patient already takes {n} drugs that raise bleeding risk (rule-based).")
    if drug in NSAIDS and patient.get("age", 0) >= 65:
        notes.append("Age 65 or older: higher NSAID bleeding and kidney risk (rule-based).")
    return notes


def check(patient, drug):
    drug_rx, drug = to_ingredient(drug)
    drug = key(drug)
    notices = []
    if patient.get("medications") is None:
        notices.append("Medication list is unavailable for this patient, so drug interactions could not be checked.")
    if patient.get("medications_incomplete"):
        notices.append("Medication list is incomplete, so interactions with unlisted medications could not be checked.")
    if patient.get("allergy_status") == "unknown":
        notices.append("Allergy information is unknown for this patient, so allergies could not be checked.")
    meds = [m for m in (patient.get("medications") or []) if m.get("status", "active") == "active"]
    names = [med_ingredient(m) for m in meds]

    alerts = sorted(
        allergy_alerts(patient.get("allergies", []), drug, drug_rx) + interaction_alerts(names, drug),
        key=lambda a: RANK[a["severity"]],
    )
    notes = context_notes(drug, patient, names)

    alternatives = []
    for alt in ALTS.get(drug, []):
        a_rx, a_name = to_ingredient(alt["drug"])
        a_name = key(a_name)
        found = allergy_alerts(patient.get("allergies", []), a_name, a_rx) + interaction_alerts(names, a_name)
        if min((RANK[f["severity"]] for f in found), default=9) <= 1:
            continue  # never suggest an alternative with a major-or-worse alert
        alternatives.append({**alt, "alerts_found": [f["explanation"] for f in found]})

    for a in alerts:
        primary = RANK[a["severity"]] <= 1
        a["priority"] = "primary" if primary else "collapsed"
        a["context"] = notes if primary else []
        a["alternatives"] = alternatives if primary else []

    return {
        "drug": drug,
        "total_found": len(alerts),
        "shown": sum(a["priority"] == "primary" for a in alerts),
        "alerts": alerts,
        "notices": notices,
        "disclaimer": DISCLAIMER,
    }
