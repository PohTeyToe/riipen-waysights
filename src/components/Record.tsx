import { useState } from 'react'
import { runs, scorecard, seedBySlug, shortName, sourceById, type Run } from '../lib/data'
import { cleanTitle, fmtDate, fmtDateTime, prettyUrl } from '../lib/format'
import { fillMarks, openQuestions, revealAt, shownRows, writePlan, FIELD_ORDER } from '../lib/record'
import { Link } from '../lib/router'
import { useStore, type AccountState } from '../lib/store'
import { FieldRow, SampleTag } from './Fields'
import { RunLog } from './RunLog'
import { Quote } from './Source'
import { Chip, Dot, Glyph, Marks } from './Status'
import { Tested } from './Tested'

function statusWord(run: Run, st: AccountState): string {
  if (st.phase === 'idle') return seedBySlug[run.account.slug].Enrichment_Status
  if (st.phase === 'running') {
    const last = run.steps.slice(0, st.shown + 1).filter((s) => s.step === 'status').at(-1)
    return last?.msg === 'Queued' ? 'Queued' : 'Running'
  }
  if (st.phase === 'proposed') return 'Changes proposed'
  return writePlan(run, st.answers).status
}

function AccountList({ current }: { current: string }) {
  const store = useStore()
  return (
    <nav className="accounts" aria-label="Example public accounts">
      <p className="accounts-head">
        Example public accounts <span className="accounts-count">{runs.length}</span>
      </p>
      <ul>
        {runs.map((r) => {
          const slug = r.account.slug
          const st = store.get(slug)
          const ran = st.phase === 'proposed' || st.phase === 'written'
          const marks = fillMarks(r, st.answers, ran)
          const filled = marks.filter((m) => m === 'filled' || m === 'merge').length
          const open = ran ? openQuestions(r, st.answers) : 0
          const state = !ran ? (st.phase === 'running' ? 'Running' : 'Never run') : `${filled} filled`
          const label = ran ? `${filled} of ${FIELD_ORDER.length} fields filled${open ? `, ${open} question to answer` : ''}` : state
          return (
            <li key={slug}>
              <Link
                to={`/demo?account=${slug}`}
                keepScroll
                aria-current={slug === current ? 'page' : undefined}
                className="account"
              >
                <span className="account-name">
                  <span className="account-full">{r.account.name}</span>
                  <span className="account-short">{shortName[slug]}</span>
                </span>
                <span className="account-region">{r.account.jurisdiction === 'ON' ? 'Ontario' : 'New York'}</span>
                <span className="account-state">
                  <Marks marks={marks} label={label} />
                  <span>
                    {state}
                    {open ? (
                      <>
                        {' '}
                        <Dot /> {open} question
                      </>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Head({ run, st }: { run: Run; st: AccountState }) {
  const store = useStore()
  const slug = run.account.slug
  const seed = seedBySlug[slug]
  const ran = st.phase === 'proposed' || st.phase === 'written'
  const rule = run.steps.find((s) => s.rate_rule)?.rate_rule ?? 'One run per Account per day. Last run: never.'
  const lastRun = fmtDateTime(run.run.finished_at)
  const word = statusWord(run, st)
  const tone = word === 'Done' ? 'filled' : word === 'Needs review' ? 'needs_human' : null
  return (
    <header className="rec-head">
      <div className="rec-id">
        <p className="eyebrow">
          Account <Dot /> example public account
        </p>
        <h1>{run.account.name}</h1>
        <dl className="rec-meta">
          <div>
            <dt>Website</dt>
            <dd>
              <a href={run.account.website} target="_blank" rel="noreferrer">
                {prettyUrl(run.account.website)}
              </a>
            </dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{run.account.region}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>
              {seed.Account_Type} <SampleTag />
            </dd>
          </div>
          <div>
            <dt>Record id</dt>
            <dd>
              <code>{seed.crm_id}</code> <SampleTag />
            </dd>
          </div>
        </dl>
      </div>
      <div className="rec-actions">
        <button
          type="button"
          className="btn btn--enrich"
          onClick={() => store.enrich(slug)}
          disabled={st.phase === 'running'}
          aria-describedby="rate-rule"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2 8h9M8 4.5 11.5 8 8 11.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Enrich Account
        </button>
        <p id="rate-rule" className="rate">
          {ran ? `One run per Account per day. Last run: ${lastRun}.` : rule}
        </p>
        {st.blocked ? (
          <p className="rate-blocked" role="status">
            Already enriched in the last 24 hours. Last run: {lastRun}.{' '}
            <button type="button" className="linkish" onClick={() => store.reset(slug)}>
              Start this Account over
            </button>
          </p>
        ) : null}
      </div>
      <dl className="rec-status">
        <div>
          <dt>Enrichment status</dt>
          <dd aria-live="polite">
            {tone ? <Chip kind={tone} label={word} /> : <span className={`status-word status-word--${st.phase}`}>{word}</span>}
            {st.phase === 'idle' ? <SampleTag /> : null}
          </dd>
        </div>
        <div>
          <dt>Last enriched</dt>
          <dd>{st.phase === 'written' ? lastRun : <span className="nil">empty</span>}</dd>
        </div>
      </dl>
    </header>
  )
}

function Fields({ run, st }: { run: Run; st: AccountState }) {
  const store = useStore()
  const slug = run.account.slug
  const reveal = st.phase === 'proposed' || st.phase === 'written' || (st.phase === 'running' && st.shown >= revealAt(run.steps, 'check'))
  const rows = shownRows(run, st.answers)
  return (
    <section className="fields" aria-labelledby="fields-h">
      <header className="section-head">
        <h2 id="fields-h">{st.phase === 'written' ? 'Changes' : reveal ? 'Proposed changes' : 'Fields'}</h2>
        <p className="section-note">
          {st.phase === 'written'
            ? 'Each value shows the line it came from. The write below is a preview; nothing was sent.'
            : reveal
              ? 'Each value shows the line it came from. Nothing is written until you press Write below.'
              : 'Blank, as the sample CRM record starts. The run fills what the sources settle.'}
        </p>
      </header>
      <ul className="field-list">
        {rows.map((row) =>
          reveal ? (
            <li key={row.field} className={`field field--${row.shown} field--in`} data-field={row.field}>
              {row.field === 'brief' ? <BriefRow run={run} /> : <FieldRow run={run} row={row} onAnswer={(o) => store.answer(slug, row.field, o)} />}
              <KeyNote run={run} field={row.field} />
            </li>
          ) : (
            <li key={row.field} className="field field--before">
              <div className="field-head">
                <h3 className="field-label">{row.label}</h3>
                <div className="diff">
                  <span className="diff-cur">
                    {row.current ? (
                      <>
                        {row.current} <SampleTag />
                      </>
                    ) : (
                      <span className="nil">empty</span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      {reveal ? <Rejected run={run} /> : null}
    </section>
  )
}

const SCORED: Record<string, string[]> = {
  road_length_km: ['road_length_km'],
  email: ['email'],
  phone: ['phone'],
  roads_head: ['roads_head_name', 'roads_head_title'],
  key_documents: ['key_document'],
}

/** If the answer key scored this field wrong or missed, say so on the row itself. */
function KeyNote({ run, field }: { run: Run; field: string }) {
  const miss = scorecard.misses.find((m) => m.account === run.account.slug && (SCORED[field] ?? []).includes(m.field))
  if (!miss) return null
  const expected = Array.isArray(miss.expected) ? miss.expected.join(' or ') : String(miss.expected)
  return (
    <p className="keynote">
      <Glyph kind="rejected" />
      <span>
        The answer key scores this {miss.outcome === 'wrong' ? 'wrong' : 'as missed'}: it expects <code>{expected}</code>.{' '}
        <a href="#tested-h">How this was tested</a>
      </span>
    </p>
  )
}

function BriefRow({ run }: { run: Run }) {
  const b = run.brief
  const ids = [...new Set(b.sentences.flatMap((s) => s.cites))]
  return (
    <>
      <div className="field-head">
        <h3 className="field-label">Account brief</h3>
        <div className="diff">
          <span className="diff-cur">
            <span className="nil">empty</span>
          </span>
          <span className="diff-arrow" aria-label="becomes">
            →
          </span>
          <span className="diff-new">{b.sentences.length} sentences</span>
        </div>
        <Chip kind="filled" />
      </div>
      <div className="field-body">
        <p className="brief">
          {b.sentences.map((s, i) => (
            <span key={i} className="brief-s">
              {s.text}
              {s.cites.map((id) => {
                const src = sourceById(run, id)
                return (
                  <a key={id} className="cite" href={src?.url} target="_blank" rel="noreferrer" title={src?.title}>
                    {id}
                  </a>
                )
              })}{' '}
            </span>
          ))}
        </p>
        <p className="brief-by">
          Written by <code>{b.model}</code> on {fmtDate(run.run.finished_at)} from the checked fields and quoted lines only.
          Sentences that cited nothing, or used a number the checks hadn't passed, would have been dropped.
        </p>
        <ul className="brief-key">
          {ids.map((id) => {
            const src = sourceById(run, id)
            return (
              <li key={id}>
                <span className="cite cite--key">{id}</span>
                <a href={src?.url} target="_blank" rel="noreferrer">
                  {src ? cleanTitle(src.title) : id}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

const FIELD_NAME: Record<string, string> = {
  road_length_km: 'road length',
  email: 'the Public Works email',
  phone: 'the Public Works phone',
  roads_head: 'the roads head',
}

function Rejected({ run }: { run: Run }) {
  const n = run.rejected.length
  return (
    <details className="rejected">
      <summary>
        <Glyph kind="rejected" />
        <span>Rejected by validation ({n})</span>
        <span className="rejected-sub">{n ? 'what the checks threw out in this run' : 'the checks refused nothing on this Account'}</span>
      </summary>
      {n ? (
        <ul>
          {run.rejected.map((r, i) => (
            <li key={i}>
              <p className="rej-head">
                <code className="rej-value">{r.value}</code>
                <span>
                  offered as {FIELD_NAME[r.field] ?? r.field}, refused: {r.reason}
                </span>
              </p>
              <Quote slug={run.account.slug} cite={r} value={r.value.split(' ')[0]} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rejected-none">
          Every value the model offered for {run.account.name} passed the checks.
        </p>
      )}
    </details>
  )
}

function Write({ run, st }: { run: Run; st: AccountState }) {
  const store = useStore()
  const plan = writePlan(run, st.answers)
  const written = st.phase === 'written'
  const [picked, setShown] = useState(0)
  const shown = Math.min(picked, plan.requests.length - 1)
  const label = `Write ${plan.changes} ${plan.changes === 1 ? 'change' : 'changes'}${plan.notes ? ` and ${plan.notes} Note` : ''}`
  const why = plan.notes ? ', because a question is still open' : ''
  const count = plan.requests.length === 1 ? 'the request' : `the ${plan.requests.length} requests`
  return (
    <section className="write" aria-labelledby="write-h">
      <header className="section-head">
        <h2 id="write-h">Write back to Zoho</h2>
        <p className="section-note">Draft, never run in a Zoho org; field names are guesses.</p>
      </header>
      <div className="write-row">
        {written ? (
          <p className="write-hint">
            Preview only: nothing was sent. Below is {count} the service would make. Status: <strong>{plan.status}</strong>
            {why}.
          </p>
        ) : (
          <>
            <button type="button" className="btn btn--primary" onClick={() => store.write(run.account.slug)}>
              {label}
            </button>
            <span className="write-hint">
              Preview only: nothing is sent. Status after the write: <strong>{plan.status}</strong>
              {why}.
            </span>
          </>
        )}
      </div>
      {written ? (
        <div className="payload">
          {plan.changedByAnswer ? <p className="payload-note">Changed on this page by your answer. The run's own output is in data/run/{run.account.slug}.json.</p> : null}
          <div className="payload-tabs" role="tablist" aria-label="Requests">
            {plan.requests.map((r, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={shown === i}
                className="payload-tab"
                onClick={() => setShown(i)}
              >
                <span className="payload-method">{r.method}</span> {r.url.replace('https://www.zohoapis.com/crm/v8', '')}
              </button>
            ))}
          </div>
          {plan.requests[shown] ? (
            <div role="tabpanel" className="payload-body">
              <p className="payload-url">
                <code>
                  {plan.requests[shown].method} {plan.requests[shown].url}
                </code>
              </p>
              <pre>{JSON.stringify(plan.requests[shown].body, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function RecordView({ slug }: { slug: string }) {
  const store = useStore()
  const run = runs.find((r) => r.account.slug === slug) ?? runs[0]
  const st = store.get(run.account.slug)
  const done = st.phase === 'proposed' || st.phase === 'written'
  return (
    <div className="record-grid">
      <AccountList current={run.account.slug} />
      <div className="rec-main" key={run.account.slug}>
        <Head run={run} st={st} />
        <Fields run={run} st={st} />
        {done ? <Write run={run} st={st} /> : null}
      </div>
      <aside className="rec-log">
        <RunLog run={run} st={st} onSkip={() => store.skip(run.account.slug)} onEnrich={() => store.enrich(run.account.slug)} />
      </aside>
      <Tested />
    </div>
  )
}
