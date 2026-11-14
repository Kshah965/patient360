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
