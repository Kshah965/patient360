import { usePatientData } from '@/hooks/usePatientData'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePatient } from '@/hooks/usePatient'
import { usePrescriptionCheck } from '@/hooks/usePrescriptionCheck'
import { type SafetyMode } from '@/services/clinicalApi'
import { MedicationSearch } from '@/components/MedicationSearch'
import { SafetyResults } from '@/components/SafetyResults'
import { Button } from '@/components/ui/button'

function PatientPrescriptionChecker({ patientId, mode }: { patientId: string; mode: SafetyMode }) {
  const [drug, setDrug] = useState('')
  const state = usePrescriptionCheck(patientId, drug, mode)
  return <>
    <form className="mt-4" onSubmit={e => { e.preventDefault(); if (drug && state.status !== 'loading') void state.check() }}>
      <MedicationSearch value={drug} onChange={setDrug} disabled={false} mode={mode} />
      <Button type="submit" className="mt-3" disabled={!drug || state.status === 'loading'}>{state.status === 'loading' ? 'Checking…' : state.status === 'error' ? 'Retry Medication Safety Check' : 'Check Medication Safety'}</Button>
    </form>
    {state.status === 'loading' && <p role="status" className="mt-3 text-sm text-muted-foreground">{mode === 'backend' ? 'Loading backend engine findings…' : 'Loading predefined demo findings…'}</p>}
    {state.status === 'error' && <p role="alert" className="mt-3 text-sm text-red-900">{state.error}</p>}
    {state.status === 'success' && <SafetyResults key={state.result.prescription.drug} result={state.result} />}
  </>
}
function CheckerContext() {
  const { patient, loading } = usePatient()
  const { mode } = usePatientData()
  if (!patient) return <div className="mt-3 text-sm">{loading ? <p role="status">Loading patient context…</p> : <p>Select a patient before checking a medication. <Link to="/patients" className="font-medium text-primary underline">Open patient directory</Link></p>}</div>
  return <>
    <p className="mt-3 text-base font-medium">{patient.name} · {patient.id}</p>
    <p className="mt-1 text-sm text-muted-foreground">{mode === 'backend' ? 'Backend engine · Selected patient record' : 'Predefined mock · Offline demo findings'}</p>
    <p className="mt-1 text-sm">Review allergies and current medications in the patient overview. No prescription is saved by this checker.</p>
    {(patient.medications === null || patient.allergies.status === 'unknown' || patient.conditions === null) && <div role="note" className="mt-3 border-l-2 border-amber-500 pl-3 text-sm leading-6"><p className="font-semibold">Incomplete patient information</p>{patient.medications === null && <p>Medication information is unavailable.</p>}{patient.allergies.status === 'unknown' && <p>Allergy status is unknown.</p>}{patient.conditions === null && <p>Condition information is unavailable.</p>}<p>Findings cannot establish comprehensive safety with missing information.</p></div>}
    <PatientPrescriptionChecker key={`${mode}:${patient.id}`} patientId={patient.id} mode={mode} />
  </>
}
export function PrescriptionChecker() {
  const { selectedId } = usePatient()
  return <section aria-labelledby="safety-heading" className="border-t p-5">
    <h2 id="safety-heading" className="text-lg font-semibold">Medication Safety Checker</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Demonstration only. Not clinically validated medical advice.</p>
    <CheckerContext key={selectedId ?? 'none'} />
  </section>
}
