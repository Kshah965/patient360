# API integration

Based on [frontend/PATIENT_API.md](../frontend/PATIENT_API.md), the current service implementations, and [clinical.ts](../frontend/src/types/clinical.ts).

## Current adapter

`frontend/src/services/clinicalApi.ts` exports a `ClinicalApi` currently assigned to `mockClinicalApi`. Components use hooks/context that call this adapter. There is no HTTP adapter, configured API base URL, endpoint implementation, or database connection.

```ts
interface ClinicalApi {
  searchPatients(query: string, signal?: AbortSignal): Promise<PatientSummary[]>
  getPatient(patientId: string, signal?: AbortSignal): Promise<Patient>
}
```

Search trims the query and matches partial names or IDs case-insensitively. Empty search returns all seven fixtures; no match returns `[]`. Both methods delay 300ms and honor AbortSignal. Detail lookup rejects unknown IDs and returns a cloned record to protect fixtures. Cancellation rejects with `AbortError`. There are no random failures; hooks/provider convert request errors to readable UI messages with retry actions.

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

1. Agree transport URLs, response formats, and error/status handling with the frontend team. No endpoint names are prescribed or implemented here.
2. Provide patient search and detail responses matching the existing types, or agree explicit adapter mappings.
3. Add an HTTP implementation of ClinicalApi and select it in `clinicalApi.ts`. Pass AbortSignal through to fetch and reject failures so existing error/retry behavior works.
4. Decide API base URL configuration and local CORS/proxy setup when the backend is available; neither is configured today.
5. Keep database access and OpenAI credentials on the backend. Do not put secrets in Vite-exposed variables.

Summary generation and medication safety interfaces do not yet exist. Their types, request semantics, error handling, and response formats must be agreed during subsequent phases rather than assumed from the disabled UI.
