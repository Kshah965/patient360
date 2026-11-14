"""Reset the patient tables and reload data/seed_patients.json.

From backend/:  python -m patients.seed
Leaves drug_interactions (DDInter) untouched.
"""
from .db import db_path, ensure_schema, load_seed, session

if __name__ == "__main__":
    with session() as conn:
        ensure_schema(conn)
        n = load_seed(conn, reset=True)
    print(n, "patients loaded into", db_path())
