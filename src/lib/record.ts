// What the record shows once the run is in, and how one answer on the page changes it.
// The answer lives only in this browser tab. The payload logic mirrors pipeline/writeback.py.
import type { OptionResult, ProposedRow, QuestionOption, Run, Step, ZohoRequest } from './data'

export type Answers = Record<string, number> // field -> chosen option index

export type ShownStatus = 'filled' | 'needs_human' | 'not_found' | 'merge' | 'blank' | 'empty'

export type ShownRow = ProposedRow & {
  shown: ShownStatus
  answered?: { option: QuestionOption; result: OptionResult }
}

export const FIELD_ORDER: ProposedRow['field'][] = ['road_length_km', 'email', 'phone', 'roads_head', 'key_documents', 'brief']

export function shownRows(run: Run, answers: Answers): ShownRow[] {
  return FIELD_ORDER.map((f) => run.proposed.find((r) => r.field === f)!)
    .filter(Boolean)
    .map((row) => {
      const pick = answers[row.field]
      const option = row.question && pick !== undefined ? row.question.options[pick] : undefined
      if (!option) return { ...row, shown: row.status }
      const shown: ShownStatus = option.result === 'filled' ? 'filled' : option.result === 'blank' ? 'blank' : 'needs_human'
      return { ...row, shown, answered: { option, result: option.result } }
    })
}

/** One mark per field for the Account list: what the record would hold after this run. */
export function fillMarks(run: Run, answers: Answers, ran: boolean): ShownStatus[] {
  if (!ran) return FIELD_ORDER.map(() => 'empty')
  return shownRows(run, answers).map((r) => r.shown)
}

export function openQuestions(run: Run, answers: Answers): number {
  return shownRows(run, answers).filter((r) => r.question && r.shown === 'needs_human').length
}

export type WritePlan = {
  requests: ZohoRequest[]
  changes: number
  notes: number
  /** Notes that are open questions; the rest need a person for another reason (two phone numbers, say). */
  openQuestions: number
  status: 'Done' | 'Needs review'
  changedByAnswer: boolean
}

const BOOKKEEPING = new Set(['id', 'Enrichment_Status', 'Last_Enriched'])
const F_ROAD_KM = 'Road_Network_Centerline_km'

/** The Account update: the button sends the record id, so the Account is updated by it (writeback.account_update). */
const isAccount = (r: ZohoRequest) => r.method === 'PUT' && r.url.endsWith('/Accounts')
const isNotes = (r: ZohoRequest) => r.url.endsWith('/Notes')
const firstLine = (n: Record<string, unknown>) => String(n.Note_Content).split('\n')[0]

export function writePlan(run: Run, answers: Answers): WritePlan {
  const requests: ZohoRequest[] = structuredClone(run.writeback.requests)
  let changedByAnswer = false
  // A Note's first line is its question (writeback.notes), which is how an answer finds its Note.
  const settled = new Set<string>()
  const answerLine = new Map<string, string>()

  for (const q of run.questions) {
    const pick = answers[q.field]
    if (pick === undefined) continue
    const option = q.options[pick]
    changedByAnswer = true
    if (option.result === 'filled' && option.value_km !== null) {
      const account = requests.find(isAccount)
      if (account && q.field === 'road_length_km') account.body.data[0][F_ROAD_KM] = option.value_km
      settled.add(q.text)
    } else {
      answerLine.set(q.text, `Answered on the page: ${option.label}.`)
    }
  }

  // Notes: drop the ones the answer settled, record the answer on the rest.
  const out: ZohoRequest[] = []
  for (const r of requests) {
    if (!isNotes(r)) {
      out.push(r)
      continue
    }
    const data = r.body.data
      .filter((n) => !settled.has(firstLine(n)))
      .map((n) => {
        const line = answerLine.get(firstLine(n))
        return line ? { ...n, Note_Content: `${n.Note_Content}\n${line}` } : n
      })
    if (data.length) out.push({ ...r, body: { ...r.body, data } })
  }

  const noteList = out.filter(isNotes).flatMap((r) => r.body.data)
  const asked = new Set(run.questions.filter((q) => answers[q.field] === undefined).map((q) => q.text))
  const status = noteList.length > 0 ? 'Needs review' : 'Done'
  const account = out.find(isAccount)
  if (account) {
    if (account.body.data[0].Enrichment_Status !== status) changedByAnswer = true
    account.body.data[0].Enrichment_Status = status
  }
  const accountFields = account ? Object.keys(account.body.data[0]).filter((k) => !BOOKKEEPING.has(k)).length : 0
  const contacts = out.filter((r) => r.url.endsWith('/Contacts')).length
  return {
    requests: out,
    changes: accountFields + contacts,
    notes: noteList.length,
    openQuestions: noteList.filter((n) => asked.has(firstLine(n))).length,
    status,
    changedByAnswer,
  }
}

/**
 * When each log line appears in the replay, in ms from the press. The real gaps are kept in
 * proportion and squeezed to about `target` ms, with a floor so bursts stay readable.
 */
export function replayTimes(steps: Step[], target = 10_000, min = 45, max = 1_400): number[] {
  const ts = steps.map((s) => Date.parse(s.t))
  const span = Math.max(1, ts[ts.length - 1] - ts[0])
  const k = target / span
  const out: number[] = []
  let at = 250
  ts.forEach((t, i) => {
    if (i > 0) at += Math.min(max, Math.max(min, (t - ts[i - 1]) * k))
    out.push(Math.round(at))
  })
  return out
}

export function realSpanMs(steps: Step[]): number {
  return Date.parse(steps[steps.length - 1].t) - Date.parse(steps[0].t)
}

/** Index of the first log line at which the record starts to show results. */
export function revealAt(steps: Step[], step: string): number {
  const i = steps.findIndex((s) => s.step === step)
  return i === -1 ? steps.length - 1 : i
}
