// The recorded run as a timeline: one lane per Account, every event at the time the run logged it.
// Nothing here is invented. Times come from each step's timestamp; model calls are the gaps the
// run logged around them (pipeline/run.py logs "sending" before the extract call and "kept" after
// the brief call).
import { meta, runs, type Run, type Step } from './data'

export const RUN_START = Date.parse(meta.started_at)
export const RUN_END = Date.parse(meta.finished_at)
/** The whole run, in ms. */
export const SPAN = RUN_END - RUN_START

export type TickKind = 'page' | 'data' | 'robots' | 'redirect' | 'error'
/** One HTTP request. fetch.py logs it the moment the response is in, with how long the request
 * took (`ms`) and how long the shared host clock held it first (`wait`), so both spans are real. */
export type Tick = { at: number; i: number; kind: TickKind; ms: number; wait: number }
export type Block = { from: number; to: number; i: number; kind: 'extract' | 'brief' }
export type MarkKind = 'reject' | 'question' | 'note' | 'check' | 'merge' | 'write'
export type Mark = { at: number; i: number; kind: MarkKind }

export type Lane = {
  slug: string
  run: Run
  /** ms from the run's start, one per step. */
  times: number[]
  start: number
  end: number
  ticks: Tick[]
  blocks: Block[]
  marks: Mark[]
  /** Step index after which the checked values exist. */
  checkStep: number
  briefStep: number
  writeStep: number
}

const isData = (s: Step) => !!s.url && s.url.includes('data.ny.gov')

/** A field left for a person: an open question, or a note that says so (two phone numbers). Other
 * notes are the crawler's own observations, such as an email address the site hides from scripts. */
export const isAsk = (s: Step) => s.step === 'question' || (s.step === 'note' && s.msg.includes('left for a person'))

function tickKind(s: Step): TickKind | null {
  if (s.step === 'fetch') {
    if (s.status && s.status >= 400) return 'error'
    return isData(s) ? 'data' : 'page'
  }
  if (s.step === 'robots') return 'robots'
  if (s.step === 'redirect') return 'redirect'
  return null
}

export function buildLane(run: Run): Lane {
  const times = run.steps.map((s) => Date.parse(s.t) - RUN_START)
  const ticks: Tick[] = []
  const marks: Mark[] = []
  const blocks: Block[] = []
  run.steps.forEach((s, i) => {
    const k = tickKind(s)
    if (k) ticks.push({ at: times[i], i, kind: k, ms: s.ms ?? 0, wait: s.waited_ms ?? 0 })
    if (s.step === 'reject' || s.step === 'check') marks.push({ at: times[i], i, kind: s.step })
    if (isAsk(s)) marks.push({ at: times[i], i, kind: s.step === 'note' ? 'note' : 'question' })
    if (s.step === 'dedupe' && s.msg.startsWith('merge')) marks.push({ at: times[i], i, kind: 'merge' })
    if (s.step === 'writeback') marks.push({ at: times[i], i, kind: 'write' })
    // The extract call sits between "sending N sources" and "model returned".
    if (s.step === 'extract' && s.model && i > 0 && run.steps[i - 1].step === 'extract') blocks.push({ from: times[i - 1], to: times[i], i, kind: 'extract' })
    // The brief call runs right after the step before "N sentences kept".
    if (s.step === 'brief' && s.model && i > 0) blocks.push({ from: times[i - 1], to: times[i], i, kind: 'brief' })
  })
  const find = (step: string) => run.steps.findIndex((s) => s.step === step)
  return {
    slug: run.account.slug,
    run,
    times,
    start: times[0],
    end: times[times.length - 1],
    ticks,
    blocks,
    marks,
    checkStep: find('check'),
    briefStep: find('brief'),
    writeStep: find('writeback'),
  }
}

/** Lanes in the order the board shows them: the order the run picked them up. */
export const lanes: Lane[] = runs.map(buildLane).sort((a, b) => a.start - b.start || a.slug.localeCompare(b.slug))
export const laneBySlug: Record<string, Lane> = Object.fromEntries(lanes.map((l) => [l.slug, l]))

/** How many of the lane's steps have happened by time t. */
export function shownAt(lane: Lane, t: number): number {
  let lo = 0
  let hi = lane.times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lane.times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export type Phase = 'waiting' | 'reading' | 'model' | 'checking' | 'writing' | 'done' | 'needs_review'

export type LaneNow = {
  phase: Phase
  /** A few words on what the lane is doing. */
  doing: string
  pages: number
  requests: number
  rejected: number
  questions: number
  /** Fields left for a person: open questions plus notes (two phone numbers, say). */
  asks: number
  modelCalls: number
}

const HTTP = new Set(['fetch', 'robots', 'redirect'])

/** The model call out once `shown` steps have happened. A call runs from the step before it to its
 * own step, so it's out exactly while the lane has shown everything up to that step. */
export function inFlight(lane: Lane, shown: number): Block | undefined {
  return lane.blocks.find((b) => b.i === shown)
}

/** The lane's state once `shown` steps have happened. */
export function laneNow(lane: Lane, shown: number): LaneNow {
  const steps = lane.run.steps.slice(0, shown)
  const pages = steps.filter((s) => s.step === 'fetch' && s.page && s.status === 200 && !isData(s)).length
  const now: LaneNow = {
    phase: 'waiting',
    doing: 'Waiting for a worker',
    pages,
    requests: steps.filter((s) => HTTP.has(s.step)).length,
    rejected: steps.filter((s) => s.step === 'reject').length,
    questions: steps.filter((s) => s.step === 'question').length,
    asks: steps.filter(isAsk).length,
    modelCalls: lane.blocks.filter((b) => b.i < shown).length,
  }
  if (shown === 0) return now
  if (shown >= lane.times.length) {
    const review = lane.run.status === 'needs_review'
    return { ...now, phase: review ? 'needs_review' : 'done', doing: review ? 'Needs review' : 'Done' }
  }
  const inBlock = inFlight(lane, shown)
  if (inBlock) return { ...now, phase: 'model', doing: inBlock.kind === 'extract' ? 'Model reading the pages' : 'Model writing the brief' }
  const last = steps[steps.length - 1]
  if (shown > lane.writeStep && lane.writeStep >= 0) return { ...now, phase: 'writing', doing: 'Zoho update built' }
  if (shown > lane.checkStep && lane.checkStep >= 0) return { ...now, phase: 'checking', doing: 'Checking values' }
  if (last.step === 'dataset' || (last.url && isData(last))) return { ...now, phase: 'reading', doing: 'State road data' }
  return { ...now, phase: 'reading', doing: `Reading pages, ${pages} of ${lane.run.run.page_budget}` }
}

export type Totals = { pages: number; requests: number; rejected: number; questions: number; asks: number; modelCalls: number; done: number }

export function totalsAt(shown: number[]): Totals {
  const out: Totals = { pages: 0, requests: 0, rejected: 0, questions: 0, asks: 0, modelCalls: 0, done: 0 }
  lanes.forEach((lane, i) => {
    const n = laneNow(lane, shown[i])
    out.pages += n.pages
    out.requests += n.requests
    out.rejected += n.rejected
    out.questions += n.questions
    out.asks += n.asks
    out.modelCalls += n.modelCalls
    if (shown[i] >= lane.times.length) out.done += 1
  })
  return out
}

/** The most Accounts the run had in flight at once. */
export function peakWorkers(): number {
  const edges = lanes.flatMap((l) => [
    { at: l.start, d: 1 },
    { at: l.end, d: -1 },
  ])
  // A lane that ends at the same moment another starts frees its worker first.
  edges.sort((a, b) => a.at - b.at || a.d - b.d)
  let n = 0
  let peak = 0
  for (const e of edges) {
    n += e.d
    peak = Math.max(peak, n)
  }
  return peak
}

/** "1:42" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
