# patient360

patient360 is a web-based clinical decision-support prototype that builds one consolidated profile per patient and uses it for two connected jobs:

1. **Emergency patient summary**: medications, allergies, conditions, history, encounters and vitals in one place, with critical alerts first (e.g. "On blood thinner (Warfarin)").
2. **Medication safety**: a proposed drug is checked against this patient's medications and allergies. One serious alert is shown up front, lower-priority findings are collapsed, and every alert carries its source. Options can be compared side by side and prescribed, with an override reason required for serious alerts.

Deterministic code makes every safety decision. Language models only explain verified text and cite it. "No interaction found in our dataset" never means safe.

**Synthetic data only. Not clinically validated.**

## Run it

```bash
# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
OFFLINE=1 .venv/bin/uvicorn main:app --reload      # http://127.0.0.1:8000/docs
```

```bash
# frontend (another terminal)
cd frontend
npm install
printf 'VITE_API_BASE_URL=http://127.0.0.1:8000\nVITE_PATIENT_DATA_MODE=backend\n' > .env.local
npm run dev
```

The demo walkthrough is in [DEMO.md](DEMO.md). Developer notes and architecture are in [CLAUDE.md](CLAUDE.md).

## Tests

```bash
cd backend && OFFLINE=1 .venv/bin/python -m pytest -q
cd frontend && npm run build && npm run lint && node --test tests/patients.test.mjs
```

## Data and credits

- Interaction data: [DDInter 2.0](https://ddinter2.scbdd.com/) (CC BY-NC-SA 4.0, non-commercial) plus a small curated table. Rows without DDInter text quote FDA drug labels.
- Drug facts: FDA drug labels via [openFDA](https://open.fda.gov/), which the FDA notes are not validated for clinical decision-making.
- Drug names: NLM RxNorm / RxClass (responses cached so the demo runs offline).
- Patients: hand-built synthetic records; Synthea FHIR R4 import is supported (`python -m patients.fhir_import`).
