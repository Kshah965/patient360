import type { AllergyRecord, Patient, PatientSummary } from '@/types/clinical'
export class PatientApiError extends Error {}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PatientApiError('Invalid patient response: expected an object.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new PatientApiError('Invalid patient response: expected text.')
  return value
}
function list<T>(value: unknown, convert: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new PatientApiError('Invalid patient response: expected a list.')
  return value.map(convert)
}
function nullableList<T>(value: unknown, convert: (value: unknown) => T): T[] | null { return value === null ? null : list(value, convert) }
function recorded(value: unknown, fallback: string): string { return value == null || value === '' ? fallback : text(value) }
function identity(value: unknown) {
  const p = object(value)
  const id = text(p.id), name = text(p.name), dateOfBirth = text(p.dateOfBirth)
  if (!id.trim() || !name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(Date.parse(dateOfBirth))) throw new PatientApiError('Invalid patient identity or birth date.')
  return { id, name, dateOfBirth, sex: p.sex == null ? null : text(p.sex) }
}
export function normalizePatientDirectory(value: unknown): PatientSummary[] {
  const patients = list(value, row => ({ ...identity(row), indicator: text(object(row).indicator) }))
  if (new Set(patients.map(p => p.id)).size !== patients.length) throw new PatientApiError('Duplicate patient IDs in directory response.')
  return patients
}
export function normalizePatient(value: unknown, expectedId: string): Patient {
  const p = object(value), who = identity(p)
  if (who.id !== expectedId) throw new PatientApiError('Patient response identity does not match the selection.')
  const a = object(p.allergies)
  const items = list(a.items, entry => { const item = object(entry); return { substance: text(item.substance), reaction: recorded(item.reaction, 'Reaction not recorded') } })
  let allergies: AllergyRecord
  if (a.status === 'documented' && items.length > 0) allergies = { status: 'documented', items }
  else if ((a.status === 'unknown' || a.status === 'none-known') && items.length === 0) allergies = { status: a.status, items: [] }
  else throw new PatientApiError('Invalid or contradictory allergy information.')
  let vitals: Patient['vitals'] = null
  if (p.vitals !== null) {
    const v = object(p.vitals)
    const num = (k: string): number | null => { const x = v[k]; if (x == null) return null; if (typeof x !== 'number' || !Number.isFinite(x)) throw new PatientApiError('Invalid vital sign value.'); return x }
    const partial = { bloodPressure: v.bloodPressure == null ? null : text(v.bloodPressure), heartRate: num('heartRate'), temperatureC: num('temperatureC'), oxygenSaturation: num('oxygenSaturation') }
    // Partial sets are kept: missing vitals stay null and are shown as not recorded.
    if (Object.values(partial).some(x => x !== null)) vitals = { recordedAt: text(v.recordedAt), ...partial }
  }
  return {
    ...who, allergies, vitals,
    medications: nullableList(p.medications, entry => { const m = object(entry); if (m.id !== undefined && (typeof m.id !== 'number' || !Number.isInteger(m.id))) throw new PatientApiError('Invalid medication ID.'); return { ...(m.id === undefined ? {} : { id: m.id as number }), name: text(m.name), dose: recorded(m.dose, 'Not recorded'), frequency: recorded(m.frequency, 'Not recorded') } }),
    conditions: nullableList(p.conditions, text), history: nullableList(p.history, text),
    encounters: nullableList(p.encounters, entry => { const e = object(entry); return { date: text(e.date), reason: text(e.reason), outcome: recorded(e.outcome, 'Outcome not recorded') } }),
    ...(p.observations === undefined ? {} : { observations: list(p.observations, entry => { const o = object(entry); if (o.category !== 'vital' && o.category !== 'lab') throw new PatientApiError('Invalid observation category.'); return { recordedAt: text(o.recordedAt), category: o.category, name: text(o.name), value: text(o.value), unit: o.unit == null ? null : text(o.unit) } }) }),
    ...(p.criticalAlerts === undefined ? {} : { criticalAlerts: list(p.criticalAlerts, entry => { const c = object(entry); if (c.severity !== 'high' && c.severity !== 'moderate') throw new PatientApiError('Invalid patient alert severity.'); return { severity: c.severity, kind: text(c.kind), message: text(c.message) } }) }),
  }
}
