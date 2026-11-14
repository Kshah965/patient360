import { useMemo, useState, type ReactNode } from 'react'
import { apiConfig, type PatientDataMode } from '@/services/apiConfig'
import { createPatientApi } from '@/services/clinicalApi'
import { PatientDataContext } from './patientDataContext'
import { PatientProvider } from './PatientProvider'
export function PatientDataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PatientDataMode>(apiConfig.patientMode)
  const api = useMemo(() => createPatientApi(mode), [mode])
  return <PatientDataContext.Provider value={{ mode, setMode, api }}><PatientProvider key={mode}>{children}</PatientProvider></PatientDataContext.Provider>
}
