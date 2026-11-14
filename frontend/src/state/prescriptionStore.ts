import { SafetyApiError } from '@/services/httpSafetyApi'
import type { ClinicalApi, PrescriptionCheckResult } from '@/types/clinical'
export type PrescriptionState =
  | { status: 'idle' | 'loading'; result: null; error: null }
  | { status: 'success'; result: PrescriptionCheckResult; error: null }
  | { status: 'error'; result: null; error: string }

export function createPrescriptionStore(patientId: string | null, drug: string, api: Pick<ClinicalApi, 'checkPrescription'>) {
  let state: PrescriptionState = { status: 'idle', result: null, error: null }
  let controller: AbortController | null = null
  let version = 0
  const listeners = new Set<() => void>()
  const update = (next: PrescriptionState) => { state = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    cancel() { version++; controller?.abort() },
    async check() {
      if (!patientId || !drug) return
      controller?.abort()
      const current = new AbortController()
      controller = current
      const thisVersion = ++version
      update({ status: 'loading', result: null, error: null })
      try {
        const result = await api.checkPrescription(patientId, { drug }, current.signal)
        if (current.signal.aborted || version !== thisVersion) return
        if (result.patientId !== patientId || result.prescription.drug !== drug) throw new Error('Response context mismatch')
        update({ status: 'success', result, error: null })
      } catch (error) {
        if (!current.signal.aborted && version === thisVersion) update({ status: 'error', result: null, error: error instanceof SafetyApiError ? error.message : 'Unable to check medication safety. Please retry.' })
      }
    },
  }
}
