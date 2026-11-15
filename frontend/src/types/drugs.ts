// Shapes returned by the backend drug comparison endpoints (backend/drugs/).

export type RiskLevel = 'contraindicated' | 'major' | 'moderate' | 'minor' | 'none-found'
export type Severity = Exclude<RiskLevel, 'none-found'>

export interface RiskReason {
  kind: 'interaction' | 'allergy' | 'duplication' | 'notice' | 'context' | 'boxed-warning'
  severity: Severity | null
  priority: 'primary' | 'collapsed'
  text: string
  management: string | null
  source: string
}

export interface Alternative {
  drug: string
  indication?: string | null
  rationale?: string | null
}

export interface DrugRiskProfile {
  query: string
  drug: string
  riskLevel: RiskLevel
  reasons: RiskReason[]
  counts: Record<Severity, number>
  shown: number
  totalFound: number
  checkId: number | null
  alternatives: Alternative[]
}

export interface CompareResponse {
  patientId: string
  drugs: DrugRiskProfile[]
  suggestedAlternatives: Alternative[]
  disclaimer: string
}

export interface CitedText {
  text: string
  section: string
  quote: string
}

export interface DrugFact extends CitedText {
  topic: 'uses' | 'how_it_works' | 'boxed_warning' | 'contraindications' | 'warnings' | 'common_side_effects'
}

export type DrugInfo =
  | { drug: string; query: string; available: false; message: string; disclaimer: string }
  | {
      drug: string
      query: string
      available: true
      brandNames: string[]
      drugClass: string[]
      productType: string | null
      summary: CitedText | null
      facts: DrugFact[]
      boxedWarning: string | null
      sectionTitles: Record<string, string>
      source: { name: string; setId: string | null; effectiveTime: string | null; url: string | null }
      generatedBy: string
      disclaimer: string
    }

export interface PrescribeRequest {
  name: string
  dose?: string
  frequency?: string
  prescribedBy?: string
  overrideReason?: string
}

export type PrescribeResult =
  | { status: 'prescribed'; medicationId: number }
  | { status: 'needs-override'; message: string; reasons: string[] }
