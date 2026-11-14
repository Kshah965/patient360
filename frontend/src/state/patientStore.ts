import type { ClinicalApi } from '@/types/clinical'
import type { PatientState } from './patientContext'
import { PatientApiError } from '@/services/patientNormalization'
export function createPatientStore(api: Pick<ClinicalApi, 'getPatient'>) {
  type State = Pick<PatientState, 'selectedId' | 'patient' | 'loading' | 'error'>
  let state: State = { selectedId: null, patient: null, loading: false, error: null }
  let controller: AbortController | null = null
  let version = 0
  const listeners = new Set<() => void>()
  const update = (next: State) => { state = next; listeners.forEach(listener => listener()) }
  const cancel = () => { version++; controller?.abort() }
  const selectPatient = async (id: string) => {
    cancel()
    const current = new AbortController(), seq = version
    controller = current
    update({ selectedId: id, patient: null, loading: true, error: null })
    try {
      const patient = await api.getPatient(id, current.signal)
      if (current.signal.aborted || seq !== version) return
      if (patient.id !== id) throw new PatientApiError('Patient response identity does not match the selection.')
      update({ selectedId: id, patient, loading: false, error: null })
    } catch (error) {
      if (!current.signal.aborted && seq === version) update({ selectedId: id, patient: null, loading: false, error: error instanceof PatientApiError ? error.message : 'Unable to load the patient record. Please retry.' })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectPatient, cancel,
    clearPatient() { cancel(); update({ selectedId: null, patient: null, loading: false, error: null }) },
    retry() { if (state.selectedId) return selectPatient(state.selectedId) },
  }
}
