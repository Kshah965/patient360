import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { backendClinicalApi, clinicalApi, type SafetyMode } from '@/services/clinicalApi'
import { createPrescriptionStore } from '@/state/prescriptionStore'
export function usePrescriptionCheck(patientId: string | null, drug: string, mode: SafetyMode = 'mock') {
  // Changing either input renders idle immediately, before cleanup effects run.
  const store = useMemo(() => createPrescriptionStore(patientId, drug, mode === 'backend' ? backendClinicalApi : clinicalApi), [patientId, drug, mode])
  useEffect(() => () => store.cancel(), [store])
  return { ...useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot), check: store.check }
}
