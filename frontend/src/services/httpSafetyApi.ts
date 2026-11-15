import type { ClinicalApi, EvidenceSource, PrescriptionCheckResult, PrescriptionRequest, AlertSeverity } from '@/types/clinical'
import type { BackendCheckResponse, BackendSafetyAlert, BackendAlternative } from '@/types/backendSafety'

// The backend loader resolves patient identity; unknown IDs must return HTTP 404.
export class SafetyApiError extends Error {}
export function supportsBackendPatient(id: string): boolean { return typeof id === 'string' && id.trim().length > 0 && id === id.trim() }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SafetyApiError('Invalid backend safety response: expected an object.')
  return value as Record<string, unknown>
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new SafetyApiError('Invalid backend safety response: expected text.')
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new SafetyApiError('Invalid backend safety response: expected a text array.')
  return value.map(string)
}
function optionalText(value: unknown): string | undefined { return value == null ? undefined : string(value) }
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new SafetyApiError('Invalid backend safety response: expected verification metadata.')
  return value
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new SafetyApiError('Invalid backend safety counts.')
  return value
}
function parseAlternative(value: unknown): BackendAlternative {
  const a = object(value)
  return { drug: string(a.drug), rationale: string(a.rationale), source: string(a.source), indication: optionalText(a.indication), monitoring: optionalText(a.monitoring), alerts_found: a.alerts_found === undefined ? undefined : strings(a.alerts_found), verified: a.verified === undefined ? undefined : boolean(a.verified) }
}
function parseAlert(value: unknown): BackendSafetyAlert {
  const a = object(value)
  const type = string(a.type)
  if (!['interaction', 'allergy', 'duplication', 'contraindication'].includes(type)) throw new SafetyApiError(`Unsupported backend alert type: ${type}.`)
  if (!Array.isArray(a.alternatives)) throw new SafetyApiError('Invalid backend alternatives.')
  return {
    id: optionalText(a.id), severity: string(a.severity), type: type as BackendSafetyAlert['type'], drugs: strings(a.drugs), explanation: string(a.explanation),
    source: string(a.source), source_id: a.source_id == null ? null : string(a.source_id), verified: boolean(a.verified),
    management: optionalText(a.management), priority: string(a.priority), context: strings(a.context), alternatives: a.alternatives.map(parseAlternative),
  }
}
function parseResponse(value: unknown): BackendCheckResponse {
  const r = object(value)
  if (!Array.isArray(r.alerts)) throw new SafetyApiError('Invalid backend alert list.')
  if (r.check_id !== undefined && r.check_id !== null) count(r.check_id)
  const result = { ...(r.check_id === undefined ? {} : { check_id: r.check_id as number | null }), drug: string(r.drug), total_found: count(r.total_found), shown: count(r.shown), disclaimer: string(r.disclaimer), alerts: r.alerts.map(parseAlert), notices: r.notices === undefined ? [] : strings(r.notices) }
  if (result.shown > result.total_found) throw new SafetyApiError('Invalid backend safety counts.')
  return result
}
function source(name: string, verified?: boolean, reference?: string | null): EvidenceSource {
  const provided = name.trim().length > 0 && !/TODO/i.test(name)
  return { name, reference: reference ?? undefined, backendVerified: verified, status: provided && verified === true ? 'backend-reported' : 'pending' }
}
// Content-stable FNV-1a fingerprint; identical duplicate alerts get occurrence suffixes.
function fingerprint(value: string) {
  let hash = 14695981039346656037n
  for (const char of value) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n)
  return hash.toString(16)
}
const severities: Record<string, AlertSeverity> = { contraindicated: 'critical', major: 'high', moderate: 'moderate', minor: 'low' }

export function normalizeSafetyResponse(value: unknown, patientId: string, prescription: PrescriptionRequest): PrescriptionCheckResult {
  const r = parseResponse(value)
  const ids = new Map<string, number>()
  const alerts = r.alerts.map(a => {
    const baseId = a.id || `backend-${fingerprint(JSON.stringify([patientId, a.type, [...a.drugs].sort(), a.severity, a.source_id, a.explanation]))}`
    const occurrence = (ids.get(baseId) ?? 0) + 1
    ids.set(baseId, occurrence)
    return {
      id: `${baseId}:${occurrence}`, severity: Object.hasOwn(severities, a.severity) ? severities[a.severity] : 'unknown', backendSeverity: a.severity, backendPriority: a.priority,
      type: a.type, drugs: a.drugs, explanation: a.explanation, management: a.management,
      source: source(a.source, a.verified, a.source_id), context: a.context,
      alternatives: a.alternatives.map(alt => ({ medication: alt.drug, rationale: alt.rationale, source: source(alt.source, alt.verified), management: alt.monitoring, indication: alt.indication, alertsFound: alt.alerts_found })),
    }
  })
  return {
    patientId, prescription: { ...prescription }, alerts, notices: r.notices ?? [], provenance: 'backend-engine', backend: { drug: r.drug, total_found: r.total_found, shown: r.shown, disclaimer: r.disclaimer, check_id: r.check_id },
    limitations: [r.disclaimer, 'Coverage is limited to the backend rule dataset. Missing records and unlisted interactions are not a safety clearance.', 'Backend verification flags are supplied metadata, not independent clinical validation.',
      ...(r.total_found !== r.alerts.length ? [`Backend reported ${r.total_found} total findings but supplied ${r.alerts.length} alert records.`] : []),
      ...(r.alerts.some(a => !a.verified || /TODO/i.test(a.explanation + a.source + (a.management ?? ''))) ? ['Some backend content is unverified or incomplete; review its evidence status.'] : []),
    ],
  }
}

export function createHttpSafetyApi(baseUrl: string, fetcher: typeof fetch = fetch): Pick<ClinicalApi, 'checkPrescription'> {
  return {
    async checkPrescription(patientId, prescription, signal) {
      if (!supportsBackendPatient(patientId)) throw new SafetyApiError('A valid patient ID is required for a backend check.')
      if (!baseUrl.trim()) throw new SafetyApiError('Set VITE_API_BASE_URL to enable backend checks.')
      let url: URL
      try { url = new URL(`${baseUrl.trim().replace(/\/+$/, '')}/patients/${encodeURIComponent(patientId)}/check`) } catch { throw new SafetyApiError('VITE_API_BASE_URL must be an absolute HTTP(S) URL.') }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new SafetyApiError('VITE_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.')
      signal?.throwIfAborted()
      let response: Response
      try { response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drug: prescription.drug }), signal }) }
      catch (error) { if (signal?.aborted) throw error; throw new SafetyApiError('Backend connection failed. Check the server URL, server availability, and CORS.') }
      signal?.throwIfAborted()
      if (!response.ok) throw new SafetyApiError(`Backend safety check failed (HTTP ${response.status}).`)
      let payload: unknown
      try { payload = await response.json() } catch { signal?.throwIfAborted(); throw new SafetyApiError('Backend returned invalid JSON.') }
      signal?.throwIfAborted()
      return normalizeSafetyResponse(payload, patientId, prescription)
    },
  }
}
