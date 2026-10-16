import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { Inspector, type ITab } from '../components/Inspector'
import { Record } from '../components/Record'
import { Score } from '../components/Score'
import { meta, REPO } from '../lib/data'
import type { Focus } from '../lib/marks'
import { useMedia } from '../lib/media'
import { player, prefersReducedMotion, useReplay } from '../lib/player'
import { Link, navigate } from '../lib/router'
import { rescore } from '../lib/rule4'
import { useStore } from '../lib/store'
import { laneBySlug, lanes } from '../lib/timeline'

let started = false

const smooth = () => (prefersReducedMotion() ? 'auto' : 'smooth') as ScrollBehavior

/** The run board on top; the selected Account's record and inspector under it; the scorecard last. */
export function Run({ account, autoplay }: { account: string; autoplay: boolean }) {
  const store = useStore()
  const { shown, t, playing } = useReplay()
  const wide = useMedia('(min-width: 1100px)')
  const [tab, setTab] = useState<ITab>('log')
  const [focus, setFocus] = useState<Focus | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const score = useMemo(() => rescore(store.near), [store.near])
  const desk = useRef<HTMLDivElement>(null)
  const inspector = useRef<HTMLDivElement>(null)
  const i = lanes.findIndex((l) => l.slug === account)

  // The first visit plays the whole run. A link to one Account waits for its Enrich Account press.
  useEffect(() => {
    if (started) return
    started = true
    if (prefersReducedMotion()) player.finish()
    else if (autoplay) player.play(0)
  }, [autoplay])

  // A new Account starts with nothing open, unless a mark on its lane picked the step to show.
  const pending = useRef<number | null>(null)
  useEffect(() => {
    setFocus(null)
    setActive(pending.current)
    pending.current = null
  }, [account])

  // The handlers keep their identity while the replay plays, so the lanes, the record, the
  // inspector and the scorecard re-render only for their own changes, not on every step.
  const select = useCallback(
    (slug: string, scroll = !wide) => {
      if (slug !== account) navigate(`/demo?account=${slug}`, { keepScroll: true, replace: true })
      if (scroll) desk.current?.scrollIntoView({ behavior: smooth(), block: 'start' })
    },
    [account, wide],
  )

  const open = useCallback(
    (f: Focus) => {
      setFocus(f)
      setTab('source')
      if (!wide) inspector.current?.scrollIntoView({ behavior: smooth(), block: 'start' })
    },
    [wide],
  )

  const onStep = useCallback(
    (slug: string, step: number) => {
      if (slug !== account) pending.current = step
      else setActive(step)
      select(slug)
      setTab('log')
    },
    [account, select],
  )

  const { approve } = store
  const onEnrich = useCallback(() => {
    const l = laneBySlug[account]
    // A new run needs a new approval.
    approve(account, false)
    setActive(null)
    setTab('log')
    player.play(Math.max(0, l.start - 300), l.end + 200)
  }, [account, approve])

  const onZoho = useCallback(() => {
    setTab('zoho')
    if (!wide) inspector.current?.scrollIntoView({ behavior: smooth(), block: 'start' })
  }, [wide])

  const pickTab = useCallback((x: ITab) => {
    setTab(x)
    if (x !== 'log') setActive(null)
  }, [])

  const onPick = useCallback(
    (slug: string) => {
      select(slug, false)
      desk.current?.scrollIntoView({ behavior: smooth(), block: 'start' })
    },
    [select],
  )

  return (
    <>
      <Board selected={account} score={score} onSelect={select} onStep={onStep} />
      <div className="desk" ref={desk}>
        <Record
          slug={account}
          shown={shown[i]}
          started={playing || t > 0}
          playing={playing}
          focus={focus}
          onOpen={open}
          onEnrich={onEnrich}
          onZoho={onZoho}
        />
        <div className="desk-side" ref={inspector}>
          <Inspector slug={account} shown={shown[i]} playing={playing} tab={tab} setTab={pickTab} focus={focus} active={active} onOpen={open} />
        </div>
      </div>
      <Score score={score} onPick={onPick} />
      <footer className="foot">
        <p className="mono">
          Pipeline commit {meta.pipeline_commit.slice(0, 7)} · {meta.tests.passed} pipeline tests pass offline · nothing on this page calls a model
        </p>
        <nav aria-label="More">
          <Link to="/demo/zoho">Zoho side</Link>
          <Link to="/demo/plan">Plan</Link>
          <a href={REPO} target="_blank" rel="noreferrer">
            Code
          </a>
        </nav>
      </footer>
    </>
  )
}
