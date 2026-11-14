# Stage 2: patient alignment inspection and handoff

> Historical stage notes below. The completed live summary/check/explanation integration is documented in [PERSON3_HANDOFF.md](../context/PERSON3_HANDOFF.md); use [DEMO.md](../DEMO.md) for current launch/demo instructions. Backend Owen has no sertraline entry.

## Status: canonical data update blocked

Inspection performed on `krishna-frontend` after `git fetch origin`. Both HEAD and freshly fetched origin/main point to `53d79cf2a754b476b9f1e33da943ea0f8ee1ffe0` (Merge pull request #2 from Kshah965/feature/safety-engine). There are no newer main commits or backend file differences. Existing uncommitted frontend/integration work was preserved; no merge, commit, push, or rebase was performed.

The user-designated canonical location is **backend/data/patients.json**, but that file and its schema are absent from both this checkout and origin/main. It was not created from assumptions. Canonical medication updates and frontend/canonical equality validation therefore cannot be completed until the teammate supplies the existing records/schema or identifies their actual branch/path.

The only current backend patient JSON is `backend/safety/fixtures/demo_patient.json`. It is not Owen and must not be relabeled or used as his canonical record. `safety/routes.py` reads it for ID demo only; it never loads backend/data/patients.json.

## Owen's current frontend record

ID SYN-1002, born 1955-08-09; age 71 as of 2026-11-14. No known allergies documented.

| Medication | Existing dose | Existing frequency |
| --- | --- | --- |
| Warfarin | 3 mg | Daily |
| Sertraline | 50 mg orally | Once daily |
| Metoprolol tartrate | 25 mg | Twice daily |
| Lisinopril | 10 mg | Daily |
| Atorvastatin | 20 mg | Nightly |

The approved fictional sertraline entry already exists exactly once in `src/mocks/patients.ts`; no additional entry was added. Route is currently represented in the display dose string, and the list represents current medications rather than containing a separate status field. The profile and emergency summary use the same medication data. All seven records remain available. No clinical records were changed during this stage.

Once the canonical schema is available, add sertraline only if absent, following its native dose/route/frequency/status fields. Preserve every other medication and all non-medication patient fields. If an existing sertraline entry differs, report it instead of adding a duplicate or silently changing its dose.

A regression assertion now checks Owen's complete five-medication list and uniqueness, alongside the existing profile/summary consistency checks. This verifies frontend consistency only, not equality to a missing canonical file.

## Actual engine check — not Owen HTTP support

Called the existing `safety.engine.check()` with a test DTO projected from Owen's actual frontend fixture: derived age, the same medication names/doses/frequencies, explicit active status for the current list, and an empty documented-allergy list. No backend loader, route, or rule was modified.

The check used OFFLINE=1, in-memory interaction/cache databases, and a read-only copy of the committed Rx cache. No imported DDInter table was present; findings came from the current curated fallback data. Results can differ if another environment loads different interaction data.

Proposed drug ibuprofen returned **3 findings, 1 primary**:

| Implicated current medication | Backend severity | Priority | Backend verified | Source ID |
| --- | --- | --- | --- | --- |
| Warfarin | major | primary | true | null |
| Sertraline | moderate | collapsed | true | null |
| Lisinopril | moderate | collapsed | true | null |

Each source is a supplied `DDInter 2.0 Interaction Checker` label identifying its pair. No source URL or stable source ID is returned. These are backend metadata assertions, not independent clinical validation. None of these three findings is marked unverified. Other curated entries still contain TODO/unverified content.

Primary context includes two existing drugs in the engine's bleeding-risk set and the age-65+ NSAID note, each explicitly qualified as a prototype heuristic. Context does not alter severity.

The primary finding includes backend-suggested acetaminophen with rationale, indication, monitoring, source text, and alerts_found containing a warfarin caution. Alternative records have no verification flag; the frontend correctly retains their metadata but withholds recommendation details pending verification. No alternative was invented or substituted.

The frontend's predefined Owen scenario still contains two illustrative findings; it is a separately labeled limited mock response, not the engine's three-finding output. It must not be presented as the full backend assessment.

## Observed endpoint status

Offline in-process ASGI requests to the current app confirmed:

| Endpoint | Result |
| --- | --- |
| POST /patients/demo/check | 200 |
| POST /patients/SYN-1002/check | 404 |
| GET /patients | 404 |
| GET /patients/SYN-1002 | 404 |
| GET /patients/SYN-1002/summary | 404 |

The summary route was previously proposed by the team; no current implementation exists. No directory/profile implementation was found. Mock directory, profiles, summaries, and patient checking remain unchanged. The separate backend fixture mode still targets demo. Owen remains excluded from the HTTP allowlist. No alias or silent fallback was introduced.

## Exact teammate action items

1. Supply/publish the intended canonical patient file at backend/data/patients.json, or identify its actual location and schema. Confirm all seven IDs and retain missing-versus-known-empty distinctions.
2. Add the approved fictional sertraline entry to Owen using that schema if it is absent: 50 mg, oral, once daily, active. Preserve the existing four medications and all unrelated fields.
3. Replace the temporary get_patient(pid) fixture stub with a canonical-record lookup by exact ID. Preserve unknown-ID 404 behavior and retain demo as a separate fixture if desired.
4. Project Owen into the engine's existing DTO: age derived from birth date, active medications with name/optional rxcui/status, and documented allergies with allergen and recorded severity when available. Do not invent allergy severity. Owen's documented no-known-allergy status can map to an empty list.
5. The same indexed loader can retrieve all seven patients once their schemas are confirmed, but missing medication/allergy information must not silently become an empty known-negative list. Agree error/coverage handling for incomplete records before enabling their checks; the engine currently expects medication/allergy lists.
6. Add backend route tests confirming SYN-1002 resolves to Owen's actual context, and demo remains distinct. Confirm unknown IDs fail, active medications filter correctly, and no frontend patient ID is remapped.
7. Resolve the current severity-test/data discrepancy and provision a compatible FastAPI/Starlette/httpx environment. Do not change rules solely to satisfy stale expectations.
8. Later implement directory/profile/summary endpoints under an agreed response contract. No fake endpoint or FHIR parser was added here.

## Next frontend integration step after backend verification

When POST /patients/SYN-1002/check actually works and record parity is confirmed:

- Add SYN-1002 to the supported-ID guard and expose a real **selected patient** HTTP mode; retain the independent demo-fixture mode and mock mode.
- Keep request ID/drug correlation, AbortSignal, sequence guards, and resets on patient/medication/mode changes.
- Current normalization already handles major/moderate severity, duplication, sources, verification flags, alternatives, context, raw priority, and backend counts. Owen should show three actual returned findings under the tested data, with one primary, not a fixed two/six-finding story.
- Preserve backend verification as a supplied assertion; alternative verification needs agreement before recommendations become reviewable.
- Agree stable alert IDs, identity/data-version echoes, severity mapping, count semantics, normalized-drug matching, and meaningful error/coverage metadata.
- Keep patient/profile/summary services mocked until their real endpoints exist. No LLM integration is part of this stage.

## Checks and limitations

- Existing four backend JSON files parse successfully. Canonical JSON validation/update: blocked because the file is absent.
- Frontend build, ESLint, and all 24 automated tests passed after strengthening Owen's complete-list assertion.
- Existing backend pytest suite: **7 passed, 2 failed**. test_contraindicated_pairs expects contraindicated for clarithromycin/simvastatin, but current curated data returns major. test_route fails constructing TestClient due to installed httpx incompatibility (`unexpected keyword argument app`). No engine, backend tests, dependencies, or rules were changed.
- Tests used installed Python libraries, with the existing pure-Python dependency directory supplied on PYTHONPATH. No installation/upgrade was performed. Backend test databases were temporary; engine/ASGI checks used in-memory databases.
- Separate ASGI requests confirm demo works and Owen remains 404 despite the TestClient issue. These checks do not claim browser/CORS verification.
- Git diff checks passed. Canonical alignment remains pending the missing file; do not mark the canonical update complete.
