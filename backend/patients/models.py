"""Request and response shapes.

Response models use the exact camelCase keys of frontend/src/types/clinical.ts,
so the frontend adapter is a plain fetch. Null vs empty list matters:
null = information unavailable, [] = nothing documented.
"""
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

AllergyStatus = Literal["documented", "none-known", "unknown"]


# ---------- input: POST /patients, seed file, FHIR importer ----------

class AllergyIn(BaseModel):
    substance: str
    reaction: Optional[str] = None
    severity: Optional[Literal["high", "low"]] = None


class AllergiesIn(BaseModel):
    status: AllergyStatus = "unknown"  # missing allergy info is unknown, never none-known
    items: list[AllergyIn] = []

    @model_validator(mode="after")
    def items_match_status(self):
        if self.status == "documented" and not self.items:
            raise ValueError("status 'documented' needs at least one allergy item")
        if self.status != "documented" and self.items:
            raise ValueError(f"status '{self.status}' must have no allergy items")
        return self


class MedicationIn(BaseModel):
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    rxcui: Optional[str] = None
    status: Literal["active", "stopped"] = "active"
    startedOn: Optional[str] = None


class ConditionIn(BaseModel):
    name: str
    status: Literal["active", "resolved"] = "active"
    onsetDate: Optional[str] = None
    code: Optional[str] = None


class HistoryIn(BaseModel):
    description: str
    occurredOn: Optional[str] = None


class EncounterIn(BaseModel):
    date: str
    reason: str
    outcome: Optional[str] = None


class VitalsIn(BaseModel):
    recordedAt: str
    bloodPressure: Optional[str] = None  # '118/76' or '118/76 mmHg'
    heartRate: Optional[float] = None
    temperatureC: Optional[float] = None
    oxygenSaturation: Optional[float] = None


class ObservationIn(BaseModel):
    recordedAt: str
    category: Literal["vital", "lab"]
    name: str
    value: str
    unit: Optional[str] = None


class PatientIn(BaseModel):
    id: Optional[str] = None  # server assigns the next SYN-#### when missing
    name: str
    dateOfBirth: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    sex: Optional[str] = None
    allergies: AllergiesIn = AllergiesIn()
    medications: Optional[list[MedicationIn]] = None
    conditions: Optional[list[Union[str, ConditionIn]]] = None
    history: Optional[list[Union[str, HistoryIn]]] = None
    encounters: Optional[list[EncounterIn]] = None
    vitals: Optional[VitalsIn] = None
    observations: list[ObservationIn] = []  # extra readings, e.g. labs
    fhirId: Optional[str] = None


# ---------- output ----------

class Allergy(BaseModel):
    substance: str
    reaction: str


class Allergies(BaseModel):
    status: AllergyStatus
    items: list[Allergy]


class Medication(BaseModel):
    name: str
    dose: str
    frequency: str


class Encounter(BaseModel):
    date: str
    reason: str
    outcome: str


class Vitals(BaseModel):
    recordedAt: str
    bloodPressure: str
    heartRate: float
    temperatureC: float
    oxygenSaturation: float


class Observation(BaseModel):
    recordedAt: str
    category: Literal["vital", "lab"]
    name: str
    value: str
    unit: Optional[str]


class CriticalAlert(BaseModel):
    severity: Literal["high", "moderate"]
    kind: str  # anticoagulant | antiplatelet | allergy | allergy-unknown | unavailable
    message: str


class Patient(BaseModel):
    id: str
    name: str
    dateOfBirth: str
    sex: Optional[str]
    allergies: Allergies
    medications: Optional[list[Medication]]
    conditions: Optional[list[str]]
    history: Optional[list[str]]
    encounters: Optional[list[Encounter]]
    vitals: Optional[Vitals]
    observations: list[Observation]
    criticalAlerts: list[CriticalAlert]


class PatientSummary(BaseModel):
    id: str
    name: str
    dateOfBirth: str
    sex: Optional[str]
    indicator: str
