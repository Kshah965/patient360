import { ExplanationPanel } from './ExplanationPanel'
import { useState } from 'react'
import type { PrescriptionCheckResult } from '@/types/clinical'
import { prioritizeAlerts } from '@/lib/safety'
import { SafetyAlert } from '@/components/SafetyAlert'
import { Button } from '@/components/ui/button'

export function SafetyResults({ result }: { result: PrescriptionCheckResult }) {
  const [expanded, setExpanded] = useState(false)
  const { visible, additional } = prioritizeAlerts(result.alerts)
  const shown = expanded ? result.alerts.length : visible.length
  return <section aria-labelledby="safety-results-heading" className="mt-5 border-t pt-4">
    <h3 id="safety-results-heading" className="text-lg font-semibold">Safety findings · {result.prescription.drug}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{result.provenance === 'backend-engine' ? 'Backend engine response · Synthetic patient' : 'Predefined synthetic demo response'} · {result.patientId}</p>
    {result.backend && <p className="mt-2 text-sm text-muted-foreground">Check ID: {result.backend.check_id ?? 'not supplied'}. Backend reported {result.backend.total_found} total findings; {result.backend.shown} marked primary. Normalized drug: {result.backend.drug}. The display below also keeps highest-severity ties visible.</p>}
    {result.alerts.length === 0 ? <p className="mt-3 text-base">{result.backend && result.backend.total_found > 0 ? 'The backend reported findings but supplied no alert records for review.' : result.provenance === 'backend-engine' ? 'No interactions found in the available backend dataset.' : 'No interactions found in the available demo dataset.'} A missing interaction is not proof of safety.</p> : <>
      <p role="status" className="my-3 text-sm font-medium">{shown} of {result.alerts.length} findings shown</p>
      <div className="space-y-5">{visible.map(alert => <SafetyAlert key={alert.id} alert={alert} />)}</div>
      {additional.length > 0 && <div className="mt-4 border-t pt-3"><Button variant="outline" aria-expanded={expanded} aria-controls="additional-findings" onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse additional findings' : `Show ${additional.length} lower-priority ${additional.length === 1 ? 'finding' : 'findings'}`}</Button><div id="additional-findings" hidden={!expanded} className="mt-4 space-y-5">{additional.map(alert => <SafetyAlert key={alert.id} alert={alert} />)}</div></div>}
    </>}
    {result.provenance === 'backend-engine' && <ExplanationPanel patientId={result.patientId} kind="safety" checkId={result.backend?.check_id ?? undefined} />}
    {result.limitations.length > 0 && <div className="mt-4 border-t pt-3"><h4 className="text-sm font-semibold">Dataset limitations</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{result.limitations.map(text => <li key={text}>{text}</li>)}</ul></div>}
  </section>
}
