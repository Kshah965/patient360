import { summaryFromPatient } from './emergencySummary'
import type { ClinicalApi } from '../types/clinical'
import { normalizePatient, normalizePatientDirectory, PatientApiError } from './patientNormalization'

export function createHttpClinicalApi(baseUrl: string, fetcher: typeof fetch = fetch): Pick<ClinicalApi, 'searchPatients' | 'getPatient' | 'getEmergencySummary'> {
  async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    if (!baseUrl.trim()) throw new PatientApiError('Set VITE_API_BASE_URL before using backend patient data. No mock fallback was used.')
    let base: URL
    try { base = new URL(baseUrl.trim()) } catch { throw new PatientApiError('Invalid API base URL. Use an absolute HTTP(S) URL.') }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new PatientApiError('API base URL must use HTTP(S) without credentials, query, or fragment.')
    signal?.throwIfAborted()
    let response: Response
    try { response = await fetcher(`${base.href.replace(/\/+$/, '')}${path}`, { signal, headers: { Accept: 'application/json' } }) }
    catch (error) { signal?.throwIfAborted(); if (error instanceof PatientApiError) throw error; throw new PatientApiError('Cannot reach the patient backend. Check the URL, server and CORS. No mock fallback was used.') }
    signal?.throwIfAborted()
    if (response.status === 404) throw new PatientApiError('Patient record not found (HTTP 404). No mock fallback was used.')
    if (!response.ok) throw new PatientApiError(`Patient backend request failed (HTTP ${response.status}). No mock fallback was used.`)
    try { const result: unknown = await response.json(); signal?.throwIfAborted(); return result }
    catch { signal?.throwIfAborted(); throw new PatientApiError('Patient backend returned invalid JSON.') }
  }
  return {
    getEmergencySummary: async (id, signal) => summaryFromPatient(normalizePatient(await getJson(`/patients/${encodeURIComponent(id)}/summary`, signal), id)),
    searchPatients: async (query, signal) => normalizePatientDirectory(await getJson(`/patients?q=${encodeURIComponent(query.trim())}`, signal)),
    getPatient: async (id, signal) => normalizePatient(await getJson(`/patients/${encodeURIComponent(id)}`, signal), id),
  }
}
