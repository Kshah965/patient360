"""Load DDInter CSVs into the drug_interactions table of backend/medprofile.db.

From backend/:  python -m safety.scripts.load_ddinter
Edit COLS to match the column names printed by check_ddinter_pairs.
"""
import glob
import os
import pathlib
import re
import sqlite3

import pandas as pd

COLS = {"a": "Drug_A", "b": "Drug_B", "level": "Level", "id_a": "DDInterID_A", "id_b": "DDInterID_B"}
SALTS = re.compile(r"\s+(hydrochloride|hcl|sodium|potassium|sulfate|maleate|besylate|tartrate|succinate|citrate)\b")
LEVEL = {"major": "major", "moderate": "moderate", "minor": "minor", "unknown": "minor"}
HERE = pathlib.Path(__file__).parents[1]
DB_PATH = os.getenv("MEDPROFILE_DB", str(HERE.parent / "medprofile.db"))


RENAME = {"acetylsalicylic acid": "aspirin"}


def key(n):
    k = SALTS.sub("", str(n).lower().strip())
    return RENAME.get(k, k)


df = pd.concat(pd.read_csv(f) for f in glob.glob(str(HERE / "data" / "ddinter" / "*.csv")))
rows = {}
for r in df.to_dict("records"):
    a, b = key(r[COLS["a"]]), key(r[COLS["b"]])
    if a == b:
        continue
    sid = f"{r.get(COLS['id_a'], '')}-{r.get(COLS['id_b'], '')}"
    rows[(a, b)] = (LEVEL.get(str(r[COLS["level"]]).lower(), "minor"), sid)

db = sqlite3.connect(DB_PATH)
db.execute("drop table if exists drug_interactions")
db.execute("create table drug_interactions(a text, b text, severity text, source_id text)")
db.executemany("insert into drug_interactions values (?,?,?,?)", [(a, b, s, i) for (a, b), (s, i) in rows.items()])
db.execute("create index ix_pair on drug_interactions(a, b)")
db.commit()
print(len(rows), "pairs loaded into", DB_PATH)
