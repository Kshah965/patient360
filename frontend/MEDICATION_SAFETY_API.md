# Medication safety frontend — Phase 4

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

## Stage 1 update

A typed HTTP adapter is now available for backend fixture `demo` through explicit UI context selection. All patient/profile/summary services and frontend-patient checks remain mocked. See [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) for configuration, wire validation, normalization, and remaining Owen blockers. The mock-specific Phase 4 details below remain applicable.

## Implemented scope

A doctor can select a synthetic patient, search/select one of eight demo medications, submit a mock check, review prioritized findings, expand/collapse additional findings, and inspect supplied sources and alternatives. No backend, normalization API, database, FHIR parser, rule engine, or LLM calls are implemented.

Medication options and exact scenario responses are separate from components in `src/mocks/medications.ts` and `src/mocks/prescriptionResults.ts`. `mockClinicalApi.checkPrescription` delays 300ms, honors AbortSignal, rejects unknown patients/catalog drugs, and returns cloned deterministic data. It performs scenario lookup only, not interaction inference. Other patient/drug combinations return no findings in the limited dataset, not a safety clearance. Missing patient information appears in limitations.

## Demonstration scenarios

- **Owen Calder (SYN-1002) + ibuprofen:** two predefined potential bleeding-risk findings involving warfarin and sertraline. His approved sertraline 50 mg orally once daily and unchanged warfarin 3 mg Daily are present. No patient data was changed for Phase 4.
- **Mara Ellison (SYN-1001) + amoxicillin:** a conflict with the exact documented amoxicillin allergy and recorded hives/facial swelling. The patient does not have a separately documented broad penicillin allergy. The fixture preserves that distinction; no allergy was changed.

Interaction sources are explicitly pending backend verification; there are no fabricated DDInter IDs, citations, or clinical severity classifications. Mara's source is the synthetic allergy record, not clinical validation. No management guidance or alternatives are invented.

## Frontend API types

Defined in `src/types/clinical.ts`:

```ts
checkPrescription(
  patientId: string,
  prescription: PrescriptionRequest,
  signal?: AbortSignal
): Promise<PrescriptionCheckResult>
```

| Type | Fields |
| --- | --- |
| `PrescriptionRequest` | `drug: string` (catalog values are lowercase names) |
| `PrescriptionCheckResult` | `patientId`, `prescription`, `alerts: SafetyAlert[]`, `limitations: string[]`, `provenance: 'synthetic-demo' | 'backend-engine'`, optional backend metadata |
| `AlertSeverity` | `critical`, `high`, `moderate`, `low`, `unknown` |
| `SafetyAlert` | `id`, `severity`, optional `demoPriority`, `type`, `drugs`, optional `allergen`, `explanation`, `source`, optional `management`, `alternatives` |
| `SafetyAlert.type` | `interaction`, `allergy`, `contraindication`, `duplication`; no contraindication scenario is fabricated |
| `EvidenceSource` | `name`, optional `reference` and `url`, `status: 'verified' | 'pending' | 'backend-reported'`, optional backendVerified |
| `MedicationAlternative` | `medication`, `rationale`, `source`, optional `management` |

All string fields are plain text rendered with React escaping. Source links permit HTTP(S) only. Verified source status describes source availability, not validation of the entire check. Alternatives are displayed only when their source status is verified; none are supplied by these fixtures. No automatic substitution occurs.

### Priority and visibility

`src/lib/safety.ts` documents the order: **critical → high → moderate → low → unknown**. Actual backend severity must determine production priority. All fixture severities remain **unknown**. Separate `demoPriority` metadata (high/moderate/low) illustrates triage without claiming clinical severity; the UI labels both fields explicitly. This metadata is frontend demo-only and must not replace backend severity.

All findings tied for highest priority stay visible, along with every critical finding and any unclassified finding lacking a demo priority. Only genuinely lower display priorities collapse. Owen's result therefore starts at **1 of 2 findings shown**, never 1 of 6. Expanded counts use the actual array length. Lower findings remain accessible through an aria-expanded button and hidden region.

### Request lifecycle

`usePrescriptionCheck` creates a request store scoped to patient ID and proposed medication. Changing either immediately renders fresh idle state, and cleanup cancels the old request. Sequence guards suppress old completions even if transport ignores abort. Response patient/drug identity must match the request. Changing the medication search text clears medication selection and old output. Selecting another patient resets medication selection as well. Results/medication selection reset on route unmount; shared patient selection remains intact.

## Backend integration contract

Planned FastAPI route:

```http
POST /patients/{id}/check
Content-Type: application/json

{"drug":"ibuprofen"}
```

The team's example response contains `alerts` with severity, type, drugs, explanation, source, and alternatives. It is **not a finalized schema**. Stage 1 adds `src/services/httpSafetyApi.ts` with runtime validation and an adapter for the inspected response. Future schema changes still require agreement; see the Stage 1 handoff.

Questions for backend teammates:

1. Final severity vocabulary, ordering, and handling of unknown/unclassified findings; omit demoPriority from real engine output.
2. Stable alert IDs and whether patient/drug identity is echoed. The adapter may attach captured request identity when the agreed transport omits it.
3. Is source a string, object, or list? Agree evidence verification status, URLs/references, provenance, and the scope of DDInter/RxNorm/RxClass/curated fallback attribution. No such integrations exist here.
4. Alternative/rationale/source/management structure; preserve absence rather than inventing recommendations.
5. Allergen representation and distinction between missing allergy data and no known allergies.
6. Dataset coverage/limitations, empty alerts semantics, missing-data indicators, and transport error/status behavior.
7. API base URL and production CORS policy. Stage 1 adds VITE_API_BASE_URL; no proxy is required for the current permissive dev CORS.

The backend engine determines findings and severity. Future LLM explanations must use verified findings only. Never put API keys in the frontend.

## Verification

From `frontend/`:

```bash
npm run build
npm run lint
node --test tests/patients.test.mjs
npm run dev
```

Build, lint, and all 16 tests pass. The six Phase 4 tests cover catalog selection/filtering, deterministic scenarios and evidence labeling, stable severity order and critical/tied visibility, initially collapsed findings/counts, missing/empty/error responses, alternatives absence, source URL filtering, cancellation, retry, patient/drug changes, and identity mismatch. The existing ten patient/summary tests also pass.

Tests use server rendering and independent request stores, not browser interactions. Manual verification remains necessary for clicks, expand/collapse, responsive layout, and React lifecycle cleanup:

1. Select Owen; open Medication Safety. Search/select Ibuprofen and click Check Medication Safety.
2. Inspect loading, the prominent warfarin finding, and the 1 of 2 count. Expand and collapse the sertraline finding.
3. Change to Acetaminophen; previous results should clear immediately. Run another check to see the limited-dataset empty result.
4. Switch to Mara, choose Amoxicillin, and check the allergy reaction/source. Select Theo to inspect missing-data limitations.
5. Change patient or medication while a request is pending; old results must not appear under new context. Clear patient selection to verify the selection prompt.
6. Recheck search, Dashboard navigation, patient details, and emergency summaries. To exercise retry manually, temporarily reject the mock method locally, then restore it; there are no random demo failures.

Stopped before Phase 5. No commits, merges, pushes, or dependency additions are performed automatically.
