"""Prescribing: POST/PATCH /patients/{id}/medications, check_id, and schema migration.

Own module, so it gets its own seeded DB (client fixture in conftest.py).
"""
import os
import sqlite3
import tempfile

from patients.db import ensure_schema, session


def meds(client, pid):
    return client.get(f"/patients/{pid}").json()["medications"]


def test_check_returns_check_id(client):
    r = client.post("/patients/SYN-1000/check", json={"drug": "ibuprofen"}).json()
    assert isinstance(r["check_id"], int)
    assert client.post("/patients/demo/check", json={"drug": "ibuprofen"}).json()["check_id"] is None


def test_prescribe_without_serious_alert(client):
    r = client.post("/patients/SYN-1000/medications", json={
        "name": "Acetaminophen", "dose": "500 mg", "frequency": "Every 6 hours as needed",
        "prescribedBy": "Dr. Test"})
    assert r.status_code == 201
    med, check = r.json()["medication"], r.json()["check"]
    assert med["status"] == "active" and med["prescribedBy"] == "Dr. Test" and med["overrideReason"] is None
    assert med["checkId"] == check["check_id"] and med["prescribedAt"]
    assert any(m["name"] == "Acetaminophen" and m["id"] == med["id"] for m in meds(client, "SYN-1000"))
    with session() as conn:
        row = conn.execute("SELECT drug FROM interaction_results WHERE id = ?", (med["checkId"],)).fetchone()
    assert row["drug"] == "acetaminophen"


def test_serious_alert_needs_override_reason(client):
    before = len(meds(client, "SYN-1000"))
    r = client.post("/patients/SYN-1000/medications", json={"name": "ibuprofen", "overrideReason": "   "})
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "warfarin" in detail["check"]["alerts"][0]["drugs"]
    assert len(meds(client, "SYN-1000")) == before  # nothing prescribed
    with session() as conn:  # the refused attempt is still logged
        assert conn.execute("SELECT 1 FROM interaction_results WHERE id = ?",
                            (detail["check"]["check_id"],)).fetchone()

    r = client.post("/patients/SYN-1000/medications", json={
        "name": "ibuprofen", "overrideReason": "Short course; INR checked today"})
    assert r.status_code == 201
    assert r.json()["medication"]["overrideReason"] == "Short course; INR checked today"
    # Later checks see the new drug.
    again = client.post("/patients/SYN-1000/check", json={"drug": "ibuprofen"}).json()
    assert any(a["type"] == "duplication" for a in again["alerts"])


def test_allergy_alert_blocks_without_override(client):
    r = client.post("/patients/SYN-1000/medications", json={"name": "amoxicillin"})
    assert r.status_code == 409
    assert r.json()["detail"]["check"]["alerts"][0]["type"] == "allergy"


def test_prescribe_unknown_patient(client):
    assert client.post("/patients/nobody/medications", json={"name": "acetaminophen"}).status_code == 404


def test_stop_and_restart_medication(client):
    med_id = next(m["id"] for m in meds(client, "SYN-1002") if m["name"] == "Atorvastatin")
    r = client.patch(f"/patients/SYN-1002/medications/{med_id}", json={"status": "stopped"})
    assert r.status_code == 200 and r.json()["status"] == "stopped" and r.json()["stoppedAt"]
    assert "Atorvastatin" not in [m["name"] for m in meds(client, "SYN-1002")]

    r = client.patch(f"/patients/SYN-1002/medications/{med_id}", json={"status": "active"})
    assert r.json()["stoppedAt"] is None
    assert "Atorvastatin" in [m["name"] for m in meds(client, "SYN-1002")]

    assert client.patch(f"/patients/SYN-1001/medications/{med_id}", json={"status": "stopped"}).status_code == 404
    assert client.patch(f"/patients/SYN-1002/medications/{med_id}", json={"status": "paused"}).status_code == 422


def test_prescribing_for_unavailable_list_marks_it_incomplete(client):
    assert meds(client, "SYN-1004") is None
    assert client.post("/patients/SYN-1004/medications", json={"name": "Acetaminophen"}).status_code == 201
    theo = client.get("/patients/SYN-1004").json()
    assert [m["name"] for m in theo["medications"]] == ["Acetaminophen"]
    messages = [a["message"] for a in theo["criticalAlerts"]]
    assert "Medication list incomplete: outside records unavailable" in messages
    assert "Medication list unavailable" not in messages


def test_ensure_schema_adds_columns_to_old_database():
    path = os.path.join(tempfile.mkdtemp(), "old.db")
    old = sqlite3.connect(path)
    old.executescript("""
        CREATE TABLE patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, date_of_birth TEXT NOT NULL);
        CREATE TABLE medications (id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, name TEXT NOT NULL,
          rxcui TEXT, dose TEXT, frequency TEXT, status TEXT NOT NULL DEFAULT 'active', started_on TEXT);
        CREATE TABLE drug_interactions (a TEXT, b TEXT, severity TEXT, source_id TEXT);
        INSERT INTO patients VALUES ('P1', 'Old', '1950-01-01');
        INSERT INTO medications (patient_id, name) VALUES ('P1', 'Warfarin');
        INSERT INTO drug_interactions VALUES ('warfarin', 'ibuprofen', 'major', 'x');
    """)
    old.commit()
    ensure_schema(old)
    cols = {r[1] for r in old.execute("PRAGMA table_info(medications)")}
    assert {"prescribed_by", "prescribed_at", "check_id", "override_reason", "stopped_at"} <= cols
    assert old.execute("SELECT name FROM medications").fetchone()[0] == "Warfarin"
    assert old.execute("SELECT COUNT(*) FROM drug_interactions").fetchone()[0] == 1
    ensure_schema(old)  # running twice is a no-op
