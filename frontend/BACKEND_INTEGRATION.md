# Stage 1: HTTP medication safety integration

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

Current patient-read integration: see [PATIENT_DIRECTORY_INTEGRATION.md](PATIENT_DIRECTORY_INTEGRATION.md). It supersedes earlier fixture-only/backend-availability notes below. The canonical seed now exists at backend/patients/data/seed_patients.json. Patient mode is explicit; summaries and selected-patient safety remain outside this increment.

## Stage 2 inspection

The requested canonical path backend/data/patients.json is absent locally and on freshly fetched origin/main. No canonical record was invented or changed. Owen’s existing frontend sertraline entry and all five medications are consistent with the profile/summary, but canonical parity remains unverified. The engine returns three ibuprofen findings from Owen’s frontend data; his HTTP route is still 404. See [PATIENT_ALIGNMENT.md](PATIENT_ALIGNMENT.md) for exact results and teammate actions.

## Scope and explicit routing

Patient search, profiles, and emergency summaries continue to use the original mocks. All seven frontend patients are unchanged. `clinicalApi` defaults to mock checking. `backendClinicalApi` uses HTTP checking only; `createClinicalApi(mode, baseUrl, fetcher)` allows deterministic tests of either mode.

The checker offers two explicit contexts:

- **Selected frontend patient · Predefined mock** (default): preserves Phase 1–4 workflows.
- **Separate backend fixture demo · HTTP engine**: enabled when VITE_API_BASE_URL is set. Always checks ID `demo`, clearly identified as a different record from the selected frontend patient. It does not add a patient to the directory, invent demographics, or change patient context/profile/summary data.

Only ID `demo` is allowlisted, matching the current `safety/routes.py` loader. All other IDs are rejected before fetch. `SYN-1002` is never aliased to `demo`. Keep the allowlist fixed until actual backend support is confirmed. There is no automatic mock fallback, even after 404, 422, 500, network, JSON, or schema failures.

Changing mode, patient, or medication clears results and cancels pending work. A patient change also resets mode to mock and clears medication selection. Existing AbortController, request-sequence, and patient/drug guards remain. The HTTP adapter forwards AbortSignal and checks it after fetch and JSON parsing. A late response cannot publish into another request context even when transport ignores abort. Route unmount clears check state; shared patient selection remains intact.

## Configuration and manual test

Create `frontend/.env.local` using `.env.example`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Use an absolute HTTP(S) URL with no credentials, query, or fragment. A path prefix is supported if the service is mounted under one. This browser-exposed setting is not a secret. Restart Vite after changing it. No Vite proxy or API keys are needed.

Start the backend using its correctly provisioned Python environment:

```bash
cd backend
OFFLINE=1 uvicorn safety.dev_app:app --reload
```

The dev app currently permits all origins/methods/headers through CORS. No credentialed fetch is used. A future production app should explicitly allow its frontend origin. OFFLINE=1 uses the cache and curated data; normal backend startup may create its configured SQLite files. This frontend change does not modify backend files or databases.

In another terminal:

```bash
cd frontend
npm run dev
```

1. Open Medication Safety. Select the **Separate backend fixture demo** context. A frontend patient is not required for this independent connection test.
2. Choose Ibuprofen and submit. Confirm backend-engine provenance, fixture ID `demo`, returned totals/primary counts, context, and verification metadata. The current offline fallback fixture returns five findings, two primary; counts come from the response, not a hardcoded example.
3. Switch back to mock mode, select Owen, and check Ibuprofen. His existing two predefined findings remain available, labeled mock.
4. Stop the backend and run another HTTP check. An explicit backend error must appear; no predefined findings may substitute for it.
5. Change context/patient/drug while loading and check that stale results disappear. Patient profiles and emergency summaries must continue working.

A direct backend smoke request is:

```bash
curl -X POST http://127.0.0.1:8000/patients/demo/check \
  -H 'Content-Type: application/json' -d '{"drug":"ibuprofen"}'
```

## Current wire contract and normalization

`src/types/backendSafety.ts` represents the inspected backend response. `src/services/httpSafetyApi.ts` validates JSON at runtime before normalization. Unsupported alert types or malformed structures fail the entire request rather than silently discarding findings. Unknown severity strings are retained and mapped to unknown, keeping those findings visible.

Request: `POST /patients/{id}/check` with `{ "drug": string }`.

Response fields:

- `drug`, `total_found`, `shown`, `disclaimer`, `alerts`.
- Each alert: `severity`, `type`, `drugs`, `explanation`, `source`, nullable `source_id`, boolean `verified`, `priority`, `context`, `alternatives`; optional `id` and `management`.
- Each alternative: `drug`, `rationale`, `source`; optional `monitoring`, `indication`, `alerts_found`. An optional `verified` field is supported but the current backend does not provide it for alternatives.

Normalized model decisions:

| Backend field | Frontend treatment |
| --- | --- |
| contraindicated / major / moderate / minor | critical / high / moderate / low; original `backendSeverity` retained |
| duplication | Explicit supported finding type |
| `source`, `source_id`, `verified` | EvidenceSource name/reference/backendVerified; no URL is invented |
| `verified: true` and meaningful source | `status: backend-reported`; explicitly not independent clinical validation |
| false/missing verification, blank/TODO source | pending; never promoted to clinically verified |
| `priority` | Original `backendPriority` preserved; primary findings remain visible |
| `context` | Preserved and displayed as backend context, including heuristic qualifiers |
| alternative drug/monitoring/alerts_found | medication/management/alertsFound; indication and rationale retained |
| alternative verification absent | Pending; recommendation details withheld until verified source metadata is supplied |
| counts/disclaimer/normalized drug | Exact values retained in `result.backend` and displayed separately from frontend visibility counts |

Backend results use `provenance: backend-engine`; predefined mocks retain `synthetic-demo`. This distinguishes execution source, not real patient data. All records remain synthetic. `EvidenceSource.status: verified` still exists for prior fixture-backed sources; it is not used to claim independent validation of backend results.

Management text is withheld when evidence is pending or text contains TODO. Unverified findings remain visible with their evidence status and backend-assigned severity; they are not relabeled as verified. Alternative source status must be reviewable and content complete before details are displayed. Nothing is automatically substituted.

Absent alert IDs use a deterministic FNV-1a content fingerprint over patient ID, type, sorted drugs, raw severity, source ID, and explanation. Existing backend IDs are retained as the base. Occurrence suffixes make duplicate rows unique. Reordering distinct unchanged alerts does not change IDs; changing their content may change generated IDs. Stable backend-owned IDs remain preferable.

The backend does not echo patient identity or original request drug. The adapter attaches the captured request context to the normalized result and retains the backend-normalized drug separately. This is correlation with the request, not proof of backend patient identity.

The UI retains backend totals and shown counts even if they differ from supplied array length. It reports partial payloads instead of fabricating records. All backend-primary, critical, highest-severity ties, and unknown-severity findings remain visible. Consequently frontend visible counts can exceed the backend shown count; both are labeled separately.

## Remaining backend agreements / Stage 2 blockers

1. A real loader for Owen `SYN-1002` with matching age, medications, allergies, and missing-data semantics. Current `demo` is a different 68-year-old record with aspirin/omeprazole and penicillin allergy. Adding a frontend alias is not acceptable.
2. Formal approval of severity mapping and priority/visibility semantics, plus stable alert IDs and identity/version echoes.
3. Meaning and scope of `verified`; provenance for curated versus DDInter-derived severity/text and alternatives. Alternatives currently lack verification metadata and some source text remains TODO.
4. Alternative cautions (`alerts_found`), management, indication and source schema. No omitted caution may be treated as proof of safety.
5. Normalized-drug identity semantics, partial-response counts, missing patient information, and error/status contracts.
6. A consistent backend dependency environment: the inspected environment had missing dependencies and a Starlette TestClient/httpx incompatibility. Backend dependencies were not installed or changed by this frontend task.
7. Future patient/profile/summary endpoints and CORS tightening. They are not part of Stage 1.

## Checks

From frontend: `npm run build`, `npm run lint`, and `node --test tests/patients.test.mjs`.

The expanded 24-test suite includes all prior patient/summary/mock checks and eight HTTP integration groups: normalization, stable IDs, malformed schemas, supported-ID guards, errors without fallback, explicit routing, stale HTTP responses, and rendered provenance/verification/counts. Fetch is injected in HTTP tests. An additional smoke check passed actual offline ASGI responses from the existing backend through the normalizer: ibuprofen (5 alerts/2 primary), amoxicillin (1/1), and sertraline (2/0, including duplication). This used in-memory databases and installed libraries without modifying the backend. Browser clicks/CORS and live server networking still require the manual walkthrough above.

No backend code, patient fixtures, or medication rules are changed. Stop before Stage 2; no automatic Git mutations.
