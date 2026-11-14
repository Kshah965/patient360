# Patient360 project overview

Patient360 is a MedTech hackathon prototype intended to help emergency department clinicians quickly review patient context and assess a proposed medication. The goal is a focused, readable end-to-end demonstration within a 12–24-hour hackathon, using entirely fictional records.

## Intended users and core features

This is a doctor-facing clinical decision-support workspace, not a patient portal.

1. **AI emergency patient summaries — planned:** condense conditions, allergies, medications, and relevant history into an easy-to-scan emergency report. The current UI contains a disabled Generate Summary action; no summary service or AI integration exists.
2. **Medication safety checking — planned:** demonstrate potential drug interactions, allergy conflicts, and contraindications for a proposed prescription. The current UI contains disabled medication selection and Check Safety controls; no checking logic or results exist.

The completed foundation is a patient directory and clinical profile shared across Dashboard, Patients, and Medication Safety pages.

## Technology and responsibilities

| Area | Technology | Status |
| --- | --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8 | Implemented |
| Styling and UI | Tailwind CSS 4, local shadcn/ui components, Lucide icons | Implemented |
| Routing and state | React Router 7, React Context and hooks | Implemented |
| Demo records | Seven typed synthetic fixtures and asynchronous mock services | Implemented |
| Backend | Lightweight Node.js service | Planned; owned by backend teammates |
| Database | SQLite for demo data | Planned; no database integration exists here |
| Summarization | OpenAI API through the backend | Planned; no integration exists here |

Frontend work is limited to presentation, state, mock services, and future API integration. Backend endpoints, database implementation, and OpenAI integration belong to other teammates.

## Goals and boundaries

- Prioritize patient identity, allergy visibility, readable clinical information, and fast navigation.
- Preserve missing-information distinctions rather than inventing clinical values.
- Keep the frontend service contract replaceable without coupling components to backend transport details.
- Use synthetic data only. Summaries and safety checks must remain demonstration features, not clinically validated medical advice.

See [current progress](CURRENT_PROGRESS.md) and [API integration](API_INTEGRATION.md) for exact implementation boundaries.
