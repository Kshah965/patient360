"""Run from backend/:  OFFLINE=1 python -m pytest safety/tests -q

Behavior tests using the curated table. Once you verify severities against
DDInter / DailyMed, update the expected values to match your sources.
"""
import json
import os
import pathlib
import tempfile

os.environ["OFFLINE"] = "1"
os.environ["MEDPROFILE_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["RX_CACHE_DB"] = os.path.join(tempfile.mkdtemp(), "rx.db")

from fastapi.testclient import TestClient  # noqa: E402

from safety.dev_app import app  # noqa: E402
from safety.engine import check  # noqa: E402

PATIENT = json.loads((pathlib.Path(__file__).parents[1] / "fixtures" / "demo_patient.json").read_text())


def test_ibuprofen_one_primary_rest_collapsed():
    r = check(PATIENT, "ibuprofen")
    assert r["shown"] >= 1 and r["total_found"] > r["shown"]
    top = r["alerts"][0]
    assert top["priority"] == "primary" and "warfarin" in top["drugs"]
    assert all(a["priority"] == "collapsed" for a in r["alerts"][r["shown"]:])


def test_context_notes_on_primary():
    top = check(PATIENT, "ibuprofen")["alerts"][0]
    assert any("bleeding" in n for n in top["context"])


def test_alternative_is_rechecked_and_offered():
    alts = check(PATIENT, "ibuprofen")["alerts"][0]["alternatives"]
    assert [a["drug"] for a in alts] == ["acetaminophen"]
    assert alts[0]["alerts_found"]  # the minor warfarin note is surfaced, not hidden


def test_brand_name_and_misspelling():
    assert check(PATIENT, "Advil")["drug"] == "ibuprofen"
    assert check(PATIENT, "ibuprofin")["drug"] == "ibuprofen"


def test_penicillin_allergy():
    r = check(PATIENT, "amoxicillin")
    assert r["alerts"][0]["type"] == "allergy" and r["alerts"][0]["priority"] == "primary"


def test_contraindicated_pairs():
    p = {"medications": [{"name": "simvastatin"}, {"name": "nitroglycerin"}], "allergies": []}
    assert check(p, "clarithromycin")["alerts"][0]["severity"] == "contraindicated"
    assert check(p, "viagra")["alerts"][0]["severity"] == "contraindicated"


def test_duplication():
    r = check(PATIENT, "Coumadin")
    assert any(a["type"] == "duplication" for a in r["alerts"])


def test_unknown_drug_has_no_alerts():
    r = check(PATIENT, "foobarzine")
    assert r["total_found"] == 0 and "does not mean" in r["disclaimer"]


def test_route():
    c = TestClient(app)
    assert c.post("/patients/demo/check", json={"drug": "ibuprofen"}).status_code == 200
    assert c.post("/patients/nobody/check", json={"drug": "ibuprofen"}).status_code == 404
