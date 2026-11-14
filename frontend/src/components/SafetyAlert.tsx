import { AlertTriangle, CircleHelp, Info, OctagonAlert } from 'lucide-react'
import type { SafetyAlert as SafetyAlertType } from '@/types/clinical'
import { AlternativeOptions, Evidence } from '@/components/AlternativeOptions'

export function SafetyAlert({ alert }: { alert: SafetyAlertType }) {
  const Icon = alert.severity === 'critical' ? OctagonAlert : alert.severity === 'high' ? AlertTriangle : alert.severity === 'unknown' ? CircleHelp : Info
  const color = alert.severity === 'critical' || alert.severity === 'high' ? 'border-red-500' : alert.severity === 'moderate' ? 'border-amber-500' : 'border-slate-300'
  return <article className={`border-l-2 pl-3 ${color}`}>
    <h4 className="flex items-start gap-2 text-base font-semibold"><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><span>{alert.severity === 'unknown' ? 'Clinical severity unassigned' : `${alert.severity[0].toUpperCase()}${alert.severity.slice(1)} severity`} · {alert.type}</span></h4>
    {alert.backendSeverity && <p className="mt-1 text-sm text-muted-foreground">Backend severity: {alert.backendSeverity} · Backend priority: {alert.backendPriority ?? 'not supplied'}</p>}
    {alert.demoPriority && <p className="mt-1 text-sm font-medium">Illustrative demo priority: {alert.demoPriority}</p>}
    <p className="mt-2 text-base font-medium">{alert.drugs.join(' + ')}{alert.allergen && ` · Documented allergen: ${alert.allergen}`}</p>
    <p className="mt-2 text-sm leading-6">{/TODO/i.test(alert.explanation) ? 'Backend explanation is incomplete and requires source verification.' : alert.explanation}</p>
    <div className="mt-2"><Evidence source={alert.source} /></div>
    {alert.context && alert.context.length > 0 && <div className="mt-2"><h5 className="text-sm font-semibold">Backend context</h5><ul className="list-disc pl-5 text-sm leading-6">{alert.context.map((note, i) => <li key={i}>{note}</li>)}</ul></div>}
    {alert.management && !/TODO/i.test(alert.management) && alert.source.status !== 'pending' && <p className="mt-2 text-sm leading-6"><strong>Provided management guidance:</strong> {alert.management}</p>}
    {alert.management && (alert.source.status === 'pending' || /TODO/i.test(alert.management)) && <p className="mt-2 text-sm text-muted-foreground">Backend management text withheld pending source verification.</p>}
    <AlternativeOptions alternatives={alert.alternatives} />
  </article>
}
