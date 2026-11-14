# Emergency summary: frontend contract and handoff

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

## Implemented in Phase 3

`ClinicalApi.getEmergencySummary(patientId: string, signal?: AbortSignal): Promise<EmergencySummary>` returns a cloned, predefined synthetic snapshot after the mock adapter's 300ms delay. Unknown IDs reject; AbortSignal is honored. The seven snapshots in `src/mocks/emergencySummaries.ts` project existing patient facts directly, with fixed record-supported missing-information notes. No LLM, risk inference, FHIR parsing, or recommendations are implemented.

`EmergencySummaryPanel` supports Generate Emergency Summary, loading skeleton, error/retry, and structured report output. `useEmergencySummary` creates a patient-scoped request store. Identity changes render a fresh idle state immediately; cleanup aborts old requests. Sequence and identity checks also reject stale or mismatched responses even if transport ignores cancellation. The summary resets on route unmount; patient selection still persists through the existing provider.

Priority information and allergies precede patient overview and clinical context. All mock `critical_alerts` arrays are empty because the records contain no verified safety findings. The UI explicitly says safety has not been assessed. Allergy facts are displayed without inferring severity from reactions. Historical observations retain their recording date. Missing values remain distinct from empty documented lists.

## Planned backend integration — not implemented

The official architecture is Python FastAPI + SQLite + synthetic FHIR records, with rule-based medication safety checks and LLM explanations only for verified findings. Backend teammates own those functions. The frontend does not consume FHIR directly or call OpenAI.

The team-planned route is **GET /patients/{id}/summary**. No HTTP call or endpoint is implemented in this frontend. Expected top-level information includes medications, allergies, conditions, encounters, observations, and critical_alerts.

The current `EmergencySummary` in `src/types/clinical.ts` is a **frontend-normalized model**, not a claim about an agreed backend wire schema:

| Field | Current frontend shape |
| --- | --- |
| `patient` | ID, name, dateOfBirth, nullable sex; age is derived |
| `medications` | Existing name/dose/frequency array or null |
| `allergies` | Existing documented/none-known/unknown status union |
| `conditions`, `history` | String arrays or null |
| `encounters` | Existing date/reason/outcome array or null |
| `observations` | Existing dated vital-sign object or null |
| `medication_context` | Factual medication notes (string array), separate from risk findings; backend mapping requires agreement |
| `critical_alerts` | `{ text, severity: 'critical' | 'warning' | 'info', source }[]` |
| `missing_information` | Record-supported strings |
| `provenance` | Literal `synthetic-demo` |

Agree the nested schemas, units/date formats, null-versus-empty semantics, ID correlation, allergy status encoding, critical-alert verification/source/severity format, and error/status behavior with the backend teammate. In particular, observations may be FHIR-derived lists on the backend and require normalization. Patient identity, history, missing-information notes, and provenance may need mapping/enrichment from an existing patient response rather than fields on the summary endpoint. No undocumented field is assumed available over HTTP.

Only display alerts supported by verified findings and their sources. A future HTTP adapter must map the agreed payload to this model, pass AbortSignal to fetch, and reject errors. API base URL/CORS and response validation remain integration work; no API keys belong in frontend configuration.

## Approved demo data

Owen (SYN-1002) now includes the approved fictional active medication sertraline 50 mg orally once daily. His existing warfarin 3 mg Daily entry is unchanged. His summary includes the factual medication context “Warfarin is an anticoagulant.” This is not a verified interaction finding. No diagnoses, allergies, or history were added. Proposed ibuprofen is a Phase 4 safety-check input, not a current medication.

## Verification and manual walkthrough

From `frontend/`:

```bash
npm run build
npm run lint
node --test tests/patients.test.mjs
npm run dev
```

Ten automated tests pass, including the existing six patient tests. Summary tests cover all seven records, exact fact projection, priority ordering, missing data, loading/failure/retry state transitions, cancellation, superseded requests, and identity mismatch. Store tests exercise lifecycle safeguards independently of React; they do not simulate browser clicks or effect cleanup.

In the browser, select a patient on Patients, click Generate Emergency Summary, and inspect the loading skeleton and report. Compare Theo's missing information with Nadia's no-known-allergies record. Generate again and quickly switch patients; no previous report should appear. Search and navigate all three pages; selected identity should persist, while summary output resets on route unmount. Error/retry can be exercised locally by temporarily rejecting the mock summary method; no random failures are built into the demo. Browser interaction/visual verification has not been performed by the implementation agent.

Phase 4 now adds mock medication checks separately; see [Medication Safety API](MEDICATION_SAFETY_API.md). Summary alerts are not automatically populated from check results.
