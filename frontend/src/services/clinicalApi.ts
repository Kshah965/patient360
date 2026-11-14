import type { ClinicalApi } from '../types/clinical'
import { createHttpClinicalApi } from './httpClinicalApi'
import { mockClinicalApi } from './mockClinicalApi'
import { createHttpSafetyApi } from './httpSafetyApi'

export type SafetyMode = 'mock' | 'backend'
import { apiConfig, type PatientDataMode } from './apiConfig'

export const apiBaseUrl = apiConfig.baseUrl
export function createPatientApi(mode: PatientDataMode, baseUrl = apiBaseUrl, fetcher: typeof fetch = fetch): Pick<ClinicalApi, 'searchPatients' | 'getPatient'> {
  return mode === 'backend' ? createHttpClinicalApi(baseUrl, fetcher) : mockClinicalApi
}

export function createClinicalApi(
  mode: SafetyMode,
  baseUrl = apiBaseUrl,
  fetcher: typeof fetch = fetch,
  patientBaseUrl = '',
): ClinicalApi {
  return {
    ...mockClinicalApi,
    ...(patientBaseUrl ? (() => { const reads = createHttpClinicalApi(patientBaseUrl, fetcher); return { searchPatients: reads.searchPatients, getPatient: reads.getPatient } })() : {}),
    getEmergencySummary: mode === 'backend' ? createHttpClinicalApi(baseUrl, fetcher).getEmergencySummary : mockClinicalApi.getEmergencySummary,
    // Project the patient /summary response into the report model; never fail over.
    checkPrescription: mode === 'backend'
      ? createHttpSafetyApi(baseUrl, fetcher).checkPrescription
      : mockClinicalApi.checkPrescription,
  }
}
export const clinicalApi = createClinicalApi('mock')
export const backendClinicalApi = createClinicalApi('backend')
