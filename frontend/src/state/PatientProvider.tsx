import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { usePatientData } from '@/hooks/usePatientData'
import { PatientContext } from './patientContext'
import { createPatientStore } from './patientStore'
export function PatientProvider({ children }: { children: ReactNode }) {
  const { api } = usePatientData()
  const store = useMemo(() => createPatientStore(api), [api])
  useEffect(() => () => store.cancel(), [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return <PatientContext.Provider value={{ ...state, selectPatient: store.selectPatient, clearPatient: store.clearPatient, retry: store.retry }}>{children}</PatientContext.Provider>
}
