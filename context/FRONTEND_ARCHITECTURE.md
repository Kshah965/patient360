# Frontend architecture

## Existing setup

The existing `frontend/` application uses React 19, TypeScript 6, and Vite 8. `main.tsx` mounts the application in React StrictMode. Vite includes the React and Tailwind CSS 4 plugins. `src/index.css` imports Tailwind and defines navy, teal, white, and light-gray theme tokens.

`components.json` configures shadcn/ui's New York style, TypeScript, CSS variables, and Lucide icons. Local Button, Card, and Badge primitives live in `components/ui/`; Button uses Radix Slot and class-variance-authority. `cn()` combines clsx and tailwind-merge. The `@/` alias resolves to `src/` through Vite and TypeScript configuration. Directory search and medication controls use native HTML inputs/selects.

## Structure

```text
frontend/
├── src/
│   ├── App.tsx                    # Router and shared provider
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Tailwind import and theme
│   ├── components/
│   │   ├── layout/AppShell.tsx    # Sidebar, header, demo notice
│   │   ├── WorkspaceOverview.tsx  # Page composition for clinical workflows
│   │   ├── PatientDirectory.tsx   # Search and selectable patient table
│   │   ├── EmergencySummaryPanel.tsx # Generation and structured report
│   │   ├── PrescriptionChecker.tsx # Medication selection/check workflow
│   │   ├── MedicationSearch.tsx    # Curated catalog filter/select
│   │   ├── SafetyResults.tsx       # Prioritization and expansion
│   │   ├── SafetyAlert.tsx         # Finding details and sources
│   │   ├── AlternativeOptions.tsx  # Supplied alternatives only
│   │   ├── PatientProfile.tsx     # Clinical profile and request states
│   │   └── ui/                    # Button, Card, Badge
│   ├── hooks/                    # usePatient and usePatientSearch
│   ├── state/                    # PatientContext and PatientProvider
│   ├── services/                 # Clinical API adapter and mock implementation
│   ├── types/clinical.ts          # Patient and API contracts
│   ├── mocks/patients.ts          # Seven fictional records
│   ├── lib/                      # Styling, age, and date helpers
│   └── assets/                   # Retained starter assets
├── tests/patients.test.mjs
├── PATIENT_API.md
├── components.json
├── vite.config.ts
└── package.json
```

Retained starter assets and `App.css` are not part of the active dashboard design. `frontend/README.md` remains the starter documentation; these context files describe the actual application.

## Routes and composition

| Route | View |
| --- | --- |
| `/` | Clinical Dashboard with selected patient profile |
| `/patients` | Searchable directory plus selected patient profile |
| `/medication-safety` | Same patient context, with mock safety checking presented first |
| Any other path | Not-found view with a dashboard link |

All views use AppShell and WorkspaceOverview. EmergencySummaryPanel loads predefined demo reports; PrescriptionChecker loads predefined mock scenario results. `usePrescriptionCheck` wraps a patient/drug-scoped store with cancellation and identity guards; results clear immediately on input changes. See [safety integration](../frontend/MEDICATION_SAFETY_API.md). `useEmergencySummary` wraps a patient-scoped request store using useSyncExternalStore. Identity changes reset report output immediately, cleanup aborts requests, and sequence/identity guards prevent stale updates. Summaries reset on route unmount. See [summary integration](../frontend/EMERGENCY_SUMMARY_API.md).

## State and asynchronous requests

`PatientProvider` wraps Routes inside BrowserRouter. It owns selected ID, patient detail, loading, and error state, plus select, clear, and retry actions. `usePatient()` exposes that context. Selection survives route navigation for the current session; reload resets it. It is not stored in local storage or a database.

Selection immediately clears previous details. An AbortController cancels the prior detail request, and a sequence guard prevents older responses from updating state. Clear selection cancels pending work as well.

`usePatientSearch(query)` owns directory results, loading/error state, and retries. It cancels obsolete searches and suppresses results belonging to another query. Search text is local to the directory and resets when that view unmounts.

Components access patient data through `services/clinicalApi.ts`; they do not read fixture data directly. Future backend integration should replace the adapter, preserving these typed boundaries.
