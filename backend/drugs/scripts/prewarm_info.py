"""Fill drugs/data/info_cache/ for every demo drug, so the comparison works offline.

From backend/ (needs internet):
    python -m drugs.scripts.prewarm_info                 # fetch missing labels and summarize them
    python -m drugs.scripts.prewarm_info --refresh       # re-summarize cached labels (e.g. after adding a key)
    python -m drugs.scripts.prewarm_info --only ibuprofen,acetaminophen

Summaries use Claude when ANTHROPIC_API_KEY (or an `ant auth login` profile) is set,
one call per drug; otherwise the label's own first sentences (template). Review the
JSON files, then commit them.
"""
import argparse
import json
import pathlib

from drugs.info import build_entry, normalize

SAFETY_DATA = pathlib.Path(__file__).parents[2] / "safety" / "data"
SEED = pathlib.Path(__file__).parents[2] / "patients" / "data" / "seed_patients.json"


def demo_drugs():
    drugs = set(json.loads((SAFETY_DATA / "aliases.json").read_text()).values())
    for c in json.loads((SAFETY_DATA / "curated.json").read_text()):
        drugs |= {c["a"], c["b"]}
    for k, alts in json.loads((SAFETY_DATA / "alternatives.json").read_text()).items():
        drugs |= {k} | {a["drug"] for a in alts}
    for p in json.loads(SEED.read_text()):
        drugs |= {m["name"] for m in p.get("medications") or []}
    drugs |= {"naproxen", "amoxicillin", "penicillin"}
    return sorted({normalize(d) for d in drugs})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-summarize labels that are already cached")
    ap.add_argument("--only", help="comma-separated drug names")
    args = ap.parse_args()
    names = [normalize(n) for n in args.only.split(",")] if args.only else demo_drugs()
    for drug in names:
        entry = build_entry(drug, refresh_summary=args.refresh)
        if not entry:
            print(f"{drug:>22}: no label found")
            continue
        s = entry["summary"]
        print(f"{drug:>22}: {len(entry['label']['sections'])} sections, {len(s['facts'])} facts, by {s['generatedBy']}")
