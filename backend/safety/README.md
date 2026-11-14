# Safety engine (Person B)

Medication safety checker: interaction + allergy checks, severity ranking, alternatives.
Code and data decide; the LLM (Person C) only rephrases the alert JSON.

## Run (from `backend/`)

    python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    OFFLINE=1 python -m pytest safety/tests -q              # all tests should pass
    uvicorn safety.dev_app:app --reload                     # then open http://127.0.0.1:8000/docs

## Data

| File | What | Status |
|---|---|---|
| `data/curated.json` | Fallback interactions with explanation, management, source | Every entry is `verified: false` until checked on DDInter or DailyMed |
| `data/alternatives.json` | Curated alternatives per proposed drug | Fill `monitoring` and `source` |
| `data/aliases.json` | Brand names and misspellings, works offline | Add as needed |
| `data/ddinter/*.csv` | Raw DDInter 2.0 downloads (not committed) | Download locally |
| `data/rx_cache.db` | Cached RxNorm/RxClass responses | Generate with prewarm, then commit |

## Scripts (from `backend/`)

    python -m safety.scripts.check_ddinter_pairs   # hour-1 gate: are demo pairs in DDInter?
    python -m safety.scripts.load_ddinter          # load DDInter into medprofile.db
    python -m safety.scripts.prewarm_cache         # fill rx_cache.db (needs internet)

## Response of POST /patients/{id}/check

    { "drug", "total_found", "shown", "disclaimer",
      "alerts": [{ "severity", "type", "priority", "drugs", "explanation", "management",
                   "source", "source_id", "verified", "context", "alternatives" }] }

DDInter 2.0 is licensed CC BY-NC-SA 4.0: credit it in the app and pitch.
Prototype on synthetic data only. "No interaction found in our dataset" never means safe.
