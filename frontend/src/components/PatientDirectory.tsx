import { useState } from 'react'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { usePatient } from '@/hooks/usePatient'
import { getAge } from '@/lib/patient'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function PatientDirectory() {
  const [query, setQuery] = useState('')
  const { patients, loading, error, retry } = usePatientSearch(query)
  const { selectedId, selectPatient } = usePatient()
  return <Card className="mb-5">
    <CardHeader><CardTitle>Synthetic patient directory</CardTitle><label htmlFor="patient-search" className="mt-2 text-sm font-medium">Search by name or patient record ID</label><input id="patient-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Mara Ellison or SYN-1001" className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md" /></CardHeader>
    <CardContent>
      <div aria-live="polite" role="status" className="mb-3 text-sm text-muted-foreground">{loading ? 'Loading patients…' : error ? '' : `${patients.length} matching synthetic ${patients.length === 1 ? 'record' : 'records'}`}</div>
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-red-800">{error}<Button variant="outline" onClick={retry}>Retry</Button></div>}
      {!loading && !error && patients.length === 0 && <p className="py-3 text-base">No matching patients. Try another name or record ID.</p>}
      {!loading && !error && patients.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Fictional patient records. Select a name to load the clinical profile.</caption><thead className="border-y bg-muted"><tr>{['Patient', 'Age', 'Record ID', 'Sex', 'Clinical indicator'].map(label => <th key={label} scope="col" className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{patients.map(p => <tr key={p.id} className={cn('border-b', selectedId === p.id ? 'bg-accent' : 'hover:bg-muted/60')}><td className="px-3 py-2"><button type="button" aria-pressed={selectedId === p.id} onClick={() => selectPatient(p.id)} className="rounded text-left font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{p.name}{selectedId === p.id && <span className="ml-2 font-normal">(Selected)</span>}</button></td><td className="px-3 py-3">{getAge(p.dateOfBirth)}</td><td className="whitespace-nowrap px-3 py-3">{p.id}</td><td className="px-3 py-3">{p.sex ?? 'Not recorded'}</td><td className="px-3 py-3">{p.indicator}</td></tr>)}</tbody></table></div>}
    </CardContent>
  </Card>
}
