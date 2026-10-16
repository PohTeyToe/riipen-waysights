// One Account's log, as the run wrote it, revealed up to the playhead.
import { useEffect, useRef } from 'react'
import { runBySlug, type Step } from '../lib/data'
import { fmtBytes, prettyUrl } from '../lib/format'
import { sourceIdFor, type Focus } from '../lib/marks'
import { laneBySlug } from '../lib/timeline'

const TAG: Record<string, string> = {
  status: 'status',
  allowlist: 'allow',
  robots: 'robots',
  fetch: 'fetch',
  redirect: 'redirect',
  skip: 'skip',
  pdf: 'pdf',
  read: 'read',
  dataset: 'data',
  extract: 'Claude',
  check: 'check',
  reject: 'refuse',
  question: 'ask',
  note: 'ask',
  dedupe: 'dedupe',
  brief: 'Claude',
  writeback: 'zoho',
  error: 'error',
}

function tone(s: Step): string {
  if (s.step === 'fetch' && s.status && s.status >= 400) return 'bad'
  if (s.step === 'extract' || (s.step === 'brief' && s.model)) return 'model'
  if (s.step === 'reject' || s.step === 'error') return 'bad'
  if (s.step === 'question' || s.step === 'note') return 'ask'
  if (s.step === 'dataset' || (s.url ?? '').includes('data.ny.gov')) return 'data'
  if (s.step === 'skip' || s.step === 'robots' || s.step === 'allowlist' || s.step === 'status') return 'dim'
  return 'plain'
}

function Line({ s }: { s: Step }) {
  if ((s.step === 'fetch' || s.step === 'redirect') && s.url) {
    const u = prettyUrl(s.url)
    const path = u.replace(/^[^/]+/, '') || '/'
    return (
      <>
        <span className="log-msg">
          <b>{s.status}</b> <span className="log-path">{decodeURIComponent(path)}</span>
        </span>
        <span className="log-sub">
          {s.step === 'redirect' && s.to ? `to ${prettyUrl(s.to)}` : null}
          {s.ms != null ? `${s.ms} ms` : null}
          {s.waited_ms ? ` · paused ${(s.waited_ms / 1000).toFixed(1)} s first` : null}
          {s.bytes ? ` · ${fmtBytes(s.bytes)}` : null}
          {s.page ? ` · page ${s.page}` : null}
        </span>
        {s.why ? <span className="log-why">{s.why}</span> : null}
      </>
    )
  }
  return <span className="log-msg">{s.msg}</span>
}

export function RunLog({
  slug,
  shown,
  playing,
  active,
  onOpen,
}: {
  slug: string
  shown: number
  playing: boolean
  active: number | null
  onOpen: (f: Focus) => void
}) {
  const run = runBySlug[slug]
  const lane = laneBySlug[slug]
  const box = useRef<HTMLOListElement>(null)
  const follow = useRef(true)
  const seen = useRef(shown)

  // As new lines arrive, keep the newest in view unless the reader scrolled up. Opening a
  // finished Account starts at the top.
  useEffect(() => {
    const el = box.current
    const grew = shown > seen.current
    seen.current = shown
    if (!el || active != null || !grew) return
    if (follow.current) el.scrollTop = el.scrollHeight
  }, [shown, active])

  useEffect(() => {
    if (playing) follow.current = true
  }, [playing])

  useEffect(() => {
    if (active == null) return
    const row = box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
    if (row && box.current) box.current.scrollTop = row.offsetTop - box.current.clientHeight / 3
  }, [active, slug])

  if (shown === 0)
    return (
      <p className="panel-empty">
        Nothing logged yet. {lane.start > 0 ? `This Account waits ${(lane.start / 1000).toFixed(1)} s for a free worker.` : 'Press Enrich Account or Play.'}
      </p>
    )

  return (
    <ol
      className="log"
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {run.steps.slice(0, shown).map((s, i) => {
        const block = lane.blocks.find((b) => b.i === i)
        const src = s.url ? sourceIdFor(run, s.url) : undefined
        const k = tone(s)
        const body = (
          <>
            <span className="log-t mono">+{((lane.times[i] - lane.start) / 1000).toFixed(1)}</span>
            <span className={`log-tag log-tag--${k}`}>{TAG[s.step] ?? s.step}</span>
            <span className="log-body">
              <Line s={s} />
              {block ? (
                <span className="log-sub">
                  {s.model} · {((block.to - block.from) / 1000).toFixed(1)} s{s.step === 'extract' ? ` · prompt of ${run.run.prompt_chars.toLocaleString('en-US')} characters, no tools, JSON schema` : ''}
                </span>
              ) : null}
            </span>
          </>
        )
        return (
          <li key={i} data-i={i} className={`log-row log-row--${k}${active === i ? ' is-active' : ''}`}>
            {src && s.status === 200 ? (
              <button type="button" className="log-btn" onClick={() => onOpen({ source: src })} aria-label={`Open the saved text of ${prettyUrl(s.url!)}`}>
                {body}
              </button>
            ) : (
              <div className="log-btn">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
