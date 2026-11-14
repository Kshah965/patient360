"""Critical alerts for the top of the ER summary.

Deterministic rules over the stored record. They are computed on every read,
never stored, so they always match the current data.
"""

# Matched as words inside the medication name, so 'Warfarin Sodium 5 MG Oral Tablet' matches.
DRUG_GROUPS = [
    ("anticoagulant", "high", "On blood thinner",
     {"warfarin", "apixaban", "rivaroxaban", "dabigatran", "edoxaban", "heparin", "enoxaparin"}),
    ("antiplatelet", "moderate", "On antiplatelet",
     {"aspirin", "clopidogrel", "prasugrel", "ticagrelor"}),
]

UNAVAILABLE_LABELS = {
    "medications": "Medication list unavailable",
    "conditions": "Condition list unavailable",
}

ORDER = {"high": 0, "moderate": 1}


def _words(text):
    return set(text.lower().replace("-", " ").replace("/", " ").split())


def critical_alerts(allergy_status, allergies, active_meds, unavailable):
    """allergies: rows with allergen/reaction/severity. active_meds: rows with name."""
    alerts = []

    for kind, severity, label, members in DRUG_GROUPS:
        hits = [m["name"] for m in active_meds if _words(m["name"]) & members]
        if hits:
            alerts.append({"severity": severity, "kind": kind,
                           "message": f"{label} ({', '.join(hits)})"})

    if allergy_status == "documented":
        for a in allergies:
            reaction = f" ({a['reaction']})" if a["reaction"] else ""
            alerts.append({
                "severity": "moderate" if a["severity"] == "low" else "high",
                "kind": "allergy",
                "message": f"Allergy: {a['allergen']}{reaction}",
            })
    elif allergy_status == "unknown":
        alerts.append({"severity": "moderate", "kind": "allergy-unknown",
                       "message": "Allergy status unknown"})

    for section, message in UNAVAILABLE_LABELS.items():
        if section in unavailable:
            alerts.append({"severity": "moderate", "kind": "unavailable", "message": message})

    return sorted(alerts, key=lambda a: ORDER[a["severity"]])  # stable: keeps rule order within a level
