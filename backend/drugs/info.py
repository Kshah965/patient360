"""Drug information card: FDA label facts + plain-language summary, cached per ingredient.

Lookup order: committed cache file -> live openFDA + summary (then cached) -> nothing.
With OFFLINE=1 only the cache is used, so the demo never depends on the network.
"""
import json
import logging
import os
import pathlib

import requests

from safety.engine import key
from safety.rx import to_ingredient

from .label import SECTIONS, fetch_label
from .summarize import PROMPT_VERSION, first_sentence, summarize

log = logging.getLogger(__name__)

CACHE_DIR = pathlib.Path(os.getenv("DRUG_INFO_CACHE", pathlib.Path(__file__).parent / "data" / "info_cache"))
DISCLAIMER = ("From the FDA drug label via openFDA, which the FDA says is not validated for clinical "
              "decision-making. Supporting information only; interaction findings come from DDInter "
              "and our curated tables.")


def normalize(name):
    """Brand, generic or misspelling -> ingredient name used by the safety engine."""
    return key(to_ingredient(name)[1])


def _cache_file(drug):
    return CACHE_DIR / f"{drug.replace('/', '-').replace(' ', '_')}.json"


def load_cached(drug):
    f = _cache_file(drug)
    return json.loads(f.read_text()) if f.exists() else None


def save_cached(drug, label, summary):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    entry = {"ingredient": drug, "promptVersion": PROMPT_VERSION, "label": label, "summary": summary}
    _cache_file(drug).write_text(json.dumps(entry, indent=1, ensure_ascii=False) + "\n")
    return entry


def build_entry(drug, refresh_summary=False, client=None):
    """Return the cache entry for a drug, fetching and summarizing when needed. None if no label."""
    entry = load_cached(drug)
    offline = os.getenv("OFFLINE") == "1"
    if entry and not refresh_summary:
        return entry
    if entry:  # re-summarize the cached label (e.g. template -> Claude), no openFDA call
        return save_cached(drug, entry["label"], summarize(entry["label"], client=client))
    if offline:
        return None
    try:
        label = fetch_label(drug)
    except requests.RequestException as e:
        log.warning("openFDA unavailable for %s: %s", drug, e)
        return None
    if not label:
        return None
    return save_cached(drug, label, summarize(label, client=client))


def _date(yyyymmdd):
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:8]}" if yyyymmdd and len(yyyymmdd) == 8 else None


def get_drug_info(name):
    """Info card for the UI. Always returns a dict; available=False when no label is on hand."""
    drug = normalize(name)
    entry = build_entry(drug)
    if not entry:
        return {"drug": drug, "query": name, "available": False,
                "message": "No FDA label information cached for this drug.", "disclaimer": DISCLAIMER}
    label, summary = entry["label"], entry["summary"]
    boxed = label["sections"].get("boxed_warning")
    return {
        "drug": drug,
        "query": name,
        "available": True,
        "brandNames": label.get("brandNames", []),
        "drugClass": label.get("drugClass", []),
        "productType": label.get("productType"),
        "summary": summary.get("summary"),
        "facts": summary.get("facts", []),
        "boxedWarning": first_sentence(boxed) if boxed else None,
        "sectionTitles": {k: SECTIONS.get(k, k) for k in label["sections"]},
        "source": {
            "name": "FDA drug label (openFDA)",
            "setId": label.get("setId"),
            "effectiveTime": _date(label.get("effectiveTime")),
            "url": label.get("url"),
        },
        "generatedBy": summary.get("generatedBy", "template"),
        "disclaimer": DISCLAIMER,
    }
