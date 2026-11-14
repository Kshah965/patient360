import type { ReactNode } from 'react'
import { usePatient } from '@/hooks/usePatient'
import { formatDate, getAge } from '@/lib/patient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t py-4"><h3 className="mb-2 text-lg font-semibold">{title}</h3>{children}</section>
}
function TextList({ items, empty }: { items: string[] | null; empty: string }) {
  if (items === null) return <p className="text-sm text-muted-foreground">Information unavailable.</p>
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return <ul className="list-disc space-y-1 pl-5 text-base leading-6">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}
export function PatientProfile() {
  const { patient, loading, error, retry } = usePatient()
  return <Card aria-busy={loading}>
    <CardHeader className="border-b"><CardTitle>Patient overview</CardTitle></CardHeader>
    <CardContent className="pt-5">
      {loading ? <p role="status" className="py-2 text-base">Loading patient record…</p> : error ? <div role="alert"><p className="mb-3 text-base text-red-800">{error}</p><Button onClick={retry} variant="outline">Retry patient record</Button></div> : !patient ? <p className="text-base text-muted-foreground">No patient selected. Choose a record from the patient directory.</p> : <>
        <div className="mb-5"><h2 className="text-2xl font-semibold">{patient.name}</h2><p className="mt-2 text-base">{getAge(patient.dateOfBirth)} years · {patient.sex ?? 'Sex not recorded'} · {patient.id}</p><p className="mt-1 text-sm text-muted-foreground">Born {formatDate(patient.dateOfBirth)} · Synthetic patient</p></div>
        <section aria-labelledby="allergies-heading" className={`mb-4 rounded-lg border p-4 ${patient.allergies.status === 'documented' ? 'border-red-200 bg-red-50 text-red-900' : patient.allergies.status === 'unknown' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-border bg-muted/60'}`}>
          <h3 id="allergies-heading" className="mb-2 text-lg font-semibold">Allergies</h3>
          {patient.allergies.status === 'documented' ? <ul className="space-y-2 text-base">{patient.allergies.items.map(a => <li key={a.substance}><strong>{a.substance}</strong> — {a.reaction}</li>)}</ul> : <p className="text-base">{patient.allergies.status === 'none-known' ? 'No known allergies documented.' : 'Allergy information unavailable.'}</p>}
        </section>
        <Detail title="Active medications">{patient.medications === null ? <p className="text-sm text-muted-foreground">Medication information unavailable.</p> : patient.medications.length === 0 ? <p className="text-sm text-muted-foreground">No current medications documented.</p> : <ul className="divide-y">{patient.medications.map(m => <li key={m.name} className="py-2 first:pt-0"><p className="text-base font-medium">{m.name}</p><p className="text-sm leading-6 text-muted-foreground">{m.dose} · {m.frequency}</p></li>)}</ul>}</Detail>
        <Detail title="Active medical conditions"><TextList items={patient.conditions} empty="No active medical conditions documented." /></Detail>
        <Detail title="Medical history"><TextList items={patient.history} empty="No medical history documented." /></Detail>
        <Detail title="Recent encounters">{patient.encounters === null ? <p className="text-sm text-muted-foreground">Encounter information unavailable.</p> : patient.encounters.length === 0 ? <p className="text-sm text-muted-foreground">No recent encounters documented.</p> : <ul className="space-y-3">{patient.encounters.map((e, i) => <li key={i}><p className="text-base font-medium">{formatDate(e.date)} · {e.reason}</p><p className="text-sm leading-6 text-muted-foreground">{e.outcome}</p></li>)}</ul>}</Detail>
        <Detail title="Recorded vital signs">{patient.vitals ? <><p className="mb-3 text-sm text-muted-foreground">Recorded {formatDate(patient.vitals.recordedAt)} · Historical measurements</p><dl className="grid grid-cols-2 gap-4 text-sm">{[['Blood pressure', patient.vitals.bloodPressure], ['Heart rate', `${patient.vitals.heartRate} bpm`], ['Temperature', `${patient.vitals.temperatureC} °C`], ['Oxygen saturation', `${patient.vitals.oxygenSaturation}%`]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-base font-medium">{value}</dd></div>)}</dl></> : <p className="text-sm text-muted-foreground">Vital signs unavailable.</p>}</Detail>
      </>}
    </CardContent>
  </Card>
}
