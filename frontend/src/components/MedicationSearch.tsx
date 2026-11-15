import { useEffect, useState } from 'react'
import { searchMedications } from '@/mocks/medications'
import { apiConfig } from '@/services/apiConfig'

type Option = { drug: string; label: string }

// Backend mode loads the backend's known names (GET /drugs, brands included) once.
// Mock mode, and any backend failure, keeps the curated offline demo list.
function useBackendCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<Option[] | null>(null)
  useEffect(() => {
    if (!enabled || !apiConfig.baseUrl) return
    const controller = new AbortController()
    fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/drugs`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: { name: string; drug: string }[]) => setCatalog(rows.map(r => ({ drug: r.drug, label: r.name }))))
      .catch(() => { if (!controller.signal.aborted) setCatalog(null) })
    return () => controller.abort()
  }, [enabled])
  return catalog
}

export function MedicationSearch({ value, onChange, disabled, mode = 'mock' }: { value: string; onChange: (drug: string) => void; disabled: boolean; mode?: 'mock' | 'backend' }) {
  const [query, setQuery] = useState('')
  const catalog = useBackendCatalog(mode === 'backend')
  const term = query.trim().toLowerCase()
  const options: Option[] = catalog ? catalog.filter(m => m.label.toLowerCase().includes(term)) : searchMedications(query)
  // Backend mode can check any typed name: the engine normalizes brands and misspellings.
  const typed = catalog && term && !catalog.some(m => m.label.toLowerCase() === term || m.drug === term) ? query.trim() : ''
  const source = catalog ? 'medications' : 'demo medications'
  return <div className="space-y-2">
    <label htmlFor="medication-filter" className="block text-sm font-medium">Search {source}</label>
    <input id="medication-filter" type="search" value={query} disabled={disabled} onChange={e => { setQuery(e.target.value); onChange('') }} placeholder="e.g. Ibuprofen" className="h-10 w-full rounded-lg border bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted" />
    <label htmlFor="proposed-medication" className="block text-sm font-medium">Proposed medication</label>
    <select id="proposed-medication" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="h-10 w-full rounded-lg border bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted">
      <option value="">{catalog ? 'Choose a medication' : 'Choose a demo medication'}</option>
      {typed && <option value={typed}>Check “{typed}” as typed</option>}
      {options.map(m => <option key={m.label} value={m.drug}>{m.label}</option>)}
    </select>
    {options.length === 0 && !typed && <p role="status" className="text-sm text-muted-foreground">No matching {source}. Try another name.</p>}
  </div>
}
