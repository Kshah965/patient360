import type { EvidenceSource, MedicationAlternative } from '@/types/clinical'
import { safeEvidenceUrl } from '@/lib/safety'

export function Evidence({ source }: { source: EvidenceSource }) {
  const url = safeEvidenceUrl(source.url)
  return <div className="text-sm leading-6 text-muted-foreground">
    <p>Source: {/TODO/i.test(source.name) || !source.name.trim() ? 'Not supplied; backend placeholder requires review.' : source.name}{source.reference && <> · {source.reference}</>}{url && <> · <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">View source</a></>}</p>
    {source.backendVerified !== undefined ? <p>Backend verification flag: {String(source.backendVerified)}. This is not independent clinical validation.</p> : source.status === 'verified' ? <p>Source supplied; scope limited to the cited information.</p> : <p>Verification not supplied.</p>}
    {source.status === 'pending' && <p>Evidence pending verification.</p>}
  </div>
}
export function AlternativeOptions({ alternatives }: { alternatives: MedicationAlternative[] }) {
  const reviewable = alternatives.filter(a => a.source.status !== 'pending' && !/TODO/i.test(a.rationale + (a.management ?? '')))
  const withheld = alternatives.length - reviewable.length
  return <section className="mt-3"><h5 className="text-sm font-semibold">Alternatives for review</h5>
    {reviewable.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No alternatives available for review.</p> : <ul className="mt-2 space-y-3">{reviewable.map((a, i) => <li key={i}><p className="text-base font-medium">{a.medication}</p><p className="text-sm leading-6">{a.rationale}</p>{a.indication && <p className="text-sm">Provided indication: {a.indication}</p>}{a.management && <p className="text-sm leading-6">Provided management: {a.management}</p>}<Evidence source={a.source} />{a.alertsFound?.length ? <ul className="mt-1 list-disc pl-5 text-sm">{a.alertsFound.map((text, j) => <li key={j}>{text}</li>)}</ul> : null}</li>)}</ul>}
    {withheld > 0 && <p className="mt-2 text-sm text-muted-foreground">{withheld} backend {withheld === 1 ? 'suggestion withheld' : 'suggestions withheld'}: verification is missing or content is incomplete. No medication has been substituted.</p>}
  </section>
}
