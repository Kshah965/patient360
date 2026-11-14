import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { PatientDirectory } from '@/components/PatientDirectory'
import { PatientProfile } from '@/components/PatientProfile'
import { usePatient } from '@/hooks/usePatient'

type View = 'dashboard' | 'patients' | 'safety'
const headings: Record<View, { title: string; description: string }> = {
  dashboard: { title: 'Clinical Dashboard', description: 'Patient overview and clinical decision support.' },
  patients: { title: 'Patients', description: 'Patient directory and clinical history.' },
  safety: { title: 'Medication Safety', description: 'Review proposed medication against the patient record.' },
}

function EmergencySummary() {
  return (
    <section aria-labelledby="summary-heading" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="summary-heading" className="text-lg font-semibold">AI Emergency Summary</h2>
        <Button disabled aria-describedby="summary-state">Generate Summary</Button>
      </div>
      <p id="summary-state" className="mt-4 text-sm leading-6 text-muted-foreground">No summary generated. Summary generation is unavailable.</p>
    </section>
  )
}

function MedicationSafety() {
  return (
    <section aria-labelledby="safety-heading" className="border-t p-5">
      <h2 id="safety-heading" className="text-lg font-semibold">Medication Safety Checker</h2>
      <label htmlFor="proposed-medication" className="mt-4 block text-sm font-medium">Proposed medication</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
        <select id="proposed-medication" disabled aria-describedby="safety-state" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground disabled:cursor-not-allowed">
          <option value="">Medication selection unavailable</option>
        </select>
        <Button disabled aria-describedby="safety-state">Check Safety</Button>
      </div>
      <p id="safety-state" className="mt-3 text-sm leading-6 text-muted-foreground">No safety check performed. Medication review is unavailable.</p>
    </section>
  )
}

export function WorkspaceOverview({ view }: { view: View }) {
  const heading = headings[view]
  const { patient, selectedId, loading, error, clearPatient } = usePatient()
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{heading.title}</h1>
        <p className="mt-1.5 text-base text-muted-foreground">{heading.description}</p>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <p className="text-sm text-muted-foreground">{loading ? `Loading ${selectedId}…` : error ? `Record unavailable: ${selectedId}` : patient ? `${patient.name} · ${patient.id}` : 'No active patient record.'}</p>
        <div className="flex gap-2">{selectedId && <Button variant="ghost" size="sm" onClick={clearPatient}>Clear selection</Button>}{view !== 'patients' && <Button asChild variant="outline" size="sm"><Link to="/patients">{selectedId ? 'Change patient' : 'Patient directory'}<ArrowRight aria-hidden="true" /></Link></Button>}</div>
      </div>
      {view === 'patients' && <PatientDirectory />}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)]">
        <PatientProfile key={selectedId ?? 'none'} />
        <Card>{view === 'safety' ? <><div className="[&>section]:border-t-0"><MedicationSafety /></div><div className="border-t"><EmergencySummary /></div></> : <><EmergencySummary /><MedicationSafety /></>}</Card>
      </div>
    </>
  )
}
