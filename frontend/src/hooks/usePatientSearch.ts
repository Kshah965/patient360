import { useEffect, useState } from 'react'
import { usePatientData } from './usePatientData'
import { PatientApiError } from '@/services/patientNormalization'
import type { PatientSummary } from '@/types/clinical'

export function usePatientSearch(query: string) {
  const { api } = usePatientData()
  const [result, setResult] = useState<{ query: string; patients: PatientSummary[]; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api.searchPatients(query, controller.signal).then(patients => {
      if (!controller.signal.aborted) setResult({ query, patients, error: null })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ query, patients: [], error: error instanceof PatientApiError ? error.message : 'Unable to load the patient directory.' })
    })
    return () => controller.abort()
  }, [query, attempt, api])
  return { patients: result?.query === query ? result.patients : [], error: result?.query === query ? result.error : null, loading: result?.query !== query, retry: () => { setResult(null); setAttempt(n => n + 1) } }
}
