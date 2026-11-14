# Patient directory and profile integration

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

## Git sync and preservation

Fetched origin and compared HEAD with origin/main: both were b17ebd71b31ec267e0375a9f6e7e2e3cedefa5f1. Saved staged, unstaged and untracked work using a new retained stash, ran the approved merge (Already up to date), and applied that stash with --index. SHA-256 checks for all 34 preserved files and exact staged/unstaged diffs matched the pre-sync snapshot before implementation. No conflicts occurred. Both stashes remain; no frontend commit, push, rebase or stash drop was performed.

## Scope

This increment connects only patient directory and profile reads. React routes, styling, loading/error/retry/empty states and session patient selection remain. All records are synthetic.

The header's **Patient data** selector offers:

- **Mock · Offline**: existing seven frontend records and predefined summary/safety tools.
- **FastAPI · Synthetic**: real directory/profile data from the combined backend. Predefined summary/safety tools are separated from these records and replaced by an integration-pending notice. This prevents showing an outdated mock report beside an HTTP profile. Switch back to mock mode to use those existing tools, including the independent Stage 1 demo-fixture HTTP check.

Changing patient source clears query, selection, pending details and demo-panel state. Patient selection persists across routes within the selected mode. Source selection lasts until refresh; its startup default is configurable. Backend failures stay visible with Retry; no automatic fallback occurs.

No prescribing, medication-status updates, real emergency summaries, selected-patient safety integration, LLM calls, backend code, seed edits or medication-rule changes are included.

## Run

Using the teammate's provisioned backend environment:

```bash
cd backend
OFFLINE=1 uvicorn main:app --reload
```

Use main:app, not the standalone safety.dev_app, so patient tables are initialized. Startup creates/seeds backend/medprofile.db if needed. This task used temporary test databases and did not modify that database or seeds. Avoid resetting an existing database just to refresh seeds.

Create frontend/.env.local from .env.example:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_PATIENT_DATA_MODE=backend
```

Then from frontend:

```bash
npm run dev
```

VITE_API_BASE_URL is the shared browser-accessible API base URL. VITE_API_URL remains a legacy fallback when the preferred variable is absent. If both differ, the preferred variable wins and the header displays a configuration warning. No secrets belong in these variables. Vite needs a restart after env changes. No proxy is needed for the current permissive dev CORS.

Without configuration the explicit default is mock. Selecting backend without a URL produces a configuration error, not mock records. A malformed/unsupported response, network failure, 404, invalid JSON or server error also produces an error.

## Read contracts and normalization

- GET /patients?q={query}: directory list with id, name, dateOfBirth, nullable sex, indicator. Search is trimmed, case-insensitive and matches partial names/IDs; empty list represents no matches.
- GET /patients/{id}: patient identity, allergy status/items, medications, conditions, history, encounters and vitals. The HTTP profile adapter now uses this direct route rather than its /summary alias.
- GET /patients/{id}/summary: currently the same patient shape, not the frontend EmergencySummary. No summary integration was added.

Runtime normalization is in src/services/patientNormalization.ts. It rejects malformed identities/collections and identity mismatches, preserves null versus empty arrays, retains optional numeric medication IDs, and supplies explicit missing-value display text for absent dose/frequency/reaction/outcome. Partial vital sets become unavailable instead of fabricated complete observations. Backend observations and criticalAlerts are retained as optional typed metadata, without interpreting them as generated summaries or displaying unsupported advice.

Source configuration lives in services/apiConfig.ts; createPatientApi selects mock or HTTP reads. Existing clinicalApi and safety adapters remain available. The explicit fourth patientBaseUrl parameter on createClinicalApi is preserved for compatible callers/tests; the application's patient source is controlled by PatientDataProvider.

PatientDataProvider supplies the selected API and remounts PatientProvider on mode change. PatientProvider uses a patient-scoped store with abort, version and ID checks; usePatientSearch also cancels obsolete searches. Old patient details clear immediately before a new fetch. There is no local-storage persistence or new state dependency.

## Backend inspection findings

The current backend includes SQLite patient storage, eight seed records (SYN-1000 through SYN-1007), FHIR CLI ingestion, deterministic critical alerts, database-backed safety loading and check logging. It also includes new POST /patients/{id}/medications and PATCH /patients/{id}/medications/{med_id} routes with server-side safety/override handling. None of those medication-write routes were connected by this increment.

Current working routes were verified through an offline ASGI client with a fresh temporary DB:

- GET /patients, name/ID/no-result searches: 200.
- GET /patients/{id} and /summary: 200 for all eight seeds; their patient responses agree.
- Unknown patient detail: 404.
- POST /patients/SYN-1002/check: 200, two findings, one primary under current fallback data.
- CORS preflight from localhost:5173: 200, wildcard origin.

All eight actual profile payloads and the directory passed the new frontend normalizers. These were in-process checks, not browser networking tests.

The canonical seed is backend/patients/data/seed_patients.json, with runtime SQLite as the data source after seeding. The previously proposed backend/data/patients.json remains absent and was not created.

## Owen's current backend record and remaining mismatches

SYN-1002 currently has:

| Medication | Dose | Frequency |
| --- | --- | --- |
| Warfarin | 3 mg | Daily |
| Metoprolol tartrate | 25 mg | Twice daily |
| Lisinopril | 10 mg | Daily |
| Atorvastatin | 20 mg | Nightly |

The approved fictional sertraline 50 mg orally once daily exists only in frontend mocks, not Owen's backend seed. No data was altered to reconcile it in this task. Live profiles show only backend-supplied medications. His backend ibuprofen check returns warfarin major/primary and lisinopril moderate/collapsed, not the frontend mock's warfarin/sertraline pair.

Before the official full demo:

1. Teammate-approved data alignment must update the established canonical seed and any existing database using a deliberate migration; startup does not refresh nonempty databases.
2. Agree mapping from Patient.observations/criticalAlerts to the frontend EmergencySummary model. The backend does not return that report schema or an LLM summary.
3. Enable real selected-patient safety mode only in a later approved increment. The existing adapter's demo-only guard was intentionally left unchanged here, despite backend support for seeded IDs.
4. Preserve backend flags as assertions, not independent validation. Alternative verification metadata and check_id handling need agreement.
5. Retain missing-data coverage limitations; an empty safety result must not imply complete information or prescribing safety.

## Checks and manual workflow

From frontend: npm run build; npm run lint; node --test tests/patients.test.mjs. All 31 tests pass, including six added groups for patient normalization, malformed responses, HTTP reads/errors/abort, URL precedence, patient switching/retry/source reset, and isolation from predefined tools. Prior summary/safety tests remain passing.

Existing backend tests: 11 passed, 2 failed, 20 setup errors in the installed environment. The TestClient/httpx mismatch blocks route/prescribing fixtures; the safety suite also has an existing contraindicated-versus-major expectation disagreement. No backend tests, rules or dependencies were changed. Separate ASGI checks verified read routes despite that harness incompatibility.

Manual browser checks still required:

1. Choose FastAPI in the header; open Patients and confirm eight seed rows.
2. Search Owen and SYN-1002, select him and inspect the four current backend medications.
3. Select Mara, then Theo (unknown data) and Nadia (known-empty fields).
4. Navigate Dashboard/Patients/Medication Safety: patient identity remains consistent; later integrations remain explicitly pending.
5. Change selection rapidly and switch sources while loading. Old details must not reappear.
6. Stop the server; verify error/retry without mock fallback. Restore it and retry.
7. Choose Mock to verify all seven offline records and existing demo tools remain available.

Stopped after patient directory/profile integration. No frontend integration changes were committed or pushed.
