import type { ClinicalApi } from '../types/clinical'
import { mockClinicalApi } from './mockClinicalApi'

// Replace this adapter with an HTTP implementation of ClinicalApi when available.
export const clinicalApi: ClinicalApi = mockClinicalApi
