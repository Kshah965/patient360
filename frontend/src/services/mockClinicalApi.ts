import { patients } from '../mocks/patients'
import type { ClinicalApi } from '../types/clinical'

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request aborted', 'AbortError')); return }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Request aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 300)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
export const mockClinicalApi: ClinicalApi = {
  async searchPatients(query, signal) {
    await delay(signal)
    const term = query.trim().toLowerCase()
    return patients.filter(p => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term)).map(p => ({
      id: p.id, name: p.name, dateOfBirth: p.dateOfBirth, sex: p.sex,
      indicator: p.allergies.status === 'documented' ? 'Documented allergies' : p.allergies.status === 'unknown' ? 'Allergy status unknown' : 'No known allergies',
    }))
  },
  async getPatient(patientId, signal) {
    await delay(signal)
    const patient = patients.find(p => p.id === patientId)
    if (!patient) throw new Error('Patient record not found.')
    return structuredClone(patient)
  },
}
