import { useContext } from 'react'
import { PatientDataContext } from '@/state/patientDataContext'
export function usePatientData() { return useContext(PatientDataContext) }
