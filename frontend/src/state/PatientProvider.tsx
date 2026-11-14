import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { clinicalApi } from '@/services/clinicalApi'
import type { Patient } from '@/types/clinical'
import { PatientContext } from './patientContext'

export function PatientProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  useEffect(() => () => { request.current?.abort() }, [])
  const selectPatient = useCallback((id: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const version = ++sequence.current
    setSelectedId(id)
    setPatient(null)
    setError(null)
    setLoading(true)
    clinicalApi.getPatient(id, controller.signal).then(result => {
      if (version === sequence.current && !controller.signal.aborted) setPatient(result)
    }).catch(() => {
      if (version === sequence.current && !controller.signal.aborted) setError('Unable to load the patient record. Please retry.')
    }).finally(() => {
      if (version === sequence.current && !controller.signal.aborted) setLoading(false)
    })
  }, [])
  const clearPatient = useCallback(() => {
    request.current?.abort()
    sequence.current++
    setSelectedId(null)
    setPatient(null)
    setError(null)
    setLoading(false)
  }, [])
  return <PatientContext.Provider value={{ selectedId, patient, loading, error, selectPatient, clearPatient, retry: () => { if (selectedId) selectPatient(selectedId) } }}>{children}</PatientContext.Provider>
}
