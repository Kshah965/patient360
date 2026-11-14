import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleCheck, ExternalLink, LoaderCircle, Plus, Scale, TriangleAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePatient } from '@/hooks/usePatient'
import { cn } from '@/lib/utils'
import { apiUrl, compareDrugs, getDrugInfo, prescribe } from '@/services/drugApi'
import type { CompareResponse, DrugInfo, DrugRiskProfile, RiskLevel, RiskReason, Severity } from '@/types/drugs'

const MAX_DRUGS = 4
const SEVERITIES: Severity[] = ['contraindicated', 'major', 'moderate', 'minor']

const LEVEL_STYLE: Record<RiskLevel, { label: string; badge: string; bar: string }> = {
  contraindicated: { label: 'Contraindicated', badge: 'border-red-800 bg-red-700 text-white', bar: 'bg-red-700' },
  major: { label: 'Major', badge: 'border-red-200 bg-red-50 text-red-800', bar: 'bg-red-500' },
  moderate: { label: 'Moderate', badge: 'border-amber-200 bg-amber-50 text-amber-900', bar: 'bg-amber-400' },
  minor: { label: 'Minor', badge: 'border-slate-200 bg-slate-50 text-slate-700', bar: 'bg-slate-400' },
  'none-found': { label: 'No interaction found in our dataset', badge: 'border-border bg-muted text-muted-foreground', bar: 'bg-muted' },
}

const REASON_LABEL: Record<RiskReason['kind'], string> = {
  interaction: 'Interaction',
  allergy: 'Allergy',
  duplication: 'Duplicate therapy',
  'allergy-unknown': 'Missing information',
  context: 'Patient context',
  'boxed-warning': 'FDA boxed warning',
}

const TOPIC_LABEL: Record<string, string> = {
  uses: 'Used for',
  how_it_works: 'How it works',
  boxed_warning: 'Boxed warning',
  contraindications: 'Do not use when',
  warnings: 'Warnings',
  common_side_effects: 'Common side effects',
}

type InfoState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; info: DrugInfo }

function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge className={cn('text-sm', LEVEL_STYLE[level].badge)}>{LEVEL_STYLE[level].label}</Badge>
}

function SeverityBar({ profile }: { profile: DrugRiskProfile }) {
  const total = SEVERITIES.reduce((sum, s) => sum + profile.counts[s], 0)
  const parts = SEVERITIES.filter(s => profile.counts[s] > 0)
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={total ? parts.map(s => `${profile.counts[s]} ${s}`).join(', ') : 'No interactions found in our dataset'}>
        {parts.map(s => <span key={s} className={LEVEL_STYLE[s].bar} style={{ width: `${(profile.counts[s] / total) * 100}%` }} />)}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {total ? `${parts.map(s => `${profile.counts[s]} ${s}`).join(' · ')} · showing ${profile.shown} of ${profile.totalFound}` : 'No interactions found in our dataset'}
      </p>
    </div>
  )
}

function Reason({ reason }: { reason: RiskReason }) {
  const serious = reason.severity === 'contraindicated' || reason.severity === 'major'
  return (
    <li className={cn('rounded-lg border p-3 text-sm', serious ? 'border-red-200 bg-red-50/60' : 'bg-card')}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        {serious && <TriangleAlert aria-hidden="true" className="size-3.5 text-red-700" />}
        {REASON_LABEL[reason.kind]}{reason.severity && <span className="capitalize">· {reason.severity}</span>}
      </p>
      <p className="mt-1 leading-6">{reason.text}</p>
      {reason.management && <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.management}</p>}
      <p className="mt-1 text-xs text-muted-foreground">Source: {reason.source}</p>
    </li>
  )
}

function ReasonList({ reasons }: { reasons: RiskReason[] }) {
  const primary = reasons.filter(r => r.priority === 'primary')
  const collapsed = reasons.filter(r => r.priority !== 'primary')
  if (!reasons.length) return <p className="text-sm text-muted-foreground">No interaction or allergy finding in our dataset. This does not mean the drug is safe for this patient.</p>
  return (
    <div className="space-y-2">
      <ul className="space-y-2">{primary.map((r, i) => <Reason key={i} reason={r} />)}</ul>
      {collapsed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary">Show {collapsed.length} lower-priority finding{collapsed.length > 1 ? 's' : ''}</summary>
          <ul className="mt-2 space-y-2">{collapsed.map((r, i) => <Reason key={i} reason={r} />)}</ul>
        </details>
      )}
    </div>
  )
}

function InfoPanel({ state, hideBoxed }: { state: InfoState | undefined; hideBoxed: boolean }) {
  if (!state || state.status === 'loading') {
    return <div className="space-y-2" aria-busy="true"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /></div>
  }
  if (state.status === 'error') return <p className="text-sm text-muted-foreground">Drug information unavailable: {state.message}</p>
  const info = state.info
  if (!info.available) return <p className="text-sm text-muted-foreground">{info.message}</p>
  const facts = info.facts.filter(f => !(hideBoxed && f.topic === 'boxed_warning'))
  const byClaude = info.generatedBy !== 'template'
  return (
    <div className="space-y-3 text-sm">
      {(info.drugClass.length > 0 || info.brandNames.length > 0) && (
        <p className="text-xs text-muted-foreground">{[info.drugClass.join(', '), info.brandNames.length ? `Brands: ${info.brandNames.join(', ')}` : ''].filter(Boolean).join(' · ')}</p>
      )}
      {info.summary && <p className="leading-6">{info.summary.text}</p>}
      <dl className="space-y-2">
        {facts.map((f, i) => (
          <div key={i}>
            <dt className={cn('text-xs font-medium', f.topic === 'boxed_warning' ? 'text-red-800' : 'text-muted-foreground')}>{TOPIC_LABEL[f.topic] ?? f.topic}</dt>
            <dd className="leading-6">{f.text}
              <details className="mt-0.5 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Label: {info.sectionTitles[f.section] ?? f.section}</summary>
                <q className="mt-1 block italic">{f.quote}</q>
              </details>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {byClaude ? 'Summarized by Claude from the FDA label' : 'Excerpted from the FDA label'}{info.source.effectiveTime ? ` (${info.source.effectiveTime})` : ''}.{' '}
        {info.source.url && <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={info.source.url} target="_blank" rel="noreferrer">Full label<ExternalLink aria-hidden="true" className="size-3" /></a>}
      </p>
    </div>
  )
}

function PrescribeForm({ patientId, profile, onPrescribed }: { patientId: string; profile: DrugRiskProfile; onPrescribed: () => void }) {
  const [open, setOpen] = useState(false)
  const [dose, setDose] = useState('')
  const [frequency, setFrequency] = useState('')
  const [prescribedBy, setPrescribedBy] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [needsOverride, setNeedsOverride] = useState<string[] | null>(null)
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'done' } | { status: 'error'; message: string }>({ status: 'idle' })
  const serious = profile.riskLevel === 'major' || profile.riskLevel === 'contraindicated'
  const showOverride = serious || needsOverride !== null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setState({ status: 'saving' })
    try {
      const result = await prescribe(patientId, {
        name: profile.drug, dose: dose || undefined, frequency: frequency || undefined,
        prescribedBy: prescribedBy || undefined, overrideReason: overrideReason.trim() || undefined,
      })
      if (result.status === 'needs-override') {
        setNeedsOverride(result.reasons)
        setState({ status: 'idle' })
        return
      }
      setState({ status: 'done' })
      onPrescribed()
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Prescribing failed.' })
    }
  }

  if (state.status === 'done') {
    return <p className="flex items-center gap-2 rounded-lg border border-accent-foreground/20 bg-accent p-3 text-sm text-accent-foreground"><CircleCheck aria-hidden="true" className="size-4" />Prescribed {profile.drug}. The medication list has been updated.</p>
  }
  if (!open) return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>Prescribe {profile.drug}</Button>
  const field = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm'
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Prescribe {profile.drug}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">Dose<input className={field} value={dose} onChange={e => setDose(e.target.value)} placeholder="500 mg" /></label>
        <label className="text-xs text-muted-foreground">Frequency<input className={field} value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="Every 6 hours" /></label>
      </div>
      <label className="block text-xs text-muted-foreground">Prescribed by<input className={field} value={prescribedBy} onChange={e => setPrescribedBy(e.target.value)} placeholder="Your name" /></label>
      {needsOverride && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs leading-5 text-red-900">
          <p className="font-medium">Serious alert found. Review it and give a reason to prescribe anyway.</p>
          <ul className="mt-1 list-disc pl-4">{needsOverride.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {showOverride && (
        <label className="block text-xs text-muted-foreground">Reason for prescribing despite the alert{needsOverride ? ' (required)' : ''}
          <textarea className="mt-0.5 min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} required={needsOverride !== null} />
        </label>
      )}
      {state.status === 'error' && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={state.status === 'saving'}>{state.status === 'saving' && <LoaderCircle aria-hidden="true" className="animate-spin" />}Confirm prescription</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">The safety check runs again on the server. You remain responsible for this decision.</p>
    </form>
  )
}

function DrugColumn({ patientId, profile, info, onPrescribed }: { patientId: string; profile: DrugRiskProfile; info: InfoState | undefined; onPrescribed: () => void }) {
  const typed = profile.query.trim().toLowerCase() !== profile.drug
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4" aria-label={`${profile.drug} for this patient`}>
      <header>
        <h3 className="text-lg font-semibold capitalize">{profile.drug}</h3>
        {typed && <p className="text-xs text-muted-foreground">Entered as “{profile.query}”</p>}
      </header>
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For this patient</h4>
        <RiskBadge level={profile.riskLevel} />
        <SeverityBar profile={profile} />
        <ReasonList reasons={profile.reasons} />
      </section>
      <section className="space-y-2 border-t pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About this drug</h4>
        <InfoPanel state={info} hideBoxed={profile.reasons.some(r => r.kind === 'boxed-warning')} />
      </section>
      <div className="mt-auto border-t pt-4"><PrescribeForm patientId={patientId} profile={profile} onPrescribed={onPrescribed} /></div>
    </article>
  )
}

export function DrugComparison() {
  // selectedId (not patient) gates the view, so reloading the record after prescribing doesn't blank it.
  const { patient, selectedId, retry } = usePatient()
  const [input, setInput] = useState('')
  const [drugs, setDrugs] = useState<string[]>([])
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [infos, setInfos] = useState<Record<string, InfoState>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function run(list: string[]) {
    if (!selectedId || !list.length) return
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const response = await compareDrugs(selectedId, list, ctrl.signal)
      if (ctrl.signal.aborted) return
      setResult(response)
      setInfos(prev => Object.fromEntries(response.drugs.map(d => [d.drug, prev[d.drug]?.status === 'ready' ? prev[d.drug] : { status: 'loading' as const }])))
      for (const d of response.drugs) {
        getDrugInfo(d.drug, ctrl.signal)
          .then(info => { if (!ctrl.signal.aborted) setInfos(prev => ({ ...prev, [d.drug]: { status: 'ready', info } })) })
          .catch(e => { if (!ctrl.signal.aborted) setInfos(prev => ({ ...prev, [d.drug]: { status: 'error', message: e instanceof Error ? e.message : 'Request failed.' } })) })
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Comparison failed.')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }

  // Adds a chip and returns the new list (unchanged when the name is empty, a duplicate, or over the limit).
  function add(name: string, compareNow = false) {
    const trimmed = name.trim()
    if (!trimmed || drugs.length >= MAX_DRUGS || drugs.some(d => d.toLowerCase() === trimmed.toLowerCase())) return drugs
    const next = [...drugs, trimmed]
    setDrugs(next)
    setInput('')
    if (compareNow) void run(next)
    return next
  }

  function remove(name: string) {
    const next = drugs.filter(d => d !== name)
    setDrugs(next)
    if (next.length) void run(next)
    else setResult(null)
  }

  if (!apiUrl) {
    return <Card className="p-5"><h2 className="text-lg font-semibold">Compare medications</h2><p className="mt-2 text-sm text-muted-foreground">Comparison needs the backend. Set VITE_API_URL in frontend/.env.local and restart the dev server.</p></Card>
  }
  if (!selectedId) {
    return <Card className="p-5"><h2 className="text-lg font-semibold">Compare medications</h2><p className="mt-2 text-sm text-muted-foreground">Select a patient to compare medications against their record.</p></Card>
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Scale aria-hidden="true" className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Compare medications for {patient?.name ?? selectedId}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Add up to {MAX_DRUGS} options to see each one against this patient's medications, allergies and history.</p>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); if (input.trim()) add(input); else void run(drugs) }}>
        <label htmlFor="compare-drug" className="sr-only">Medication name</label>
        <input id="compare-drug" value={input} onChange={e => setInput(e.target.value)} disabled={drugs.length >= MAX_DRUGS}
          placeholder={drugs.length >= MAX_DRUGS ? 'Maximum of 4 medications' : 'Medication name, e.g. ibuprofen or Advil'}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm disabled:bg-muted" />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => add(input)} disabled={!input.trim() || drugs.length >= MAX_DRUGS}><Plus aria-hidden="true" />Add</Button>
          <Button type="button" onClick={() => void run(add(input))} disabled={loading || (!drugs.length && !input.trim())}>
            {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}Compare
          </Button>
        </div>
      </form>

      {drugs.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Medications to compare">
          {drugs.map(d => (
            <li key={d}><Badge className="bg-secondary py-1 text-sm text-secondary-foreground">{d}
              <button type="button" onClick={() => remove(d)} aria-label={`Remove ${d}`} className="rounded hover:text-destructive"><X className="size-3.5" /></button></Badge></li>
          ))}
        </ul>
      )}

      {result && result.suggestedAlternatives.length > 0 && drugs.length < MAX_DRUGS && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Curated alternatives:</span>
          {result.suggestedAlternatives.map(a => (
            <Button key={a.drug} size="sm" variant="outline" title={a.rationale ?? undefined} onClick={() => add(a.drug, true)}><Plus aria-hidden="true" />{a.drug}{a.indication ? ` (${a.indication})` : ''}</Button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

      <div aria-live="polite">
        {result && (
          <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
            {result.drugs.map(d => (
              <DrugColumn key={d.drug} patientId={selectedId} profile={d} info={infos[d.drug]} onPrescribed={() => { retry(); void run(drugs) }} />
            ))}
          </div>
        )}
      </div>

      <footer className="mt-5 space-y-1 border-t pt-3 text-xs leading-5 text-muted-foreground">
        <p>{result?.disclaimer ?? 'Experimental prototype on synthetic data. No interaction found in our dataset does not mean a combination is safe.'} Alternatives are suggestions for clinician review only.</p>
        <p>Interaction data: DDInter 2.0 (CC BY-NC-SA 4.0) and curated tables. Drug facts: FDA labels via openFDA, not validated for clinical decision-making. Patient data is never sent to the AI model.</p>
      </footer>
    </Card>
  )
}
