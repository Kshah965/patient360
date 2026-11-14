# API integration

Current status: real directory, profiles, structured summaries and selected-patient safety checks are connected. New source-bound explanation routes use templates or optional GPT-4.1 mini. See [PERSON3_HANDOFF.md](PERSON3_HANDOFF.md). The earlier stage sections below are historical snapshots.

Based on [frontend/PATIENT_API.md](../frontend/PATIENT_API.md), the current service implementations, and [clinical.ts](../frontend/src/types/clinical.ts).

## Stage 1 integration update

The merged FastAPI safety service now has a typed HTTP adapter for its supported fixture ID `demo`. Check context is explicit in the UI; existing frontend patient checks, directory/profile data, and summaries remain mocked. There is no Owen-to-demo alias or automatic fallback. See [BACKEND_INTEGRATION.md](../frontend/BACKEND_INTEGRATION.md) for current configuration, wire contract, validation and mapping decisions.

## Stage 2 patient-data prerequisite

The designated canonical file backend/data/patients.json is missing both locally and on freshly fetched origin/main; no schema or canonical record was invented. Owen’s existing frontend list and summary agree, but canonical alignment is blocked. Direct engine checking returns three ibuprofen findings; POST for SYN-1002 still returns 404. See [PATIENT_ALIGNMENT.md](../frontend/PATIENT_ALIGNMENT.md) for observed results, test failures, and exact loader work required from the teammate.

## Current adapter

`frontend/src/services/clinicalApi.ts` exports a mock-default ClinicalApi and a separate backendClinicalApi for safety checks. Components use hooks/context that call this adapter. The default remains mock; backendClinicalApi routes only safety checks over HTTP using VITE_API_BASE_URL. The frontend does not access the database.

```ts
interface ClinicalApi {
  searchPatients(query: string, signal?: AbortSignal): Promise<PatientSummary[]>
  getPatient(patientId: string, signal?: AbortSignal): Promise<Patient>
  getEmergencySummary(patientId: string, signal?: AbortSignal): Promise<EmergencySummary>
  checkPrescription(patientId: string, prescription: PrescriptionRequest, signal?: AbortSignal): Promise<PrescriptionCheckResult>
}
```

Search trims the query and matches partial names or IDs case-insensitively. Empty search returns all seven fixtures; no match returns `[]`. Mock methods delay 300ms and honor AbortSignal. Detail lookup rejects unknown IDs and returns a cloned record to protect fixtures. Cancellation rejects with `AbortError`. There are no random failures; hooks/provider convert request errors to readable UI messages with retry actions.

## Existing response types

`PatientSummary` contains `id`, `name`, `dateOfBirth`, nullable `sex`, and a plain-text `indicator` derived from allergy status. It is a directory row type, **not** an AI summary.

| Patient field | Type/content |
| --- | --- |
| `id`, `name` | Strings; stable unique ID and full name |
| `dateOfBirth` | YYYY-MM-DD string; age is calculated in the UI |
| `sex` | String or null |
| `allergies` | Status plus substance/reaction items; see below |
| `medications` | Array of `{ name, dose, frequency }` strings, or null |
| `conditions`, `history` | String arrays or null |
| `encounters` | Array of `{ date, reason, outcome }` strings, or null |
| `vitals` | Object or null: `recordedAt`, `bloodPressure`, `heartRate`, `temperatureC`, `oxygenSaturation` |

Vital numeric fields are heart rate (bpm), temperature (°C), and oxygen saturation (%); blood pressure is a formatted string in the fixtures. Encounter and vital recording dates use YYYY-MM-DD. Vitals are historical, not live observations.

Allergy status is one of:

- `documented`: items contain `{ substance: string, reaction: string }`.
- `none-known`: empty items; no known allergies documented.
- `unknown`: empty items; allergy information unavailable.

For nullable clinical collections, null means unavailable and `[]` means no entries documented. Preserve this difference in backend serialization. Do not convert unknown allergy information to no known allergies.

## Backend handoff

1. Agree transport URLs, response formats, and error/status handling with the frontend team. Patient search/detail endpoint names are not prescribed here. The summary route is planned, not implemented.
2. Provide patient search and detail responses matching the existing types, or agree explicit adapter mappings.
3. Add an HTTP implementation of ClinicalApi and select it in `clinicalApi.ts`. Pass AbortSignal through to fetch and reject failures so existing error/retry behavior works.
4. Stage 1 provides VITE_API_BASE_URL and uses the current permissive dev CORS; agree production origins and any future proxy configuration.
5. Keep database access and OpenAI credentials on the backend. Do not put secrets in Vite-exposed variables.

Phase 3 adds a normalized EmergencySummary model and mock summary method. The team-planned FastAPI route is GET /patients/{id}/summary; nested payload shapes remain unconfirmed. See [the summary handoff](../frontend/EMERGENCY_SUMMARY_API.md) for field mapping questions. Phase 4 implements mock checkPrescription and normalized response types. See [Medication Safety API](../frontend/MEDICATION_SAFETY_API.md) for the proposed POST /patients/{id}/check contract, evidence fields, prioritization, and backend questions. HTTP safety integration exists only for the separate demo fixture. The official backend architecture is Python FastAPI, SQLite, and synthetic FHIR records; rule-based findings precede any LLM explanations.
