import type { ClinicalApi, Patient, PatientSummary } from '../types/clinical'

// HTTP implementation of ClinicalApi against the FastAPI backend (backend/main.py).
// Responses already match the shared types; fetch rejects with AbortError on cancellation.
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (response.status === 404) throw new Error('Patient record not found.')
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return response.json() as Promise<T>
}

export function createHttpClinicalApi(baseUrl: string): ClinicalApi {
  const base = baseUrl.replace(/\/+$/, '')
  return {
    searchPatients: (query, signal) =>
      getJson<PatientSummary[]>(`${base}/patients?q=${encodeURIComponent(query.trim())}`, signal),
    getPatient: (patientId, signal) =>
      getJson<Patient>(`${base}/patients/${encodeURIComponent(patientId)}/summary`, signal),
  }
}
