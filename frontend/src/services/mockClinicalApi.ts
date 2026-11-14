import { prescriptionScenarios } from '../mocks/prescriptionResults'
import { medications } from '../mocks/medications'
import { emergencySummaries } from '../mocks/emergencySummaries'
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
  async checkPrescription(patientId, prescription, signal) {
    await delay(signal)
    const patient = patients.find(p => p.id === patientId)
    if (!patient) throw new Error('Patient record not found.')
    const drug = prescription.drug.trim().toLowerCase()
    if (!medications.some(m => m.drug === drug)) throw new Error('Medication is not in the demo catalog.')
    const key = `${patientId}:${drug}`
    const alerts = Object.hasOwn(prescriptionScenarios, key) ? prescriptionScenarios[key] : []
    return structuredClone({
      patientId, prescription: { drug }, alerts,
      limitations: [
        'Predefined mock response only. This is not a comprehensive medication safety assessment.',
        'Clinical severity and interaction evidence require backend verification. Demo priority is illustrative.',
        ...(patient.allergies.status === 'unknown' ? ['Allergy information is unavailable.'] : []),
        ...(patient.medications === null ? ['Current medication information is unavailable.'] : []),
        ...(patient.conditions === null ? ['Medical condition information is unavailable.'] : []),
      ],
      provenance: 'synthetic-demo',
    })
  },
  async getEmergencySummary(patientId, signal) {
    await delay(signal)
    const summary = Object.hasOwn(emergencySummaries, patientId) ? emergencySummaries[patientId] : undefined
    if (!summary) throw new Error('Emergency summary not found.')
    return structuredClone(summary)
  },
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
