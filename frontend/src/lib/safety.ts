import type { AlertSeverity, SafetyAlert } from '@/types/clinical'

// Clinical severity order; fixture-only demo priorities use the same display
// scale. Unclassified findings without demo metadata always stay visible.
export const severityOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 }
function rank(alert: SafetyAlert) {
  return severityOrder[alert.severity === 'unknown' && alert.demoPriority ? alert.demoPriority : alert.severity]
}
export function prioritizeAlerts(alerts: SafetyAlert[]) {
  const sorted = [...alerts].sort((a, b) => rank(a) - rank(b))
  const highest = sorted[0] ? rank(sorted[0]) : Infinity
  const keepVisible = (a: SafetyAlert) => a.backendPriority === 'primary' || a.severity === 'critical' || rank(a) === highest || (a.severity === 'unknown' && !a.demoPriority)
  return { visible: sorted.filter(keepVisible), additional: sorted.filter(a => !keepVisible(a)) }
}
export function safeEvidenceUrl(url?: string): string | undefined {
  if (!url) return undefined
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined } catch { return undefined }
}
