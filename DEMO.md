# Patient360 clinician demo

## Start reliably

Use the current synthetic seed/SQLite records. Never delete medprofile.db (it may also contain DDInter data); to undo rehearsal changes (prescriptions, recorded vitals) run `python -m patients.seed`, which only resets patient tables. The canonical seed is backend/patients/data/seed_patients.json. No extra sertraline entry is required for this walkthrough.

Backend terminal, from the repository root, using the provisioned Python environment:

```bash
cd backend
OFFLINE=1 LLM_ENABLED=0 python -m uvicorn main:app --reload
```

If a fresh environment is needed first:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
# Then use backend/.venv/bin/python instead of python in the backend command.
```

Frontend configuration: create frontend/.env.local:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_PATIENT_DATA_MODE=backend
```

Frontend terminal:

```bash
cd frontend
npm run dev
```

Use the URL printed by Vite. On a fresh checkout install existing frontend dependencies first; CLAUDE.md notes npm install rather than npm ci if the lockfile is out of sync. Restart Vite after changing env settings.

Templates are a complete offline explanation path. Optional GPT-4.1 mini use requires OPENAI_API_KEY, LLM_ENABLED=1 and optionally OPENAI_MODEL in the **backend** shell. Never use a VITE key variable. Backend/.env.example documents the settings; files are not loaded automatically. Do not enable paid model calls for automated tests.

## 90-second clinician-facing script

“Emergency care starts with incomplete context. Patient360 brings patient history and proposed-medication checks into one clinical workspace.”

1. Choose **FastAPI · Synthetic** in the header. Open Patients and search **Owen** or **SYN-1002**.
2. Select Owen. Point out his documented allergy status, conditions and actual current medications: **warfarin 3 mg daily, metoprolol tartrate 25 mg twice daily, lisinopril 10 mg daily, atorvastatin 20 mg nightly**.
3. Click **Generate Emergency Summary**. “This structured report comes from the same backend record. Critical information comes first: the backend flags warfarin as a blood thinner. Missing information stays explicit.”
4. Optionally click **Prepare explanation** below the summary. “These are source-bound handoff excerpts. With no provider key, the application clearly labels the deterministic template; the patient facts are still available.”
5. Open Medication Safety, retaining Owen's selection. In **Search medications** type `adv` and pick **Advil (ibuprofen)** (brand names resolve to the ingredient), then **Check Medication Safety**.
6. “The deterministic engine found four interactions but shows one: the **major warfarin bleeding risk**, with this patient's context (age 65+). The moderate metoprolol and lisinopril findings and the minor atorvastatin one are collapsed.” The counter reads **1 of 4 findings shown**. Expand to show the rest. Point out **acetaminophen** under *Alternatives for review*, with its rationale and source: suggested, never substituted.
7. Review the backend severity, verification flag, management text and supplied source labels. “Those verification flags are backend metadata, not independent clinical validation. Missing source IDs remain missing.”
8. Click **Prepare explanation**. “The explanation reads this patient's stored check ID. Only eligible verified findings can reach the model. AI cannot modify severity, add interactions or decide whether to prescribe.” Show the **Deterministic template** label by default; show **AI-assisted source excerpts** only after a real successful provider call.
9. **Compare options side by side.** Scroll to **Compare medications for Owen Calder**. Type `ibuprofen`, press **Compare**, then click **+ acetaminophen (pain)**. “Each column is this patient's risk profile (Major vs Moderate, with the reasons) next to facts from the drug's FDA label, each with the exact label sentence one click away.” Open **Prescribe ibuprofen** and press **Confirm**: the server re-runs the check and asks for an override reason. Cancel, then prescribe acetaminophen to show the medication list update.
10. **Missing information is never “safe”.** Change patient to **Theo Wren (SYN-1004)** and check ibuprofen: zero findings, but a banner says the medication list and allergies **could not be checked**. In his profile, **Record vitals now** (e.g. BP 142/90, HR 104): the new readings show at once and the ones not taken stay “Not recorded”.
11. Optional: **Walter Haines (SYN-1000)** + amoxicillin shows the penicillin-class allergy alert with his recorded reaction.
12. Close: “Patient360 focuses the review without replacing clinical judgment. No matches in a limited dataset are not proof of safety.”

## Expected-result checklist

- [ ] Header says FastAPI; eight seed patients are available on a fresh seeded DB.
- [ ] Owen ID remains SYN-1002 across pages; no demo-ID alias is used.
- [ ] Profile and live summary both show the same four backend medications.
- [ ] No sertraline finding is manufactured. Older mock Owen data is a separate labeled demo dataset.
- [ ] Summary flags blood thinner use; no narrative is required to see facts.
- [ ] Ibuprofen check returns the actual backend response, expected two findings/one primary with current curated fallback data.
- [ ] Sources and raw severity/priority/verification are visible; check ID is preserved.
- [ ] Explanation uses that check ID and displays sources; no-key mode is explicitly a template.
- [ ] Alternatives are not automatically substituted. Suggestions lacking verification metadata remain withheld, with the reason shown.
- [ ] Patient/drug/source changes clear stale results; backend errors do not produce mock success.
- [ ] DDInter attribution is visible.
- [ ] Owen + Advil/ibuprofen: 1 of 4 findings shown; acetaminophen offered as an alternative with its source.
- [ ] Comparison: ibuprofen **Major**, acetaminophen **Moderate**; prescribing ibuprofen asks for an override reason; acetaminophen prescribes and appears in the profile.
- [ ] Theo: “Parts of this check could not run” banner; recorded vitals appear with missing ones marked “Not recorded”.
- [ ] After rehearsing, reset with `cd backend && .venv/bin/python -m patients.seed` (keeps DDInter).

Counts may differ in an existing edited database or with a different DDInter import. Inspect actual data before presenting; never alter records/rules to force a count. Walter Haines (SYN-1000) and legacy demo are different patients and must not be presented as Owen.

## Known limitations / honest pitch language

Synthetic-data prototype, not clinically validated medical advice. Rule coverage is limited; missing records, absent findings, partial observations and unverified alternatives need review. No dose/renal/pregnancy/supplement/EHR claims. The LLM is constrained to exact evidence excerpts and cannot add clinical prose beyond approved facts. Paid provider access has not been live-tested. Edited/imported records intentionally use local templates. Existing backend TestClient/dependency and severity-expectation failures are documented in context/PERSON3_HANDOFF.md. Full manual browser testing remains required.
