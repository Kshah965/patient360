"""Fill the unverified ("TODO") rows of safety/data/curated.json and alternatives.json
with text taken from FDA drug labels (openFDA), and record where each came from.

From backend/ (needs internet):  python -m drugs.scripts.fill_curated_from_labels

Every string in `quotes` must appear word for word in the named label section, or
the script stops without writing anything. Severities are not changed: they stay as
set in curated.json (DDInter levels). Re-run after labels change to re-check the quotes.
"""
import json
import pathlib
import re
import sys

from drugs.label import DAILYMED, _clean, _pick, _search

SAFETY_DATA = pathlib.Path(__file__).parents[2] / "safety" / "data"

SECTION_TITLES = {"drug_interactions": "Drug Interactions", "contraindications": "Contraindications",
                  "warnings_and_cautions": "Warnings and Precautions", "indications_and_usage": "Indications and Usage"}

# Each row: the curated pair, the label it is read from, and the exact label sentences used.
# `explanation` and `management` are built only from those sentences, except where the
# label gives a table or list: then the listed drug is named and `quotes` holds the list text.
INTERACTIONS = [
    {
        "pair": ("warfarin", "aspirin"), "label": "warfarin", "section": "drug_interactions",
        "explanation": "The warfarin label lists aspirin (an antiplatelet agent) among drugs that can increase the risk of bleeding.",
        "management": "Because bleeding risk is increased when these drugs are used concomitantly with warfarin, closely monitor patients receiving any such drug with warfarin.",
        "quotes": ["Drugs that Can Increase the Risk of Bleeding", "Antiplatelet Agents aspirin",
                   "Because bleeding risk is increased when these drugs are used concomitantly with warfarin, closely monitor patients receiving any such drug with warfarin."],
    },
    {
        "pair": ("warfarin", "sertraline"), "label": "sertraline", "section": "drug_interactions",
        "explanation": "The concurrent use of an antiplatelet agent or anticoagulant with sertraline hydrochloride may potentiate the risk of bleeding.",
        "management": "Inform patients of the increased risk of bleeding associated with the concomitant use of sertraline hydrochloride and antiplatelet agents and anticoagulants. For patients taking warfarin, carefully monitor the international normalized ratio.",
        "quotes": ["The concurrent use of an antiplatelet agent or anticoagulant with sertraline hydrochloride may potentiate the risk of bleeding.",
                   "Inform patients of the increased risk of bleeding associated with the concomitant use of sertraline hydrochloride and antiplatelet agents and anticoagulants.",
                   "For patients taking warfarin, carefully monitor the international normalized ratio"],
    },
    {
        "pair": ("simvastatin", "clarithromycin"), "label": "simvastatin", "section": "drug_interactions",
        "explanation": "The simvastatin label lists clarithromycin as a strong CYP3A4 inhibitor. Concomitant use of strong CYP3A4 inhibitors with simvastatin increases simvastatin exposure and increases the risk of myopathy and rhabdomyolysis, particularly with higher simvastatin dosages.",
        "management": "Concomitant use of strong CYP3A4 inhibitors with simvastatin is contraindicated. If treatment with a CYP3A4 inhibitor is unavoidable, suspend simvastatin during the course of strong CYP3A4 inhibitor treatment.",
        "quotes": ["Concomitant use of strong CYP3A4 inhibitors with simvastatin increases simvastatin exposure and increases the risk of myopathy and rhabdomyolysis, particularly with higher simvastatin dosages.",
                   "select macrolide antibiotics (e.g., erythromycin and clarithromycin)",
                   "Concomitant use of strong CYP3A4 inhibitors with simvastatin is contraindicated",
                   "If treatment with a CYP3A4 inhibitor is unavoidable, suspend simvastatin during the course of strong CYP3A4 inhibitor treatment."],
    },
    {
        "pair": ("clopidogrel", "omeprazole"), "label": "clopidogrel", "section": "drug_interactions",
        "explanation": "In clinical studies, omeprazole was shown to reduce significantly the antiplatelet activity of clopidogrel tablets when given concomitantly or 12 hours apart.",
        "management": "Avoid concomitant use of clopidogrel tablets with omeprazole or esomeprazole.",
        "quotes": ["In clinical studies, omeprazole was shown to reduce significantly the antiplatelet activity of clopidogrel tablets when given concomitantly or 12 hours apart.",
                   "Avoid concomitant use of clopidogrel tablets with omeprazole or esomeprazole."],
    },
    {
        "pair": ("sertraline", "tramadol"), "label": "sertraline", "section": "warnings_and_cautions",
        "explanation": "The sertraline label names tramadol among serotonergic drugs that increase the risk of serotonin syndrome, a potentially life-threatening condition.",
        "management": "Monitor all patients taking sertraline hydrochloride for the emergence of serotonin syndrome. Discontinue treatment with sertraline hydrochloride and any concomitant serotonergic agents immediately if the above symptoms occur, and initiate supportive symptomatic treatment.",
        "quotes": ["can precipitate serotonin syndrome, a potentially life-threatening condition",
                   "The risk is increased with concomitant use of other serotonergic drugs (including triptans, tricyclic antidepressants, fentanyl, lithium, tramadol",
                   "Monitor all patients taking sertraline hydrochloride for the emergence of serotonin syndrome.",
                   "Discontinue treatment with sertraline hydrochloride and any concomitant serotonergic agents immediately if the above symptoms occur, and initiate supportive symptomatic treatment."],
    },
    {
        "pair": ("sildenafil", "nitroglycerin"), "label": "sildenafil", "section": "contraindications",
        "explanation": "Nitroglycerin is an organic nitrate. Sildenafil tablets was shown to potentiate the hypotensive effect of nitrates.",
        "management": "Contraindicated: administration of sildenafil tablets to patients using nitric oxide donors, such as organic nitrates or organic nitrites in any form.",
        "quotes": ["Sildenafil tablets was shown to potentiate the hypotensive effect of nitrates",
                   "dministration of sildenafil tablets to patients using nitric oxide donors, such as organic nitrates or organic nitrites in any form."],
    },
    {
        "pair": ("lisinopril", "spironolactone"), "label": "lisinopril", "section": "drug_interactions",
        "explanation": "Potassium-sparing diuretics (spironolactone, amiloride, triamterene, and others) can increase the risk of hyperkalemia.",
        "management": "If concomitant use of such agents is indicated, monitor the patient's serum potassium frequently.",
        "quotes": ["Potassium-sparing diuretics (spironolactone, amiloride, triamterene, and others) can increase the risk of hyperkalemia.",
                   "if concomitant use of such agents is indicated, monitor the patient’s serum potassium frequently."],
    },
]

# Alternatives whose source was "TODO": the source becomes the alternative's own label.
ALTERNATIVE_SOURCES = [
    {"drug": "azithromycin", "label": "azithromycin", "section": "indications_and_usage",
     "quotes": ["Azithromycin tablets are a macrolide antibacterial drug"]},
]

_labels = {}


def _norm(text):
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()


def label_for(drug):
    if drug not in _labels:
        label = _pick(_search(drug, rx_only=True), _search(drug, rx_only=False), drug)
        if not label:
            sys.exit(f"No FDA label found for {drug}")
        _labels[drug] = label
    return _labels[drug]


def check_quotes(row):
    """Return the source string for a row, or stop if any quote is not in the label section."""
    label = label_for(row["label"])
    text = _norm(_clean(" ".join(label.get(row["section"]) or [])))
    missing = [q for q in row["quotes"] if _norm(q) not in text]
    if missing:
        sys.exit(f"{row['label']} label, {row['section']}: quote not found: {missing[0]!r}")
    name = (label["openfda"].get("generic_name") or [row["label"]])[0].lower()
    return (f"FDA drug label: {name}, {SECTION_TITLES[row['section']]} "
            f"({DAILYMED.format(label['set_id'])})")


if __name__ == "__main__":
    sources = [(row, check_quotes(row)) for row in INTERACTIONS]          # verify everything first
    alt_sources = [(row, check_quotes(row)) for row in ALTERNATIVE_SOURCES]

    curated_file = SAFETY_DATA / "curated.json"
    curated = json.loads(curated_file.read_text())
    for row, source in sources:
        entry = next(c for c in curated if {c["a"], c["b"]} == set(row["pair"]))
        entry.update(explanation=row["explanation"], management=row["management"], source=source, verified=True)
        print(f"{row['pair'][0]} + {row['pair'][1]}: {len(row['quotes'])} quotes found in the {row['label']} label")
    curated_file.write_text(json.dumps(curated, indent=1, ensure_ascii=False) + "\n")

    alts_file = SAFETY_DATA / "alternatives.json"
    alts = json.loads(alts_file.read_text())
    for row, source in alt_sources:
        for options in alts.values():
            for alt in options:
                if alt["drug"] == row["drug"] and alt.get("source") == "TODO":
                    alt["source"] = source
    for options in alts.values():  # an alternative is verified once it has a real source
        for alt in options:
            alt["verified"] = bool(alt.get("source")) and "TODO" not in alt["source"]
    alts_file.write_text(json.dumps(alts, indent=1, ensure_ascii=False) + "\n")
    print("alternatives.json: sources and verified flags updated")
