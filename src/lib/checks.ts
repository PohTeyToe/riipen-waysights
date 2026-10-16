// What the model said, next to what the checks did with it. Both halves are the run's own saved
// outputs: `extracted` is Claude's answer as it came back, `validated` and `rejected` are what
// pipeline/validate.py made of it. Nothing here re-decides anything; it lines the two up.
import { fmtKm } from './format'
import type { Run } from './data'

export type Verdict = 'kept' | 'refused' | 'asked' | 'shown' | 'unused'

export type CheckItem = {
  /** Which record field the item was for. */
  field: 'road_length_km' | 'roads_head' | 'email' | 'phone' | 'sign'
  /** What the model returned, in a few words. */
  said: string
  quote: string
  source: string
  pdf_page: number | null
  verdict: Verdict
  /** What the checks did, in a few words. */
  why: string
}

type RoadLine = { value: string; unit: string; measures: string; road_type: string; quote: string; source: string; pdf_page: number | null }
type Extracted = {
  road_lines?: RoadLine[]
  roads_head?: { name: string | null; title: string | null; quote: string; source: string } | null
  department_email?: { value: string; quote: string; source: string } | null
  department_phones?: { value: string; quote: string; source: string }[]
  sign_work?: { quote: string; source: string }[]
}
type Part = { index?: number; km: number; agrees_by?: 'rounded' | 'near' }
type Option = { km: number; parts: Part[]; agrees?: Part[] }
type RoadField = { options: Option[]; partial?: { km: number; parts: Part[] }[]; status: string }

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

export function checkItems(run: Run): CheckItem[] {
  const ex = (run as unknown as { extracted: Extracted }).extracted
  const road = run.validated.road_length_km as unknown as RoadField
  const items: CheckItem[] = []
  const at = (x: { quote: string; source: string; pdf_page?: number | null }) => ({ quote: x.quote, source: x.source, pdf_page: x.pdf_page ?? null })
  const refusal = (field: string, quote: string) => run.rejected.find((r) => r.field === field && same(r.quote, quote))

  ;(ex.road_lines ?? []).forEach((line, i) => {
    const said = `${line.value} ${line.unit}${line.road_type ? `, ${line.road_type}` : ''}`
    const base = { field: 'road_length_km' as const, said, ...at(line) }
    const no = refusal('road_length_km', line.quote)
    if (no) return items.push({ ...base, verdict: 'refused', why: no.reason })
    const own = road.options.find((o) => o.parts.some((p) => p.index === i))
    if (own) {
      const why = own.parts.length > 1 ? `summed into ${fmtKm(own.km)} km` : `${fmtKm(own.km)} km`
      return items.push({ ...base, verdict: road.status === 'needs_human' ? 'asked' : 'kept', why: road.status === 'needs_human' ? `${why}, sent to a person` : why })
    }
    const beside = road.options.find((o) => (o.agrees ?? []).some((p) => p.index === i))
    if (beside) {
      const by = beside.agrees!.find((p) => p.index === i)!.agrees_by
      return items.push({ ...base, verdict: 'shown', why: by === 'rounded' ? `the rounded form of ${fmtKm(beside.km)} km` : `within 2% of ${fmtKm(beside.km)} km` })
    }
    if ((road.partial ?? []).some((p) => p.parts.some((x) => x.index === i)))
      return items.push({ ...base, verdict: 'unused', why: 'covers only part of the roads' })
    items.push({ ...base, verdict: 'unused', why: 'not part of a whole-network total' })
  })

  const head = ex.roads_head
  if (head) {
    const said = [head.name, head.title].filter(Boolean).join(', ')
    const v = run.validated as unknown as { roads_head: { status: string } }
    const no = refusal('roads_head', head.quote)
    items.push({
      field: 'roads_head',
      said,
      ...at(head),
      ...(no
        ? { verdict: 'refused' as const, why: no.reason }
        : v.roads_head.status === 'title_only'
          ? { verdict: 'unused' as const, why: 'a title with no name, so no Contact' }
          : { verdict: 'kept' as const, why: run.merge ? 'matches an existing Contact' : 'new Contact' }),
    })
  }

  const email = ex.department_email
  if (email) {
    const no = refusal('email', email.quote)
    items.push({ field: 'email', said: email.value, ...at(email), ...(no ? { verdict: 'refused' as const, why: no.reason } : { verdict: 'kept' as const, why: 'printed whole on the page' }) })
  }

  const phone = run.validated.phone
  for (const p of ex.department_phones ?? []) {
    const no = refusal('phone', p.quote)
    const base = { field: 'phone' as const, said: p.value, ...at(p) }
    if (no) items.push({ ...base, verdict: 'refused', why: no.reason })
    else if (phone.status === 'needs_human') items.push({ ...base, verdict: 'asked', why: `one of ${phone.values?.length ?? 2} numbers, sent to a person` })
    else items.push({ ...base, verdict: phone.value === p.value ? 'kept' : 'unused', why: phone.value === p.value ? 'printed whole on the page' : 'another number was kept' })
  }

  const signs = (run as unknown as { sign_work: { quote: string }[] }).sign_work
  for (const s of ex.sign_work ?? []) {
    const kept = signs.some((k) => same(k.quote, s.quote))
    const no = refusal('sign_work', s.quote)
    items.push({
      field: 'sign',
      said: `"${s.quote.length > 72 ? `${s.quote.slice(0, 71).trimEnd()}…` : s.quote}"`,
      ...at(s),
      ...(no ? { verdict: 'refused' as const, why: no.reason } : kept ? { verdict: 'kept' as const, why: 'used in the brief' } : { verdict: 'unused' as const, why: 'not found on the page' }),
    })
  }
  return items
}

export type CheckTally = { said: number; kept: number; refused: number; asked: number }

export function tally(items: CheckItem[]): CheckTally {
  return {
    said: items.length,
    kept: items.filter((x) => x.verdict === 'kept' || x.verdict === 'shown').length,
    refused: items.filter((x) => x.verdict === 'refused').length,
    asked: items.filter((x) => x.verdict === 'asked').length,
  }
}
