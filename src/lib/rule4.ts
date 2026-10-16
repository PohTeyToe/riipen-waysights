// Rule 4 again, in the browser, at any tolerance. pipeline/validate.py treats two road figures as the
// same roads when they are within NEAR = 2% of each other. Here the saved figures are split back
// apart and merged again at the tolerance the viewer picks, then scored against the answer key with
// the rules of pipeline/report.py (score_road). Every other scored field keeps its recorded outcome.
import { answerKey, runs, scorecard, type RoadPart, type Run, type ScoreOutcome, type ScoreRow } from './data'

export const RECORDED_NEAR = 0.02

type Figure = {
  km: number
  parts: RoadPart[]
  centerline: boolean
  approximate: boolean
  dataset: boolean
  /** Agreement that doesn't depend on the tolerance ("about 300 km" for 310 km). */
  rounded: RoadPart[]
}

export type RoadAt = {
  status: 'filled' | 'needs_human' | 'not_found'
  value_km: number | null
  /** Each figure left after merging, the one a person would see first at the top. */
  options: { km: number; centerline: boolean; approximate: boolean; parts: RoadPart[] }[]
}

const round1 = (n: number) => Math.round(n * 10) / 10
const isDataset = (p: RoadPart) => p.cite.column !== undefined

function figure(parts: RoadPart[]): Figure {
  return {
    km: round1(parts.reduce((n, p) => n + p.km, 0)),
    parts,
    centerline: parts.every((p) => p.centerline),
    approximate: parts.some((p) => p.approximate),
    dataset: parts.some(isDataset),
    rounded: [],
  }
}

/** The road field as rule 4 would leave it at tolerance `near` (0.02 is the recorded run). */
export function roadAt(run: Run, near: number): RoadAt {
  const saved = run.validated.road_length_km
  const figs: Figure[] = []
  for (const o of saved.options) {
    const own = figure(o.parts)
    own.rounded = (o.agrees ?? []).filter((a) => a.agrees_by === 'rounded')
    figs.push(own)
    for (const a of o.agrees ?? []) if (a.agrees_by === 'near') figs.push(figure([a]))
  }
  // validate.py: precise before approximate, the Account's own pages before the state's data.
  figs.sort((a, b) => Number(a.approximate) - Number(b.approximate) || Number(a.dataset) - Number(b.dataset))
  const kept: Figure[] = []
  for (const f of figs) {
    const keep = kept.find((k) => Math.abs(f.km - k.km) <= near * Math.max(f.km, k.km) + 1e-9)
    if (!keep) {
      kept.push({ ...f })
      continue
    }
    keep.centerline = keep.centerline || f.centerline
  }
  kept.sort((a, b) => Number(!a.centerline) - Number(!b.centerline) || Number(a.approximate) - Number(b.approximate))
  const options = kept.map((k) => ({ km: k.km, centerline: k.centerline, approximate: k.approximate, parts: k.parts }))
  if (!kept.length) return { status: 'not_found', value_km: null, options }
  if (kept.length === 1 && kept[0].centerline) return { status: 'filled', value_km: kept[0].km, options }
  return { status: 'needs_human', value_km: kept[0].km, options }
}

/** report.score_road, for one Account at one tolerance. */
export function scoreRoad(slug: string, road: RoadAt): ScoreRow {
  const key = answerKey.accounts[slug].road_length_km
  const accepted = (key.accepted_options_km ?? []).map(round1)
  const base = { account: slug, field: 'road_length_km', key_expect: key.expect, expected: key.accepted_options_km ?? 'blank' }
  if (road.status === 'needs_human')
    return { ...base, outcome: 'sent_to_person', key_agrees_unclear: key.expect === 'needs_human', got: road.options.map((o) => o.km) }
  if (road.status === 'filled') {
    const ok = key.expect === 'filled' && accepted.includes(round1(road.value_km!))
    return { ...base, outcome: ok ? 'right' : 'wrong', got: road.value_km }
  }
  return { ...base, outcome: key.expect === 'blank' ? 'correctly_blank' : 'missed', got: null }
}

export type Rescore = {
  rows: ScoreRow[]
  counts: Record<ScoreOutcome, number>
  keyAgrees: number
  /** Accounts whose road row differs from the recorded run. */
  changed: string[]
}

const OUTCOMES: ScoreOutcome[] = ['right', 'wrong', 'correctly_blank', 'missed', 'sent_to_person']

export function rescore(near: number): Rescore {
  const changed: string[] = []
  const rows = scorecard.rows.map((r) => {
    if (r.field !== 'road_length_km') return r
    const run = runs.find((x) => x.account.slug === r.account)!
    const next = scoreRoad(r.account, roadAt(run, near))
    if (next.outcome !== r.outcome) changed.push(r.account)
    return next
  })
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, rows.filter((r) => r.outcome === o).length])) as Record<ScoreOutcome, number>
  const keyAgrees = rows.filter((r) => r.outcome === 'sent_to_person' && r.key_agrees_unclear).length
  return { rows, counts, keyAgrees, changed }
}

/** How far apart a lane's two closest road figures are, as a share of the larger one. */
export function nearGap(run: Run): number | null {
  const o = run.validated.road_length_km.options[0]
  const near = o?.agrees?.find((a) => a.agrees_by === 'near')
  if (!o || !near) return null
  const a = o.km
  const b = round1(near.km)
  return Math.abs(a - b) / Math.max(a, b)
}
