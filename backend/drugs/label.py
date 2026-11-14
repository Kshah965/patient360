"""Fetch a drug's FDA label from openFDA and keep the sections the comparison shows.

Only the drug name is sent to openFDA; no patient data. The FDA notes openFDA data
is not validated for clinical decision-making, so labels are supporting
information only, never the safety engine.
"""
import re

import requests

OPENFDA = "https://api.fda.gov/drug/label.json"
DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={}"
MAX_SECTION_CHARS = 4000  # excerpt per section; the UI links to the full label

# Label field -> display name, in the order they are sent to the summarizer.
SECTIONS = {
    "indications_and_usage": "Indications and usage",
    "boxed_warning": "Boxed warning",
    "contraindications": "Contraindications",
    "warnings_and_cautions": "Warnings and precautions",
    "warnings": "Warnings",
    "adverse_reactions": "Adverse reactions",
    "mechanism_of_action": "Mechanism of action",
    "do_not_use": "Do not use",  # OTC "Drug Facts" labels
}

# Leading section heading, e.g. "1 INDICATIONS AND USAGE" or "BOXED WARNING WARNING: RISK OF ...".
HEADING = re.compile(r"^\s*[\d.]*\s*(?:[A-Z&][A-Z&/,()\-]*\s+){1,8}(?=[A-Z][a-z])")


def _fix_drop_caps(text):
    """Rejoin drop-cap splits like 'C ardiovascular' -> 'Cardiovascular'.

    Only when the joined word also appears elsewhere in the text, so real phrases
    such as 'vitamin K antagonist' or 'A patient' are left alone.
    """
    words = set(re.findall(r"[a-z]{3,}", text.lower()))

    def join(m):
        joined = m.group(1) + m.group(2)
        return joined if joined.lower() in words else m.group(0)

    return re.sub(r"\b([A-Z]) ([a-z]{2,})\b", join, text)


def _clean(text):
    text = _fix_drop_caps(re.sub(r"\s+", " ", text).strip())
    return HEADING.sub("", text, count=1).strip()


def _search(ingredient, rx_only):
    query = f'openfda.generic_name:"{ingredient}"'
    if rx_only:
        query += ' AND openfda.product_type:"HUMAN PRESCRIPTION DRUG"'
    r = requests.get(OPENFDA, params={"search": query, "sort": "effective_time:desc", "limit": 10}, timeout=15)
    if r.status_code == 404:  # openFDA answers 404 when nothing matches
        return []
    r.raise_for_status()
    return r.json().get("results", [])


def _single_ingredient(name, ingredient):
    """'sertraline hydrochloride' matches 'sertraline'; 'acetaminophen and codeine' does not."""
    name, ingredient = name.lower().strip(), ingredient.lower()
    if name == ingredient:
        return True
    return name.startswith(ingredient + " ") and " and " not in name and "," not in name


def _matches(results, ingredient):
    return [r for r in results
            if any(_single_ingredient(n, ingredient) for n in r.get("openfda", {}).get("generic_name", []))]


def _oral(results):
    return [r for r in results if "ORAL" in r.get("openfda", {}).get("route", [])]


def _pick(rx_results, all_results, ingredient):
    """Label for the ingredient alone (salt forms allowed, combination products skipped).

    Order: oral prescription, oral OTC (e.g. acetaminophen), any prescription, any.
    """
    rx, every = _matches(rx_results, ingredient), _matches(all_results, ingredient)
    for group in (_oral(rx), _oral(every), rx, every):
        if group:
            return group[0]
    return None


def fetch_label(ingredient):
    """Return the label excerpt for an ingredient, or None if openFDA has none.

    Raises requests exceptions on network errors; callers fall back to the template.
    """
    label = _pick(_search(ingredient, rx_only=True), _search(ingredient, rx_only=False), ingredient)
    if not label:
        return None
    sections = {}
    for key in SECTIONS:
        if label.get(key):
            sections[key] = _clean(" ".join(label[key]))[:MAX_SECTION_CHARS]
    if "mechanism_of_action" not in sections and label.get("clinical_pharmacology"):
        sections["mechanism_of_action"] = _clean(" ".join(label["clinical_pharmacology"]))[:MAX_SECTION_CHARS]
    openfda = label.get("openfda", {})
    set_id = label.get("set_id")
    return {
        "ingredient": ingredient,
        "setId": set_id,
        "effectiveTime": label.get("effective_time"),
        "url": DAILYMED.format(set_id) if set_id else None,
        "brandNames": sorted({b.title() for b in openfda.get("brand_name", [])})[:5],
        "drugClass": [re.sub(r"\s*\[EPC\]$", "", c) for c in openfda.get("pharm_class_epc", [])],
        "productType": (openfda.get("product_type") or [None])[0],
        "sections": sections,
    }
