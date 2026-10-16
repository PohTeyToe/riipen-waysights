// The recorded run, drawn on one time axis: one lane per Account, every request, model call,
// check and question at the moment the run logged it. A per-frame clock moves the playhead and
// the lit edge through the DOM; React only re-renders when a lane gains a step.
import { Fragment, memo, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { meta, scorecard, shortName } from '../lib/data'
import { fmtBytes, fmtDate, prettyUrl } from '../lib/format'
import { player, useReplay } from '../lib/player'
import type { Rescore } from '../lib/rule4'
import { clock, lanes, laneNow, SPAN, totalsAt, type Lane } from '../lib/timeline'
import { Glyph, OUTCOME } from './Glyph'
import { How } from './How'

const SPEEDS = [1, 10, 30]
const AXIS = [0, 20_000, 40_000, 60_000, 80_000, 100_000]
export const KEY_FIELDS = ['road_length_km', 'roads_head_name', 'roads_head_title', 'email', 'phone', 'key_document'] as const
export const KEY_LABEL: Record<string, string> = {
  road_length_km: 'Road km',
  roads_head_name: 'Head name',
  roads_head_title: 'Head title',
  email: 'Email',
  phone: 'Phone',
  key_document: 'Key doc',
}

const pct = (ms: number) => `${(Math.max(0, ms) / SPAN) * 100}%`
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** Marks logged at the same moment sit side by side instead of on top of each other. */
function groupMarks(lane: Lane) {
  const out: { at: number; i: number; kind: 'check' | 'ask' | 'merge'; n: number; slot: number }[] = []
  for (const m of lane.marks) {
    if (m.kind === 'reject' || m.kind === 'write') continue
    // Marks at the same moment sit side by side.
    const s = lane.run.steps[m.i]
    const kind = m.kind === 'check' ? 'check' : m.kind === 'merge' ? 'merge' : 'ask'
    const slot = out.filter((o) => Math.abs(o.at - m.at) < 1500).length
    out.push({ at: m.at, i: m.i, kind, n: m.kind === 'check' ? (s.rejected ?? 0) : 1, slot })
  }
  return out
}

/** Everything a lane logged, drawn once. The board shows it twice: dim for the whole recording, lit up to the playhead. */
const Ink = memo(function Ink({ lane }: { lane: Lane }) {
  const marks = useMemo(() => groupMarks(lane), [lane])
  return (
    <>
      {lane.start > 0 ? <span className="ink-queue" style={{ width: pct(lane.start) }} /> : null}
      <span className="ink-base" style={{ left: pct(lane.start), width: pct(lane.end - lane.start) }} />
      {lane.start > 0 ? (
        <span className="ink-queue-l mono" style={{ width: pct(lane.start) }}>
          waits for a free worker
        </span>
      ) : null}
      {lane.ticks.map((k) => (
        <Fragment key={k.i}>
          {k.wait > 0 ? <span className="ink-wait" style={{ left: pct(k.at - k.ms - k.wait), width: pct(k.wait) }} /> : null}
          <span className={`ink-req ink-req--${k.kind}`} style={{ left: pct(k.at - k.ms), width: pct(k.ms) }} />
        </Fragment>
      ))}
      {lane.blocks.map((b) => (
        <span key={b.i} className={`ink-model ink-model--${b.kind}`} style={{ left: pct(b.from), width: pct(b.to - b.from) }}>
          <span className="ink-model-l">
            {b.kind === 'extract' ? 'Claude reads' : 'Claude brief'} <b>{secs(b.to - b.from)}</b>
          </span>
        </span>
      ))}
      {marks.map((m) => (
        <span key={m.i} className={`ink-mark ink-mark--${m.kind}`} style={{ left: pct(m.at), ['--slot' as string]: m.slot }}>
          {m.kind === 'check' ? (
            m.n > 0 ? (
              <span className="oct">
                <Glyph kind="rejected" size={16} />
                <b>{m.n}</b>
              </span>
            ) : (
              <Glyph kind="filled" size={13} />
            )
          ) : m.kind === 'merge' ? (
            <Glyph kind="merge" size={13} />
          ) : (
            <Glyph kind="person" size={15} />
          )}
        </span>
      ))}
    </>
  )
})

/** A few words on what a lane is doing right now. */
function phaseLabel(lane: Lane, shown: number, t: number, started: boolean): { text: string; tone: string } {
  const now = laneNow(lane, shown, t)
  if (now.phase === 'waiting') return started ? { text: 'queued', tone: 'wait' } : { text: 'not run', tone: 'wait' }
  if (now.phase === 'done') return { text: 'done', tone: 'done' }
  if (now.phase === 'needs_review') return { text: 'needs review', tone: 'ask' }
  if (now.phase === 'model') {
    const b = lane.blocks.find((x) => x.from <= t && t < x.to)
    return { text: b?.kind === 'brief' ? 'Claude: brief' : 'Claude: reading', tone: 'run' }
  }
  if (now.phase === 'checking' || now.phase === 'writing') return { text: 'checking', tone: 'run' }
  if (now.doing === 'State road data') return { text: 'state road data', tone: 'run' }
  return { text: `reading ${now.pages}/${lane.run.run.page_budget}`, tone: 'run' }
}

type Tip = { x: number; y: number; lane: Lane; i: number }

function nearestStep(lane: Lane, at: number, upTo: number, within: number): number | null {
  let best: number | null = null
  let gap = within
  lane.run.steps.forEach((s, i) => {
    const tm = lane.times[i]
    if (tm > upTo || s.step === 'status' || s.step === 'allowlist') return
    const d = Math.abs(tm - at)
    if (d < gap) {
      gap = d
      best = i
    }
  })
  return best
}

function TipCard({ tip }: { tip: Tip }) {
  const s = tip.lane.run.steps[tip.i]
  const at = secs(tip.lane.times[tip.i] - tip.lane.start)
  const block = tip.lane.blocks.find((b) => b.i === tip.i)
  return (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      <p className="tip-h">
        <span>{tip.lane.run.account.name}</span>
        <span className="mono">+{at}</span>
      </p>
      {s.url && (s.step === 'fetch' || s.step === 'robots' || s.step === 'redirect') ? (
        <>
          <p className="tip-main mono">
            <b className={s.status && s.status >= 400 ? 'bad' : undefined}>{s.status}</b> {prettyUrl(s.url).replace(/^[^/]+/, '') || '/'}
          </p>
          <p className="tip-sub mono">
            {prettyUrl(s.url).split('/')[0]}
            {s.ms != null ? ` · ${s.ms} ms` : ''}
            {s.waited_ms ? ` · paused ${secs(s.waited_ms)} first` : ''}
            {s.bytes ? ` · ${fmtBytes(s.bytes)}` : ''}
          </p>
          {s.why ? <p className="tip-why">{s.why}</p> : null}
        </>
      ) : (
        <>
          <p className="tip-main">{s.msg}</p>
          {block ? <p className="tip-sub mono">{s.model} · {secs(block.to - block.from)}</p> : null}
        </>
      )}
    </div>
  )
}

function LaneRow({
  lane,
  shown,
  t,
  started,
  selected,
  score,
  onSelect,
  onStep,
  onTip,
}: {
  lane: Lane
  shown: number
  t: number
  started: boolean
  selected: boolean
  score: Rescore
  onSelect: (slug: string) => void
  onStep: (slug: string, i: number) => void
  onTip: (tip: Tip | null) => void
}) {
  const phase = phaseLabel(lane, shown, t, started)
  const done = shown >= lane.times.length
  const cells = KEY_FIELDS.map((f) => score.rows.find((r) => r.account === lane.slug && r.field === f)!)
  const changed = score.changed.includes(lane.slug)

  const timeAt = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { ms: ((e.clientX - r.left) / r.width) * SPAN, perPx: SPAN / r.width, r }
  }

  return (
    <div className={`lane${selected ? ' is-sel' : ''}`} data-tone={phase.tone}>
      <button type="button" className="lane-name" aria-pressed={selected} onClick={() => onSelect(lane.slug)}>
        <span className="lane-n">
          <span className="ln-full">{lane.run.account.name}</span>
          <span className="ln-short">{shortName[lane.slug]}</span>
        </span>
        <span className="lane-meta">
          <span className="lane-j">{lane.run.account.jurisdiction}</span>
          <span className={`lane-ph lane-ph--${phase.tone}`}>{phase.text}</span>
        </span>
      </button>
      <div
        className="track"
        aria-hidden="true"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const { ms, perPx, r } = timeAt(e)
          const i = nearestStep(lane, ms, player.t, perPx * 14)
          const board = e.currentTarget.closest('.gantt')!.getBoundingClientRect()
          // Keep the card inside the board at both ends.
          const x = Math.min(Math.max(e.clientX - board.left, 175), board.width - 175)
          onTip(i == null ? null : { x, y: r.bottom - board.top + 6, lane, i })
        }}
        onPointerLeave={() => onTip(null)}
        onClick={(e) => {
          const { ms, perPx } = timeAt(e)
          const i = nearestStep(lane, ms, player.t, perPx * 14)
          if (i != null) onStep(lane.slug, i)
          else onSelect(lane.slug)
        }}
      >
        <div className="ink ink--ghost">
          <Ink lane={lane} />
        </div>
        <div className="ink ink--lit">
          <Ink lane={lane} />
        </div>
      </div>
      <div className={`lane-key${done ? ' is-done' : ''}${changed ? ' is-changed' : ''}`} aria-label={done ? `${lane.run.account.name} against the answer key` : undefined}>
        {cells.map((c) => (
          <span key={c.field} className={`key-cell key-cell--${c.outcome}`} title={done ? `${KEY_LABEL[c.field]}: ${OUTCOME[c.outcome].word}` : undefined}>
            {done ? <Glyph kind={OUTCOME[c.outcome].glyph} size={11} /> : null}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Board({
  selected,
  score,
  onSelect,
  onStep,
}: {
  selected: string
  score: Rescore
  onSelect: (slug: string) => void
  onStep: (slug: string, i: number) => void
}) {
  const { shown, t, playing, speed } = useReplay()
  const root = useRef<HTMLElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const scrub = useRef<HTMLInputElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const started = playing || t > 0

  // Per frame: the playhead, the lit edge and the clock, straight into the DOM.
  useEffect(
    () =>
      player.onFrame((now) => {
        root.current?.style.setProperty('--p', String(now / SPAN))
        if (clockRef.current) clockRef.current.textContent = clock(now)
        if (scrub.current && document.activeElement !== scrub.current) scrub.current.value = String(Math.round(now))
      }),
    [],
  )

  // Space plays and pauses, unless the reader is in a control that uses Space itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.altKey || e.ctrlKey || e.metaKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, button, a, [role="tab"], [contenteditable="true"]')) return
      e.preventDefault()
      if (player.playing) player.pause()
      else player.play()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const totals = totalsAt(shown, t)
  const readouts: [string, number | string, string?][] = [
    ['Accounts done', totals.done, `/${lanes.length}`],
    ['Pages read', totals.pages],
    ['HTTP requests', totals.requests],
    ['Claude calls', totals.modelCalls],
    ['Refused by checks', totals.rejected],
    ['Sent to a person', totals.asks],
  ]

  return (
    <section className="board" ref={root} aria-labelledby="board-h">
      <div className="board-in">
        <div className="board-bar">
          <div className="board-title">
            <h1 id="board-h">Recorded run, {fmtDate(meta.run_date)}</h1>
            <p className="board-sub mono">6 municipalities · 3 workers · {meta.model}</p>
          </div>
          <div className="transport" role="group" aria-label="Replay">
            <button
              type="button"
              className={`tbtn tbtn--play${playing ? ' is-on' : ''}`}
              onClick={() => (playing ? player.pause() : player.play())}
              aria-label={playing ? 'Pause' : 'Play'}
              aria-keyshortcuts="Space"
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
            >
              {playing ? (
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2.5 1.5h2.4v9H2.5zM7.1 1.5h2.4v9H7.1z" />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M3 1.3 10.6 6 3 10.7Z" />
                </svg>
              )}
              <span>{playing ? 'Pause' : t >= SPAN ? 'Replay' : 'Play'}</span>
            </button>
            <button type="button" className="tbtn" onClick={() => player.play(0)} aria-label="Restart from the beginning">
              <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
                <path d="M3.2 4.6A5 5 0 1 1 2 7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M1.6 1.8v3.4H5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="speeds" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className="speed" aria-pressed={speed === s} onClick={() => player.setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <span className="clock mono" aria-hidden="true">
              <span ref={clockRef}>{clock(t)}</span>
              <span className="clock-of"> / {clock(SPAN)}</span>
            </span>
          </div>
          <How />
        </div>

        <dl className="readouts">
          {readouts.map(([label, n, of]) => (
            <div key={label} className="readout">
              <dt>{label}</dt>
              <dd className="mono">
                {n}
                {of ? <span className="of">{of}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        <div className="gantt" onPointerLeave={() => setTip(null)}>
          <div className="axis">
            <span className="axis-h">Account</span>
            <div className="axis-track">
              {AXIS.map((a) => (
                <span key={a} className="axis-t mono" style={{ left: pct(a) }}>
                  {clock(a)}
                </span>
              ))}
              <input
                ref={scrub}
                className="scrub"
                type="range"
                min={0}
                max={SPAN}
                step={100}
                defaultValue={0}
                aria-label="Run time"
                aria-valuetext={`${clock(t)} of ${clock(SPAN)}`}
                onInput={(e) => {
                  player.pause()
                  player.seek(Number(e.currentTarget.value))
                }}
              />
            </div>
            <span className="axis-h axis-h--key">vs answer key</span>
          </div>
          {lanes.map((lane, i) => (
            <LaneRow
              key={lane.slug}
              lane={lane}
              shown={shown[i]}
              t={t}
              started={started}
              selected={lane.slug === selected}
              score={score}
              onSelect={onSelect}
              onStep={onStep}
              onTip={setTip}
            />
          ))}
          {tip ? <TipCard tip={tip} /> : null}
        </div>

        <div className="board-foot">
          <ul className="legend" aria-label="Legend">
            <li>
              <span className="lg lg-req" /> request
            </li>
            <li>
              <span className="lg lg-wait" /> 2 s pause per site
            </li>
            <li>
              <span className="lg lg-data" /> state road data
            </li>
            <li>
              <span className="lg lg-model" /> Claude call
            </li>
            <li>
              <Glyph kind="rejected" size={12} /> refused
            </li>
            <li>
              <Glyph kind="person" size={12} /> asks a person
            </li>
            <li>
              <Glyph kind="merge" size={11} /> merge
            </li>
          </ul>
          <p className="hint hint--night">Click a lane or mark to inspect it</p>
        </div>
        <p className="sr-only" aria-live="polite">
          {totals.done === lanes.length && !playing ? `Run finished: ${scorecard.total} fields scored.` : ''}
        </p>
      </div>
    </section>
  )
}
