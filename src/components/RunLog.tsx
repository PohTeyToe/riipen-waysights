import { useEffect, useRef, type ReactNode } from 'react'
import type { Run, Step } from '../lib/data'
import { fmtBytes, fmtDate, fmtTime, prettyUrl } from '../lib/format'
import { realSpanMs, replayTimes } from '../lib/record'
import type { AccountState } from '../lib/store'

const TAG: Record<string, string> = {
  status: 'status',
  allowlist: 'allow',
  robots: 'robots',
  fetch: 'fetch',
  skip: 'skip',
  pdf: 'pdf',
  read: 'read',
  dataset: 'data',
  extract: 'model',
  check: 'check',
  reject: 'reject',
  question: 'ask',
  merge: 'merge',
  brief: 'brief',
  writeback: 'write',
  note: 'note',
  dedupe: 'dedupe',
  redirect: 'redirect',
}

/** A URL on the Account's own site shows as its path; anything else keeps its host. */
function where(url: string, home: string): string {
  const p = prettyUrl(url)
  return p.startsWith(`${home}/`) ? p.slice(home.length) : p
}

function Line({ s, home }: { s: Step; home: string }) {
  const bad = s.step === 'reject' || (s.step === 'fetch' && (s.status ?? 200) >= 400)
  let head: ReactNode = s.msg
  let detail = ''
  let clip = false
  if (s.step === 'fetch' && s.url) {
    clip = true
    head = (
      <>
        <span className={bad ? 'log-bad' : 'log-ok'}>{s.msg}</span> <span title={s.url}>{where(s.url, home) || '/'}</span>
      </>
    )
    detail = [
      s.bytes ? fmtBytes(s.bytes) : '',
      `${s.ms} ms`,
      s.waited_ms ? `waited ${(s.waited_ms / 1000).toFixed(1)} s` : '',
      s.why ?? '',
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (s.step === 'robots') {
    detail = `HTTP ${s.status} · ${s.delay_s} s between requests`
  } else if (s.step === 'status' && s.rate_rule) {
    detail = s.rate_rule
  } else if (s.step === 'redirect' && s.url) {
    detail = `${where(s.url, home)} to ${s.to ? where(s.to, home) : ''}`
  } else if ((s.step === 'skip' || s.step === 'note') && s.url) {
    detail = where(s.url, home)
  } else if (s.step === 'reject') {
    head = <span className="log-bad">{s.msg}</span>
  } else if (s.model) {
    detail = s.model
  }
  return (
    <li className={`log-line log-line--${s.step}`}>
      <time className="log-t" dateTime={s.t} title={s.t}>
        {fmtTime(s.t, false)}
      </time>
      <span className="log-tag">
        {TAG[s.step] ?? s.step}
        {s.page ? <span className="log-page"> {s.page}</span> : null}
      </span>
      <span className="log-msg">
        <span className={clip ? 'log-main log-clip' : 'log-main'}>{head}</span>
        {detail ? (
          <span className="log-detail log-clip" title={detail}>
            {detail}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export function RunLog({ run, st, onSkip, onEnrich }: { run: Run; st: AccountState; onSkip: () => void; onEnrich: () => void }) {
  const box = useRef<HTMLOListElement>(null)
  const steps = run.steps
  const shown = st.phase === 'idle' ? 0 : st.phase === 'running' ? st.shown : steps.length
  const speed = Math.round(realSpanMs(steps) / replayTimes(steps).at(-1)!)

  useEffect(() => {
    const el = box.current
    if (el && st.phase !== 'idle') el.scrollTop = el.scrollHeight
  }, [shown, st.phase])

  const pages = run.run.pages_read
  const skipped = steps.find((s) => s.step === 'skip' && /links pointed off/.test(s.msg))
  const offList = skipped ? Number(skipped.msg.match(/\d+/)?.[0] ?? 0) : 0

  return (
    <section className="log" aria-labelledby="log-h">
      <header className="log-head">
        <div>
          <h2 id="log-h">Run log</h2>
          <p className="log-sub">
            {st.phase === 'idle'
              ? `Replays the run from ${fmtDate(run.run.started_at)}, line by line`
              : `Replayed from a run on ${fmtDate(run.run.started_at)}, about ${speed}x speed`}
          </p>
        </div>
        {st.phase === 'running' ? (
          <button type="button" className="btn btn--quiet" onClick={onSkip}>
            Skip to result
          </button>
        ) : null}
      </header>
      {st.phase === 'idle' ? (
        <div className="log-empty">
          <p>
            Press <button type="button" className="linkish" onClick={onEnrich}>Enrich Account</button> to replay what the
            pipeline did for {run.account.name}: {steps.length} log lines, about 10 seconds, with a skip.
          </p>
          <p className="log-dim">Times are UTC. Every request, wait and refusal is in the log as it happened.</p>
        </div>
      ) : (
        <>
          {st.phase !== 'running' ? (
            <p className="log-summary">
              {pages} pages read · {run.run.requests_used} of {run.run.page_budget} requests · {offList} off-list links not
              followed · {run.rejected.length} {run.rejected.length === 1 ? 'value' : 'values'} rejected
            </p>
          ) : null}
          <ol className="log-lines" ref={box} aria-live={st.phase === 'running' ? 'off' : undefined} tabIndex={0} aria-label="Run log lines">
            {steps.slice(0, Math.max(shown, 1)).map((s, i) => (
              <Line key={i} s={s} home={prettyUrl(run.account.website)} />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
