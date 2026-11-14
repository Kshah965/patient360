"""SQLite connection and startup setup for the patient tables.

Patient data shares backend/medprofile.db with the safety engine's
drug_interactions table, so one file holds the whole record. Override the
path with the MEDPROFILE_DB env var (the tests do).
"""
import json
import os
import pathlib
import sqlite3
from contextlib import contextmanager

HERE = pathlib.Path(__file__).parent
SCHEMA = HERE / "schema.sql"
SEED_FILE = HERE / "data" / "seed_patients.json"
DEFAULT_DB = HERE.parent / "medprofile.db"

PATIENT_TABLES = ("medications", "interaction_results", "observations", "encounters",
                  "history", "conditions", "allergies", "patients")

# Columns added to existing tables after the first release: (table, column, type).
# ensure_schema adds any that are missing, so nobody has to delete medprofile.db
# (which would also delete the DDInter data).
ADDED_COLUMNS = [
    ("medications", "prescribed_by", "TEXT"),
    ("medications", "prescribed_at", "TEXT"),
    ("medications", "check_id", "INTEGER REFERENCES interaction_results(id)"),
    ("medications", "override_reason", "TEXT"),
    ("medications", "stopped_at", "TEXT"),
]


def db_path():
    return os.getenv("MEDPROFILE_DB", str(DEFAULT_DB))


def connect():
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def session():
    """Connection that commits on success, rolls back on error, and always closes."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_conn():
    """FastAPI dependency: one connection per request."""
    with session() as conn:
        yield conn


def load_seed(conn, reset=False):
    """Insert the seed patients. With reset=True, wipe patient tables first.

    Never touches drug_interactions.
    """
    from .repo import create_patient  # local import: repo imports nothing from here at load

    if reset:
        for table in PATIENT_TABLES:
            conn.execute(f"DELETE FROM {table}")
    records = json.loads(SEED_FILE.read_text())
    for record in records:
        create_patient(conn, record, source="seed")
    return len(records)


def ensure_schema(conn):
    """Create missing tables, then add columns that older databases lack."""
    conn.executescript(SCHEMA.read_text())
    for table, column, col_type in ADDED_COLUMNS:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


def init_db():
    """Create or update tables, and seed them when there are no patients yet."""
    with session() as conn:
        ensure_schema(conn)
        if conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0] == 0:
            load_seed(conn)
