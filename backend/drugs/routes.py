"""Drug comparison endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from patients import repo
from patients.db import get_conn

from .catalog import search
from .compare import compare
from .info import get_drug_info

router = APIRouter(tags=["drugs"])


class CompareIn(BaseModel):
    drugs: list[str] = Field(min_length=1, max_length=4)


@router.post("/patients/{pid}/compare")
def compare_drugs(pid: str, body: CompareIn, conn=Depends(get_conn)):
    """Side-by-side, patient-specific risk profile for 1-4 drugs. Deterministic, no LLM."""
    patient = repo.get_patient_for_check(conn, pid)
    if not patient:
        raise HTTPException(404, "Patient record not found.")
    if not any(d.strip() for d in body.drugs):
        raise HTTPException(422, "Give at least one drug name.")
    return compare(conn, patient, body.drugs)


@router.get("/drugs")
def list_drugs(q: str = ""):
    """Known medication names for the picker: [{name, drug}]. Any other name can still be checked."""
    return search(q)


@router.get("/drugs/{name}/info")
def drug_info(name: str):
    """FDA label facts and a cited plain-language summary. Patient-independent."""
    return get_drug_info(name)
