import { useEffect, useState } from 'react'
import { clinicalApi } from '@/services/clinicalApi'
import type { PatientSummary } from '@/types/clinical'

export function usePatientSearch(query: string) {
  const [result, setResult] = useState<{ query: string; patients: PatientSummary[]; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    clinicalApi.searchPatients(query, controller.signal).then(patients => {
      if (!controller.signal.aborted) setResult({ query, patients, error: null })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ query, patients: [], error: 'Unable to load the patient directory.' })
    })
    return () => controller.abort()
  }, [query, attempt])
  return { patients: result?.query === query ? result.patients : [], error: result?.query === query ? result.error : null, loading: result?.query !== query, retry: () => { setResult(null); setAttempt(n => n + 1) } }
}
