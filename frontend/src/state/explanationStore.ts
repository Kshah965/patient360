import type { Explanation, ExplanationApi, ExplanationKind } from '@/services/explanationApi'
export function createExplanationStore(patientId: string, kind: ExplanationKind, checkId: number | undefined, api: ExplanationApi) {
  type State = { status: 'idle' | 'loading' | 'success' | 'error'; value: Explanation | null; error: string | null }
  let state: State = { status: 'idle', value: null, error: null }
  let controller: AbortController | null = null
  let version = 0
  const listeners = new Set<() => void>()
  const set = (next: State) => { state = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    cancel() { version++; controller?.abort() },
    async generate() {
      controller?.abort()
      const current = new AbortController(); controller = current
      const seq = ++version
      set({ status: 'loading', value: null, error: null })
      try {
        const value = await api.getExplanation(patientId, kind, checkId, current.signal)
        if (current.signal.aborted || seq !== version) return
        if (value.patient_id !== patientId || value.kind !== kind || (kind === 'safety' && value.check_id !== checkId)) throw new Error('Explanation mismatch')
        set({ status: 'success', value, error: null })
      } catch {
        if (!current.signal.aborted && seq === version) set({ status: 'error', value: null, error: 'Explanation unavailable. Structured patient facts and deterministic findings are unchanged. You can retry.' })
      }
    },
  }
}
