import { createContext } from 'react'
import type { Patient } from '@/types/clinical'
export interface PatientState {
  selectedId: string | null
  patient: Patient | null
  loading: boolean
  error: string | null
  selectPatient: (id: string) => void
  clearPatient: () => void
  retry: () => void
}
export const PatientContext = createContext<PatientState | null>(null)
