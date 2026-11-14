"""Plain-language drug description from FDA label text.

Claude summarizes only the label excerpt it is given (never its own knowledge),
and every statement carries a verbatim quote from the section it cites. The
server checks each quote against that section and drops anything that fails.
If Claude is unavailable, refuses, or nothing passes the check, a template built
from the label's own first sentences is used instead. Only label text and the
drug name are sent; no patient data.
"""
import json
import logging
import os
import re

from pydantic import BaseModel, ValidationError

from .label import SECTIONS

log = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
PROMPT_VERSION = 1  # bump when the prompt or schema changes; cached summaries are regenerated
MAX_FACTS = 6
MIN_QUOTE_CHARS = 15
TOPICS = ["uses", "how_it_works", "boxed_warning", "contraindications", "warnings", "common_side_effects"]

SYSTEM = """You summarize FDA drug label excerpts for clinicians in an emergency department.

Rules:
- Use only the label text provided in the user message. Do not add anything from your own knowledge.
- Every statement must cite the one section it comes from and include a short verbatim quote (one sentence or less) copied exactly from that section.
- Write in plain language, one or two short sentences per statement.
- Do not give dosing advice or advice about any specific patient.
- Never describe a drug, or a combination of drugs, as safe.
- If the label does not cover a topic, leave that topic out.

Return a one-sentence summary of what the drug is and what it is used for, and up to six key facts covering, where the label has them: uses, how it works, boxed warning, contraindications, warnings, and common side effects."""

# Template: label section -> fact topic.
TEMPLATE_TOPICS = [
    ("boxed_warning", "boxed_warning"),
    ("contraindications", "contraindications"),
    ("do_not_use", "contraindications"),
    ("warnings_and_cautions", "warnings"),
    ("warnings", "warnings"),
    ("adverse_reactions", "common_side_effects"),
    ("mechanism_of_action", "how_it_works"),
]
SENTENCE_END = re.compile(r"(?<=[a-z0-9)\]][.!?])\s+(?=[A-Z])")


class Cited(BaseModel):
    text: str
    section: str
    quote: str


class Fact(Cited):
    topic: str


class Summary(BaseModel):
    summary: Cited
    facts: list[Fact]


def _norm(text):
    text = text.lower().replace("’", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip(" .")


def quote_ok(item, sections):
    """True if the quote is long enough and appears verbatim in the section it cites."""
    quote = _norm(item.quote)
    return (item.section in sections and len(quote) >= MIN_QUOTE_CHARS
            and quote in _norm(sections[item.section]))


# Template prefers the first sentence containing one of these words, so it skips
# boilerplate like "Carefully consider the potential benefits and risks...".
KEY_WORDS = {
    "indications_and_usage": ("indicated", "used for", "used to", "treatment of", "relief of"),
    "contraindications": ("contraindicated", "do not use"),
    "adverse_reactions": ("most common", "most frequent", "most commonly"),
}


def _shorten(sentence, limit):
    return sentence if len(sentence) <= limit else sentence[:limit].rsplit(" ", 1)[0] + "…"


def first_sentence(text, limit=300):
    return _shorten(SENTENCE_END.split(text, maxsplit=1)[0].strip(), limit)


def key_sentence(text, section, limit=300):
    """First sentence with a key word for this section (within the first 20), else the first sentence."""
    words = KEY_WORDS.get(section)
    if words:
        for sentence in SENTENCE_END.split(text)[:20]:
            if any(w in sentence.lower() for w in words):
                return _shorten(sentence.strip(), limit)
    return first_sentence(text, limit)


def template_summary(label):
    """Deterministic fallback: sentences copied from the label, each tagged with its section."""
    sections = label["sections"]
    summary = None
    if "indications_and_usage" in sections:
        s = key_sentence(sections["indications_and_usage"], "indications_and_usage")
        summary = {"text": s, "section": "indications_and_usage", "quote": s}
    facts, seen = [], set()
    for section, topic in TEMPLATE_TOPICS:
        if section in sections and topic not in seen:
            s = key_sentence(sections[section], section)
            facts.append({"topic": topic, "text": s, "section": section, "quote": s})
            seen.add(topic)
    return {"summary": summary, "facts": facts, "generatedBy": "template"}


def _schema(section_keys):
    cited = {
        "text": {"type": "string"},
        "section": {"type": "string", "enum": section_keys},
        "quote": {"type": "string"},
    }
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "object", "properties": cited,
                        "required": ["text", "section", "quote"], "additionalProperties": False},
            "facts": {"type": "array", "items": {
                "type": "object",
                "properties": {"topic": {"type": "string", "enum": TOPICS}, **cited},
                "required": ["topic", "text", "section", "quote"],
                "additionalProperties": False,
            }},
        },
        "required": ["summary", "facts"],
        "additionalProperties": False,
    }


_client = None


def _get_client():
    """Lazily build the client. None when disabled or no credentials are configured."""
    global _client
    if os.getenv("OFFLINE") == "1" or os.getenv("DRUG_INFO_LLM") == "0" or _client is False:
        return None
    if _client is None:
        try:
            import anthropic
            _client = anthropic.Anthropic(timeout=30.0, max_retries=1)
        except Exception as e:  # no API key / profile configured
            log.info("Claude unavailable, using template summaries: %s", e)
            return None
    return _client


def _ask_claude(client, label):
    import anthropic

    keys = list(label["sections"])
    body = "\n\n".join(f'<section key="{k}" title="{SECTIONS.get(k, k)}">\n{label["sections"][k]}\n</section>'
                       for k in keys)
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # server-side retry on another model if this one declines
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": _schema(keys)}},
            system=SYSTEM,
            messages=[{"role": "user", "content": f"Drug: {label['ingredient']}\n\nFDA label excerpt:\n\n{body}"}],
        )
    except anthropic.RateLimitError as e:
        log.warning("Claude rate limited: %s", e)
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
        return None
    except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
        log.warning("Claude unreachable: %s", e)
        return None
    except TypeError as e:  # the SDK raises this when no API key / auth profile is configured
        global _client
        _client = False  # don't retry for the rest of this process
        log.info("No Claude credentials configured, using template summaries: %s", e)
        return None

    if response.stop_reason in ("refusal", "max_tokens"):
        log.warning("Claude stopped with %s for %s", response.stop_reason, label["ingredient"])
        return None
    text = next((b.text for b in response.content if b.type == "text"), None)
    try:
        return Summary.model_validate(json.loads(text)), response.model
    except (TypeError, ValueError, ValidationError) as e:
        log.warning("Claude returned unusable JSON for %s: %s", label["ingredient"], e)
        return None


def summarize(label, client=None):
    """{summary, facts, generatedBy} for a label. Never raises; falls back to the template."""
    if not label or not label.get("sections"):
        return {"summary": None, "facts": [], "generatedBy": "template"}
    client = client or _get_client()
    result = _ask_claude(client, label) if client else None
    if not result:
        return template_summary(label)

    parsed, served_by = result
    sections = label["sections"]
    facts = [f.model_dump() for f in parsed.facts if f.topic in TOPICS and quote_ok(f, sections)][:MAX_FACTS]
    summary = parsed.summary.model_dump() if quote_ok(parsed.summary, sections) else None
    if not facts and not summary:
        return template_summary(label)
    if summary is None:  # keep Claude's checked facts, but use the label's own first sentence as the summary
        summary = template_summary(label)["summary"]
    return {"summary": summary, "facts": facts, "generatedBy": served_by or MODEL}
