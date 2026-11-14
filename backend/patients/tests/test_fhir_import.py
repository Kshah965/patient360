"""Importer test on a small hand-written bundle shaped like Synthea R4 output."""
import os
import tempfile

import pytest

from patients import repo
from patients.db import SCHEMA, session
from patients.fhir_import import bundle_to_record, import_bundle

RX = "http://www.nlm.nih.gov/research/umls/rxnorm"
LOINC = "http://loinc.org"


def cc(display, code="x", system="http://snomed.info/sct"):
    return {"coding": [{"system": system, "code": code, "display": display}], "text": display}


def vital(code, when, value=None, unit=None, components=None):
    r = {"resourceType": "Observation", "effectiveDateTime": when, "code": cc("v", code, LOINC),
         "category": [{"coding": [{"code": "vital-signs"}]}]}
    if components:
        r["component"] = [{"code": cc("c", c, LOINC), "valueQuantity": {"value": v}} for c, v in components]
    else:
        r["valueQuantity"] = {"value": value, "unit": unit}
    return r


BUNDLE = {"resourceType": "Bundle", "entry": [{"resource": r} for r in [
    {"resourceType": "Patient", "id": "fhir-abc", "birthDate": "1960-02-03", "gender": "female",
     "name": [{"given": ["Ada123"], "family": "Stone456"}]},
    {"resourceType": "MedicationRequest", "status": "stopped", "authoredOn": "2020-01-01T00:00:00Z",
     "medicationCodeableConcept": cc("warfarin sodium 5 MG Oral Tablet", "855332", RX),
     "dosageInstruction": [{"timing": {"repeat": {"frequency": 1, "period": 1, "periodUnit": "d"}},
                            "doseAndRate": [{"doseQuantity": {"value": 1}}]}]},
    {"resourceType": "MedicationRequest", "status": "active", "authoredOn": "2025-01-01T00:00:00Z",
     "medicationCodeableConcept": cc("warfarin sodium 5 MG Oral Tablet", "855332", RX)},
    {"resourceType": "AllergyIntolerance", "criticality": "high", "code": cc("Penicillin V"),
     "reaction": [{"manifestation": [cc("Hives (finding)")]}]},
    {"resourceType": "Condition", "code": cc("Atrial fibrillation (disorder)", "49436004"),
     "clinicalStatus": cc("active", "active"), "onsetDateTime": "2019-05-01T00:00:00Z"},
    {"resourceType": "Condition", "code": cc("Full-time employment (finding)"),
     "clinicalStatus": cc("active", "active")},
    {"resourceType": "Procedure", "code": cc("Appendectomy (procedure)"), "performedDateTime": "1990-06-01T00:00:00Z"},
    {"resourceType": "Encounter", "period": {"start": "2026-10-01T09:00:00Z"}, "type": [cc("General examination")]},
    vital("85354-9", "2026-10-01T09:00:00Z", components=[("8480-6", 130), ("8462-4", 85)]),
    vital("8867-4", "2026-10-01T09:00:00Z", 72, "/min"),
    vital("8867-4", "2025-01-01T09:00:00Z", 99, "/min"),  # older reading, dropped
    vital("8310-5", "2026-10-01T09:00:00Z", 36.9, "Cel"),
    vital("2708-6", "2026-10-01T09:00:00Z", 98, "%"),
    {"resourceType": "Observation", "effectiveDateTime": "2026-10-01T09:00:00Z", "code": cc("INR", "6301-6", LOINC),
     "category": [{"coding": [{"code": "laboratory"}]}], "valueQuantity": {"value": 2.4, "unit": "{INR}"}},
]]}


def test_bundle_to_record():
    rec = bundle_to_record(BUNDLE)
    assert rec["name"] == "Ada Stone" and rec["sex"] == "Female" and rec["fhirId"] == "fhir-abc"
    assert rec["medications"] == [{"name": "warfarin sodium 5 MG Oral Tablet", "rxcui": "855332", "dose": None,
                                   "frequency": None, "status": "active", "startedOn": "2020-01-01"}]
    assert rec["allergies"] == {"status": "documented",
                                "items": [{"substance": "Penicillin V", "reaction": "Hives", "severity": "high"}]}
    assert [c["name"] for c in rec["conditions"]] == ["Atrial fibrillation"]
    assert rec["history"][0]["description"] == "Appendectomy (1990-06-01)"
    assert {o["name"]: o["value"] for o in rec["observations"]} == {
        "blood_pressure": "130/85", "heart_rate": "72", "temperature_c": "36.9",
        "oxygen_saturation": "98", "inr": "2.4"}


def test_bundle_without_patient_is_skipped():
    assert bundle_to_record({"resourceType": "Bundle", "entry": [{"resource": {"resourceType": "Organization"}}]}) is None


@pytest.fixture
def conn():
    old = os.environ.get("MEDPROFILE_DB")
    os.environ["MEDPROFILE_DB"] = os.path.join(tempfile.mkdtemp(), "fhir_test.db")
    with session() as c:
        c.executescript(SCHEMA.read_text())
        yield c
    if old is None:
        del os.environ["MEDPROFILE_DB"]
    else:
        os.environ["MEDPROFILE_DB"] = old


def test_import_is_idempotent_and_readable(conn):
    pid = import_bundle(conn, BUNDLE)
    assert pid == "SYN-1001"
    assert import_bundle(conn, BUNDLE) is None  # same Patient.id is skipped
    p = repo.get_patient(conn, pid)
    assert p["vitals"]["bloodPressure"] == "130/85 mmHg" and p["vitals"]["recordedAt"] == "2026-10-01"
    assert p["criticalAlerts"][0]["message"].startswith("On blood thinner (warfarin")
    assert repo.get_patient_for_check(conn, pid)["medications"][0]["rxcui"] == "855332"
