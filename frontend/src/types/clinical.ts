export type AllergyRecord =
  | { status: 'documented'; items: { substance: string; reaction: string }[] }
  | { status: 'none-known' | 'unknown'; items: [] }

export interface Patient {
  id: string
  name: string
  dateOfBirth: string // YYYY-MM-DD; age is derived in the UI
  sex: string | null
  allergies: AllergyRecord
  medications: { id?: number; name: string; dose: string; frequency: string }[] | null
  conditions: string[] | null
  history: string[] | null
  encounters: { date: string; reason: string; outcome: string }[] | null
  observations?: { recordedAt: string; category: 'vital' | 'lab'; name: string; value: string; unit: string | null }[]
  criticalAlerts?: { severity: 'high' | 'moderate'; kind: string; message: string }[]
  vitals: { recordedAt: string; bloodPressure: string; heartRate: number; temperatureC: number; oxygenSaturation: number } | null
}
export type PatientSummary = Pick<Patient, 'id' | 'name' | 'dateOfBirth' | 'sex'> & { indicator: string }
export interface ClinicalApi {
  searchPatients(query: string, signal?: AbortSignal): Promise<PatientSummary[]>
  getPatient(patientId: string, signal?: AbortSignal): Promise<Patient>
  getEmergencySummary(patientId: string, signal?: AbortSignal): Promise<EmergencySummary>
  checkPrescription(patientId: string, prescription: PrescriptionRequest, signal?: AbortSignal): Promise<PrescriptionCheckResult>
}

/** Frontend-normalized shape; nested backend response schemas require agreement. */
export interface EmergencySummary {
  patient: Pick<Patient, 'id' | 'name' | 'dateOfBirth' | 'sex'>
  medications: Patient['medications']
  allergies: AllergyRecord
  conditions: Patient['conditions']
  history: Patient['history']
  encounters: Patient['encounters']
  observations: Patient['vitals']
  medication_context: string[] // Factual medication context; not interaction findings.
  critical_alerts: {
    text: string
    severity: 'critical' | 'warning' | 'info' | 'high' | 'moderate'
    kind?: string
    source: string // Identifies the verified record/finding supporting the alert.
  }[]
  missing_information: string[]
  recorded_observations?: Patient['observations']
  provenance: 'synthetic-demo' | 'backend-record'
}

export type AlertSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'unknown'
export interface EvidenceSource {
  name: string
  reference?: string
  url?: string
  status: 'verified' | 'pending' | 'backend-reported'
  backendVerified?: boolean // Backend assertion only, not independent clinical validation.
}
export interface MedicationAlternative {
  medication: string
  rationale: string
  source: EvidenceSource
  management?: string
  indication?: string
  alertsFound?: string[]
}
export interface PrescriptionRequest { drug: string }
export interface SafetyAlert {
  id: string
  severity: AlertSeverity
  /** Illustrative display priority only; never a clinical severity assignment. */
  demoPriority?: 'high' | 'moderate' | 'low'
  type: 'interaction' | 'allergy' | 'contraindication' | 'duplication'
  drugs: string[]
  allergen?: string
  explanation: string
  source: EvidenceSource
  management?: string
  alternatives: MedicationAlternative[]
  backendSeverity?: string
  backendPriority?: string
  context?: string[]
}
export interface PrescriptionCheckResult {
  patientId: string
  prescription: PrescriptionRequest
  alerts: SafetyAlert[]
  limitations: string[]
  provenance: 'synthetic-demo' | 'backend-engine'
  backend?: { drug: string; total_found: number; shown: number; disclaimer: string; check_id?: number | null }
}
