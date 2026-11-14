import type { ClinicalApi, EmergencySummary } from '@/types/clinical'

export type SummaryState =
  | { status: 'idle' | 'loading'; summary: null; error: null }
  | { status: 'success'; summary: EmergencySummary; error: null }
  | { status: 'error'; summary: null; error: string }

/** One patient-scoped request lifecycle, also testable independently of React. */
export function createEmergencySummaryStore(patientId: string | null, api: Pick<ClinicalApi, 'getEmergencySummary'>) {
  let state: SummaryState = { status: 'idle', summary: null, error: null }
  let controller: AbortController | null = null
  let version = 0
  const listeners = new Set<() => void>()
  const update = (next: SummaryState) => { state = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    cancel() { version++; controller?.abort() },
    async generate() {
      if (!patientId) return
      controller?.abort()
      const current = new AbortController()
      controller = current
      const requestVersion = ++version
      update({ status: 'loading', summary: null, error: null })
      try {
        const summary = await api.getEmergencySummary(patientId, current.signal)
        if (current.signal.aborted || version !== requestVersion) return
        if (summary.patient.id !== patientId) throw new Error('Summary identity mismatch')
        update({ status: 'success', summary, error: null })
      } catch {
        if (!current.signal.aborted && version === requestVersion) update({ status: 'error', summary: null, error: 'Unable to load the emergency summary. Please retry.' })
      }
    },
  }
}
