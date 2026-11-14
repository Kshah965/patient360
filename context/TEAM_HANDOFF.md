# Team handoff

## Get the frontend running

Use the krishna-frontend branch. New local frontend changes must be committed and pushed by the owner before teammates can retrieve them.

```bash
git clone --branch krishna-frontend https://github.com/Kshah965/patient360.git
cd patient360/frontend
npm ci
npm run dev
```

Use the local URL printed by Vite. Run commands from `frontend/`, which owns the package manifest and lockfile. No backend, database, API key, or environment file is required for the mock demo.

Use a modern Node version supported by the installed toolchain. The custom test loader requires Node 22.15+; the earlier successful development checks used Node 25.2.1. The repository does not pin a Node version.

```bash
npm run build
npm run lint
node --test tests/patients.test.mjs
```

`npm run preview` serves an existing production build. There is no `npm test` script. Build and lint previously passed, as did the 16 patient/summary/safety tests. Browser navigation and visual behavior still need manual checks. The earlier dependency installation reported seven moderate advisories; no dependency upgrades were performed as part of this documentation task.

## Demo walkthrough

1. Open Patients, search `Mara` or `SYN-1002`, and select a patient name.
2. Inspect allergies, medications, conditions, history, encounters, and available dated vitals.
3. Navigate to Dashboard and Medication Safety: the same selected patient should remain visible.
4. Use Change patient or return to Patients; Clear selection removes the active record. Reload resets selection.
5. Try an unmatched search and rapidly switch selections to inspect empty/loading behavior.

Generate Emergency Summary loads a predefined demo report for the selected patient. Medication Safety now supports curated medication selection and predefined checks; select Owen + Ibuprofen for two mock findings or Mara + Amoxicillin for the exact documented allergy conflict. See [safety handoff](../frontend/MEDICATION_SAFETY_API.md). See [summary handoff](../frontend/EMERGENCY_SUMMARY_API.md) for testing and response contracts.

## Understand the mock data

Fixtures live in `frontend/src/mocks/patients.ts` and are entirely fictional:

| Record | Useful scenario |
| --- | --- |
| SYN-1001 — Mara Ellison | Documented amoxicillin allergy and asthma |
| SYN-1002 — Owen Calder | Multiple medications; no known allergies |
| SYN-1003 — Leila Marlow | Diabetes, chronic kidney disease, documented allergy |
| SYN-1004 — Theo Wren | Incomplete history, unknown allergies, missing sex/vitals |
| SYN-1005 — Nadia Vale | No known allergies and no documented current medications |
| SYN-1006 — Felix Rowan | Multiple documented allergies |
| SYN-1007 — Iris Fenwick | Chronic conditions and incomplete medication reconciliation |

Owen/ibuprofen and Mara/amoxicillin have predefined mock results; no live safety engine is integrated. Dates are fixed fixtures; ages are derived from birth dates. Nulls and empty lists carry different meanings. Preserve synthetic/demo labeling.

## Connect a backend later

Read [API_INTEGRATION.md](API_INTEGRATION.md) and [frontend/PATIENT_API.md](../frontend/PATIENT_API.md). Keep components calling the existing typed adapter; replace the mock implementation at `frontend/src/services/clinicalApi.ts` once an HTTP adapter is agreed and implemented.

Coordinate endpoint URLs, schema mapping, error handling, request cancellation, local API configuration, and CORS with backend teammates. The frontend currently assumes no endpoint paths. Backend teammates own Python FastAPI, SQLite, synthetic FHIR handling, and rule-based safety checks. Person 3 owns frontend, the LLM explanation layer, and pitch. LLM explanations must describe verified findings only. Summary nested wire schemas and safety contracts require agreement.

Phases 3–4 add frontend mock summary and safety workflows only. No dependencies, backend code, commits, or pushes were added automatically.
