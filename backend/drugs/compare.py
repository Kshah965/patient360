"""Patient-specific risk profile for each drug in a side-by-side comparison.

Deterministic: the level and every reason come from the safety engine, the
patient record and (for boxed warnings) the cached FDA label. Nothing here calls
an LLM or the network.
"""
from patients import repo
from safety import engine

from .info import load_cached, normalize
from .summarize import first_sentence

LEVELS = ["contraindicated", "major", "moderate", "minor"]
LABEL_SOURCE = "FDA drug label (openFDA)"


def _risk_level(alerts):
    found = {a["severity"] for a in alerts}
    return next((lvl for lvl in LEVELS if lvl in found), "none-found")


def risk_profile(conn, patient, query):
    """Run the safety check for one drug and turn it into a level + reasons."""
    result = engine.check(patient, query)
    drug = result["drug"]
    check_id = repo.log_check(conn, patient["id"], result)
    alerts = result["alerts"]

    reasons = [{
        "kind": a["type"],  # interaction | allergy | duplication
        "severity": a["severity"],
        "priority": a["priority"],
        "text": a["explanation"],
        "management": a.get("management"),
        "source": a["source"],
    } for a in alerts]

    if patient.get("allergy_status") == "unknown":
        reasons.append({"kind": "allergy-unknown", "severity": None, "priority": "primary",
                        "text": "Allergy status unknown: allergy check not possible.",
                        "management": "Confirm allergies with the patient or outside records before prescribing.",
                        "source": "Patient record"})

    active = [m for m in patient["medications"] if m.get("status", "active") == "active"]
    for note in engine.context_notes(drug, patient, [engine.med_ingredient(m) for m in active]):
        reasons.append({"kind": "context", "severity": None, "priority": "primary", "text": note,
                        "management": None, "source": "Patient record (prototype heuristic)"})

    cached = load_cached(drug)
    boxed = cached and cached["label"]["sections"].get("boxed_warning")
    if boxed:  # drug-wide label information: shown as a reason, never changes the level
        reasons.append({"kind": "boxed-warning", "severity": None, "priority": "primary",
                        "text": f"FDA boxed warning: {first_sentence(boxed)}",
                        "management": None, "source": LABEL_SOURCE})

    primary = next((a for a in alerts if a["priority"] == "primary"), None)
    return {
        "query": query,
        "drug": drug,
        "riskLevel": _risk_level(alerts),
        "reasons": reasons,
        "counts": {lvl: sum(a["severity"] == lvl for a in alerts) for lvl in LEVELS},
        "shown": result["shown"],
        "totalFound": result["total_found"],
        "checkId": check_id,
        "alerts": alerts,
        "alternatives": primary["alternatives"] if primary else [],
    }


def compare(conn, patient, queries):
    """Risk profiles in the order given, one per ingredient (duplicates by ingredient are merged)."""
    seen, profiles = set(), []
    for q in queries:
        q = q.strip()
        if not q or normalize(q) in seen:
            continue
        seen.add(normalize(q))
        profiles.append(risk_profile(conn, patient, q))

    first = profiles[0] if profiles else None
    suggestions = []
    if first:
        alts = first["alternatives"] or engine.ALTS.get(first["drug"], [])
        suggestions = [{"drug": a["drug"], "indication": a.get("indication"), "rationale": a.get("rationale")}
                       for a in alts if a["drug"] not in seen]
    return {"patientId": patient["id"], "drugs": profiles, "suggestedAlternatives": suggestions,
            "disclaimer": engine.DISCLAIMER}
