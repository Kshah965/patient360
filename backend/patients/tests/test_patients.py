"""Run from backend/:  OFFLINE=1 python -m pytest -q"""
import os
import sqlite3
import tempfile

os.environ.setdefault("OFFLINE", "1")  # read by safety.rx at import

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from patients import repo  # noqa: E402
from patients.db import session  # noqa: E402


@pytest.fixture(scope="module")
def client():
    """Fresh seeded DB for this module. Env is restored afterwards so other test modules are unaffected."""
    old = os.environ.get("MEDPROFILE_DB")
    os.environ["MEDPROFILE_DB"] = os.path.join(tempfile.mkdtemp(), "patients_test.db")
    with TestClient(app) as c:  # runs lifespan -> init_db -> seed
        yield c
    if old is None:
        del os.environ["MEDPROFILE_DB"]
    else:
        os.environ["MEDPROFILE_DB"] = old


def test_list_all_seeded(client):
    rows = client.get("/patients").json()
    assert [r["id"] for r in rows] == [f"SYN-{n}" for n in range(1000, 1008)]
    assert set(rows[0]) == {"id", "name", "dateOfBirth", "sex", "indicator"}


def test_search_by_name_and_id(client):
    assert client.get("/patients", params={"q": "  MARA "}).json()[0]["id"] == "SYN-1001"
    assert client.get("/patients", params={"q": "syn-1002"}).json()[0]["name"] == "Owen Calder"
    assert client.get("/patients", params={"q": "no such patient"}).json() == []


def test_unknown_patient_404(client):
    assert client.get("/patients/missing/summary").status_code == 404
    assert client.get("/patients/missing").status_code == 404


def test_unavailable_is_null_and_empty_is_list(client):
    theo = client.get("/patients/SYN-1004/summary").json()
    assert theo["medications"] is None and theo["conditions"] is None and theo["history"] is None
    assert theo["allergies"] == {"status": "unknown", "items": []}
    assert theo["vitals"] is None and len(theo["encounters"]) == 1

    nadia = client.get("/patients/SYN-1005").json()
    assert nadia["medications"] == [] and nadia["conditions"] == []
    assert nadia["allergies"] == {"status": "none-known", "items": []}


def test_vitals_round_trip(client):
    v = client.get("/patients/SYN-1001").json()["vitals"]
    assert v == {"recordedAt": "2026-10-22", "bloodPressure": "118/76 mmHg",
                 "heartRate": 88, "temperatureC": 36.8, "oxygenSaturation": 97}


def test_demo_patient_critical_alerts(client):
    p = client.get("/patients/SYN-1000/summary").json()
    messages = [a["message"] for a in p["criticalAlerts"]]
    assert messages[0] == "On blood thinner (Warfarin)"
    assert "Allergy: Penicillin (Hives)" in messages
    assert any(o["name"] == "inr" and o["category"] == "lab" for o in p["observations"])
    row = client.get("/patients", params={"q": "SYN-1000"}).json()[0]
    assert row["indicator"] == "On blood thinner (Warfarin)"


def test_indicator_falls_back_to_allergy_text(client):
    assert client.get("/patients", params={"q": "nadia"}).json()[0]["indicator"] == "No known allergies"
    assert client.get("/patients", params={"q": "theo"}).json()[0]["indicator"] == "Allergy status unknown"


def test_add_patient(client):
    r = client.post("/patients", json={
        "name": "Test Person", "dateOfBirth": "1990-01-01",
        "medications": [{"name": "Apixaban", "dose": "5 mg", "frequency": "Twice daily"}],
        "vitals": {"recordedAt": "2026-11-14", "heartRate": 90},
    })
    assert r.status_code == 201
    p = r.json()
    assert p["id"] == "SYN-1008"
    assert p["allergies"]["status"] == "unknown"  # missing allergy info never becomes none-known
    assert p["conditions"] is None  # not sent -> unavailable
    assert p["vitals"] is None  # partial set until the frontend allows nullable vitals
    assert [o["name"] for o in p["observations"]] == ["heart_rate"]
    assert p["criticalAlerts"][0]["message"] == "On blood thinner (Apixaban)"
    assert "SYN-1008" in [row["id"] for row in client.get("/patients").json()]


def test_add_patient_rejects_bad_input(client):
    base = {"name": "X", "dateOfBirth": "1990-01-01"}
    assert client.post("/patients", json={**base, "id": "SYN-1001"}).status_code == 409
    assert client.post("/patients", json={**base, "allergies": {"status": "documented", "items": []}}).status_code == 422
    assert client.post("/patients", json={**base, "dateOfBirth": "01/01/1990"}).status_code == 422


def test_loader_shape_for_safety_engine(client):
    with session() as conn:
        p = repo.get_patient_for_check(conn, "SYN-1000")
    assert p["age"] == repo._age("1958-05-02")
    assert {"name": "Warfarin", "rxcui": None, "status": "active"} in p["medications"]
    assert p["allergies"] == [{"allergen": "Penicillin", "severity": "high"}]


def test_check_uses_db_patient_and_logs_result(client):
    r = client.post("/patients/SYN-1000/check", json={"drug": "ibuprofen"})
    assert r.status_code == 200
    assert "warfarin" in r.json()["alerts"][0]["drugs"]
    with session() as conn:
        logged = conn.execute("SELECT drug, total_found FROM interaction_results WHERE patient_id = 'SYN-1000'").fetchall()
    assert [tuple(row) for row in logged] == [("ibuprofen", r.json()["total_found"])]

    allergy = client.post("/patients/SYN-1000/check", json={"drug": "amoxicillin"}).json()
    assert allergy["alerts"][0]["type"] == "allergy"
    assert client.post("/patients/nobody/check", json={"drug": "ibuprofen"}).status_code == 404


def test_seed_reset_keeps_drug_interactions(client):
    with session() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS drug_interactions(a text, b text, severity text, source_id text)")
        conn.execute("INSERT INTO drug_interactions VALUES ('x', 'y', 'minor', 'test')")
    from patients.db import load_seed
    with session() as conn:
        assert load_seed(conn, reset=True) == 8
        assert conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0] == 8
        assert conn.execute("SELECT COUNT(*) FROM drug_interactions WHERE source_id = 'test'").fetchone()[0] == 1


def test_foreign_keys_enforced(client):
    with session() as conn, pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO medications (patient_id, name) VALUES ('nobody', 'x')")
