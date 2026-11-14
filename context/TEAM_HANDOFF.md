# Team handoff

## Get the frontend running

The commands below assume Phase 1/2 work and these docs have been committed and pushed first. At documentation time, `frontend/` was still untracked locally; cloning the remote alone may not yet include it.

```bash
git clone https://github.com/Kshah965/patient360.git
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

`npm run preview` serves an existing production build. There is no `npm test` script. Build and lint previously passed, as did all six patient tests. Browser navigation and visual behavior still need manual checks. The earlier dependency installation reported seven moderate advisories; no dependency upgrades were performed as part of this documentation task.

## Demo walkthrough

1. Open Patients, search `Mara` or `SYN-1002`, and select a patient name.
2. Inspect allergies, medications, conditions, history, encounters, and available dated vitals.
3. Navigate to Dashboard and Medication Safety: the same selected patient should remain visible.
4. Use Change patient or return to Patients; Clear selection removes the active record. Reload resets selection.
5. Try an unmatched search and rapidly switch selections to inspect empty/loading behavior.

Generate Summary, medication selection, and Check Safety are intentionally disabled. They must not be presented as completed features.

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

These are scenarios for future demonstration work, not implemented safety results. Dates are fixed fixtures; ages are derived from birth dates. Nulls and empty lists carry different meanings. Preserve synthetic/demo labeling.

## Connect a backend later

Read [API_INTEGRATION.md](API_INTEGRATION.md) and [frontend/PATIENT_API.md](../frontend/PATIENT_API.md). Keep components calling the existing typed adapter; replace the mock implementation at `frontend/src/services/clinicalApi.ts` once an HTTP adapter is agreed and implemented.

Coordinate endpoint URLs, schema mapping, error handling, request cancellation, local API configuration, and CORS with backend teammates. The frontend currently assumes no endpoint paths. Backend teammates own Node.js services, SQLite, and eventual OpenAI calls; frontend work owns UI and client integration. Summary and safety contracts remain future work.

No application source, dependencies, commits, or pushes were changed by this documentation task.
