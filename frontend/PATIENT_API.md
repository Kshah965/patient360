# Patient frontend integration

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

Current patient-read integration: see [PATIENT_DIRECTORY_INTEGRATION.md](PATIENT_DIRECTORY_INTEGRATION.md). It supersedes earlier fixture-only/backend-availability notes below. The canonical seed now exists at backend/patients/data/seed_patients.json. Patient mode is explicit; summaries and selected-patient safety remain outside this increment.

All bundled records are fictional. The frontend currently uses `src/services/mockClinicalApi.ts`, selected in `src/services/clinicalApi.ts`. Patient/profile/summary services remain mocks. Stage 1 provides a separate HTTP safety adapter; see [backend integration](BACKEND_INTEGRATION.md).

## Adapter contract

`ClinicalApi` in `src/types/clinical.ts` defines:

- `searchPatients(query: string, signal?: AbortSignal): Promise<PatientSummary[]>`
- `getPatient(patientId: string, signal?: AbortSignal): Promise<Patient>`
- `getEmergencySummary(patientId: string, signal?: AbortSignal): Promise<EmergencySummary>` — see [summary contract](EMERGENCY_SUMMARY_API.md).

An empty/whitespace search returns all demo records. Search matches partial name or ID, case-insensitively. No matches return an empty array. IDs are stable strings. Unknown IDs reject; failures reject and cancellations use an `AbortError`. All mock methods simulate a 300ms delay and honor cancellation.

Search returns identity fields (`id`, `name`, `dateOfBirth`, nullable `sex`) plus a plain-text `indicator`. Patient detail returns identity plus allergies, medications, conditions, history, encounters, and nullable vitals. Full field definitions are in the shared TypeScript types. Dates use YYYY-MM-DD. Age is calculated in the UI, never stored. Vitals include their historical recording date and are not presented as live measurements.

Allergies use a discriminated status: `documented` with substance/reaction entries, `none-known` with an empty list, or `unknown` with an empty list. Null clinical collections mean unavailable; empty collections mean no entries documented. Never map unknown allergies to none-known.

Backend teammates can implement this interface using fetch and pass the signal to fetch. Agree endpoint URLs and transport error formats before integration; no endpoint paths are assumed here. No OpenAI keys or SDK belong in the frontend.

See [Medication Safety API](MEDICATION_SAFETY_API.md) for the Phase 4 `checkPrescription(patientId, prescription, signal?)` contract and POST /patients/{id}/check. The only backend-supported patient ID currently is demo, offered as a separate explicit context.

## State behavior

PatientProvider lives above the route tree. Navigation preserves the selection for the current app session; browser reload resets it. Selecting another record immediately clears previous detail, aborts the previous request, and guards updates with a request sequence. Clear selection also aborts pending work. Profile failures include Retry; directory failures include Retry. Emergency summaries use a patient-scoped request lifecycle; medication checks use deterministic scenario mocks with patient/drug-scoped cancellation.

## Verification

From frontend:

```bash
npm run build
npm run lint
node --test tests/patients.test.mjs
npm run dev
```

The test runner uses Node 22.15+ and the installed TypeScript dependency. Tests cover mock search, lookup failures, cancellation, fixture isolation, missing data, profile states, age boundaries, and server rendering of all three workspace views. They do not simulate browser navigation.

Manual workflow:

1. Open Patients. Search `mara` and then `SYN-1002`; verify matching records. An unmatched query shows no results.
2. Clear search; select Mara, then Owen. Check the selected row, allergy reactions, medication lists, and loading state.
3. Navigate Dashboard → Medication Safety → Patients. Owen should remain selected. Change patient or clear selection from the context toolbar.
4. Select Theo (`SYN-1004`) to see unavailable information; select Nadia (`SYN-1005`) to see no known allergies and no documented medications.
5. Rapidly switch between patients; the final selection must be the only profile displayed.
6. To exercise error UI locally, temporarily reject the relevant mock method, then restore it and use Retry. Deterministic demo records intentionally do not fail randomly.

## Official team architecture

The planned backend is Python FastAPI with SQLite and synthetic FHIR records. Medication safety findings come from backend rules; LLM explanations must use only verified findings. The frontend uses normalized types, not raw FHIR. The planned summary endpoint is GET /patients/{id}/summary; its nested schema still requires agreement. Stage 1 integrates only the existing safety endpoint for its separate demo fixture; all directory/profile/summary services remain mocked.

## Canonical data alignment status

The designated backend/data/patients.json file is not present in this checkout or fetched origin/main. The current backend loader does not read that path and only supports its separate demo fixture. Owen already has the approved fictional sertraline 50 mg orally once daily entry in frontend mocks. Canonical equality cannot be established until the file/schema is supplied. See [Stage 2 alignment handoff](PATIENT_ALIGNMENT.md).
