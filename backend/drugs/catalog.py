"""Names the app knows about, for the medication picker.

Built from data already in the repo: the curated interaction and alternative tables,
the brand-name aliases, the cached FDA labels, and the seed patients' medications.
Typing a name that is not listed still works: the safety engine normalizes any name.
"""
import json
import pathlib
from functools import lru_cache

from .info import CACHE_DIR, load_cached

SAFETY_DATA = pathlib.Path(__file__).parents[1] / "safety" / "data"


@lru_cache(maxsize=1)
def catalog():
    """[{name, drug}] sorted by name. `drug` is the ingredient the engine checks."""
    aliases = json.loads((SAFETY_DATA / "aliases.json").read_text())
    ingredients = set(aliases.values())
    for c in json.loads((SAFETY_DATA / "curated.json").read_text()):
        ingredients |= {c["a"], c["b"]}
    for k, alts in json.loads((SAFETY_DATA / "alternatives.json").read_text()).items():
        ingredients |= {k} | {a["drug"] for a in alts}
    ingredients |= {f.stem.replace("_", " ") for f in CACHE_DIR.glob("*.json")}

    entries = {d: {"name": d.title(), "drug": d} for d in ingredients}
    for brand, drug in aliases.items():
        # Skip misspellings and abbreviations (e.g. "ibuprofin", "asa"); keep real brand names.
        cached = load_cached(drug)
        brands = {b.lower() for b in (cached or {}).get("label", {}).get("brandNames", [])}
        if brand in brands or len(brand) > 3 and brand not in {"ibuprofin", "paracetamol"}:
            entries.setdefault(brand, {"name": f"{brand.title()} ({drug})", "drug": drug})
    return sorted(entries.values(), key=lambda e: e["name"].lower())


def search(q="", limit=50):
    term = q.strip().lower()
    hits = [e for e in catalog() if term in e["name"].lower()] if term else catalog()
    return hits[:limit]
