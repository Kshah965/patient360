"""Patient endpoints. Shapes match frontend/src/types/clinical.ts."""
from fastapi import APIRouter, Depends, HTTPException

from . import repo
from .db import get_conn
from .models import Patient, PatientIn, PatientSummary

router = APIRouter(tags=["patients"])


@router.get("/patients", response_model=list[PatientSummary])
def search_patients(q: str = "", conn=Depends(get_conn)):
    return repo.list_patients(conn, q)


@router.post("/patients", response_model=Patient, status_code=201)
def add_patient(body: PatientIn, conn=Depends(get_conn)):
    try:
        pid = repo.create_patient(conn, body, source="api")
    except repo.DuplicatePatientError:
        raise HTTPException(409, f"patient {body.id} already exists")
    return repo.get_patient(conn, pid)


@router.get("/patients/{pid}", response_model=Patient)
@router.get("/patients/{pid}/summary", response_model=Patient)
def patient_summary(pid: str, conn=Depends(get_conn)):
    patient = repo.get_patient(conn, pid)
    if not patient:
        raise HTTPException(404, "Patient record not found.")
    return patient
