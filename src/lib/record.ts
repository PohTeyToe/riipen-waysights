// What the record shows once the run is in, and how one answer on the page changes it.
// The answer lives only in this browser tab. The payload logic mirrors pipeline/writeback.py.
import type { OptionResult, ProposedRow, QuestionOption, Run, ZohoRequest } from './data'

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

/** The road length goes where writeback.account_update puts it: right after Last_Enriched. */
function withRoad(row: Record<string, unknown>, km: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k !== F_ROAD_KM) out[k] = v
    if (k === 'Last_Enriched') out[F_ROAD_KM] = km
  }
  return out
}

/** The Account update: the button sends the record id, so the Account is updated by it (writeback.account_update). */
const isAccount = (r: ZohoRequest) => r.method === 'PUT' && r.url.endsWith('/Accounts')
const isNotes = (r: ZohoRequest) => r.url.endsWith('/Notes')
const firstLine = (n: Record<string, unknown>) => String(n.Note_Content).split('\n')[0]

/** The Account field each record row writes (writeback.account_update), or the Contact for the roads head. */
export const API_FIELD: Partial<Record<ProposedRow['field'], string>> = {
  road_length_km: F_ROAD_KM,
  email: 'Public_Works_Email',
  phone: 'Public_Works_Phone',
  key_documents: 'Key_Documents',
  brief: 'Account_Brief',
}

/**
 * The Zoho requests after a person's answers and any rows they chose not to write.
 * A dropped row is left out of the update; a dropped roads head drops its Contact request.
 */
export function writePlan(run: Run, answers: Answers, dropped: ReadonlySet<string> = new Set()): WritePlan {
  let requests: ZohoRequest[] = structuredClone(run.writeback.requests)
  if (dropped.has('roads_head')) requests = requests.filter((r) => !r.url.endsWith('/Contacts'))
  const acct = requests.find(isAccount)
  for (const f of dropped) {
    const key = API_FIELD[f as ProposedRow['field']]
    if (acct && key) delete acct.body.data[0][key]
  }
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
      if (account && q.field === 'road_length_km' && !dropped.has('road_length_km')) account.body.data[0] = withRoad(account.body.data[0], option.value_km)
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
