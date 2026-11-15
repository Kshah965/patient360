import { ExplanationPanel } from './ExplanationPanel'
import type { ReactNode } from 'react'
import type { EmergencySummary } from '@/types/clinical'
import { usePatient } from '@/hooks/usePatient'
import { useEmergencySummary } from '@/hooks/useEmergencySummary'
import { formatDate, getAge } from '@/lib/patient'
import { Button } from '@/components/ui/button'

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-4 border-t pt-4"><h4 className="mb-2 text-base font-semibold">{title}</h4>{children}</section>
}
function RecordList({ items, empty }: { items: string[] | null; empty: string }) {
  return items === null ? <p>Not available.</p> : items.length === 0 ? <p>{empty}</p> : <ul className="list-disc space-y-1 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}

export function EmergencySummaryReport({ summary: s }: { summary: EmergencySummary }) {
  return <article aria-label="Emergency summary" className="mt-4 text-sm leading-6">
    <p className="mb-3 text-sm text-muted-foreground">{s.provenance === 'backend-record' ? 'Structured summary from the patient record' : 'Sample summary'}</p>
    <h3 className="text-lg font-semibold">Priority record information</h3>
    {s.critical_alerts.length > 0 ? <ul className="mt-2 space-y-2">{s.critical_alerts.map((a, i) => <li key={i} className={`border-l-2 pl-3 ${(a.severity === 'critical' || a.severity === 'high') ? 'border-red-600 text-red-900' : (a.severity === 'warning' || a.severity === 'moderate') ? 'border-amber-600 text-amber-950' : 'border-slate-300'}`}><strong>{a.severity === 'high' ? 'High priority' : a.severity === 'moderate' ? 'Review' : a.severity === 'critical' ? 'Critical' : a.severity === 'warning' ? 'Warning' : 'Information'}:</strong> {a.text}<span className="block text-muted-foreground">Source: {a.source}</span></li>)}</ul> : <p className="mt-1 text-muted-foreground">No verified medication safety findings supplied. Safety has not been assessed.</p>}
    {s.medication_context.length > 0 && <div className="mt-3 border-l-2 border-slate-300 pl-3"><h4 className="font-semibold">Medication context</h4><ul className="list-disc pl-5">{s.medication_context.map(note => <li key={note}>{note}</li>)}</ul></div>}
    <div className={`mt-3 border-l-2 pl-3 ${s.allergies.status === 'unknown' ? 'border-amber-500' : 'border-slate-300'}`}><h4 className="font-semibold">Allergies and reactions</h4>{s.allergies.status === 'documented' ? <ul className="list-disc pl-5">{s.allergies.items.map(a => <li key={a.substance}><strong>{a.substance}</strong> — {a.reaction}</li>)}</ul> : <p>{s.allergies.status === 'none-known' ? 'No known allergies documented.' : 'Allergy information not available.'}</p>}</div>
    <ReportSection title="Patient overview"><p className="text-base font-semibold">{s.patient.name}</p><p>{getAge(s.patient.dateOfBirth)} years · {s.patient.sex ?? 'Sex not recorded'} · {s.patient.id}</p><h5 className="mt-3 font-semibold">Conditions</h5><RecordList items={s.conditions} empty="No active conditions documented." /><h5 className="mt-3 font-semibold">Current medications</h5><RecordList items={s.medications?.map(m => `${m.name} — ${m.dose}; ${m.frequency}`) ?? null} empty="No current medications documented." /><h5 className="mt-3 font-semibold">Medical history</h5><RecordList items={s.history} empty="No history documented." /></ReportSection>
    <ReportSection title="Clinical context"><h5 className="font-semibold">Recent encounters</h5><RecordList items={s.encounters?.map(e => `${formatDate(e.date)} — ${e.reason}. ${e.outcome}`) ?? null} empty="No encounters documented." /><h5 className="mt-3 font-semibold">Recorded observations</h5>{s.observations ? <><p className="text-muted-foreground">Historical measurements · {formatDate(s.observations.recordedAt)}</p><ul className="list-disc pl-5"><li>Blood pressure: {s.observations.bloodPressure ?? 'Not recorded'}</li><li>Heart rate: {s.observations.heartRate == null ? 'Not recorded' : `${s.observations.heartRate} bpm`}</li><li>Temperature: {s.observations.temperatureC == null ? 'Not recorded' : `${s.observations.temperatureC} °C`}</li><li>Oxygen saturation: {s.observations.oxygenSaturation == null ? 'Not recorded' : `${s.observations.oxygenSaturation}%`}</li></ul></> : <p>Not available.</p>}<h5 className="mt-3 font-semibold">Additional recorded observations</h5><RecordList items={s.recorded_observations?.map(o => `${o.recordedAt} — ${o.name}: ${o.value}${o.unit ? ` ${o.unit}` : ''}`) ?? null} empty="No additional observations documented." /><h5 className="mt-3 font-semibold">Information requiring verification</h5><RecordList items={s.missing_information} empty="No additional gaps identified in the supplied fields. Record completeness is not established." /></ReportSection>
  </article>
}

export function EmergencySummaryPanel() {
  const { patient } = usePatient()
  const state = useEmergencySummary(patient?.id ?? null)
  return <section aria-labelledby="summary-heading" className="p-5">
    <h2 id="summary-heading" className="text-lg font-semibold">Emergency Patient Summary</h2>
    <Button className="mt-3" disabled={!patient || state.status === 'loading'} onClick={() => { void state.generate() }} aria-describedby="summary-state">{state.status === 'loading' ? 'Generating…' : state.status === 'error' ? 'Retry Emergency Summary' : 'Generate Emergency Summary'}</Button>
    <div id="summary-state" aria-live="polite" className="mt-3 text-sm text-muted-foreground">{!patient ? 'Select a patient to generate a summary.' : state.status === 'idle' ? 'Generate a structured summary from the selected patient record.' : state.status === 'loading' ? 'Loading emergency summary…' : state.status === 'success' ? 'Emergency summary ready.' : ''}</div>
    {state.status === 'loading' && <div aria-label="Loading summary" aria-busy="true" className="mt-4 space-y-3 motion-safe:animate-pulse"><div className="h-4 w-2/3 rounded bg-muted" /><div className="h-4 rounded bg-muted" /><div className="h-4 w-4/5 rounded bg-muted" /></div>}
    {state.status === 'error' && <p role="alert" className="mt-3 text-sm text-red-900">{state.error}</p>}
    {state.status === 'success' && <><EmergencySummaryReport summary={state.summary} />{state.summary.provenance === 'backend-record' && <ExplanationPanel patientId={state.summary.patient.id} kind="summary" />}</>}
  </section>
}
