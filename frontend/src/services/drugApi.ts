import type { CompareResponse, DrugInfo, PrescribeRequest, PrescribeResult } from '../types/drugs'

// Same backend as httpClinicalApi.ts. Undefined means the frontend runs on mock data only.
export const apiUrl: string | undefined = import.meta.env?.VITE_API_URL?.replace(/\/+$/, '')

async function send<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  if (!apiUrl) throw new Error('No backend configured (VITE_API_URL).')
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok && response.status !== 409) {
    const detail = body && typeof body.detail === 'string' ? body.detail : `Request failed (${response.status}).`
    throw new Error(detail)
  }
  return { status: response.status, body: body as T }
}

export async function compareDrugs(patientId: string, drugs: string[], signal?: AbortSignal): Promise<CompareResponse> {
  const { body } = await send<CompareResponse>(`/patients/${encodeURIComponent(patientId)}/compare`, {
    method: 'POST', body: JSON.stringify({ drugs }), signal,
  })
  return body
}

export async function getDrugInfo(drug: string, signal?: AbortSignal): Promise<DrugInfo> {
  const { body } = await send<DrugInfo>(`/drugs/${encodeURIComponent(drug)}/info`, { signal })
  return body
}

interface PrescribeConflict {
  detail: { message: string; check: { alerts: { priority: string; explanation: string }[] } }
}

// The server runs the safety check; a serious alert without an override reason returns 409.
export async function prescribe(patientId: string, request: PrescribeRequest): Promise<PrescribeResult> {
  const { status, body } = await send<{ medication: { id: number } } & PrescribeConflict>(
    `/patients/${encodeURIComponent(patientId)}/medications`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  if (status === 409) {
    return {
      status: 'needs-override',
      message: body.detail.message,
      reasons: body.detail.check.alerts.filter(a => a.priority === 'primary').map(a => a.explanation),
    }
  }
  return { status: 'prescribed', medicationId: body.medication.id }
}
