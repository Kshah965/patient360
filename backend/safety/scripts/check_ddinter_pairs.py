"""Hour-1 gate: do our demo pairs exist in DDInter?

1. Download the interaction CSVs from the DDInter 2.0 downloads page into safety/data/ddinter/
2. From backend/:  python -m safety.scripts.check_ddinter_pairs
It prints the column names first. If they are not Drug_A / Drug_B / Level, edit COLS below.
"""
import glob
import pathlib

import pandas as pd

COLS = {"a": "Drug_A", "b": "Drug_B", "level": "Level"}
FILES = glob.glob(str(pathlib.Path(__file__).parents[1] / "data" / "ddinter" / "*.csv"))
PAIRS = [("warfarin", "ibuprofen"), ("warfarin", "sertraline"), ("warfarin", "aspirin"), ("ibuprofen", "aspirin"),
         ("ibuprofen", "sertraline"), ("ibuprofen", "lisinopril"), ("warfarin", "acetaminophen"),
         ("simvastatin", "clarithromycin"), ("sertraline", "tramadol"), ("sildenafil", "nitroglycerin"),
         ("lisinopril", "spironolactone"), ("clopidogrel", "omeprazole")]

if not FILES:
    raise SystemExit("No CSVs in safety/data/ddinter/. Download them first.")
df = pd.concat(pd.read_csv(f) for f in FILES)
print("columns:", df.columns.tolist(), "| rows:", len(df))
a = df[COLS["a"]].str.lower().str.strip()
b = df[COLS["b"]].str.lower().str.strip()
for x, y in PAIRS:
    m = df[((a == x) & (b == y)) | ((a == y) & (b == x))]
    print(f"{x:>14} + {y:<15} ->", m[COLS["level"]].unique().tolist() or "NOT FOUND (add to curated.json)")
