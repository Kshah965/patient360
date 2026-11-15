/** Current safety.dev_app wire format; no patient/profile routes are implied. */
export interface BackendAlternative {
  drug: string
  rationale: string
  source: string
  indication?: string
  monitoring?: string
  alerts_found?: string[]
  verified?: boolean
}
export interface BackendSafetyAlert {
  id?: string
  severity: string
  type: 'interaction' | 'allergy' | 'duplication' | 'contraindication'
  drugs: string[]
  explanation: string
  source: string
  source_id: string | null
  verified: boolean
  management?: string
  priority: string
  context: string[]
  alternatives: BackendAlternative[]
}
export interface BackendCheckResponse {
  drug: string
  total_found: number
  shown: number
  disclaimer: string
  check_id?: number | null
  alerts: BackendSafetyAlert[]
  notices?: string[] // parts of the check that could not run (unknown allergies, missing med list)
}
