# Person 3 completion handoff

This is the current integration guide; it supersedes older Stage 1/2 notes describing fixture-only backend support. All application data is synthetic. Canonical seed records and clinical rules were not modified.

## Completed workflow

- Mock/FastAPI patient-data selection remains in the header. The shared API URL config prefers VITE_API_BASE_URL and accepts legacy VITE_API_URL. Backend failures never select mocks automatically.
- FastAPI directory and profiles use GET /patients and GET /patients/{id}, with validation, missing-data handling, cancellation and shared selection.
- Generate Emergency Summary calls GET /patients/{id}/summary and projects its flat Patient response into the existing report. Backend alert severity/meaning are retained verbatim (high/moderate), with their deterministic origin labeled. Structured information remains visible without AI.
- Check Medication Safety calls POST /patients/{selectedId}/check with the selected drug. The old demo-only guard is removed; the server owns ID resolution and unknown IDs produce an error. No alias is used. Findings, raw severity/priority/verification/context/sources, counts and check_id are preserved.
- Patient/source/drug/check changes reset their corresponding result state and cancel/suppress stale completions. Explanation failures do not change structured reports or safety results.
- No prescribing or medication-status write routes are connected.

The original mock summary/safety data is retained for offline UI development. Mock Owen contains an earlier approved sertraline entry. Backend Owen does not. Mock findings must not be presented as the official live demo results; the data-source label makes the distinction explicit.

## Added explanation routes

| Route | Input | Behavior |
| --- | --- | --- |
| POST /patients/{id}/explanations/summary | No body | Reads the current structured record and prepares attributed handoff excerpts |
| POST /patients/{id}/explanations/safety | `{ "check_id": positive_integer }` | Reads only that patient's stored check log; rejects client-supplied findings |

Unknown patients/checks or wrong patient/check combinations return 404. Invalid safety request bodies return 422. The service reads existing records/logs; it does not alter clinical storage or rules.

Both routes return:

```text
patient_id, kind (summary|safety), check_id (integer|null),
mode (template|llm-extractive), model (string|null), reason,
items [{ fact_id, text, source, reference }], omitted_unverified, notice
```

The browser requests explanations explicitly after the report/check is visible. Safety explanation requires an actual stored check_id; if logging supplied none, raw findings remain usable and no fictional check ID is generated.

## GPT-4.1 mini contract

The implementation uses the existing requests dependency and OpenAI's Responses API with strict JSON Schema. Default model is gpt-4.1-mini, configurable using OPENAI_MODEL. Provider availability is not assumed; errors always produce templates. No SDK/dependencies were added and no paid API calls were used for testing.

The model is deliberately **extractive**, not a free-form clinical author:

1. Server builds a fact pool from the patient record or eligible verified deterministic findings.
2. Safety findings with false verification, missing sources or TODO text are excluded from the model pool but remain in the deterministic UI, with an omitted count.
3. Only unchanged approved synthetic seed projections may be sent externally. The service compares the full record to a seed projection generated in RAM (ignoring only storage medication IDs). Edited/imported/API-created records use local templates, even if the key is configured. This gate does not modify the database or seed.
4. The model receives no name, birth date or API credentials in its evidence input. It has no tools. Patient text is explicitly untrusted data.
5. Output contains only fact IDs and exact quotes. Pydantic rejects extra fields; validation rejects unsupported IDs, missing/duplicate facts or altered quotes. Safety order must stay identical to the deterministic order. Attribution is reconstructed from server facts, never accepted from the model.
6. Network errors, timeouts, refusals, incomplete output, schema/business-rule failures, oversized inputs and missing keys all return deterministic excerpts with a template mode/reason. Timeout is 3s connect/10s read; retries are not automatic.

This design prevents novel model claims from being displayed. It does not independently validate clinical evidence, and does not claim to provide open-ended paraphrasing or treatment recommendations. Backend `verified: true` remains a supplied assertion, not independent clinical validation. LLM availability never changes severity, drug identities, priorities, alternatives or source references.

The structured summary stays visible separately. Explanations show whether AI was used; templates are never labeled AI-generated success. Unverified alternative details remain withheld under the existing source-verification policy; metadata is retained and no substitution occurs.

Implementation references: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Model availability is not live-tested; use the configurable model or template mode if unavailable.

## Environment

Backend-only configuration (export in the backend shell; .env files are not automatically loaded by this implementation):

```bash
export OFFLINE=1
export LLM_ENABLED=0
export OPENAI_MODEL=gpt-4.1-mini
```

Template explanations work with no key. To enable optional provider use, explicitly set LLM_ENABLED=1 and OPENAI_API_KEY in that backend shell. Do not put keys in VITE variables or shell commands committed to Git. Local .env files are ignored; backend/.env.example is safe to commit. OFFLINE controls RxNorm/RxClass independently: LLM_ENABLED=1 still permits an OpenAI request on the explanation button.

Frontend .env.local:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_PATIENT_DATA_MODE=backend
```

Do not set contradictory legacy/new API URL values. Restart Vite after changing config. The current FastAPI app has permissive development CORS.

## Launch

If dependencies are already provisioned, from two terminals:

```bash
# Terminal 1, repository root
cd backend
OFFLINE=1 LLM_ENABLED=0 python -m uvicorn main:app --reload
```

```bash
# Terminal 2, repository root (after setting frontend/.env.local)
cd frontend
npm run dev
```

For a fresh Python environment, create backend/.venv and install backend/requirements.txt there before running the backend. The frontend uses the existing package manifest; install its dependencies only if missing. No database deletion/reset is needed. main:app initializes missing tables and seeds an empty database; it does not refresh an existing patient table when seed JSON changes.

## Automated validation

From frontend:

```bash
npm run build
npm run lint
node --test tests/patients.test.mjs
```

From backend:

```bash
OFFLINE=1 LLM_ENABLED=0 python -m pytest explanations/tests -q
OFFLINE=1 LLM_ENABLED=0 python -m pytest -q
```

The new explanation tests mock every provider interaction; no key/paid call is required. Coverage includes missing key, disabled provider, synthetic-only gate, verified-finding filtering, strict output/quote validation, prompt-injection-style output, refusal/malformed envelopes, timeout, priority preservation, check ownership, and unchanged stored results.

Frontend tests cover actual captured backend Owen profile/check/template explanation fixtures, summary mapping/missing data, any backend patient ID, check ID preservation, errors without fallback, and stale explanation results. The actual fixture was captured from the existing app using a temporary seeded database.

Existing backend harness problems remain: TestClient/httpx incompatibility and one contraindicated-versus-major expectation mismatch. They were not fixed by changing teammates' rules/tests/dependencies. Separate AsyncClient/ASGI checks verify actual routes using temporary storage.

## Boundaries and remaining manual validation

- Manual browser testing is still required: layout, loading visibility, source switching, rapid patient/drug changes, collapse/expand, stopping/restarting the server and retry.
- No paid provider request was performed. Successful provider output and failures are tested with mocks; actual account/model access must be tested separately if desired.
- The synthetic gate intentionally keeps edited/imported records local. Their structured summaries/checks still work; their explanations use templates.
- An unavailable medication/allergy history cannot establish safety. The UI surfaces selected-patient missing-data warnings and limited rule coverage.
- No response revision token links concurrent external edits to a prior summary; the summary explanation reads the current server record. This demo does not expose write controls.
- A browser cancellation suppresses stale results but does not guarantee a provider request already executing server-side is interrupted; provider timeouts bound it.
- DDInter credit is displayed in the application: CC BY-NC-SA 4.0, non-commercial.

See [DEMO.md](../DEMO.md) for the actual Owen walkthrough. No canonical data, clinical rules, patient loader, prescribing logic, Git branches or stashes were changed by this completion task.

## Files changed by this completion task

Created:

- DEMO.md; context/PERSON3_HANDOFF.md
- backend/.env.example
- backend/explanations/__init__.py, service.py, routes.py
- backend/explanations/tests/test_service.py, test_routes.py
- frontend/src/services/emergencySummary.ts, explanationApi.ts
- frontend/src/state/explanationStore.ts
- frontend/src/components/ExplanationPanel.tsx
- frontend/tests/fixtures/backend-owen.json

Modified:

- .gitignore; backend/main.py (router registration only)
- frontend/src/components/EmergencySummaryPanel.tsx, PrescriptionChecker.tsx, SafetyResults.tsx, WorkspaceOverview.tsx, layout/AppShell.tsx
- frontend/src/hooks/useEmergencySummary.ts
- frontend/src/services/clinicalApi.ts, httpClinicalApi.ts, httpSafetyApi.ts
- frontend/src/types/clinical.ts, backendSafety.ts
- frontend/tests/patients.test.mjs
- frontend/PATIENT_API.md, BACKEND_INTEGRATION.md, PATIENT_DIRECTORY_INTEGRATION.md, EMERGENCY_SUMMARY_API.md, MEDICATION_SAFETY_API.md, PATIENT_ALIGNMENT.md (historical-note links)
- context/API_INTEGRATION.md, CURRENT_PROGRESS.md

No package manifest/lockfile or backend requirements changes were needed. Pre-existing staged, unstaged and untracked work remains in the working tree. Current completion validation: frontend build/lint/38 tests passed; new Python explanation suite 17 passed; combined Python suite 28 passed, 2 failed, 20 setup errors from the documented baseline issues. Temporary-database ASGI smoke tests passed for all eight summaries/explanation fallbacks and Owen's actual safety/check/explanation workflow.
