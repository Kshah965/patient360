import { createContext } from 'react'
import type { ClinicalApi } from '@/types/clinical'
import type { PatientDataMode } from '@/services/apiConfig'
import { mockClinicalApi } from '@/services/mockClinicalApi'
export interface PatientDataState {
  mode: PatientDataMode
  setMode: (mode: PatientDataMode) => void
  api: Pick<ClinicalApi, 'searchPatients' | 'getPatient'>
}
export const PatientDataContext = createContext<PatientDataState>({ mode: 'mock', setMode: () => {}, api: mockClinicalApi })
