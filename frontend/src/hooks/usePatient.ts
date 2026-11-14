import { useContext } from 'react'
import { PatientContext } from '@/state/patientContext'
export function usePatient() {
  const state = useContext(PatientContext)
  if (!state) throw new Error('usePatient requires PatientProvider')
  return state
}
