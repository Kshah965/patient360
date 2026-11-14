import { useState } from 'react'
import { searchMedications } from '@/mocks/medications'

export function MedicationSearch({ value, onChange, disabled }: { value: string; onChange: (drug: string) => void; disabled: boolean }) {
  const [query, setQuery] = useState('')
  const options = searchMedications(query)
  return <div className="space-y-2">
    <label htmlFor="medication-filter" className="block text-sm font-medium">Search demo medications</label>
    <input id="medication-filter" type="search" value={query} disabled={disabled} onChange={e => { setQuery(e.target.value); onChange('') }} placeholder="e.g. Ibuprofen" className="h-10 w-full rounded-lg border bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted" />
    <label htmlFor="proposed-medication" className="block text-sm font-medium">Proposed medication</label>
    <select id="proposed-medication" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="h-10 w-full rounded-lg border bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted">
      <option value="">Choose a demo medication</option>
      {options.map(m => <option key={m.drug} value={m.drug}>{m.label}</option>)}
    </select>
    {options.length === 0 && <p role="status" className="text-sm text-muted-foreground">No matching demo medications. Try another name.</p>}
  </div>
}
