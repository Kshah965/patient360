"""Patient endpoints. Shapes match frontend/src/types/clinical.ts."""
from fastapi import APIRouter, Depends, HTTPException

from safety.engine import check as safety_check

from . import repo
from .db import get_conn
from .models import (MedicationRecord, MedicationStatusIn, Patient, PatientIn, PatientSummary,
                     PrescribeIn, PrescribeResult, VitalsEntryIn)

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


@router.post("/patients/{pid}/medications", response_model=PrescribeResult, status_code=201)
def prescribe(pid: str, body: PrescribeIn, conn=Depends(get_conn)):
    """Prescribe a drug. The safety check runs here, so it cannot be skipped.

    A serious (primary) alert needs an overrideReason; without one this returns
    409 with the check so the UI can show it. Every check is logged either way.
    The clinician decides; the server only records that the alert was seen.
    """
    patient = repo.get_patient_for_check(conn, pid)
    if not patient:
        raise HTTPException(404, "Patient record not found.")
    result = safety_check(patient, body.name)
    result["check_id"] = repo.log_check(conn, pid, result)

    serious = [a for a in result["alerts"] if a["priority"] == "primary"]
    if serious and not (body.overrideReason or "").strip():
        conn.commit()  # keep the logged check; the request's session rolls back on the raise
        raise HTTPException(409, detail={
            "message": "Serious alert found. Review it and give an overrideReason to prescribe anyway.",
            "check": result,
        })

    med_id = repo.add_medication(conn, pid, body, check_id=result["check_id"])
    return {"medication": repo.get_medication(conn, pid, med_id), "check": result}


@router.patch("/patients/{pid}/medications/{med_id}", response_model=MedicationRecord)
def update_medication_status(pid: str, med_id: int, body: MedicationStatusIn, conn=Depends(get_conn)):
    record = repo.set_medication_status(conn, pid, med_id, body.status)
    if not record:
        raise HTTPException(404, "Medication not found for this patient.")
    return record


@router.post("/patients/{pid}/vitals", response_model=Patient, status_code=201)
def record_vitals(pid: str, body: VitalsEntryIn, conn=Depends(get_conn)):
    """Record vitals taken at this visit. Earlier readings are kept; the summary shows the latest."""
    if not repo.get_patient(conn, pid):
        raise HTTPException(404, "Patient record not found.")
    repo.add_vitals(conn, pid, body)
    return repo.get_patient(conn, pid)
