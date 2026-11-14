// Run with Node 22.15+ from frontend: node --test tests/patients.test.mjs
// Uses the existing TypeScript dependency; no additional test dependencies.
import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const src = new URL('../src/', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    let url
    if (specifier.startsWith('@/')) url = new URL(specifier.slice(2), src)
    else if (specifier.startsWith('.') && context.parentURL?.startsWith(src.href)) url = new URL(specifier, context.parentURL)
    if (url) {
      for (const suffix of ['', '.ts', '.tsx']) {
        if (existsSync(fileURLToPath(url) + suffix)) return nextResolve(pathToFileURL(fileURLToPath(url) + suffix).href, context)
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(src.href) && /\.tsx?$/.test(url)) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText }
    }
    return nextLoad(url, context)
  },
})
const { clinicalApi } = await import('../src/services/clinicalApi.ts')
const { getAge } = await import('../src/lib/patient.ts')
const { createElement: h } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { PatientContext } = await import('../src/state/patientContext.ts')
const { PatientProfile } = await import('../src/components/PatientProfile.tsx')
const { WorkspaceOverview } = await import('../src/components/WorkspaceOverview.tsx')
const { MemoryRouter } = await import('react-router-dom')
function render(patient, extra = {}, view) {
  const state = { patient, selectedId: patient?.id ?? null, loading: false, error: null, retry() {}, clearPatient() {}, selectPatient() {}, ...extra }
  return renderToStaticMarkup(h(MemoryRouter, null, h(PatientContext.Provider, { value: state }, view ? h(WorkspaceOverview, { view }) : h(PatientProfile))))
}

test('search supports name, record ID, case, whitespace and no results', async () => {
  assert.equal((await clinicalApi.searchPatients('')).length, 7)
  assert.equal((await clinicalApi.searchPatients('  MARA '))[0].id, 'SYN-1001')
  assert.equal((await clinicalApi.searchPatients('syn-1002'))[0].name, 'Owen Calder')
  assert.deepEqual(await clinicalApi.searchPatients('no such patient'), [])
})
test('profile records differ and returned data cannot mutate fixtures', async () => {
  const first = await clinicalApi.getPatient('SYN-1001')
  const second = await clinicalApi.getPatient('SYN-1002')
  assert.match(render(first), /Amoxicillin/)
  assert.doesNotMatch(render(second), /Amoxicillin|Mara Ellison/)
  first.name = 'changed'
  assert.equal((await clinicalApi.getPatient('SYN-1001')).name, 'Mara Ellison')
  await assert.rejects(clinicalApi.getPatient('missing'), /not found/)
})
test('aborted requests reject while a newer patient request succeeds', async () => {
  const controller = new AbortController()
  const old = clinicalApi.getPatient('SYN-1001', controller.signal)
  controller.abort()
  await assert.rejects(old, { name: 'AbortError' })
  assert.equal((await clinicalApi.getPatient('SYN-1002')).id, 'SYN-1002')
  await assert.rejects(clinicalApi.searchPatients('', controller.signal), { name: 'AbortError' })
})
test('unknown, none-known, empty medication list and absent vitals remain distinct', async () => {
  const unknown = render(await clinicalApi.getPatient('SYN-1004'))
  assert.match(unknown, /Allergy information unavailable/)
  assert.match(unknown, /Medication information unavailable/)
  assert.match(unknown, /Vital signs unavailable/)
  const none = render(await clinicalApi.getPatient('SYN-1005'))
  assert.match(none, /No known allergies documented/)
  assert.match(none, /No current medications documented/)
})
test('profile loading, error, empty states and all workspace views render', async () => {
  assert.match(render(null, { loading: true }), /Loading patient record/)
  assert.match(render(null, { error: 'Test failure' }), /Test failure/)
  assert.match(render(null), /No patient selected/)
  const patient = await clinicalApi.getPatient('SYN-1002')
  for (const view of ['dashboard', 'patients', 'safety']) {
    const markup = render(patient, {}, view)
    assert.match(markup, /Owen Calder/)
    assert.match(markup, /Warfarin/)
  }
})
test('age calculation handles birthdays and year boundaries', () => {
  assert.equal(getAge('1984-03-18', new Date(2026, 2, 17)), 41)
  assert.equal(getAge('1984-03-18', new Date(2026, 2, 18)), 42)
  assert.equal(getAge('1993-06-21', new Date(2026, 0, 1)), 32)
})

const { patients: fixtures } = await import('../src/mocks/patients.ts')
const { EmergencySummaryReport } = await import('../src/components/EmergencySummaryPanel.tsx')
const { createEmergencySummaryStore } = await import('../src/state/emergencySummaryStore.ts')
test('all seven summaries preserve record facts and priority order without inferred findings', async () => {
  for (const patient of fixtures) {
    const summary = await clinicalApi.getEmergencySummary(patient.id)
    assert.equal(summary.patient.id, patient.id)
    for (const field of ['allergies', 'medications', 'conditions', 'history', 'encounters']) assert.deepEqual(summary[field], patient[field])
    assert.deepEqual(summary.observations, patient.vitals)
    assert.deepEqual(summary.critical_alerts, [])
    assert.equal(summary.provenance, 'synthetic-demo')
    const markup = renderToStaticMarkup(h(EmergencySummaryReport, { summary }))
    assert.ok(markup.indexOf('Priority record information') < markup.indexOf('Patient overview'))
    assert.ok(markup.indexOf('Allergies and reactions') < markup.indexOf('Medical history'))
    assert.match(markup, /Not clinically validated/)
  }
  await assert.rejects(clinicalApi.getEmergencySummary('missing'), /not found/)
  const missing = await clinicalApi.getEmergencySummary('SYN-1004')
  assert.ok(missing.missing_information.includes('Medication information not available.'))
  assert.match(renderToStaticMarkup(h(EmergencySummaryReport, { summary: missing })), /Not available/)
})
test('summary request loading, failure and retry states', async () => {
  let fail = true
  const summary = await clinicalApi.getEmergencySummary('SYN-1001')
  const store = createEmergencySummaryStore('SYN-1001', { async getEmergencySummary() { if (fail) throw new Error('Offline'); return summary } })
  const pending = store.generate()
  assert.equal(store.getSnapshot().status, 'loading')
  await pending
  assert.equal(store.getSnapshot().status, 'error')
  fail = false
  await store.generate()
  assert.equal(store.getSnapshot().status, 'success')
  const empty = createEmergencySummaryStore(null, clinicalApi)
  await empty.generate()
  assert.equal(empty.getSnapshot().status, 'idle')
})
test('cancelled and superseded summary responses cannot publish stale data', async () => {
  const summary = await clinicalApi.getEmergencySummary('SYN-1001')
  let resolveOld
  const old = createEmergencySummaryStore('SYN-1001', { getEmergencySummary: () => new Promise(resolve => { resolveOld = resolve }) })
  const pending = old.generate()
  old.cancel()
  const next = createEmergencySummaryStore('SYN-1002', clinicalApi)
  assert.equal(next.getSnapshot().status, 'idle')
  assert.equal(next.getSnapshot().summary, null)
  resolveOld(summary) // Simulates a transport that ignores AbortSignal.
  await pending
  assert.equal(old.getSnapshot().summary, null)
  await next.generate()
  assert.equal(next.getSnapshot().summary.patient.id, 'SYN-1002')
  let resolveFirst
  let call = 0
  const repeated = createEmergencySummaryStore('SYN-1001', { getEmergencySummary: () => ++call === 1 ? new Promise(resolve => { resolveFirst = resolve }) : Promise.reject(new Error('Latest request failed')) })
  const first = repeated.generate()
  await repeated.generate()
  resolveFirst(summary)
  await first
  assert.equal(repeated.getSnapshot().status, 'error')
  const mismatch = createEmergencySummaryStore('SYN-1002', { getEmergencySummary: async () => summary })
  await mismatch.generate()
  assert.equal(mismatch.getSnapshot().status, 'error')
  const controller = new AbortController()
  const aborted = clinicalApi.getEmergencySummary('SYN-1001', controller.signal)
  controller.abort()
  await assert.rejects(aborted, { name: 'AbortError' })
})


test('approved Owen demo medications appear in profile and summary without safety findings', async () => {
  const patient = await clinicalApi.getPatient('SYN-1002')
  assert.deepEqual(patient.medications, [
    { name: 'Warfarin', dose: '3 mg', frequency: 'Daily' },
    { name: 'Sertraline', dose: '50 mg orally', frequency: 'Once daily' },
    { name: 'Metoprolol tartrate', dose: '25 mg', frequency: 'Twice daily' },
    { name: 'Lisinopril', dose: '10 mg', frequency: 'Daily' },
    { name: 'Atorvastatin', dose: '20 mg', frequency: 'Nightly' },
  ])
  assert.equal(new Set(patient.medications.map(m => m.name.toLowerCase())).size, 5)
  assert.deepEqual(patient.medications.find(m => m.name === 'Warfarin'), { name: 'Warfarin', dose: '3 mg', frequency: 'Daily' })
  assert.deepEqual(patient.medications.find(m => m.name === 'Sertraline'), { name: 'Sertraline', dose: '50 mg orally', frequency: 'Once daily' })
  const profile = render(patient)
  assert.match(profile, /Warfarin/)
  assert.match(profile, /Sertraline/)
  assert.match(profile, /50 mg orally/)
  assert.match(profile, /Once daily/)
  const summary = await clinicalApi.getEmergencySummary(patient.id)
  assert.deepEqual(summary.medications, patient.medications)
  assert.deepEqual(summary.critical_alerts, [])
  const report = renderToStaticMarkup(h(EmergencySummaryReport, { summary }))
  assert.match(report, /Warfarin is an anticoagulant/)
  assert.match(report, /Sertraline — 50 mg orally; Once daily/)
  assert.ok(report.indexOf('Warfarin is an anticoagulant') < report.indexOf('Patient overview'))
  assert.match(report, /Safety has not been assessed/)
  assert.ok(!patient.medications.some(m => m.name.toLowerCase() === 'ibuprofen'))
})

const { searchMedications, medications } = await import('../src/mocks/medications.ts')
const { MedicationSearch } = await import('../src/components/MedicationSearch.tsx')
const { SafetyResults } = await import('../src/components/SafetyResults.tsx')
const { prioritizeAlerts, safeEvidenceUrl } = await import('../src/lib/safety.ts')
const { createPrescriptionStore } = await import('../src/state/prescriptionStore.ts')

test('medication catalog filters and selected medication renders accessibly', () => {
  assert.equal(medications.length, 8)
  assert.deepEqual(searchMedications('  IBUPRO '), [{ drug: 'ibuprofen', label: 'Ibuprofen' }])
  assert.deepEqual(searchMedications('no such medication'), [])
  const markup = renderToStaticMarkup(h(MedicationSearch, { value: 'ibuprofen', onChange() {}, disabled: false }))
  assert.match(markup, /value="ibuprofen" selected=""/)
  assert.match(markup, /for="proposed-medication"/)
})
test('official interaction and exact documented allergy scenarios are deterministic and honest about evidence', async () => {
  const result = await clinicalApi.checkPrescription('SYN-1002', { drug: 'Ibuprofen' })
  assert.deepEqual(result, await clinicalApi.checkPrescription('SYN-1002', { drug: 'ibuprofen' }))
  assert.equal(result.alerts.length, 2)
  assert.deepEqual(result.alerts.map(a => a.drugs), [['warfarin', 'ibuprofen'], ['sertraline', 'ibuprofen']])
  assert.ok(result.alerts.every(a => a.severity === 'unknown' && a.source.status === 'pending' && !a.source.reference && !a.source.url && a.alternatives.length === 0))
  const allergy = await clinicalApi.checkPrescription('SYN-1001', { drug: 'amoxicillin' })
  assert.equal(allergy.alerts[0].type, 'allergy')
  assert.equal(allergy.alerts[0].allergen, 'Amoxicillin')
  assert.match(allergy.alerts[0].explanation, /hives and facial swelling/)
  result.alerts[0].explanation = 'mutated'
  assert.notEqual((await clinicalApi.checkPrescription('SYN-1002', { drug: 'ibuprofen' })).alerts[0].explanation, 'mutated')
})
test('ordering retains highest ties, every critical finding and unclassified alerts', () => {
  const make = (id, severity) => ({ id, severity, type: 'interaction', drugs: [], explanation: '', source: { name: 'Test fixture', status: 'pending' }, alternatives: [] })
  const input = [make('low', 'low'), make('critical-one', 'critical'), make('high', 'high'), make('critical-two', 'critical'), make('unknown', 'unknown')]
  const result = prioritizeAlerts(input)
  assert.deepEqual(result.visible.map(a => a.id), ['critical-one', 'critical-two', 'unknown'])
  assert.deepEqual(result.additional.map(a => a.id), ['high', 'low'])
  assert.equal(input[0].id, 'low')
  const ties = prioritizeAlerts([make('one', 'high'), make('two', 'high'), make('three', 'moderate')])
  assert.deepEqual(ties.visible.map(a => a.id), ['one', 'two'])
})
test('lower-priority findings start collapsed, counter uses actual count, alternatives are not invented', async () => {
  const result = await clinicalApi.checkPrescription('SYN-1002', { drug: 'ibuprofen' })
  const markup = renderToStaticMarkup(h(SafetyResults, { result }))
  assert.match(markup, /1 of 2 findings shown/)
  assert.match(markup, /aria-expanded="false"/)
  assert.match(markup, /id="additional-findings" hidden=""/)
  assert.match(markup, /No alternatives available for review/)
  assert.doesNotMatch(markup, /1 of 6/)
})
test('empty dataset and missing information remain explicit, invalid requests reject', async () => {
  const empty = await clinicalApi.checkPrescription('SYN-1004', { drug: 'acetaminophen' })
  assert.deepEqual(empty.alerts, [])
  assert.ok(empty.limitations.includes('Current medication information is unavailable.'))
  assert.ok(empty.limitations.includes('Allergy information is unavailable.'))
  const markup = renderToStaticMarkup(h(SafetyResults, { result: empty }))
  assert.match(markup, /No interactions found in the available demo dataset/)
  assert.match(markup, /not proof of safety/)
  await assert.rejects(clinicalApi.checkPrescription('missing', { drug: 'ibuprofen' }), /not found/)
  await assert.rejects(clinicalApi.checkPrescription('SYN-1002', { drug: 'unknown' }), /demo catalog/)
  assert.equal(safeEvidenceUrl('javascript:alert(1)'), undefined)
  assert.equal(safeEvidenceUrl('https://example.org/evidence'), 'https://example.org/evidence')
})
test('prescription lifecycle supports loading, retry, cancellation, patient and medication changes', async () => {
  const result = await clinicalApi.checkPrescription('SYN-1002', { drug: 'ibuprofen' })
  let fail = true
  const retry = createPrescriptionStore('SYN-1002', 'ibuprofen', { async checkPrescription() { if (fail) throw new Error('Offline'); return result } })
  const pending = retry.check()
  assert.equal(retry.getSnapshot().status, 'loading')
  await pending
  assert.equal(retry.getSnapshot().status, 'error')
  fail = false
  await retry.check()
  assert.equal(retry.getSnapshot().status, 'success')
  for (const [patientId, drug] of [['SYN-1001', 'amoxicillin'], ['SYN-1002', 'acetaminophen']]) {
    let resolveOld
    const previous = createPrescriptionStore('SYN-1002', 'ibuprofen', { checkPrescription: () => new Promise(resolve => { resolveOld = resolve }) })
    const outstanding = previous.check()
    previous.cancel()
    const next = createPrescriptionStore(patientId, drug, clinicalApi)
    assert.equal(next.getSnapshot().status, 'idle')
    assert.equal(next.getSnapshot().result, null)
    resolveOld(result) // Transport intentionally ignores cancellation.
    await outstanding
    assert.equal(previous.getSnapshot().result, null)
    await next.check()
    assert.equal(next.getSnapshot().result.patientId, patientId)
    assert.equal(next.getSnapshot().result.prescription.drug, drug)
  }
  const wrongPatient = createPrescriptionStore('SYN-1001', 'ibuprofen', { checkPrescription: async () => result })
  await wrongPatient.check()
  assert.equal(wrongPatient.getSnapshot().status, 'error')
  const wrongDrug = createPrescriptionStore('SYN-1002', 'amoxicillin', { checkPrescription: async () => result })
  await wrongDrug.check()
  assert.equal(wrongDrug.getSnapshot().status, 'error')
  const none = createPrescriptionStore(null, '', clinicalApi)
  await none.check()
  assert.equal(none.getSnapshot().status, 'idle')
  const controller = new AbortController()
  const aborted = clinicalApi.checkPrescription('SYN-1002', { drug: 'ibuprofen' }, controller.signal)
  controller.abort()
  await assert.rejects(aborted, { name: 'AbortError' })
})

const { normalizeSafetyResponse, createHttpSafetyApi, supportsBackendPatient, SafetyApiError } = await import('../src/services/httpSafetyApi.ts')
const { createClinicalApi } = await import('../src/services/clinicalApi.ts')
const { SafetyAlert: AlertComponent } = await import('../src/components/SafetyAlert.tsx')
const backendAlert = (overrides = {}) => ({
  severity: 'major', type: 'interaction', drugs: ['ibuprofen', 'warfarin'],
  explanation: 'Backend fixture explanation', management: 'Backend fixture management',
  source: 'Backend fixture source', source_id: null, verified: true,
  priority: 'primary', context: ['Backend-supplied context'],
  alternatives: [{ drug: 'acetaminophen', rationale: 'Backend fixture rationale', monitoring: 'Backend fixture monitoring', source: 'Backend fixture source', indication: 'pain', alerts_found: ['Backend-supplied alternative caution'] }],
  ...overrides,
})
const backendPayload = (alerts = [backendAlert()], overrides = {}) => ({ drug: 'ibuprofen', total_found: alerts.length, shown: alerts.filter(a => a.priority === 'primary').length, disclaimer: 'Backend dataset disclaimer', alerts, ...overrides })

test('HTTP normalization preserves backend severity, duplication, counts, priority, context and evidence metadata', () => {
  const values = ['contraindicated', 'major', 'moderate', 'minor', 'unrecognized']
  const payload = backendPayload(values.map((severity, i) => backendAlert({ severity, type: i === 2 ? 'duplication' : 'interaction', verified: i !== 1, source_id: i === 0 ? 'provided-reference' : null, priority: i < 2 ? 'primary' : 'collapsed' })))
  const result = normalizeSafetyResponse(payload, 'demo', { drug: 'ibuprofen' })
  assert.equal(result.provenance, 'backend-engine')
  assert.equal(result.patientId, 'demo')
  assert.deepEqual(result.alerts.map(a => a.severity), ['critical', 'high', 'moderate', 'low', 'unknown'])
  assert.deepEqual(result.alerts.map(a => a.backendSeverity), values)
  assert.equal(result.alerts[2].type, 'duplication')
  assert.equal(result.backend.total_found, 5)
  assert.equal(result.backend.shown, 2)
  assert.equal(result.alerts[2].backendPriority, 'collapsed')
  assert.deepEqual(result.alerts[0].context, ['Backend-supplied context'])
  assert.equal(result.alerts[0].source.reference, 'provided-reference')
  assert.equal(result.alerts[0].source.backendVerified, true)
  assert.equal(result.alerts[0].source.status, 'backend-reported')
  assert.equal(result.alerts[1].source.backendVerified, false)
  assert.equal(result.alerts[1].source.status, 'pending')
  assert.equal(result.alerts[0].alternatives[0].medication, 'acetaminophen')
  assert.equal(result.alerts[0].alternatives[0].management, 'Backend fixture monitoring')
  assert.deepEqual(result.alerts[0].alternatives[0].alertsFound, ['Backend-supplied alternative caution'])
  assert.equal(result.alerts[0].alternatives[0].source.status, 'pending')
  assert.equal(result.alerts[0].alternatives[0].source.backendVerified, undefined)
  assert.equal(normalizeSafetyResponse(backendPayload([backendAlert({ source: 'TODO' })]), 'demo', { drug: 'ibuprofen' }).alerts[0].source.status, 'pending')
})
test('frontend IDs are content-stable through reorder, unique for duplicates, and supplied backend IDs persist', () => {
  const a = backendAlert(), b = backendAlert({ drugs: ['ibuprofen', 'sertraline'], severity: 'moderate' })
  const first = normalizeSafetyResponse(backendPayload([a, b]), 'demo', { drug: 'ibuprofen' })
  const reordered = normalizeSafetyResponse(backendPayload([b, a]), 'demo', { drug: 'ibuprofen' })
  assert.equal(first.alerts[0].id, reordered.alerts[1].id)
  const duplicates = normalizeSafetyResponse(backendPayload([a, a]), 'demo', { drug: 'ibuprofen' })
  assert.equal(new Set(duplicates.alerts.map(alert => alert.id)).size, 2)
  assert.match(normalizeSafetyResponse(backendPayload([backendAlert({ id: 'backend-id' })]), 'demo', { drug: 'ibuprofen' }).alerts[0].id, /^backend-id/)
})
test('normalization refuses malformed payloads instead of inventing or dropping findings', () => {
  for (const payload of [null, {}, backendPayload([], { total_found: -1 }), backendPayload([], { shown: 1 }), backendPayload([backendAlert({ type: 'unsupported' })]), backendPayload([backendAlert({ verified: 'true' })]), backendPayload([backendAlert({ context: null })])]) {
    assert.throws(() => normalizeSafetyResponse(payload, 'demo', { drug: 'ibuprofen' }), SafetyApiError)
  }
  const partial = normalizeSafetyResponse(backendPayload([], { total_found: 3, shown: 1 }), 'demo', { drug: 'ibuprofen' })
  assert.equal(partial.alerts.length, 0)
  assert.equal(partial.backend.total_found, 3)
  assert.ok(partial.limitations.some(text => text.includes('supplied 0')))
  assert.match(renderToStaticMarkup(h(SafetyResults, { result: partial })), /reported findings but supplied no alert records/)
  assert.equal(normalizeSafetyResponse(backendPayload([backendAlert({ severity: 'constructor' })]), 'demo', { drug: 'ibuprofen' }).alerts[0].severity, 'unknown')
})
test('HTTP adapter sends exact request and AbortSignal, rejects blank IDs without a request, and never falls back', async () => {
  let calls = 0
  const controller = new AbortController()
  const api = createHttpSafetyApi('http://localhost:8000/', async (url, options) => {
    calls++
    assert.equal(url.href, 'http://localhost:8000/patients/demo/check')
    assert.equal(options.method, 'POST')
    assert.equal(options.body, '{"drug":"ibuprofen"}')
    assert.equal(options.signal, controller.signal)
    return Response.json(backendPayload())
  })
  assert.equal(supportsBackendPatient('SYN-1002'), true)
  assert.equal(supportsBackendPatient('demo'), true)
  await assert.rejects(api.checkPrescription('', { drug: 'ibuprofen' }), /valid patient ID/)
  assert.equal(calls, 0)
  assert.equal((await api.checkPrescription('demo', { drug: 'ibuprofen' }, controller.signal)).provenance, 'backend-engine')
  assert.equal(calls, 1)
  await assert.rejects(createHttpSafetyApi('').checkPrescription('demo', { drug: 'ibuprofen' }), /VITE_API_BASE_URL/)
  await assert.rejects(createHttpSafetyApi('file:///tmp').checkPrescription('demo', { drug: 'ibuprofen' }), /HTTP/)
  controller.abort()
  await assert.rejects(api.checkPrescription('demo', { drug: 'ibuprofen' }, controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
  const bodyController = new AbortController()
  const bodyApi = createHttpSafetyApi('http://localhost:8000', async () => ({ ok: true, async json() { bodyController.abort(); throw new DOMException('Aborted', 'AbortError') } }))
  await assert.rejects(bodyApi.checkPrescription('demo', { drug: 'ibuprofen' }, bodyController.signal), { name: 'AbortError' })
})
test('HTTP failures, invalid JSON and normalization errors reach error state rather than mock results', async () => {
  for (const [fetcher, expected] of [
    [async () => new Response('', { status: 404 }), /HTTP 404/],
    [async () => new Response('', { status: 500 }), /HTTP 500/],
    [async () => { throw new TypeError('Network failure') }, /connection failed/],
    [async () => new Response('not json'), /invalid JSON/],
    [async () => Response.json({ alerts: null }), /Invalid backend/],
  ]) {
    const store = createPrescriptionStore('demo', 'ibuprofen', createHttpSafetyApi('http://localhost:8000', fetcher))
    await store.check()
    assert.equal(store.getSnapshot().status, 'error')
    assert.equal(store.getSnapshot().result, null)
    assert.match(store.getSnapshot().error, expected)
  }
})
test('explicit hybrid routing retains patient/profile/summary mocks and does not alias Owen', async () => {
  let calls = 0
  const api = createClinicalApi('backend', 'http://localhost:8000', async () => { calls++; return Response.json(backendPayload()) })
  assert.equal((await api.getPatient('SYN-1002')).name, 'Owen Calder')
  assert.equal((await clinicalApi.getEmergencySummary('SYN-1002')).patient.id, 'SYN-1002')
  assert.equal((await api.searchPatients('Owen'))[0].id, 'SYN-1002')
  assert.equal(calls, 0)
  await assert.rejects(api.checkPrescription('', { drug: 'ibuprofen' }), /valid patient ID/)
  assert.equal(calls, 0)
  await api.checkPrescription('demo', { drug: 'ibuprofen' })
  assert.equal(calls, 1)
  const mock = createClinicalApi('mock', '', async () => { throw new Error('must not fetch') })
  assert.equal((await mock.checkPrescription('SYN-1002', { drug: 'ibuprofen' })).provenance, 'synthetic-demo')
})
test('late HTTP results cannot cross medication, patient or request-mode boundaries', async () => {
  let finish
  let capturedSignal
  const http = createHttpSafetyApi('http://localhost:8000', async (_url, options) => { capturedSignal = options.signal; return new Promise(resolve => { finish = resolve }) })
  const old = createPrescriptionStore('demo', 'ibuprofen', http)
  const pending = old.check()
  old.cancel()
  const newer = createPrescriptionStore('SYN-1002', 'acetaminophen', clinicalApi)
  assert.equal(capturedSignal.aborted, true)
  assert.equal(newer.getSnapshot().status, 'idle')
  finish(Response.json(backendPayload())) // Transport ignores abort; adapter and store still guard.
  await pending
  assert.equal(old.getSnapshot().result, null)
  await newer.check()
  assert.equal(newer.getSnapshot().result.patientId, 'SYN-1002')
  assert.equal(newer.getSnapshot().result.provenance, 'synthetic-demo')
  let release
  const repeatApi = createHttpSafetyApi('http://localhost:8000', async () => new Promise(resolve => { release = resolve }))
  const oldDrug = createPrescriptionStore('demo', 'ibuprofen', repeatApi)
  const oldCheck = oldDrug.check()
  oldDrug.cancel()
  const newDrug = createPrescriptionStore('demo', 'sertraline', createHttpSafetyApi('http://localhost:8000', async () => Response.json(backendPayload([], { drug: 'sertraline' }))))
  release(Response.json(backendPayload()))
  await oldCheck
  await newDrug.check()
  assert.equal(oldDrug.getSnapshot().result, null)
  assert.equal(newDrug.getSnapshot().result.prescription.drug, 'sertraline')
})
test('backend UI preserves counts and primary findings, labels verification, and withholds unverified guidance', () => {
  const result = normalizeSafetyResponse(backendPayload([backendAlert({ verified: false }), backendAlert({ severity: 'minor', priority: 'primary', drugs: ['ibuprofen', 'other'] })]), 'demo', { drug: 'ibuprofen' })
  assert.equal(prioritizeAlerts(result.alerts).visible.length, 2)
  const markup = renderToStaticMarkup(h(SafetyResults, { result }))
  assert.match(markup, /Backend engine response/)
  assert.match(markup, /Backend reported 2 total findings; 2 marked primary/)
  assert.match(markup, /Backend verification flag: false/)
  assert.match(markup, /not independent clinical validation/)
  assert.match(markup, /Backend management text withheld/)
  assert.match(markup, /suggestion withheld/)
  assert.doesNotMatch(markup, /Backend fixture monitoring/)
  const alert = renderToStaticMarkup(h(AlertComponent, { alert: result.alerts[1] }))
  assert.match(alert, /Backend verification flag: true/)
  assert.match(alert, /Backend-supplied context/)
})

test('merged API preserves optional HTTP patient reads, mock summaries and explicit safety selection', async () => {
  const patient = await clinicalApi.getPatient('SYN-1002')
  const calls = []
  const controller = new AbortController()
  const fetcher = async (url, options) => {
    calls.push([String(url), options])
    if (options?.method === 'POST') return Response.json(backendPayload())
    return Response.json(String(url).includes('?q=') ? [{ id: patient.id, name: patient.name, dateOfBirth: patient.dateOfBirth, sex: patient.sex, indicator: 'Test indicator' }] : patient)
  }
  const merged = createClinicalApi('mock', 'http://safety.test', fetcher, 'http://patients.test/')
  assert.equal((await merged.searchPatients(' Owen ', controller.signal))[0].id, patient.id)
  assert.equal((await merged.getPatient(patient.id, controller.signal)).name, patient.name)
  assert.equal(calls[0][0], 'http://patients.test/patients?q=Owen')
  assert.equal(calls[1][0], 'http://patients.test/patients/SYN-1002')
  assert.equal(calls[0][1].signal, controller.signal)
  assert.equal(calls[1][1].signal, controller.signal)
  assert.equal((await merged.getEmergencySummary(patient.id)).patient.id, patient.id)
  assert.equal((await merged.checkPrescription(patient.id, { drug: 'ibuprofen' })).provenance, 'synthetic-demo')
  assert.equal(calls.length, 2)
  const backend = createClinicalApi('backend', 'http://safety.test', fetcher, 'http://patients.test')
  assert.equal((await backend.checkPrescription('demo', { drug: 'ibuprofen' })).provenance, 'backend-engine')
  assert.equal(calls[2][0], 'http://safety.test/patients/demo/check')
  const failing = createClinicalApi('mock', '', async () => new Response('', { status: 500 }), 'http://patients.test')
  await assert.rejects(failing.getPatient(patient.id), /500/)
  await assert.rejects(failing.searchPatients('Owen'), /500/)
})

const { normalizePatient, normalizePatientDirectory, PatientApiError } = await import('../src/services/patientNormalization.ts')
const { createHttpClinicalApi } = await import('../src/services/httpClinicalApi.ts')
const { resolveApiConfig } = await import('../src/services/apiConfig.ts')
const { createPatientApi } = await import('../src/services/clinicalApi.ts')
const { createPatientStore } = await import('../src/state/patientStore.ts')
const { PatientDataContext } = await import('../src/state/patientDataContext.ts')

test('patient normalization preserves null versus empty data, medication IDs and backend metadata', () => {
  const original = fixtures.find(p => p.id === 'SYN-1002')
  const wire = { ...original, medications: original.medications.map((m, i) => ({ ...m, id: i + 1 })), observations: [{ recordedAt: '2026-11-02', category: 'lab', name: 'test observation', value: 'not available', unit: null }], criticalAlerts: [{ severity: 'high', kind: 'anticoagulant', message: 'Backend fact' }] }
  const result = normalizePatient(wire, original.id)
  assert.equal(result.medications[0].id, 1)
  assert.deepEqual(result.observations, wire.observations)
  assert.deepEqual(result.criticalAlerts, wire.criticalAlerts)
  const missing = normalizePatient(fixtures.find(p => p.id === 'SYN-1004'), 'SYN-1004')
  assert.equal(missing.medications, null)
  assert.equal(missing.allergies.status, 'unknown')
  const empty = normalizePatient(fixtures.find(p => p.id === 'SYN-1005'), 'SYN-1005')
  assert.deepEqual(empty.medications, [])
  assert.equal(empty.allergies.status, 'none-known')
  const partial = normalizePatient({ ...wire, medications: [{ name: 'Test fixture', dose: null, frequency: null }], vitals: { recordedAt: '2026-11-02', heartRate: 70 } }, original.id)
  assert.deepEqual(partial.vitals, { recordedAt: '2026-11-02', bloodPressure: null, heartRate: 70, temperatureC: null, oxygenSaturation: null }) // partial vitals are kept, missing ones null
  assert.equal(partial.medications[0].dose, 'Not recorded')
})
test('malformed patient responses fail explicitly rather than inventing information', () => {
  const patient = fixtures[0]
  assert.throws(() => normalizePatient(patient, 'different-id'), /identity/)
  assert.throws(() => normalizePatient({ ...patient, allergies: { status: 'none-known', items: patient.allergies.items } }, patient.id), /allergy/)
  assert.throws(() => normalizePatient({ ...patient, medications: 'unknown' }, patient.id), PatientApiError)
  assert.throws(() => normalizePatientDirectory({ patients: [] }), PatientApiError)
  const row = { ...patient, indicator: 'test' }
  assert.throws(() => normalizePatientDirectory([row, row]), /Duplicate/)
  assert.deepEqual(normalizePatientDirectory([]), [])
})
test('patient HTTP reads use GET /patients and GET /patients/{id}, preserving cancellation and errors', async () => {
  const original = fixtures[0]
  const controller = new AbortController()
  const requests = []
  const api = createHttpClinicalApi('http://api.test/root/', async (url, options) => { requests.push([url, options]); return Response.json(String(url).includes('?q=') ? [{ ...original, indicator: 'test' }] : original) })
  assert.equal((await api.searchPatients(' Mara ', controller.signal))[0].id, original.id)
  assert.equal((await api.getPatient(original.id, controller.signal)).name, original.name)
  assert.equal(requests[0][0], 'http://api.test/root/patients?q=Mara')
  assert.equal(requests[1][0], 'http://api.test/root/patients/SYN-1001')
  assert.equal(requests[1][1].signal, controller.signal)
  controller.abort()
  await assert.rejects(api.getPatient(original.id, controller.signal), { name: 'AbortError' })
  assert.equal(requests.length, 2)
  for (const fetcher of [async () => new Response('', { status: 404 }), async () => new Response('', { status: 500 }), async () => new Response('bad JSON'), async () => { throw new TypeError('offline') }]) {
    await assert.rejects(createHttpClinicalApi('http://api.test', fetcher).getPatient(original.id), PatientApiError)
  }
  await assert.rejects(createHttpClinicalApi('').searchPatients(''), /VITE_API_BASE_URL/)
  const mock = createPatientApi('mock', '', async () => { throw new Error('must not fetch') })
  assert.equal((await mock.searchPatients('')).length, 7)
})
test('shared API config has deterministic precedence and explicit offline default', () => {
  assert.equal(resolveApiConfig().patientMode, 'mock')
  assert.equal(resolveApiConfig({ VITE_API_BASE_URL: ' http://api.test/ ' }).baseUrl, 'http://api.test/')
  assert.equal(resolveApiConfig({ VITE_API_URL: 'http://legacy.test' }).baseUrl, 'http://legacy.test')
  const conflict = resolveApiConfig({ VITE_API_BASE_URL: 'http://new.test', VITE_API_URL: 'http://old.test', VITE_PATIENT_DATA_MODE: 'backend' })
  assert.equal(conflict.baseUrl, 'http://new.test')
  assert.equal(conflict.patientMode, 'backend')
  assert.ok(conflict.configurationWarning)
})
test('patient store clears old details, retries, ignores stale responses, and cancels on mode reset', async () => {
  const first = fixtures[0], second = fixtures[1]
  let finish
  let signal
  const store = createPatientStore({ getPatient: (id, s) => id === first.id ? new Promise(resolve => { finish = resolve; signal = s }) : Promise.resolve(second) })
  const pending = store.selectPatient(first.id)
  assert.equal(store.getSnapshot().loading, true)
  assert.equal(store.getSnapshot().patient, null)
  await store.selectPatient(second.id)
  assert.equal(signal.aborted, true)
  finish(first)
  await pending
  assert.equal(store.getSnapshot().patient.id, second.id)
  store.clearPatient()
  assert.equal(store.getSnapshot().selectedId, null)
  let fail = true
  const retry = createPatientStore({ getPatient: async () => { if (fail) throw new PatientApiError('offline'); return first } })
  await retry.selectPatient(first.id)
  assert.equal(retry.getSnapshot().error, 'offline')
  fail = false
  await retry.retry()
  assert.equal(retry.getSnapshot().patient.id, first.id)
  const oldMode = createPatientStore({ getPatient: () => new Promise(resolve => { finish = resolve }) })
  const oldPending = oldMode.selectPatient(first.id)
  oldMode.cancel()
  const newMode = createPatientStore(clinicalApi)
  assert.equal(newMode.getSnapshot().selectedId, null)
  finish(first)
  await oldPending
  assert.equal(oldMode.getSnapshot().patient, null)
})

const { summaryFromPatient } = await import('../src/services/emergencySummary.ts')
test('live emergency summary preserves backend facts, alert severity and missing/empty distinctions', async () => {
  const wire = { ...fixtures[1], medications: fixtures[1].medications.filter(m => m.name !== 'Sertraline'), criticalAlerts: [{ severity: 'high', kind: 'anticoagulant', message: 'On blood thinner (Warfarin)' }], observations: [{ recordedAt: '2026-11-02', category: 'lab', name: 'fixture observation', value: 'recorded value', unit: null }] }
  let path
  const api = createHttpClinicalApi('http://api.test', async url => { path = url; return Response.json(wire) })
  const summary = await api.getEmergencySummary(wire.id)
  assert.equal(path, 'http://api.test/patients/SYN-1002/summary')
  assert.equal(summary.provenance, 'backend-record')
  assert.deepEqual(summary.medications, wire.medications)
  assert.equal(summary.critical_alerts[0].severity, 'high')
  assert.deepEqual(summary.recorded_observations, wire.observations)
  assert.doesNotMatch(renderToStaticMarkup(h(EmergencySummaryReport, { summary })), /Sertraline/)
  const missing = summaryFromPatient(fixtures[3])
  assert.equal(missing.medications, null)
  assert.ok(missing.missing_information.includes('Allergy information not available.'))
  assert.deepEqual(summaryFromPatient(fixtures[4]).medications, [])
})
test('live summary rejects invalid, wrong-patient, unavailable and aborted responses', async () => {
  for (const fetcher of [async () => Response.json({}), async () => Response.json(fixtures[0]), async () => new Response('', { status: 404 })]) {
    await assert.rejects(createHttpClinicalApi('http://api.test', fetcher).getEmergencySummary('SYN-1002'))
  }
  const controller = new AbortController(); controller.abort()
  await assert.rejects(createHttpClinicalApi('http://api.test', async () => { throw new Error('must not fetch') }).getEmergencySummary('SYN-1002', controller.signal), { name: 'AbortError' })
})


const actualOwen = JSON.parse(readFileSync(new URL('./fixtures/backend-owen.json', import.meta.url), 'utf8'))
test('actual backend Owen fixture flows through summary and selected-patient safety adapters', async () => {
  const requests = []
  const api = createClinicalApi('backend', 'http://api.test', async (url, options) => {
    requests.push([String(url), options])
    return Response.json(options?.method === 'POST' ? actualOwen.check : actualOwen.patient)
  })
  const summary = await api.getEmergencySummary('SYN-1002')
  const result = await api.checkPrescription('SYN-1002', { drug: 'ibuprofen' })
  assert.equal(summary.provenance, 'backend-record')
  assert.ok(!summary.medications.some(m => m.name === 'Sertraline'))
  assert.equal(result.backend.check_id, actualOwen.check.check_id)
  assert.deepEqual(result.alerts.map(a => [a.drugs, a.backendSeverity, a.backendPriority, a.source.backendVerified]), actualOwen.check.alerts.map(a => [a.drugs, a.severity, a.priority, a.verified]))
  assert.ok(requests[1][0].endsWith('/patients/SYN-1002/check'))
  const markup = renderToStaticMarkup(h(SafetyResults, { result }))
  assert.match(markup, /1 of 2 findings shown/)
  assert.doesNotMatch(markup, /sertraline/)
})

const { createExplanationApi, normalizeExplanation } = await import('../src/services/explanationApi.ts')
const { createExplanationStore } = await import('../src/state/explanationStore.ts')
const explanationFixture = (overrides = {}) => ({ patient_id: 'SYN-1002', kind: 'safety', check_id: 1, mode: 'template', model: null, reason: 'missing-key', items: [{ fact_id: 'alert-0', text: actualOwen.check.alerts[0].explanation, source: actualOwen.check.alerts[0].source, reference: null }], omitted_unverified: 0, notice: 'Explanatory excerpts only.', ...overrides })
test('explanation adapter correlates patient/check identity and sends no frontend clinical claims', async () => {
  let request
  const api = createExplanationApi('http://api.test', async (url, options) => { request = [url, options]; return Response.json(explanationFixture()) })
  const controller = new AbortController()
  const response = await api.getExplanation('SYN-1002', 'safety', 1, controller.signal)
  assert.equal(request[0], 'http://api.test/patients/SYN-1002/explanations/safety')
  assert.equal(request[1].body, '{"check_id":1}')
  assert.equal(request[1].signal, controller.signal)
  assert.equal(response.mode, 'template')
  await assert.rejects(api.getExplanation('SYN-1002', 'safety'), /stored check ID/)
  assert.throws(() => normalizeExplanation(explanationFixture(), 'different-patient', 'safety', 1), /identity/)
  assert.throws(() => normalizeExplanation(explanationFixture(), 'SYN-1002', 'safety', 2), /identity/)
  assert.throws(() => normalizeExplanation({ mode: 'llm-extractive' }, 'SYN-1002', 'summary'))
  assert.equal(normalizeExplanation(explanationFixture({ mode: 'llm-extractive', model: 'gpt-4.1-mini' }), 'SYN-1002', 'safety', 1).mode, 'llm-extractive')
})
test('explanation failure and stale responses never erase deterministic results', async () => {
  const raw = structuredClone(actualOwen.check)
  let finish
  const old = createExplanationStore('SYN-1002', 'safety', 1, { getExplanation: () => new Promise(resolve => { finish = resolve }) })
  const pending = old.generate()
  assert.equal(old.getSnapshot().status, 'loading')
  old.cancel()
  const newer = createExplanationStore('SYN-1002', 'safety', 2, { getExplanation: async () => { throw new Error('offline') } })
  assert.equal(newer.getSnapshot().value, null)
  finish(explanationFixture())
  await pending
  assert.equal(old.getSnapshot().value, null)
  await newer.generate()
  assert.equal(newer.getSnapshot().status, 'error')
  assert.deepEqual(actualOwen.check, raw)
  const wrong = createExplanationStore('SYN-1001', 'safety', 1, { getExplanation: async () => explanationFixture() })
  await wrong.generate()
  assert.equal(wrong.getSnapshot().status, 'error')
})
test('backend workspace exposes selected-patient tools without predefined result substitution', () => {
  const patient = normalizePatient(actualOwen.patient, 'SYN-1002')
  const markup = renderToStaticMarkup(h(MemoryRouter, null, h(PatientDataContext.Provider, { value: { mode: 'backend', setMode() {}, api: clinicalApi } }, h(PatientContext.Provider, { value: { patient, selectedId: patient.id, loading: false, error: null, clearPatient() {}, selectPatient() {}, retry() {} } }, h(WorkspaceOverview, { view: 'safety' })))))
  assert.match(markup, /Backend engine · Selected patient record/)
  assert.match(markup, /Check Medication Safety/)
  assert.match(markup, /Generate Emergency Summary/)
  assert.doesNotMatch(markup, /fixture ID: demo/)
  assert.doesNotMatch(markup, /50 mg orally/) // Sertraline remains a valid proposed-medication option, not an Owen medication.
})
test('HTTP checking accepts backend patient identities and preserves actual missing-ID failures', async () => {
  let path
  const api = createHttpSafetyApi('http://api.test', async url => { path = url.href; return new Response('', { status: 404 }) })
  await assert.rejects(api.checkPrescription('CUSTOM-88', { drug: 'ibuprofen' }), /HTTP 404/)
  assert.equal(path, 'http://api.test/patients/CUSTOM-88/check')
  assert.throws(() => normalizeSafetyResponse({ ...actualOwen.check, check_id: 'bad-id' }, 'SYN-1002', { drug: 'ibuprofen' }))
})

test('actual backend template explanation fixtures validate with the captured record and check', () => {
  const safety = normalizeExplanation(actualOwen.safetyExplanation, 'SYN-1002', 'safety', actualOwen.check.check_id)
  const summary = normalizeExplanation(actualOwen.summaryExplanation, 'SYN-1002', 'summary')
  assert.equal(safety.mode, 'template')
  assert.equal(safety.items.length, 2)
  assert.equal(summary.mode, 'template')
  assert.ok(summary.items.some(item => item.text.includes('Warfarin')))
  assert.ok(!summary.items.some(item => item.text.includes('Sertraline')))
})
