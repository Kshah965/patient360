# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

patient360 is a 48-hour hackathon prototype for web-based clinical decision support. It runs on synthetic data only. It builds **one consolidated patient record** and two modules read from it. It is one app, not two:

1. **Patient Medical Summary (ER view):** meds, allergies, conditions, encounters and observations, with critical alerts at the top (e.g. "on blood thinner (warfarin)").
2. **Medication Safety Checker:** a clinician proposes a drug. The system checks it against the patient's meds, allergies and conditions. It returns ranked alerts with explanation, source and curated alternatives.

The problem being solved is alert fatigue. Generic checkers fire too many alerts and clinicians ignore them. The goal is **fewer, patient-specific, explainable alerts**.

## Commands

Backend (run from `backend/`, Python venv in `backend/.venv`):

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
uvicorn main:app --reload                      # API at :8000, docs at /docs; creates + seeds medprofile.db on first start
OFFLINE=1 python -m pytest -q                  # all backend tests
OFFLINE=1 python -m pytest patients/tests/test_patients.py::test_add_patient -q   # one test
python -m patients.seed                        # reset patient tables to seed_patients.json (keeps DDInter)
python -m patients.fhir_import <folder|files>  # import Synthea FHIR R4 bundles
python -m safety.scripts.load_ddinter          # load DDInter CSVs (Aarya's; see backend/safety/README.md)
```

Frontend (run from `frontend/`): `npm run dev`, `npm run build`, `npm run lint`, `node --test tests/patients.test.mjs` (Node 22.15+). `package-lock.json` is out of sync with `package.json`, so `npm ci` fails; use `npm install`. Set `VITE_API_URL=http://localhost:8000` (e.g. in gitignored `frontend/.env.local`) to use the backend; without it the frontend uses `src/mocks/patients.ts`.

## Architecture

- **One SQLite file, `backend/medprofile.db`** (env `MEDPROFILE_DB`, gitignored). It holds the patient tables (`backend/patients/schema.sql`) and Aarya's `drug_interactions` table. The team decided against Supabase. Curated interactions and alternatives stay in `backend/safety/data/*.json`.
- **`backend/main.py`** mounts two routers: `patients/routes.py` (Davi) and `safety/routes.py` (Aarya).
- **Every write goes through `patients.repo.create_patient`.** That covers the seed file, `POST /patients` and the FHIR importer. Input shape is `models.PatientIn`, which matches the frontend `Patient` plus extras (`rxcui`, `status`, allergy `severity`, `observations`).
- **Responses use the camelCase keys of `frontend/src/types/clinical.ts`**, so `frontend/src/services/httpClinicalApi.ts` is a plain fetch. Aarya's `/check` response stays snake_case.
- **Null vs empty is meaningful.** A section sent as `null` is stored in `patients.unavailable` and returned as `null` ("information unavailable"). `[]` means "nothing documented". Missing allergy info is `unknown`, never `none-known`.
- **Vitals and labs are rows in `observations`**, one row per reading. The `vitals` object is pivoted from the latest reading of each of the four vitals, and is `null` unless all four exist (until the frontend makes them nullable).
- **`criticalAlerts`** are computed on read by `patients/critical.py`, never stored. The directory `indicator` is the top alert.
- **`/check` loads patients via `repo.get_patient_for_check`** and logs results to `interaction_results`. Patient id `demo` still loads `safety/fixtures/demo_patient.json`. The DB demo patient is `SYN-1000`.

## Endpoints

`GET /patients?q=` (directory), `GET /patients/{id}/summary` (alias `GET /patients/{id}`), `POST /patients` (201, assigns the next `SYN-####`, 409 on a duplicate id), `POST /patients/{id}/check`.

## Non-negotiable design rules

- **Deterministic code makes every safety decision.** The LLM (optional) only explains findings that code has already verified, and it cites sources. It never decides whether something is safe. There must always be a non-LLM template fallback.
- **Never say "safe".** When nothing matches, the UI says "no interaction found in our dataset".
- **Never auto-replace a prescription.** Alternatives are suggestions for clinician review only. The clinician makes the final decision.
- **The demo must not depend on live APIs.** Cache RxNorm/RxClass responses. Cached data plus template text must still give a complete result offline.
- **Every interaction, alternative and curated entry carries a source.**
- **Credit DDInter in the app** (license CC BY-NC-SA 4.0, non-commercial).
- Out of scope (future work): dosing, kidney function, pregnancy, supplements, real EHR integration, automated alternative-finding.

## Data sources

FHIR R4 bundles (Synthea) are parsed **once** into SQLite. Both modules read from the DB.

- **Synthea**: synthetic patients. Medications already carry RxNorm codes. One bundle is hand-edited into the demo patient.
- **RxNorm API** (cached): maps brand and generic names to ingredients. It does not cover supplements.
- **RxClass API** (cached): drug-class membership for class-level allergy checks (e.g. penicillin class covers amoxicillin).
- **DDInter 2.0**: main interaction source (drug-drug, drug-disease, duplication), with severity and management guidance.
- **Curated fallback table**: about 20 well-known interactions with sources, in case a demo pair is missing from DDInter.
- **Curated alternatives map**: 5 to 10 drugs. Each entry has drug, indication, alternative, rationale and source.
- **openFDA** (optional): label snippet as supporting evidence only. It is not validated for clinical decisions and is never the interaction engine.

**The hardest hidden task is the DDInter join.** DDInter keys interactions by drug *name*, not RxNorm ID. We need a mapping from DDInter names to RxNorm ingredient so patient meds can be matched. Confirm early that the demo pairs exist.

**Alternatives logic** is "same indication, no interaction with this patient's meds", **not** "same drug class". Other NSAIDs carry the same bleeding risk with warfarin. Acetaminophen is in a different class from ibuprofen and is the correct alternative.

Do not change the response shapes without coordinating. Three people build against them in parallel.

## Alert ranking / UX

Show one serious alert up front, with a line on why *this patient's* context raises concern. Collapse lower-priority findings. Show a counter like "alerts shown: 1 of 6 found".

## Demo script (what must work)

Demo patient: on **warfarin + sertraline**, with a **penicillin allergy**.
1. ER summary flags warfarin (blood thinner) at the top, plus allergies, conditions and recent history.
2. Propose **ibuprofen**. The serious alert is bleeding risk with warfarin (and sertraline). Other findings are collapsed. "1 of 6" counter shown.
3. Each alert shows its DDInter source and a plain-language explanation. Alternatives (acetaminophen) are shown with rationale.
4. Propose **amoxicillin**. This triggers a class-level penicillin allergy alert.

Other known test cases: simvastatin + clarithromycin, SSRIs + tramadol, sildenafil + nitrates.

## Priorities

- **Must (first):** repo with React + FastAPI + SQLite; load Synthea and build the demo patient; parse and store meds/allergies/conditions/history; ER summary screen with critical alerts; verify the DDInter join.
- **Second:** cached RxNorm drug search; interaction check (DDInter + curated fallback); class-level allergy check; severity-ranked alerts with sources.
- **Stretch:** curated alternatives; LLM explanations with template fallback.

## Team ownership

- **Davi (A), the user of this repo:** data and ER summary. FastAPI skeleton, SQLite, FHIR parsing, demo patient, `/patients`, `/summary`, critical-alert computation.
- **Aarya (B):** medication safety engine. DDInter join, RxNorm/RxClass caching, interaction and allergy checks, severity ranking, curated tables, `/check`.
- **Krishna (C):** frontend (React/Tailwind), LLM explanation layer, pitch and demo script.
