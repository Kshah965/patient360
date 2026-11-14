export type AllergyRecord =
  | { status: 'documented'; items: { substance: string; reaction: string }[] }
  | { status: 'none-known' | 'unknown'; items: [] }

export interface Patient {
  id: string
  name: string
  dateOfBirth: string // YYYY-MM-DD; age is derived in the UI
  sex: string | null
  allergies: AllergyRecord
  medications: { name: string; dose: string; frequency: string }[] | null
  conditions: string[] | null
  history: string[] | null
  encounters: { date: string; reason: string; outcome: string }[] | null
  vitals: { recordedAt: string; bloodPressure: string; heartRate: number; temperatureC: number; oxygenSaturation: number } | null
}
export type PatientSummary = Pick<Patient, 'id' | 'name' | 'dateOfBirth' | 'sex'> & { indicator: string }
export interface ClinicalApi {
  searchPatients(query: string, signal?: AbortSignal): Promise<PatientSummary[]>
  getPatient(patientId: string, signal?: AbortSignal): Promise<Patient>
}
