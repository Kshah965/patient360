"""POST /patients/{id}/compare. Runs offline against the curated tables (no DDInter)."""
from patients.db import session


def compare(client, pid, drugs):
    return client.post(f"/patients/{pid}/compare", json={"drugs": drugs})


def by_drug(body):
    return {d["drug"]: d for d in body["drugs"]}


def test_demo_patient_side_by_side(client):
    r = compare(client, "SYN-1000", ["ibuprofen", "acetaminophen"])
    assert r.status_code == 200
    d = by_drug(r.json())
    assert [x["drug"] for x in r.json()["drugs"]] == ["ibuprofen", "acetaminophen"]  # order kept

    ibu = d["ibuprofen"]
    assert ibu["riskLevel"] == "major"
    kinds = [x["kind"] for x in ibu["reasons"]]
    assert any(x["kind"] == "interaction" and "warfarin" in x["text"].lower() for x in ibu["reasons"])
    assert kinds.count("context") == 2  # bleeding-risk stack + age 65+
    assert "boxed-warning" in kinds  # from the cached FDA label
    assert ibu["counts"]["major"] >= 1 and ibu["totalFound"] >= ibu["shown"] >= 1
    assert [a["drug"] for a in ibu["alternatives"]] == ["acetaminophen"]

    apap = d["acetaminophen"]
    assert apap["riskLevel"] == "moderate"
    assert all(x["kind"] != "boxed-warning" for x in apap["reasons"])


def test_check_ids_are_logged(client):
    body = compare(client, "SYN-1000", ["ibuprofen"]).json()
    check_id = body["drugs"][0]["checkId"]
    with session() as conn:
        row = conn.execute("SELECT drug FROM interaction_results WHERE id = ?", (check_id,)).fetchone()
    assert row["drug"] == "ibuprofen"


def test_suggestions_skip_drugs_already_compared(client):
    assert [s["drug"] for s in compare(client, "SYN-1000", ["ibuprofen"]).json()["suggestedAlternatives"]] == ["acetaminophen"]
    assert compare(client, "SYN-1000", ["ibuprofen", "acetaminophen"]).json()["suggestedAlternatives"] == []


def test_allergy_and_unknown_allergy(client):
    amox = compare(client, "SYN-1000", ["amoxicillin"]).json()["drugs"][0]
    assert amox["riskLevel"] == "major" and amox["reasons"][0]["kind"] == "allergy"

    theo = compare(client, "SYN-1004", ["amoxicillin"]).json()["drugs"][0]
    assert theo["riskLevel"] == "none-found"  # nothing in the dataset...
    notices = [x["text"] for x in theo["reasons"] if x["kind"] == "notice"]  # ...but the gaps are stated
    assert len(notices) == 2 and any("Allergy" in n for n in notices) and any("Medication list" in n for n in notices)


def test_unknown_drug_is_none_found_not_safe(client):
    body = compare(client, "SYN-1005", ["foobarzine"]).json()
    drug = body["drugs"][0]
    assert drug["riskLevel"] == "none-found" and drug["reasons"] == []
    assert "does not mean" in body["disclaimer"]


def test_duplicates_merged_by_ingredient(client):
    body = compare(client, "SYN-1000", ["ibuprofen", "Advil", "  "]).json()
    assert [d["drug"] for d in body["drugs"]] == ["ibuprofen"]


def test_validation(client):
    assert compare(client, "SYN-1000", []).status_code == 422
    assert compare(client, "SYN-1000", ["a", "b", "c", "d", "e"]).status_code == 422
    assert compare(client, "SYN-1000", ["   "]).status_code == 422
    assert compare(client, "nobody", ["ibuprofen"]).status_code == 404


def test_drug_catalog(client):
    names = {e["name"]: e["drug"] for e in client.get("/drugs").json()}
    assert names["Advil (ibuprofen)"] == "ibuprofen" and names["Coumadin (warfarin)"] == "warfarin"
    assert "Ibuprofin (ibuprofen)" not in names  # misspelling aliases are not offered
    assert [e["drug"] for e in client.get("/drugs", params={"q": "zolo"}).json()] == ["sertraline"]
