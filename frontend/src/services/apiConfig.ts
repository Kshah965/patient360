export type PatientDataMode = 'mock' | 'backend'
export function resolveApiConfig(env: { VITE_API_BASE_URL?: string; VITE_API_URL?: string; VITE_PATIENT_DATA_MODE?: string } = {}) {
  const preferred = env.VITE_API_BASE_URL?.trim() ?? ''
  const legacy = env.VITE_API_URL?.trim() ?? ''
  return {
    baseUrl: preferred || legacy,
    patientMode: env.VITE_PATIENT_DATA_MODE === 'backend' ? 'backend' as const : 'mock' as const,
    configurationWarning: preferred && legacy && preferred.replace(/\/+$/, '') !== legacy.replace(/\/+$/, '')
      ? 'VITE_API_BASE_URL takes precedence over the different legacy VITE_API_URL value.' : null,
  }
}
export const apiConfig = resolveApiConfig({ VITE_API_BASE_URL: import.meta.env?.VITE_API_BASE_URL, VITE_API_URL: import.meta.env?.VITE_API_URL, VITE_PATIENT_DATA_MODE: import.meta.env?.VITE_PATIENT_DATA_MODE })
