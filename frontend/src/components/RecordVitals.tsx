import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePatient } from '@/hooks/usePatient'
import { usePatientData } from '@/hooks/usePatientData'
import { apiConfig } from '@/services/apiConfig'

// Vitals taken at this visit. Saved as new readings (older ones are kept); any subset is allowed.
export function RecordVitals({ patientId }: { patientId: string }) {
  const { mode } = usePatientData()
  const { retry } = usePatient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ bloodPressure: '', heartRate: '', temperatureC: '', oxygenSaturation: '' })
  const [state, setState] = useState<{ status: 'idle' | 'saving' } | { status: 'error'; message: string }>({ status: 'idle' })
  if (mode !== 'backend' || !apiConfig.baseUrl) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const body: Record<string, string | number> = {}
    if (form.bloodPressure.trim()) body.bloodPressure = form.bloodPressure.trim()
    for (const k of ['heartRate', 'temperatureC', 'oxygenSaturation'] as const) if (form[k].trim()) body[k] = Number(form[k])
    if (!Object.keys(body).length) { setState({ status: 'error', message: 'Enter at least one vital sign.' }); return }
    setState({ status: 'saving' })
    try {
      const r = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/patients/${encodeURIComponent(patientId)}/vitals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error(r.status === 422 ? 'Check the values: blood pressure as 120/80, heart rate 20–250, temperature 30–45 °C, oxygen 50–100%.' : `Saving failed (HTTP ${r.status}).`)
      setOpen(false)
      setForm({ bloodPressure: '', heartRate: '', temperatureC: '', oxygenSaturation: '' })
      setState({ status: 'idle' })
      void retry()
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Saving failed.' })
    }
  }

  if (!open) return <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>Record vitals now</Button>
  const field = 'mt-0.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground'
  const input = (key: keyof typeof form, label: string, placeholder: string) => (
    <label className="text-xs text-muted-foreground">{label}<input className={field} inputMode="decimal" value={form[key]} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>
  )
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Record vitals taken now</p>
      <div className="grid grid-cols-2 gap-2">
        {input('bloodPressure', 'Blood pressure (mmHg)', '120/80')}
        {input('heartRate', 'Heart rate (bpm)', '80')}
        {input('temperatureC', 'Temperature (°C)', '37.0')}
        {input('oxygenSaturation', 'Oxygen saturation (%)', '98')}
      </div>
      <p className="text-xs text-muted-foreground">Leave any you did not measure blank. Earlier readings stay on record.</p>
      {state.status === 'error' && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={state.status === 'saving'}>{state.status === 'saving' && <LoaderCircle aria-hidden="true" className="animate-spin" />}Save vitals</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setState({ status: 'idle' }) }}>Cancel</Button>
      </div>
    </form>
  )
}
