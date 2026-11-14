import type { EmergencySummary, Patient } from '@/types/clinical'
/** Presentation projection only: no new clinical classifications or recommendations. */
export function summaryFromPatient(p: Patient): EmergencySummary {
  const missing: string[] = []
  for (const [key, label] of [['medications', 'Medication information'], ['conditions', 'Conditions'], ['history', 'Medical history'], ['encounters', 'Encounters'], ['vitals', 'Complete vital signs']] as const) {
    if (p[key] === null) missing.push(`${label} not available.`)
  }
  if (p.sex === null) missing.push('Sex not recorded.')
  if (p.allergies.status === 'unknown') missing.push('Allergy information not available.')
  return {
    patient: { id: p.id, name: p.name, dateOfBirth: p.dateOfBirth, sex: p.sex },
    medications: p.medications, allergies: p.allergies, conditions: p.conditions,
    history: p.history, encounters: p.encounters, observations: p.vitals,
    recorded_observations: p.observations ?? [], medication_context: [],
    critical_alerts: (p.criticalAlerts ?? []).map(a => ({ text: a.message, severity: a.severity, source: 'Patient record · deterministic backend alert', kind: a.kind })),
    missing_information: missing, provenance: 'backend-record',
  }
}
