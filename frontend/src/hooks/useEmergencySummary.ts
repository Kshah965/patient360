import { usePatientData } from './usePatientData'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { backendClinicalApi, clinicalApi } from '@/services/clinicalApi'
import { createEmergencySummaryStore } from '@/state/emergencySummaryStore'

export function useEmergencySummary(patientId: string | null) {
  const { mode } = usePatientData()
  // A new store renders idle immediately on identity change, before effects run.
  const store = useMemo(() => createEmergencySummaryStore(patientId, mode === 'backend' ? backendClinicalApi : clinicalApi), [patientId, mode])
  useEffect(() => () => store.cancel(), [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...state, generate: store.generate }
}
