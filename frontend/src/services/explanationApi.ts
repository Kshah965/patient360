import { apiConfig } from './apiConfig'
export type ExplanationKind = 'summary' | 'safety'
export interface Explanation {
  patient_id: string
  kind: ExplanationKind
  check_id: number | null
  mode: 'template' | 'llm-extractive'
  model: string | null
  reason: string
  items: { fact_id: string; text: string; source: string; reference: string | null }[]
  omitted_unverified: number
  notice: string
}
export interface ExplanationApi {
  getExplanation(patientId: string, kind: ExplanationKind, checkId?: number, signal?: AbortSignal): Promise<Explanation>
}
export function normalizeExplanation(value: unknown, patientId: string, kind: ExplanationKind, checkId?: number): Explanation {
  if (!value || typeof value !== 'object') throw new Error('Invalid explanation response.')
  const e = value as Record<string, unknown>
  if (e.patient_id !== patientId || e.kind !== kind || (kind === 'safety' && e.check_id !== checkId)) throw new Error('Explanation identity mismatch.')
  if (!['template', 'llm-extractive'].includes(String(e.mode)) || typeof e.reason !== 'string' || typeof e.notice !== 'string' || !(e.model === null || typeof e.model === 'string') || !(e.check_id === null || Number.isSafeInteger(e.check_id)) || !Number.isSafeInteger(e.omitted_unverified) || Number(e.omitted_unverified) < 0 || !Array.isArray(e.items)) throw new Error('Invalid explanation metadata.')
  const items = e.items.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid explanation item.')
    const i = item as Record<string, unknown>
    if (typeof i.fact_id !== 'string' || typeof i.text !== 'string' || typeof i.source !== 'string' || !(i.reference === null || typeof i.reference === 'string')) throw new Error('Invalid explanation item.')
    return { fact_id: i.fact_id, text: i.text, source: i.source, reference: i.reference }
  })
  if (new Set(items.map(i => i.fact_id)).size !== items.length) throw new Error('Duplicate explanation facts.')
  return { patient_id: patientId, kind, check_id: e.check_id as number | null, mode: e.mode as Explanation['mode'], model: e.model, reason: e.reason, items, omitted_unverified: e.omitted_unverified as number, notice: e.notice }
}
export function createExplanationApi(baseUrl: string, fetcher: typeof fetch = fetch): ExplanationApi {
  return { async getExplanation(patientId, kind, checkId, signal) {
    if (kind === 'safety' && (!checkId || !Number.isSafeInteger(checkId))) throw new Error('A stored check ID is required for safety explanations.')
    let base: URL
    try { base = new URL(baseUrl) } catch { throw new Error('Explanation service is not configured.') }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid explanation service URL.')
    signal?.throwIfAborted()
    const response = await fetcher(`${base.href.replace(/\/+$/, '')}/patients/${encodeURIComponent(patientId)}/explanations/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(kind === 'safety' ? { body: JSON.stringify({ check_id: checkId }) } : {}), signal })
    signal?.throwIfAborted()
    if (!response.ok) throw new Error(`Explanation service unavailable (HTTP ${response.status}). Structured facts remain available.`)
    const payload: unknown = await response.json()
    signal?.throwIfAborted()
    return normalizeExplanation(payload, patientId, kind, checkId)
  } }
}
export const explanationApi = createExplanationApi(apiConfig.baseUrl)
