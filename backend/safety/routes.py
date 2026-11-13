"""POST /patients/{pid}/check

Person A: include this router in the main FastAPI app with
    from safety.routes import router as safety_router
    app.include_router(safety_router)
and replace get_patient() below with your loader. It must return:
    {"age": int, "medications": [{"name", "rxcui", "status"}], "allergies": [{"allergen", "severity"}]}
"""
import json
import pathlib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .engine import check

router = APIRouter()
FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "demo_patient.json"


class CheckReq(BaseModel):
    drug: str


def get_patient(pid):  # TEMP stub until Person A's loader exists
    return json.loads(FIXTURE.read_text()) if pid == "demo" else None


@router.post("/patients/{pid}/check")
def check_route(pid: str, req: CheckReq):
    patient = get_patient(pid)
    if not patient:
        raise HTTPException(404, "patient not found")
    return check(patient, req.drug)
