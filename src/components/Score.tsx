// The run against the answer key written before its first run, misses in words, and rule 4's
// tolerance as a slider that re-decides the road rows in the browser (src/lib/rule4.ts, tested
// against pipeline/validate.py at every setting from 0% to 5%).
import { runs, scorecard, shortName, type ScoreOutcome, type ScoreRow } from '../lib/data'
import { fmtKm, fmtPct } from '../lib/format'
import { RECORDED_NEAR, type Rescore } from '../lib/rule4'
import { useStore } from '../lib/store'
import { KEY_FIELDS, KEY_LABEL } from './Board'
import { Glyph, OUTCOME } from './Glyph'

const COUNTS: { key: ScoreOutcome; label: string }[] = [
  { key: 'right', label: 'right' },
  { key: 'correctly_blank', label: 'blank, correctly' },
  { key: 'sent_to_person', label: 'to a person' },
  { key: 'wrong', label: 'wrong' },
  { key: 'missed', label: 'missed' },
]

const km = (v: unknown) => (typeof v === 'number' ? `${fmtKm(v)} km` : String(v))

/** One line per miss, from the scorecard's own fields. */
function missLine(r: ScoreRow): string {
  const name = shortName[r.account]
  const expected = Array.isArray(r.expected) ? r.expected : []
  if (r.field === 'road_length_km' && r.outcome === 'wrong')
    return `${name} road length: filled ${km(r.got)}. The key wanted a person to pick ${expected.map(km).join(' or ')}.`
  if (r.outcome === 'sent_to_person') return `${name} ${KEY_LABEL[r.field].toLowerCase()}: sent to a person. The key takes ${expected[0]}.`
  if (r.outcome === 'missed') return `${name} ${KEY_LABEL[r.field].toLowerCase()}: left blank, the key has ${String(expected[0])}.`
  return `${name} ${KEY_LABEL[r.field].toLowerCase()}: got ${String(r.got)}, the key has ${expected.map(String).join(' or ')}.`
}

export function Score({ score, onPick }: { score: Rescore; onPick: (slug: string) => void }) {
  const store = useStore()
  const near = store.near
  const misses = score.rows.filter((r) => r.outcome === 'wrong' || r.outcome === 'missed' || (r.outcome === 'sent_to_person' && !r.key_agrees_unclear))
  const order = ['tompkins', 'warren', 'saratoga', 'lincoln', 'pelham', 'west-lincoln'].filter((s) => runs.some((r) => r.account.slug === s))
  const effect =
    score.changed.length === 0
      ? near === RECORDED_NEAR
        ? 'The recorded run. Warren and Tompkins each fill one of two close figures; the key wanted a person to pick, so both count wrong.'
        : 'Same result as the recorded run.'
      : `${score.changed.map((s) => shortName[s]).join(' and ')} now go${score.changed.length === 1 ? 'es' : ''} to a person, as the key wanted.`

  return (
    <section className="score" aria-labelledby="score-h">
      <div className="score-in">
        <header className="score-head">
          <h2 id="score-h">Against the answer key</h2>
          <p className="score-sub">
            Key written before the first run, commit <code>{scorecard.answer_key_commit.slice(0, 7)}</code>. Built on these same six, so a check, not a benchmark.
          </p>
        </header>

        <dl className="tally">
          {COUNTS.map((c) => (
            <div key={c.key} className={`tally-i tally-i--${c.key}${score.counts[c.key] ? '' : ' is-zero'}`}>
              <dt>
                <Glyph kind={OUTCOME[c.key].glyph} size={13} />
                {c.label}
              </dt>
              <dd className="mono">{score.counts[c.key]}</dd>
            </div>
          ))}
          <div className="tally-i tally-i--total">
            <dt>fields</dt>
            <dd className="mono">{scorecard.total}</dd>
          </div>
        </dl>

        <div className="score-grid">
          <table className="matrix">
            <caption className="sr-only">Each Account and field against the answer key</caption>
            <thead>
              <tr>
                <td />
                {KEY_FIELDS.map((f) => (
                  <th key={f} scope="col">
                    {KEY_LABEL[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((slug) => (
                <tr key={slug}>
                  <th scope="row">
                    <button type="button" className="linkish" onClick={() => onPick(slug)}>
                      {shortName[slug]}
                    </button>
                  </th>
                  {KEY_FIELDS.map((f) => {
                    const r = score.rows.find((x) => x.account === slug && x.field === f)!
                    const changed = f === 'road_length_km' && score.changed.includes(slug)
                    return (
                      <td key={f} className={`mx mx--${r.outcome}${changed ? ' is-changed' : ''}`}>
                        <span className="mx-in" title={`${OUTCOME[r.outcome].word}`}>
                          <Glyph kind={OUTCOME[r.outcome].glyph} size={13} />
                          <span className="sr-only">{OUTCOME[r.outcome].word}</span>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="score-side">
            <div className="tol">
              <label className="tol-h" htmlFor="near">
                Same-roads rule
                <output className="mono" htmlFor="near">
                  {fmtPct(near)}
                </output>
              </label>
              <input
                id="near"
                type="range"
                min={0}
                max={0.05}
                step={0.001}
                value={near}
                onChange={(e) => store.setNear(Number(e.currentTarget.value))}
                aria-describedby="near-hint"
              />
              <p className="tol-scale mono" aria-hidden="true">
                <span>0%</span>
                <span className="tol-rec" style={{ left: `${(RECORDED_NEAR / 0.05) * 100}%` }}>
                  run: 2%
                </span>
                <span>5%</span>
              </p>
              <p id="near-hint" className="hint">
                Two road lengths this close count as one
              </p>
              <p className="tol-effect" aria-live="polite">
                {effect}
              </p>
            </div>

            <div className="misses">
              <h3>Misses</h3>
              {misses.length ? (
                <ul>
                  {misses.map((r) => (
                    <li key={`${r.account}-${r.field}`}>
                      <Glyph kind={OUTCOME[r.outcome].glyph} size={12} />
                      <span>{missLine(r)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None at this setting.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
