"""Engine behavior on patient records from the patient DB (safety-engine-2).

Run from backend/:  OFFLINE=1 python -m pytest -q
"""
import os
import tempfile

os.environ.setdefault("OFFLINE", "1")
os.environ.setdefault("MEDPROFILE_DB", os.path.join(tempfile.mkdtemp(), "test.db"))
os.environ.setdefault("RX_CACHE_DB", os.path.join(tempfile.mkdtemp(), "rx.db"))

from safety.engine import check, key  # noqa: E402

OWEN = {"age": 71, "allergy_status": "none-known", "allergies": [],
        "medications": [{"name": n, "status": "active"} for n in
                        ["Warfarin", "Metoprolol tartrate", "Lisinopril", "Atorvastatin"]]}


def test_owen_ibuprofen_all_cards_have_real_text():
    r = check(OWEN, "ibuprofen")
    assert r["alerts"][0]["priority"] == "primary" and "warfarin" in r["alerts"][0]["drugs"]
    assert {d for a in r["alerts"] for d in a["drugs"]} >= {"metoprolol", "lisinopril", "atorvastatin"}
    assert all("TODO" not in a["explanation"] and a["verified"] for a in r["alerts"])
    assert r["notices"] == []


def test_dosage_form_words_ignored():
    assert key("Albuterol inhaler") == "albuterol" and key("Metoprolol tartrate") == "metoprolol"


def test_allergy_reaction_shown_and_group_match():
    p = {"allergy_status": "documented", "medications": [],
         "allergies": [{"allergen": "Amoxicillin", "reaction": "Hives and facial swelling", "severity": None}]}
    exact = check(p, "amoxicillin")["alerts"][0]
    assert exact["type"] == "allergy" and exact["severity"] == "major" and "Hives" in exact["explanation"]
    group = check(p, "ampicillin")["alerts"][0]
    assert group["type"] == "allergy" and "same drug group" in group["explanation"]


def test_nsaid_allergy_flags_other_nsaids():
    p = {"allergy_status": "documented", "medications": [], "allergies": [{"allergen": "Ibuprofen"}]}
    assert check(p, "naproxen")["alerts"][0]["type"] == "allergy"


def test_unknowns_become_notices():
    r = check({"allergy_status": "unknown", "medications": None, "allergies": []}, "ibuprofen")
    assert r["total_found"] == 0 and len(r["notices"]) == 2


def test_theo_from_db_gets_both_notices():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        r = c.post("/patients/SYN-1004/check", json={"drug": "ibuprofen"}).json()
    assert r["total_found"] == 0 and len(r["notices"]) == 2


def test_incomplete_med_list_after_prescribing_gets_notice():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        assert c.post("/patients/SYN-1004/medications", json={"name": "Acetaminophen"}).status_code == 201
        r = c.post("/patients/SYN-1004/check", json={"drug": "ibuprofen"}).json()
    assert any("incomplete" in n for n in r["notices"])
