import type { ReactNode } from 'react'
import { isCite, type Cite, type DocLink, type RoadOption, type Run } from '../lib/data'
import { fmtDate, fmtKm, fmtMi, prettyUrl } from '../lib/format'
import type { ShownRow } from '../lib/record'
import { Link } from '../lib/router'
import { Chip } from './Status'
import { Quote } from './Source'

export function SampleTag() {
  return (
    <span className="tag tag--sample" title="Sample CRM data, made up">
      sample
    </span>
  )
}

type RowProps = { run: Run; row: ShownRow; onAnswer: (option: number | null) => void }

function Diff({ current, next, sub, faded }: { current: ReactNode; next: ReactNode; sub?: ReactNode; faded?: boolean }) {
  return (
    <div className={`diff${faded ? ' diff--faded' : ''}`}>
      <span className="diff-cur">{current}</span>
      <span className="diff-arrow" aria-label="becomes">
        →
      </span>
      <span className="diff-new">
        {next}
        {sub ? <span className="diff-sub">{sub}</span> : null}
      </span>
    </div>
  )
}

const empty = <span className="nil">empty</span>

function kmLabel(o: RoadOption) {
  return `${o.approximate ? 'about ' : ''}${fmtKm(o.km)} km`
}

/** How an option's number was made from what the sources print. */
function optionMath(o: RoadOption): string {
  const p = o.parts
  const dataset = p[0]?.cite.column
  if (dataset) return `${fmtMi(p[0].cite.sum_mi ?? 0)} mi of county-owned roads, ${dataset} summed over ${p[0].cite.rows} rows (${p[0].cite.year})`
  if (p.length > 1 && Math.abs(p.reduce((n, x) => n + x.km, 0) - o.km) < 0.05)
    return p.map((x) => `${x.value} ${x.road_type}`).join(' + ')
  if (p.length > 1) return `the same figure on ${p.length} pages`
  if (/^mi/i.test(p[0].unit)) return `${p[0].value} ${p[0].unit} at 1.609344 km per mile`
  if (/^m(et(er|re)s?)?$/i.test(p[0].unit)) return `${p[0].value} ${p[0].unit}`
  return `${p[0].value} ${p[0].unit} as printed`
}

function Quotes({ run, cites, value }: { run: Run; cites: Cite[]; value?: (c: Cite) => string | undefined }) {
  return (
    <div className="quotes">
      {cites.map((c, i) => (
        <Quote key={`${c.source}-${i}`} slug={run.account.slug} cite={c} value={value?.(c)} />
      ))}
    </div>
  )
}

function OwnedVsWithin({ run, row }: { run: Run; row: ShownRow }) {
  const w = row.within!
  const owned = run.validated.road_length_km.options.find((o) => o.parts[0]?.cite.column === 'county_mileage')
  if (!owned) return null
  const pct = (owned.km / w.km) * 100
  const times = Math.round(w.km / owned.km)
  return (
    <figure className="owned">
      <figcaption className="owned-head">
        Roads the county owns, next to every road inside it ({w.year})
      </figcaption>
      <div className="owned-row">
        <span className="owned-label">County owns</span>
        <span className="owned-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="owned-num">
          {fmtKm(owned.km)} km <span className="owned-mi">{fmtMi(owned.parts[0].cite.sum_mi ?? 0)} mi</span>
        </span>
      </div>
      <div className="owned-row owned-row--within">
        <span className="owned-label">All roads inside</span>
        <span className="owned-bar" aria-hidden="true">
          <span style={{ width: '100%' }} />
        </span>
        <span className="owned-num">
          {fmtKm(w.km)} km <span className="owned-mi">{fmtMi(w.mi)} mi</span>
        </span>
      </div>
      <p className="owned-note">
        <code>county_mileage</code> against <code>{w.column}</code>, NYSDOT Highway Mileage on data.ny.gov. The second
        is about {times} times the first. {w.note.replace(' Question 1 for you.', '')}{' '}
        <Link to={`/demo/plan?account=${run.account.slug}#q1`}>Question 1 for you.</Link>
      </p>
    </figure>
  )
}

function Ask({ row, run, onAnswer }: RowProps) {
  const q = row.question!
  const options = run.validated.road_length_km.options
  if (row.answered) {
    const { result } = row.answered
    if (result === 'filled') return null
    const said =
      result === 'blank'
        ? 'Left blank: you said lane km, and this field takes centerline km. The Note keeps the quote for whoever follows up.'
        : 'Left blank. It becomes a Note on the Account for a person to check.'
    return (
      <div className="ask ask--done">
        <p className="ask-said">
          {said}{' '}
          <button type="button" className="linkish" onClick={() => onAnswer(null)}>
            Change
          </button>
        </p>
      </div>
    )
  }
  return (
    <div className="ask" role="group" aria-label={q.text}>
      <p className="ask-q">{q.text}</p>
      {q.kind === 'pick' ? (
        <ol className="ask-options">
          {q.options.map((opt, i) => {
            const o = options[i]
            if (opt.result !== 'filled' || !o) return null
            return (
              <li key={i} className="ask-option">
                <div className="ask-option-head">
                  <span className="ask-km">{kmLabel(o)}</span>
                  <span className="ask-math">{optionMath(o)}</span>
                </div>
                <Quotes run={run} cites={o.parts.map((p) => p.cite)} value={(c) => o.parts.find((p) => p.cite === c)?.value} />
                <button type="button" className="btn btn--answer" onClick={() => onAnswer(i)}>
                  Use {kmLabel(o)}
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <Quotes run={run} cites={row.sources.filter(isCite)} value={() => String(row.proposed ?? '').split(' ')[0]} />
      )}
      <div className="ask-actions">
        {q.options.map((opt, i) =>
          q.kind === 'pick' && opt.result === 'filled' ? null : (
            <button key={i} type="button" className={`btn btn--answer${opt.result === 'filled' ? ' btn--yes' : ''}`} onClick={() => onAnswer(i)}>
              {opt.label}
            </button>
          ),
        )}
        {q.options.some((o) => o.result === 'note') ? (
          <span className="ask-hint">Not sure leaves the field blank and adds a Note to the Account.</span>
        ) : null}
      </div>
    </div>
  )
}

function RoadRow({ run, row, onAnswer }: RowProps) {
  const options = run.validated.road_length_km.options
  let next: ReactNode
  let sub: ReactNode = null
  if (row.answered?.result === 'filled') {
    next = `${fmtKm(row.answered.option.value_km!)} km`
    sub = (
      <>
        confirmed by you{' '}
        <button type="button" className="linkish" onClick={() => onAnswer(null)}>
          Change
        </button>
      </>
    )
  } else if (row.shown === 'blank' || (row.answered && row.shown === 'needs_human')) {
    next = <span className="nil">stays empty</span>
  } else if (row.shown === 'not_found') {
    next = <span className="nil">not found</span>
  } else if (row.question?.kind === 'pick') {
    next = `${kmLabel(options[0])} proposed`
    sub = `${options.length} sources disagree`
  } else {
    next = row.status === 'needs_human' ? `${row.proposed} proposed` : row.proposed
  }

  const chosen = row.answered?.result === 'filled' && row.question?.kind === 'pick' ? options[row.question.options.indexOf(row.answered.option)] : null

  return (
    <>
      <RowHead row={row} diff={<Diff current={empty} next={next} sub={sub} />} />
      <div className="field-body">
        {row.question && row.shown === 'needs_human' && !row.answered ? (
          <Ask run={run} row={row} onAnswer={onAnswer} />
        ) : (
          <>
            {row.question ? <Ask run={run} row={row} onAnswer={onAnswer} /> : null}
            {chosen ? (
              <Quotes run={run} cites={chosen.parts.map((p) => p.cite)} value={(c) => chosen.parts.find((p) => p.cite === c)?.value} />
            ) : row.shown !== 'not_found' ? (
              <Quotes run={run} cites={row.sources.filter(isCite)} value={(c) => (c.column ? undefined : String(row.proposed ?? '').split(' ')[0])} />
            ) : null}
          </>
        )}
        {row.detail ? <p className="detail">{row.detail}</p> : null}
        {row.partial?.map((p, i) => (
          <div key={i} className="partial">
            <p className="partial-head">
              Partial, not used: {fmtKm(p.km)} km. {p.why}
            </p>
            <Quotes run={run} cites={p.sources} value={() => p.sources[0]?.quote.match(/[\d,]+/)?.[0]} />
          </div>
        ))}
        {row.within ? <OwnedVsWithin run={run} row={row} /> : null}
      </div>
    </>
  )
}

function RowHead({ row, diff }: { row: ShownRow; diff: ReactNode }) {
  return (
    <div className="field-head">
      <h3 className="field-label">{row.label}</h3>
      {diff}
      <Chip kind={row.shown} label={row.answered?.result === 'filled' ? 'Filled' : undefined} />
    </div>
  )
}

function docKind(run: Run, url: string): string {
  const k = run.sources.find((s) => s.url === url)?.kind
  return k === 'pdf' ? 'PDF' : k === 'dataset' ? 'Dataset' : 'Page'
}

export function FieldRow(props: RowProps) {
  const { run, row } = props
  if (row.field === 'road_length_km') return <RoadRow {...props} />

  if (row.field === 'key_documents') {
    const docs = row.sources as DocLink[]
    return (
      <>
        <RowHead row={row} diff={<Diff current={<span className="nil">none</span>} next={`${docs.length} documents`} />} />
        <div className="field-body">
          <ul className="docs">
            {docs.map((d) => (
              <li key={d.url}>
                <span className="doc-kind">{docKind(run, d.url)}</span>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.title}
                </a>
                <span className="doc-meta">
                  {prettyUrl(d.url).split('/')[0]} · fetched {fmtDate(d.fetched_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  if (row.status === 'merge' && row.merge) {
    const m = row.merge
    return (
      <>
        <RowHead
          row={row}
          diff={
            <Diff
              current={
                <>
                  {row.current} <SampleTag />
                </>
              }
              next={String(row.proposed)}
            />
          }
        />
        <div className="field-body">
          <div className="merge">
            <p>
              Matches the existing Contact <code>{m.contact_id}</code> (matched on {m.matched_on}). The merge keeps that record
              and its id, updates {Object.keys(m.changes).length === 2 ? 'two fields' : `${Object.keys(m.changes).length} fields`}{' '}
              and stores where the new values came from. It never merges on a name alone.
            </p>
            <table className="merge-table">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">On the Contact now</th>
                  <th scope="col">From the county's page</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.changes).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k[0].toUpperCase() + k.slice(1)}</th>
                    <td>{v.from}</td>
                    <td>{v.to}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Phone</th>
                  <td>{m.existing.phone}</td>
                  <td className="nil">unchanged, and one of the two things it matched on</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Quotes run={run} cites={row.sources.filter(isCite)} />
        </div>
      </>
    )
  }

  const value = Array.isArray(row.proposed) ? row.proposed.join(', ') : row.proposed
  return (
    <>
      <RowHead
        row={row}
        diff={<Diff current={row.current ?? empty} next={row.status === 'not_found' ? <span className="nil">not found</span> : value} />}
      />
      <div className="field-body">
        {row.detail ? <p className="detail">{row.detail}</p> : null}
        <Quotes
          run={run}
          cites={row.sources.filter(isCite)}
          value={() => (row.field === 'email' || row.field === 'phone' ? (value ?? undefined) : undefined)}
        />
      </div>
    </>
  )
}
