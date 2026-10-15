import { filledByRule, meta, REPO, runs, scorecard, shortName, type ScoreOutcome, type ScoreRow } from '../lib/data'
import { Glyph, type GlyphKind } from './Status'

const OUTCOME: Record<ScoreOutcome, { label: string; glyph: GlyphKind }> = {
  right: { label: 'Right', glyph: 'filled' },
  wrong: { label: 'Wrong', glyph: 'rejected' },
  correctly_blank: { label: 'Correctly left blank', glyph: 'not_found' },
  missed: { label: 'Missed', glyph: 'rejected' },
  sent_to_person: { label: 'Sent to a person', glyph: 'needs_human' },
}

const CELL: Record<ScoreOutcome, string> = {
  right: 'Right',
  wrong: 'Wrong',
  correctly_blank: 'Blank, right',
  missed: 'Missed',
  sent_to_person: 'To a person',
}

const FIELDS: { key: string; label: string }[] = [
  { key: 'road_length_km', label: 'Road length' },
  { key: 'roads_head_name', label: 'Roads head' },
  { key: 'roads_head_title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'key_document', label: 'Key document' },
]

const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]))

function show(v: unknown): string {
  if (Array.isArray(v)) return v.join(' or ')
  return v === null || v === undefined ? 'blank' : String(v)
}

export function Tested() {
  const c = scorecard.counts
  const byRule = scorecard.misses.filter(filledByRule).length
  const short = meta.answer_key_commit.slice(0, 7)
  const cell = (account: string, field: string): ScoreRow | undefined =>
    scorecard.rows.find((r) => r.account === account && r.field === field)
  return (
    <section className="tested" aria-labelledby="tested-h">
      <h2 id="tested-h">How this was tested</h2>
      <p className="tested-lede">
        Before the first run, I wrote down the right answer for each Account by reading the source pages directly, and
        committed it on its own (
        <a href={`${REPO}/commit/${meta.answer_key_commit}`} target="_blank" rel="noreferrer">
          <code>{short}</code>
        </a>
        ). Then the pipeline ran without seeing it.
      </p>

      <ul className="score-line" aria-label={`${scorecard.total} checks`}>
        {(Object.keys(OUTCOME) as ScoreOutcome[]).map((k) => (
          <li key={k}>
            <Glyph kind={OUTCOME[k].glyph} />
            <span className="score-n">{c[k]}</span> {OUTCOME[k].label}
            {k === 'sent_to_person' ? (
              <span className="score-aside">
                {' '}
                (the key agrees on {scorecard.sent_to_person_key_agrees === c[k] ? 'all' : `${scorecard.sent_to_person_key_agrees} of`}{' '}
                {c[k]})
              </span>
            ) : k === 'wrong' && byRule ? (
              <span className="score-aside">
                {' '}
                ({byRule === c[k] ? (byRule === 2 ? 'both' : 'all') : `${byRule} of ${c[k]}`} filled by the 2% rule, which came
                after the key, with a figure the key lists)
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="table-scroll">
        <table className="score-table">
          <caption className="visually-hidden">The run against the answer key, Account by field</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              {FIELDS.map((f) => (
                <th scope="col" key={f.key}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.account.slug}>
                <th scope="row">{shortName[r.account.slug]}</th>
                {FIELDS.map((f) => {
                  const row = cell(r.account.slug, f.key)
                  if (!row) return <td key={f.key} />
                  return (
                    <td key={f.key} className={`score score--${row.outcome}`}>
                      <Glyph kind={OUTCOME[row.outcome].glyph} />
                      {CELL[row.outcome]}
                      {filledByRule(row) ? ', 2% rule' : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="tested-sub">Where the run and the key differ ({scorecard.misses.length})</h3>
      <ul className="misses">
        {scorecard.misses.map((m, i) => (
          <li key={i}>
            <p className="miss-head">
              {shortName[m.account]}, {FIELD_LABEL[m.field] ?? m.field}:{' '}
              {filledByRule(m) ? (
                <>
                  the key sends this to a person (<code>{show(m.expected)}</code>), and the run filled{' '}
                </>
              ) : (
                <>
                  expected <code>{show(m.expected)}</code>, {m.outcome === 'sent_to_person' ? 'sent to a person with ' : 'got '}
                </>
              )}
              {Array.isArray(m.got) && m.outcome === 'sent_to_person' ? (
                m.got.map((g, j) => (
                  <span key={j}>
                    {j > 0 ? ' and ' : null}
                    <code>{String(g)}</code>
                  </span>
                ))
              ) : (
                <code>{show(m.got)}</code>
              )}
            </p>
            <p className="miss-why">{m.why}</p>
          </li>
        ))}
      </ul>

      <ul className="tested-notes">
        <li>
          {meta.tests.passed} tests run on saved copies of the pages, with no network. They cover the approved-site list,
          robots.txt, the 2 s wait per host, which links are worth reading, the quote check, units printed next to their
          numbers, lane-km and area refusals, mile to km, owned against total, rounded figures and figures within 2%, an
          email or extension cut short, two phone numbers for one department, the duplicate check, and summary sentences
          with words their pages don't print.
        </li>
        <li>
          PDF tables are read in reading order, which keeps <q>Quantity - kms of local roads 255</q> on one line. Layout
          text extraction scrambles Lincoln's Table 21.
        </li>
        <li>
          The pipeline was built and run several times on these same six Accounts before this final run, so this checks it
          on pages it was developed against. It's a check, not a benchmark. Every change made along the way is listed in{' '}
          <a href={`${REPO}/blob/main/data/SOURCES.md`} target="_blank" rel="noreferrer">
            SOURCES.md
          </a>
          .
        </li>
      </ul>
    </section>
  )
}
