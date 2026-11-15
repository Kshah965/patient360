"""GET /drugs/{name}/info and the summarizer's guardrails. No live Claude or openFDA calls."""
import json
from types import SimpleNamespace

import anthropic
import httpx2

from drugs import summarize as s
from drugs.info import load_cached

LABEL = {
    "ingredient": "examplol",
    "sections": {
        "indications_and_usage": "Examplol tablets are indicated for the relief of mild pain. Other text here.",
        "boxed_warning": "Examplol may cause serious bleeding in some patients.",
        "adverse_reactions": "Intro sentence. The most common adverse reactions are nausea and headache.",
    },
}


def fake_client(response=None, error=None, calls=None):
    def create(**kwargs):
        if calls is not None:
            calls.append(kwargs)
        if error:
            raise error
        return response
    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))


def reply(payload, stop_reason="end_turn", model="claude-opus-5-5"):
    return SimpleNamespace(stop_reason=stop_reason, model=model,
                           content=[SimpleNamespace(type="text", text=json.dumps(payload))])


GOOD = {"text": "Used for mild pain.", "section": "indications_and_usage",
        "quote": "indicated for the relief of mild pain"}


# ---------- endpoint, served from the committed cache (OFFLINE=1 in tests) ----------

def test_info_from_committed_cache(client):
    info = client.get("/drugs/ibuprofen/info").json()
    assert info["available"] and info["drug"] == "ibuprofen"
    assert info["generatedBy"] in ("template", s.MODEL)
    assert info["boxedWarning"] and info["source"]["url"].startswith("https://dailymed.nlm.nih.gov/")
    assert "not validated for clinical" in info["disclaimer"]
    sections = load_cached("ibuprofen")["label"]["sections"]
    for item in [info["summary"], *info["facts"]]:  # every statement is backed by its cited section
        assert s.quote_ok(s.Cited(**{k: item[k] for k in ("text", "section", "quote")}), sections)


def test_brand_name_resolves(client):
    assert client.get("/drugs/Advil/info").json()["drug"] == "ibuprofen"


def test_uncached_drug_offline(client):
    info = client.get("/drugs/foobarzine/info").json()
    assert info["available"] is False and "No FDA label" in info["message"]


# ---------- summarizer ----------

def test_claude_request_shape_and_quote_check():
    calls = []
    payload = {"summary": GOOD, "facts": [
        {"topic": "boxed_warning", "text": "Can cause serious bleeding.", "section": "boxed_warning",
         "quote": "may cause serious bleeding in some patients"},
        {"topic": "warnings", "text": "Made up.", "section": "boxed_warning",
         "quote": "causes liver failure in everyone"},  # not in the label -> dropped
        {"topic": "common_side_effects", "text": "Nausea and headache.", "section": "adverse_reactions",
         "quote": "short"},  # too short to count as a quote -> dropped
    ]}
    out = s.summarize(LABEL, client=fake_client(reply(payload), calls=calls))
    assert out["generatedBy"] == "claude-opus-5-5"
    assert [f["topic"] for f in out["facts"]] == ["boxed_warning"]
    assert out["summary"]["text"] == "Used for mild pain."

    req = calls[0]
    assert req["model"] == "claude-opus-5-5" and req["fallbacks"] == "default"
    assert req["output_config"]["effort"] == "low"
    schema = req["output_config"]["format"]["schema"]
    assert schema["properties"]["summary"]["properties"]["section"]["enum"] == list(LABEL["sections"])
    assert "examplol" in req["messages"][0]["content"]


def test_unverified_summary_replaced_by_label_sentence():
    payload = {"summary": {**GOOD, "quote": "the best painkiller ever made"}, "facts": [
        {"topic": "boxed_warning", "text": "Bleeding.", "section": "boxed_warning",
         "quote": "may cause serious bleeding"}]}
    out = s.summarize(LABEL, client=fake_client(reply(payload)))
    assert out["summary"]["text"] == "Examplol tablets are indicated for the relief of mild pain."
    assert len(out["facts"]) == 1


def test_fallbacks_to_template():
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    cases = [
        fake_client(reply({"summary": GOOD, "facts": []}, stop_reason="refusal")),
        fake_client(reply({"summary": GOOD, "facts": []}, stop_reason="max_tokens")),
        fake_client(error=anthropic.APITimeoutError(request=request)),
        fake_client(SimpleNamespace(stop_reason="end_turn", model="m", content=[SimpleNamespace(type="text", text="{oops")])),
        fake_client(reply({"summary": {**GOOD, "quote": "nothing like the label"}, "facts": []})),
    ]
    for client in cases:
        out = s.summarize(LABEL, client=client)
        assert out["generatedBy"] == "template"
        assert out["summary"]["section"] == "indications_and_usage"


def test_template_prefers_key_sentences():
    out = s.template_summary(LABEL)
    facts = {f["topic"]: f["text"] for f in out["facts"]}
    assert facts["common_side_effects"] == "The most common adverse reactions are nausea and headache."
    assert facts["boxed_warning"].startswith("Examplol may cause serious bleeding")
    assert all(s.quote_ok(s.Cited(text=f["text"], section=f["section"], quote=f["quote"]), LABEL["sections"])
               for f in out["facts"])


def test_no_label_means_no_summary():
    assert s.summarize(None) == {"summary": None, "facts": [], "generatedBy": "template"}


# ---------- label parsing ----------

def test_label_text_cleanup():
    from drugs.label import _clean
    assert _clean("1 INDICATIONS & USAGE Examplol is indicated for pain.") == "Examplol is indicated for pain."
    fixed = _clean("EVENTS C ardiovascular Thrombotic Events N onsteroidal drugs raise cardiovascular risk. Nonsteroidal.")
    assert "Cardiovascular Thrombotic Events Nonsteroidal drugs" in fixed
    kept = "Vitamin K antagonists such as warfarin. A patient may bleed."
    assert _clean(kept) == kept  # real one-letter words are not joined


def test_label_choice_prefers_single_ingredient_oral():
    from drugs.label import _pick

    def lab(name, route, n):
        return {"n": n, "openfda": {"generic_name": [name], "route": [route]}}

    rx = [lab("ACETAMINOPHEN AND CODEINE", "ORAL", 1), lab("ACETAMINOPHEN", "INTRAVENOUS", 2)]
    every = [*rx, lab("ACETAMINOPHEN", "ORAL", 3)]
    assert _pick(rx, every, "acetaminophen")["n"] == 3  # oral OTC beats IV prescription
    assert _pick([lab("SERTRALINE HYDROCHLORIDE", "ORAL", 4)], [], "sertraline")["n"] == 4  # salt form ok
    assert _pick([lab("ACETAMINOPHEN AND CODEINE", "ORAL", 1)], [], "acetaminophen") is None
