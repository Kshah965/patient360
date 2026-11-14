"""RxNorm / RxClass client with a SQLite cache.

- Every API response is cached in data/rx_cache.db. Commit that file before the demo.
- OFFLINE=1 forces cache-only (no network), so the demo never depends on wifi.
- A small local alias file (data/aliases.json) is checked first, so common brand
  names still resolve offline.
Check current endpoints/params in the NLM RxNav API docs before relying on them.
"""
import json
import os
import pathlib
import sqlite3

import requests

BASE = "https://rxnav.nlm.nih.gov/REST"
DATA = pathlib.Path(__file__).parent / "data"
OFFLINE = os.getenv("OFFLINE") == "1"
ALIASES = json.loads((DATA / "aliases.json").read_text())

_db = sqlite3.connect(os.getenv("RX_CACHE_DB", str(DATA / "rx_cache.db")), check_same_thread=False)
_db.execute("create table if not exists cache(k text primary key, v text)")


def cached_get(path, params=None):
    params = params or {}
    k = path + "?" + json.dumps(params, sort_keys=True)
    row = _db.execute("select v from cache where k=?", (k,)).fetchone()
    if row:
        return json.loads(row[0])
    if OFFLINE:
        return None
    try:
        r = requests.get(BASE + path, params=params, timeout=10)
        r.raise_for_status()
    except Exception:
        return None  # fail soft: callers fall back to the plain name
    data = r.json()
    _db.execute("insert or replace into cache values(?,?)", (k, json.dumps(data)))
    _db.commit()
    return data


def _ingredient_of(rxcui):
    d = cached_get(f"/rxcui/{rxcui}/related.json", {"tty": "IN"}) or {}
    groups = d.get("relatedGroup", {}).get("conceptGroup", []) or []
    props = [p for g in groups for p in (g.get("conceptProperties") or [])]
    return (props[0]["rxcui"], props[0]["name"].lower()) if props else (None, None)


def ingredient_from_rxcui(rxcui):
    """Synthea meds carry RxNorm codes (usually a specific product). Returns (ingredient_rxcui, name)."""
    return _ingredient_of(rxcui)


def to_ingredient(name):
    """Brand / generic / misspelling -> (ingredient_rxcui or None, ingredient name).

    Falls back to the lowercase input when nothing resolves.
    """
    n = name.lower().strip()
    if n in ALIASES:
        n = ALIASES[n]
    d = cached_get("/rxcui.json", {"name": n}) or {}
    ids = d.get("idGroup", {}).get("rxnormId")
    if not ids:
        a = cached_get("/approximateTerm.json", {"term": n, "maxEntries": 1}) or {}
        c = a.get("approximateGroup", {}).get("candidate", []) or []
        ids = [c[0]["rxcui"]] if c else None
    if not ids:
        return None, n
    rx, ing = _ingredient_of(ids[0])
    return (rx, ing) if rx else (ids[0], n)


def atc_level3(rxcui):
    """ATC classes at level 3 (first 4 chars, e.g. J01C = penicillins).

    Check the raw response for a known drug in your browser before trusting it.
    """
    d = cached_get("/rxclass/class/byRxcui.json", {"rxcui": rxcui, "relaSource": "ATC"}) or {}
    items = d.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", []) or []
    return {i["rxclassMinConceptItem"]["classId"][:4] for i in items}
