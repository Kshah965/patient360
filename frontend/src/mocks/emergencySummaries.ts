import { patients } from './patients'
import type { EmergencySummary } from '../types/clinical'

// Fixed, record-supported verification gaps for each existing fictional record.
// No medication risk inference or generated clinical recommendations.
const missingInformation: Record<string, string[]> = {
  'SYN-1001': [],
  'SYN-1002': [],
  'SYN-1003': ['Vital signs not available.', 'Recent renal laboratory results not available in the record.'],
  'SYN-1004': ['Sex not recorded.', 'Allergy information not available.', 'Medication information not available.', 'Conditions not available.', 'Medical history not available.', 'Vital signs not available.', 'Outside records not yet available.'],
  'SYN-1005': [],
  'SYN-1006': ['Vital signs not available.'],
  'SYN-1007': ['Allergy information not available.', 'Medication reconciliation incomplete.'],
}

// Predefined snapshots of the seven fixtures. Values are projected directly from
// the source records to avoid transcription drift; no AI, FHIR parsing, or rules.
export const emergencySummaries: Record<string, EmergencySummary> = Object.fromEntries(
  patients.map(p => [p.id, {
    patient: { id: p.id, name: p.name, dateOfBirth: p.dateOfBirth, sex: p.sex },
    medications: p.medications,
    allergies: p.allergies,
    conditions: p.conditions,
    history: p.history,
    encounters: p.encounters,
    observations: p.vitals,
    medication_context: p.id === 'SYN-1002' ? ['Warfarin is an anticoagulant.'] : [],
    critical_alerts: [], // The records contain no verified safety findings.
    missing_information: missingInformation[p.id],
    provenance: 'synthetic-demo',
  } satisfies EmergencySummary]),
)
