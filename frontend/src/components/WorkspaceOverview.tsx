import { PrescriptionChecker } from '@/components/PrescriptionChecker'
import { EmergencySummaryPanel } from '@/components/EmergencySummaryPanel'
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
        <Card>{view === 'safety' ? <><div className="[&>section]:border-t-0"><PrescriptionChecker /></div><div className="border-t"><EmergencySummaryPanel key={selectedId ?? 'none'} /></div></> : <><EmergencySummaryPanel key={selectedId ?? 'none'} /><PrescriptionChecker /></>}</Card>
      </div>
    </>
  )
}
