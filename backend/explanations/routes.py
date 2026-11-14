"""Supporting routes only. Read server-owned records/check logs, never client findings."""
import copy
import json
import sqlite3
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from patients import repo
from patients.db import SCHEMA, SEED_FILE, get_conn
from .service import Explanation, explain, safety_facts, summary_facts

router = APIRouter(tags=["explanations"])


class SafetyExplanationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    check_id: int = Field(gt=0)


def _comparable(patient):
    p = copy.deepcopy(patient)
    for m in p.get("medications") or []:
        m.pop("id", None)
    return p


@lru_cache(maxsize=32)
def _canonical_patient(pid):
    """Generate approved seed projection in RAM only; never alter application data."""
    seed = next((p for p in json.loads(SEED_FILE.read_text()) if p["id"] == pid), None)
    if seed is None:
        return None
    with sqlite3.connect(":memory:") as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA.read_text())
        repo.create_patient(conn, seed, source="seed")
        return _comparable(repo.get_patient(conn, pid))


def synthetic_allowed(conn, pid, patient):
    row = conn.execute("SELECT source FROM patients WHERE id = ?", (pid,)).fetchone()
    # Source labels alone are insufficient: only an unchanged approved synthetic
    # seed projection may be sent externally. Imported/API/edited records stay local.
    return bool(row and row["source"] == "seed" and _comparable(patient) == _canonical_patient(pid))


def get_patient(conn, pid):
    patient = repo.get_patient(conn, pid)
    if not patient:
        raise HTTPException(404, "Patient record not found.")
    return patient


@router.post("/patients/{pid}/explanations/summary", response_model=Explanation)
def explain_summary(pid: str, conn=Depends(get_conn)):
    patient = get_patient(conn, pid)
    return explain(pid, "summary", summary_facts(patient), synthetic_allowed=synthetic_allowed(conn, pid, patient))


@router.post("/patients/{pid}/explanations/safety", response_model=Explanation)
def explain_safety(pid: str, body: SafetyExplanationRequest, conn=Depends(get_conn)):
    patient = get_patient(conn, pid)
    row = conn.execute("SELECT alerts_json FROM interaction_results WHERE id = ? AND patient_id = ?", (body.check_id, pid)).fetchone()
    if not row:
        raise HTTPException(404, "Safety check not found for this patient.")
    alerts = json.loads(row["alerts_json"])
    facts, omitted = safety_facts(alerts)
    return explain(pid, "safety", facts, check_id=body.check_id, omitted=omitted, synthetic_allowed=synthetic_allowed(conn, pid, patient))
