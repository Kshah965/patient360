import type { ClinicalApi } from '../types/clinical'
import { createHttpClinicalApi } from './httpClinicalApi'
import { mockClinicalApi } from './mockClinicalApi'

// Set VITE_API_URL (e.g. http://localhost:8000) to use the FastAPI backend; otherwise the mock is used.
// Optional chaining keeps this importable outside Vite (the Node test runner has no import.meta.env).
const apiUrl: string | undefined = import.meta.env?.VITE_API_URL

export const clinicalApi: ClinicalApi = apiUrl ? createHttpClinicalApi(apiUrl) : mockClinicalApi
