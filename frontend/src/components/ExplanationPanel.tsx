import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { explanationApi, type ExplanationKind } from '@/services/explanationApi'
import { createExplanationStore } from '@/state/explanationStore'
import { Button } from '@/components/ui/button'

export function ExplanationPanel({ patientId, kind, checkId }: { patientId: string; kind: ExplanationKind; checkId?: number }) {
  const store = useMemo(() => createExplanationStore(patientId, kind, checkId, explanationApi), [patientId, kind, checkId])
  useEffect(() => () => store.cancel(), [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const unavailable = kind === 'safety' && !checkId
  return <section className="mt-5 border-t pt-4" aria-label="Optional explanation">
    <h3 className="text-lg font-semibold">{kind === 'safety' ? 'Explain these findings' : 'Clinical handoff excerpts'}</h3>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Optional source-bound explanation. AI never determines severity or prescribing safety.</p>
    <Button variant="outline" size="sm" className="mt-3" disabled={unavailable || state.status === 'loading'} onClick={() => { void store.generate() }}>{state.status === 'loading' ? 'Preparing explanation…' : state.status === 'error' ? 'Retry explanation' : 'Prepare explanation'}</Button>
    {unavailable && <p className="mt-2 text-sm text-muted-foreground">No stored backend check ID is available. Review the findings and sources directly.</p>}
    {state.status === 'loading' && <p role="status" className="mt-2 text-sm">Preparing optional explanation; structured findings remain visible.</p>}
    {state.error && <p role="alert" className="mt-2 text-sm text-amber-950">{state.error}</p>}
    {state.value && <div className="mt-3 text-sm leading-6"><p className="font-semibold">{state.value.mode === 'llm-extractive' ? `AI-assisted source excerpts · ${state.value.model}` : 'Deterministic template · No AI narrative'}</p><p className="text-muted-foreground">{state.value.mode === 'template' ? `Template reason: ${state.value.reason}. ` : ''}{state.value.notice}</p>{state.value.items.length ? <ul className="mt-2 space-y-3">{state.value.items.map(item => <li key={item.fact_id}><p>{item.text}</p><p className="text-muted-foreground">Source: {item.source}{item.reference && ` · ${item.reference}`}</p></li>)}</ul> : <p className="mt-2">No verified findings are eligible for an explanation. This does not establish safety.</p>}{state.value.omitted_unverified > 0 && <p className="mt-3 text-muted-foreground">{state.value.omitted_unverified} unverified or incomplete findings excluded from this explanation. Review them separately in the deterministic results.</p>}</div>}
  </section>
}
