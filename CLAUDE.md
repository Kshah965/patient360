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
python -m drugs.scripts.prewarm_info           # cache FDA labels + summaries for demo drugs (needs internet)
python -m drugs.scripts.prewarm_info --refresh # re-summarize cached labels, e.g. after setting ANTHROPIC_API_KEY
```

`backend/conftest.py` points every test at empty temp databases before anything imports `safety.engine` or `safety.rx`, which open their SQLite files at import time. It also sets `OFFLINE=1` and `DRUG_INFO_LLM=0`, so tests never call openFDA or Claude.

Frontend (run from `frontend/`): `npm run dev`, `npm run build`, `npm run lint`, `node --test tests/patients.test.mjs` (Node 22.15+). `package-lock.json` is out of sync with `package.json`, so `npm ci` fails; use `npm install`. To use the backend, put `VITE_API_BASE_URL=http://127.0.0.1:8000` and `VITE_PATIENT_DATA_MODE=backend` in gitignored `frontend/.env.local` (see `frontend/.env.example`; `VITE_API_URL` is a legacy alias). The header's "Patient data" switch flips between mock and backend at runtime. All HTTP adapters read `src/services/apiConfig.ts`.

## Architecture

- **One SQLite file, `backend/medprofile.db`** (env `MEDPROFILE_DB`, gitignored). It holds the patient tables (`backend/patients/schema.sql`) and Aarya's `drug_interactions` table. The team decided against Supabase. Curated interactions and alternatives stay in `backend/safety/data/*.json`.
- **`backend/main.py`** mounts four routers: `patients/routes.py` and `drugs/routes.py` (Davi), `safety/routes.py` (Aarya) and `explanations/routes.py` (Krishna: optional GPT-4.1 mini extractive explanations, off unless `LLM_ENABLED=1` and `OPENAI_API_KEY` are set; templates otherwise).
- **The engine returns `notices`** for parts of a check that could not run (unknown allergies, missing or incomplete med list). The checker and the comparison both show them; they are not findings and never mean safe.
- **Curated data provenance:** every row in `safety/data/curated.json` is sourced. The rows that had no DDInter text were filled from FDA labels by `drugs/scripts/fill_curated_from_labels.py`, which refuses to write unless each quote is found word for word in the label.
- **Every write goes through `patients.repo.create_patient`.** That covers the seed file, `POST /patients` and the FHIR importer. Input shape is `models.PatientIn`, which matches the frontend `Patient` plus extras (`rxcui`, `status`, allergy `severity`, `observations`).
- **Responses use the camelCase keys of `frontend/src/types/clinical.ts`**, so `frontend/src/services/httpClinicalApi.ts` is a plain fetch. Aarya's `/check` response stays snake_case.
- **Null vs empty is meaningful.** A section sent as `null` is stored in `patients.unavailable` and returned as `null` ("information unavailable"). `[]` means "nothing documented". Missing allergy info is `unknown`, never `none-known`.
- **Vitals and labs are rows in `observations`**, one row per reading. The `vitals` object is pivoted from the latest reading of each of the four vitals; a vital never recorded is `null`, and `vitals` is `null` only when none exist. `POST /patients/{id}/vitals` adds readings taken now (the profile's "Record vitals now" form) without overwriting older ones.
- **`criticalAlerts`** are computed on read by `patients/critical.py`, never stored. The directory `indicator` is the top alert.
- **`/check` loads patients via `repo.get_patient_for_check`**, logs results to `interaction_results` and returns the row id as `check_id`. Patient id `demo` still loads `safety/fixtures/demo_patient.json` (its `check_id` is null). The DB demo patient is `SYN-1000`.
- **Prescribing runs the safety check on the server** (`POST /patients/{id}/medications`), so it can't be skipped. A primary (major/contraindicated) alert without an `overrideReason` gets a 409 with the check. The new `medications` row stores `check_id`, `override_reason`, `prescribed_by` and `prescribed_at`. Every attempt is logged, including refused ones. Prescribing for a patient whose med list was `null` changes it to "incomplete", with a critical alert saying so.
- **Drug comparison (`backend/drugs/`)** has two parts that are kept apart on purpose:
  - **Risk profile** (`compare.py`): deterministic and local. It runs `safety.engine.check` and `engine.context_notes` for each drug, adds "allergy status unknown" and FDA boxed-warning reasons, and logs every check. A boxed warning never changes `riskLevel`.
  - **Drug info card** (`info.py`, `label.py`, `summarize.py`): the FDA label from openFDA, summarized by Claude (`claude-opus-5-5`, effort `low`, JSON schema, server-side refusal fallback).
- **Rules for the drug info card:**
  - Claude only summarizes the label text it is given, and only the label text and drug name are sent. Patient data never goes to Claude or openFDA.
  - Every statement carries a verbatim quote. `summarize.quote_ok` checks each quote against its cited section and drops failures.
  - Any failure (no key, offline, refusal, bad JSON) falls back to `template_summary`, which uses sentences copied from the label.
  - Summaries are cached per ingredient in the committed `drugs/data/info_cache/*.json`. With `OFFLINE=1` only the cache is used. Bump `summarize.PROMPT_VERSION` when the prompt or schema changes.
- **Schema changes to existing tables** must be added to `db.ADDED_COLUMNS` as well as `schema.sql`. `ensure_schema` then adds the missing columns on startup. Never tell anyone to delete `medprofile.db` to pick up a schema change: it also holds the DDInter data.

## Endpoints

- `GET /patients?q=`: directory.
- `GET /patients/{id}/summary` (alias `GET /patients/{id}`): full record. Medications include `id`.
- `POST /patients`: 201, assigns the next `SYN-####`, 409 on a duplicate id.
- `POST /patients/{id}/check`: Aarya's engine, plus `check_id`.
- `POST /patients/{id}/medications`: prescribe. Body `{ name, dose?, frequency?, rxcui?, prescribedBy?, overrideReason? }`, returns `{ medication, check }`.
- `PATCH /patients/{id}/medications/{medId}`: body `{ status: "active" | "stopped" }`.
- `POST /patients/{id}/compare`: body `{ drugs: [1-4 names] }`. Returns a per-drug `riskLevel` (`contraindicated` | `major` | `moderate` | `minor` | `none-found`), `reasons`, `counts`, `checkId`, plus `suggestedAlternatives`.
- `GET /drugs?q=`: known medication names for the picker (`[{name, drug}]`, brands included). Any other name can still be checked.
- `POST /patients/{id}/vitals`: body any of `{ bloodPressure: "120/80", heartRate, temperatureC, oxygenSaturation }`, range-checked; returns the patient.
- `GET /drugs/{name}/info`: FDA label summary and cited facts. Doesn't depend on the patient.

The frontend's `src/components/DrugComparison.tsx` (on the Medication Safety page) uses these through `src/services/drugApi.ts`, and prescribes through the endpoint above.

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

The current walkthrough, with the real counts from the seed data, is in `DEMO.md`. Demo patients: Owen Calder (`SYN-1002`, warfarin; ibuprofen shows 1 of 4 findings) and Walter Haines (`SYN-1000`, warfarin + sertraline + aspirin, penicillin allergy; amoxicillin triggers the allergy alert). Theo Wren (`SYN-1004`) shows the "could not be checked" notices.

## Priorities

- **Must (first):** repo with React + FastAPI + SQLite; load Synthea and build the demo patient; parse and store meds/allergies/conditions/history; ER summary screen with critical alerts; verify the DDInter join.
- **Second:** cached RxNorm drug search; interaction check (DDInter + curated fallback); class-level allergy check; severity-ranked alerts with sources.
- **Stretch:** curated alternatives; LLM explanations with template fallback.

## Team ownership

- **Davi (A), the user of this repo:** data and ER summary. FastAPI skeleton, SQLite, FHIR parsing, demo patient, `/patients`, `/summary`, critical-alert computation.
- **Aarya (B):** medication safety engine. DDInter join, RxNorm/RxClass caching, interaction and allergy checks, severity ranking, curated tables, `/check`.
- **Krishna (C):** frontend (React/Tailwind), LLM explanation layer, pitch and demo script.
