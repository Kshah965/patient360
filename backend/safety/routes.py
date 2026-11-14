"""POST /patients/{pid}/check

Included in the main app (backend/main.py). Patients are loaded from the
patient tables by patients.repo.get_patient_for_check, which returns:
    {"age": int, "medications": [{"name", "rxcui", "status"}], "allergies": [{"allergen", "severity"}]}
The id "demo" still loads fixtures/demo_patient.json, so this works without a seeded DB.
"""
import json
import pathlib
import sqlite3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from patients import repo
from patients.db import session

from .engine import check

router = APIRouter()
FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "demo_patient.json"


class CheckReq(BaseModel):
    drug: str


def get_patient(pid):
    if pid == "demo":
        return json.loads(FIXTURE.read_text())
    try:
        with session() as conn:
            return repo.get_patient_for_check(conn, pid)
    except sqlite3.OperationalError:  # patient tables not created yet (e.g. safety dev_app alone)
        return None


def log_result(pid, result):
    try:
        with session() as conn:
            repo.log_check(conn, pid, result)
    except sqlite3.OperationalError:
        pass  # logging must never break a check


@router.post("/patients/{pid}/check")
def check_route(pid: str, req: CheckReq):
    patient = get_patient(pid)
    if not patient:
        raise HTTPException(404, "patient not found")
    result = check(patient, req.drug)
    log_result(pid, result)
    return result
