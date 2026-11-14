import type { SafetyAlert } from '../types/clinical'

// Exact scenario fixtures, not a safety engine. Severity is intentionally unknown.
// demoPriority demonstrates UI triage without asserting clinical classifications.
const pendingSource = { name: 'Predefined hackathon scenario; clinical evidence pending backend verification', status: 'pending' as const }
export const prescriptionScenarios: Record<string, SafetyAlert[]> = {
  'SYN-1002:ibuprofen': [
    {
      id: 'demo-owen-warfarin-ibuprofen', severity: 'unknown', demoPriority: 'high', type: 'interaction',
      drugs: ['warfarin', 'ibuprofen'],
      explanation: 'This predefined scenario illustrates potential bleeding risk involving current warfarin and proposed ibuprofen. It demonstrates how a medication conflict would be presented; no safety engine has verified this result.',
      source: pendingSource, alternatives: [],
    },
    {
      id: 'demo-owen-sertraline-ibuprofen', severity: 'unknown', demoPriority: 'moderate', type: 'interaction',
      drugs: ['sertraline', 'ibuprofen'],
      explanation: 'This predefined scenario illustrates potential bleeding risk involving current sertraline and proposed ibuprofen. Its lower demo display priority is illustrative and does not establish relative clinical severity.',
      source: pendingSource, alternatives: [],
    },
  ],
  'SYN-1001:amoxicillin': [
    {
      id: 'demo-mara-amoxicillin-allergy', severity: 'unknown', demoPriority: 'high', type: 'allergy',
      drugs: ['amoxicillin'], allergen: 'Amoxicillin',
      explanation: 'Proposed amoxicillin matches the documented amoxicillin allergy in this synthetic record. Recorded reaction: hives and facial swelling. A broader penicillin allergy is not documented.',
      source: { name: 'Synthetic patient SYN-1001, allergies: Amoxicillin', reference: 'frontend/src/mocks/patients.ts', status: 'verified' },
      alternatives: [],
    },
  ],
}
