// The Zoho Account as the button leaves it: what Zoho has now, what the run proposes, the check
// each value passed, and whether it gets written. Values land when the replay reaches the step that
// produced them. Answers, dropped fields and the approval live in this tab only.
import { type ReactNode } from 'react'
import { isCite, runBySlug, seedBySlug, type Cite, type DocLink, type ProposedRow } from '../lib/data'
import { cleanTitle, fmtDateTime, fmtKm, fmtKm1, prettyUrl } from '../lib/format'
import { quotedBits, sourceIdFor, type Focus } from '../lib/marks'
import { shownRows, writePlan, type ShownRow, type ShownStatus } from '../lib/record'
import { useStore } from '../lib/store'
import { laneBySlug, laneNow } from '../lib/timeline'
import { Glyph, type GlyphKind } from './Glyph'

const LABEL: Record<ProposedRow['field'], string> = {
  road_length_km: 'Road network',
  email: 'Public Works email',
  phone: 'Public Works phone',
  roads_head: 'Roads head',
  key_documents: 'Key documents',
  brief: 'Account brief',
}
const UNIT: Partial<Record<ProposedRow['field'], string>> = { road_length_km: 'centerline km', roads_head: 'Contact' }

const CHECK: Record<ShownStatus, { glyph: GlyphKind; word: string }> = {
  filled: { glyph: 'filled', word: 'Checked' },
  needs_human: { glyph: 'person', word: 'Ask' },
  not_found: { glyph: 'blank', word: 'Blank' },
  blank: { glyph: 'blank', word: 'Blank' },
  merge: { glyph: 'merge', word: 'Merge' },
  empty: { glyph: 'blank', word: 'Blank' },
}

const clip = (s: string, n = 96) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ')

function Quote({ c, slug, onOpen, active }: { c: Cite; slug: string; onOpen: (f: Focus) => void; active: boolean }) {
  const isData = c.column !== undefined
  return (
    <button
      type="button"
      className={`quote${active ? ' is-active' : ''}`}
      onClick={() => onOpen({ source: c.source, quote: c.quote, pdf_page: c.pdf_page, row: slug })}
    >
      {isData ? (
        <span className="quote-text">
          {c.sum_mi} mi, sum of <code>{c.column}</code> over {c.rows} rows
        </span>
      ) : (
        <span className="quote-text">"{clip(oneLine(c.quote))}"</span>
      )}
      <span className="quote-src">
        {clip(cleanTitle(c.title), 48)}
        {c.pdf_page ? `, p. ${c.pdf_page}` : ''}
      </span>
    </button>
  )
}

function Value({ row, slug, focus, onOpen }: { row: ShownRow; slug: string; focus: Focus | null; onOpen: (f: Focus) => void }) {
  const run = runBySlug[slug]
  const cites = row.sources.filter(isCite)
  const isActive = (c: Cite) => !!focus && focus.source === c.source && focus.quote === c.quote
  const quotes = (list: Cite[]) => (
    <div className="quotes">
      {list.map((c, i) => (
        <Quote key={i} c={c} slug={slug} onOpen={onOpen} active={isActive(c)} />
      ))}
    </div>
  )

  switch (row.field) {
    case 'road_length_km': {
      const answered = row.answered
      const main =
        answered?.result === 'filled' && answered.option.value_km != null
          ? `${fmtKm(answered.option.value_km)} km`
          : typeof row.proposed === 'string'
            ? row.proposed.split(' (')[0]
            : null
      const parts = typeof row.proposed === 'string' && row.proposed.includes(' (') ? row.proposed.slice(row.proposed.indexOf(' (') + 2, -1) : null
      const within = row.within
      const value = run.validated.road_length_km.value_km
      return (
        <>
          {main && row.shown !== 'blank' ? (
            <p className="v-big">
              {main}
              {parts ? <span className="v-parts">= {parts}</span> : null}
            </p>
          ) : (
            <p className="v-none">{row.shown === 'blank' ? 'Left blank, as answered' : 'No whole-network length'}</p>
          )}
          {cites.length ? quotes(cites) : null}
          {row.partial?.map((p, i) => (
            <div key={i} className="v-partial">
              <p className="v-note">{fmtKm1(p.km)} km found, but it covers only part of the roads.</p>
              {quotes(p.sources)}
            </div>
          ))}
          {within && value ? (
            <div className="compare" aria-label="Roads the county owns against every road inside it">
              <div className="cmp-row">
                <span>County owns</span>
                <span className="cmp-bar">
                  <span className="cmp-fill cmp-fill--own" style={{ width: `${(value / within.km) * 100}%` }} />
                </span>
                <span className="mono">{fmtKm1(value)} km</span>
              </div>
              <div className="cmp-row">
                <span>Every road inside</span>
                <span className="cmp-bar">
                  <span className="cmp-fill" style={{ width: '100%' }} />
                </span>
                <span className="mono">{fmtKm1(within.km)} km</span>
              </div>
              <p className="v-note">
                NYSDOT {within.year}. Which one sets the price is <a href="/demo/plan#q1">question 1</a>.
              </p>
            </div>
          ) : null}
          {row.detail && !row.partial ? <p className="v-note">{row.detail}</p> : null}
        </>
      )
    }
    case 'roads_head': {
      if (row.shown === 'merge' && row.merge) {
        return (
          <>
            <p className="v-diff">
              <del>{row.current}</del>
              <span className="v-arrow" aria-hidden="true">
                →
              </span>
              <ins>{String(row.proposed)}</ins>
            </p>
            {quotes(cites)}
            <p className="v-note">Merges into the existing Contact (sample): {row.merge.matched_on}.</p>
          </>
        )
      }
      if (!row.proposed)
        return (
          <>
            <p className="v-none">{row.detail?.startsWith('The site lists the role') ? 'Title only, no name' : 'Not on the pages read'}</p>
            {cites.length ? quotes(cites) : null}
          </>
        )
      return (
        <>
          <p className="v-main">{String(row.proposed)}</p>
          {quotes(cites)}
          <p className="v-note">New Contact on this Account.</p>
        </>
      )
    }
    case 'key_documents': {
      const docs = row.sources as DocLink[]
      return (
        <ul className="docs">
          {docs.map((d) => {
            const id = sourceIdFor(run, d.url)
            return (
              <li key={d.url}>
                {id ? (
                  <button type="button" className="doc" onClick={() => onOpen({ source: id, row: slug })}>
                    {cleanTitle(d.title)}
                  </button>
                ) : (
                  <a className="doc" href={d.url} target="_blank" rel="noreferrer">
                    {cleanTitle(d.title)}
                  </a>
                )}
                <span className="doc-host mono">{prettyUrl(d.url).split('/')[0]}</span>
              </li>
            )
          })}
        </ul>
      )
    }
    case 'brief': {
      if (!run.brief.sentences.length) return <p className="v-none">No brief: no page read mentions its signs</p>
      return (
        <div className="brief">
          {run.brief.sentences.map((s, i) => (
            <p key={i}>
              <BriefText text={s.text} />{' '}
              {s.cites.map((c) => {
                const q = quotedBits(s.text)[0]
                return (
                  <button key={c} type="button" className="cite mono" onClick={() => onOpen({ source: c, quote: q, row: slug })} aria-label={`Open source ${c}`}>
                    {c}
                  </button>
                )
              })}
            </p>
          ))}
          <p className="v-note">Written by Claude, then checked word by word against the pages it cites.</p>
        </div>
      )
    }
    default: {
      // email, phone
      if (row.status === 'needs_human' && row.field === 'phone') {
        return (
          <>
            <p className="v-none">Two numbers printed, left for a person</p>
            {quotes(cites)}
          </>
        )
      }
      if (!row.proposed) return <p className="v-none">{row.detail?.includes('Cloudflare') ? 'Hidden from scripts by the site' : 'Not on the pages read'}</p>
      return (
        <>
          <p className="v-main mono">{String(row.proposed)}</p>
          {quotes(cites)}
        </>
      )
    }
  }
}

/** The requests in a line: method and what each one writes. */
function planParts(plan: ReturnType<typeof writePlan>): { method: string; what: string }[] {
  const out: { method: string; what: string }[] = []
  const contact = plan.requests.find((r) => r.url.endsWith('/Contacts'))
  const fields = plan.changes - (contact ? 1 : 0)
  out.push({ method: 'PUT', what: `Account, ${fields} ${fields === 1 ? 'field' : 'fields'}` })
  if (contact) out.push({ method: contact.method, what: 'Contact' })
  if (plan.notes) out.push({ method: 'POST', what: plan.notes === 1 ? '1 Note' : `${plan.notes} Notes` })
  return out
}

/** A brief sentence with the words copied from the page set apart. */
function BriefText({ text }: { text: string }) {
  const out: ReactNode[] = []
  const re = /"([^"]+)"/g
  let at = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    out.push(text.slice(at, m.index))
    out.push(<q key={k++}>{m[1]}</q>)
    at = m.index + m[0].length
  }
  out.push(text.slice(at))
  return <>{out}</>
}

function Question({ row, slug }: { row: ShownRow; slug: string }) {
  const store = useStore()
  const q = row.question!
  const pick = store.get(slug).answers[row.field]
  return (
    <div className="ask" role="group" aria-label={q.text}>
      <p className="ask-q">
        <Glyph kind="person" size={13} />
        {q.text}
      </p>
      <div className="ask-opts">
        {q.options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            className="opt"
            aria-pressed={pick === i}
            onClick={() => store.answer(slug, row.field, pick === i ? null : i)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Record({
  slug,
  shown,
  t,
  playing,
  focus,
  onOpen,
  onEnrich,
  onZoho,
}: {
  slug: string
  shown: number
  t: number
  playing: boolean
  focus: Focus | null
  onOpen: (f: Focus) => void
  onEnrich: () => void
  onZoho: () => void
}) {
  const store = useStore()
  const run = runBySlug[slug]
  const lane = laneBySlug[slug]
  const review = store.get(slug)
  const now = laneNow(lane, shown, t)
  const done = shown >= lane.times.length
  const ready = lane.checkStep >= 0 && shown > lane.checkStep
  const briefReady = lane.briefStep >= 0 && shown > lane.briefStep
  const running = shown > 0 && !done
  const queued = shown === 0 && (playing || t > 0)
  const rows = shownRows(run, review.answers)
  const plan = writePlan(run, review.answers, review.dropped)
  const seed = seedBySlug[slug]

  const status = done
    ? plan.status
    : running
      ? 'Running'
      : queued
        ? 'Queued'
        : seed.Enrichment_Status
  const statusTone = done ? (plan.status === 'Done' ? 'done' : 'ask') : running || queued ? 'run' : 'idle'
  const doing = running
    ? now.phase === 'model'
      ? lane.blocks.find((b) => b.from <= t && t < b.to)?.kind === 'brief'
        ? 'Claude is writing the brief'
        : 'Claude is reading the pages'
      : now.phase === 'checking' || now.phase === 'writing'
        ? 'Checking every value'
        : now.doing
    : queued
      ? 'Waiting for one of 3 workers'
      : null

  const hasLanded = (f: ProposedRow['field']) => (f === 'brief' ? briefReady : ready)
  const filledNow = done ? rows.filter((r) => r.shown === 'filled' || r.shown === 'merge').length : 0

  return (
    <article className="record" aria-labelledby="rec-h">
      <header className="rec-head">
        <div className="rec-id">
          <p className="rec-kicker">
            <span className="tag">{run.account.jurisdiction}</span>
            <span>Account</span>
            <span className="mono rec-crm" title="Sample record id">
              {run.account.crm_id}
            </span>
          </p>
          <h2 id="rec-h">{run.account.name}</h2>
          <a className="rec-site" href={run.account.website} target="_blank" rel="noreferrer">
            {prettyUrl(run.account.website)}
          </a>
        </div>
        <div className="rec-act">
          <button
            type="button"
            className={`btn ${shown === 0 && !playing ? 'btn--primary' : 'btn--quiet'}`}
            onClick={onEnrich}
            disabled={playing && (running || queued)}
          >
            {playing && queued ? 'Queued' : playing && running ? 'Running' : shown === 0 ? 'Enrich Account' : 'Run again'}
          </button>
          <p className="hint">Replays the recorded run</p>
        </div>
      </header>

      <dl className="rec-stats">
        <div>
          <dt>Status</dt>
          <dd className={`st st--${statusTone}`}>
            {statusTone === 'ask' ? <Glyph kind="person" size={12} /> : statusTone === 'done' ? <Glyph kind="filled" size={11} /> : null}
            {status}
          </dd>
        </div>
        <div>
          <dt>Fields filled</dt>
          <dd className="mono">
            {filledNow} <span className="of">/ 6</span>
          </dd>
        </div>
        <div>
          <dt>Pages read</dt>
          <dd className="mono">
            {now.pages} <span className="of">/ {run.run.page_budget}</span>
          </dd>
        </div>
        <div>
          <dt>Run time</dt>
          <dd className="mono">{done ? `${((lane.end - lane.start) / 1000).toFixed(1)} s` : running ? '…' : '0 s'}</dd>
        </div>
      </dl>
      {doing ? (
        <p className="rec-doing" aria-live="polite">
          <span className="pulse" aria-hidden="true" />
          {doing}
        </p>
      ) : null}

      <div className="fields" role="table" aria-label={`${run.account.name} fields`}>
        <div className="f-row f-row--head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">
            Zoho now → proposed <span className="hint">Click a quote to see its page</span>
          </span>
          <span role="columnheader">Check</span>
          <span role="columnheader">Write</span>
        </div>
        {rows.map((row) => {
          const landed = hasLanded(row.field)
          const chk = CHECK[row.shown]
          const writable = row.shown === 'filled' || row.shown === 'merge'
          const dropped = review.dropped.has(row.field)
          return (
            <div key={row.field} className={`f-row${landed ? ' is-landed' : ''}${dropped ? ' is-dropped' : ''}`} role="row" data-field={row.field}>
              <span className="f-label" role="rowheader">
                {LABEL[row.field]}
                {UNIT[row.field] ? <span className="f-unit">{UNIT[row.field]}</span> : null}
              </span>
              <div className="f-val" role="cell">
                {landed ? (
                  <>
                    {row.field !== 'roads_head' || row.shown !== 'merge' ? (
                      <p className="was">
                        <span className="was-v">{row.current ?? 'empty'}</span>
                        <span aria-hidden="true">→</span>
                      </p>
                    ) : null}
                    <Value row={row} slug={slug} focus={focus} onOpen={onOpen} />
                    {row.question && row.status === 'needs_human' ? <Question row={row} slug={slug} /> : null}
                  </>
                ) : (
                  <p className="f-wait">
                    <span className="was-v">{row.current ?? 'empty'}</span>
                    {running ? <span className="f-bar" aria-hidden="true" /> : null}
                  </p>
                )}
              </div>
              <span className="f-chk" role="cell">
                {landed ? (
                  <span className={`chk chk--${chk.glyph}`}>
                    <Glyph kind={chk.glyph} size={12} />
                    {row.answered && row.shown === 'filled' ? 'Answered' : chk.word}
                  </span>
                ) : null}
              </span>
              <span className="f-write" role="cell">
                {landed && writable ? (
                  <label className="sw">
                    <input
                      type="checkbox"
                      checked={!dropped}
                      onChange={() => store.toggle(slug, row.field)}
                      aria-label={`Write ${LABEL[row.field]} to Zoho`}
                    />
                    <span className="sw-ui" aria-hidden="true" />
                  </label>
                ) : landed && row.shown === 'needs_human' ? (
                  <span className="f-note">Note</span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      <footer className={`rec-foot${done ? '' : ' is-off'}`}>
        <div className="rec-plan">
          <p className="rec-plan-h">Zoho update</p>
          <p className="rec-plan-v">
            {done ? (
              planParts(plan).map((x) => (
                <span key={x.what}>
                  <span className="mono">{x.method}</span> {x.what}
                </span>
              ))
            ) : (
              <span>Built when the run finishes</span>
            )}
          </p>
          {done ? (
            <button type="button" className="linkish" onClick={onZoho}>
              See the requests
            </button>
          ) : null}
        </div>
        <div className="rec-approve">
          {review.approved ? (
            <>
              <p className="approved">
                <Glyph kind="filled" size={12} /> Approved{run.writeback.sent ? '' : '. Not sent: preview only'}
              </p>
              <button type="button" className="linkish" onClick={() => store.approve(slug, false)}>
                Undo
              </button>
            </>
          ) : (
            <button type="button" className={`btn ${done ? 'btn--primary' : 'btn--quiet'}`} disabled={!done} onClick={() => store.approve(slug, true)}>
              Approve update
            </button>
          )}
        </div>
      </footer>
      {done ? <p className="rec-when mono">Run {fmtDateTime(run.run.finished_at)} · sample CRM state</p> : null}
    </article>
  )
}
