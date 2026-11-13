"""Fill data/rx_cache.db with every drug the demo uses, so OFFLINE=1 works on stage.

From backend/ (with internet):  python -m safety.scripts.prewarm_cache
Then commit safety/data/rx_cache.db.
"""
import json
import pathlib

from safety.rx import atc_level3, to_ingredient

DATA = pathlib.Path(__file__).parents[1] / "data"
drugs = set(json.loads((DATA / "aliases.json").read_text()).values())
for c in json.loads((DATA / "curated.json").read_text()):
    drugs |= {c["a"], c["b"]}
for k, alts in json.loads((DATA / "alternatives.json").read_text()).items():
    drugs |= {k} | {a["drug"] for a in alts}
drugs |= {"penicillin", "omeprazole"}

for d in sorted(drugs):
    rx, name = to_ingredient(d)
    print(f"{d:>16} -> {name} (rxcui {rx}) ATC3 {sorted(atc_level3(rx)) if rx else []}")
