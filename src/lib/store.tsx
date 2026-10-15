// Page state: which Accounts have been replayed, how far, and the answers given on this page.
// All of it lives in this tab only. Nothing is sent anywhere.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { runBySlug } from './data'
import { replayTimes, type Answers } from './record'

export type Phase = 'idle' | 'running' | 'proposed' | 'written'
export type AccountState = { phase: Phase; shown: number; answers: Answers; blocked: boolean }

type State = Record<string, AccountState>
type Action =
  | { type: 'start'; slug: string }
  | { type: 'line'; slug: string; shown: number }
  | { type: 'finish'; slug: string }
  | { type: 'answer'; slug: string; field: string; option: number | null }
  | { type: 'write'; slug: string }
  | { type: 'blocked'; slug: string; on: boolean }
  | { type: 'reset'; slug: string }

const blank: AccountState = { phase: 'idle', shown: 0, answers: {}, blocked: false }

function reducer(state: State, a: Action): State {
  const cur = state[a.slug] ?? blank
  const lines = runBySlug[a.slug].steps.length
  switch (a.type) {
    case 'start':
      return { ...state, [a.slug]: { ...cur, phase: 'running', shown: 0, blocked: false } }
    case 'line':
      return { ...state, [a.slug]: { ...cur, shown: a.shown } }
    case 'finish':
      return { ...state, [a.slug]: { ...cur, phase: cur.phase === 'written' ? 'written' : 'proposed', shown: lines } }
    case 'answer': {
      const answers = { ...cur.answers }
      if (a.option === null) delete answers[a.field]
      else answers[a.field] = a.option
      return { ...state, [a.slug]: { ...cur, answers } }
    }
    case 'write':
      return { ...state, [a.slug]: { ...cur, phase: 'written' } }
    case 'blocked':
      return { ...state, [a.slug]: { ...cur, blocked: a.on } }
    case 'reset':
      return { ...state, [a.slug]: blank }
  }
}

type Store = {
  get: (slug: string) => AccountState
  enrich: (slug: string) => void
  skip: (slug: string) => void
  answer: (slug: string, field: string, option: number | null) => void
  write: (slug: string) => void
  reset: (slug: string) => void
}

const Ctx = createContext<Store | null>(null)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {})
  const timers = useRef(new Map<string, number[]>())

  const clear = useCallback((slug: string) => {
    timers.current.get(slug)?.forEach((t) => window.clearTimeout(t))
    timers.current.delete(slug)
  }, [])

  useEffect(() => () => timers.current.forEach((ts) => ts.forEach((t) => window.clearTimeout(t))), [])

  const enrich = useCallback(
    (slug: string) => {
      const cur = state[slug] ?? blank
      if (cur.phase === 'running') return
      // The rate rule, as the button's function enforces it: one run per Account per day.
      if (cur.phase !== 'idle') {
        dispatch({ type: 'blocked', slug, on: true })
        return
      }
      const steps = runBySlug[slug].steps
      dispatch({ type: 'start', slug })
      if (prefersReducedMotion()) {
        dispatch({ type: 'finish', slug })
        return
      }
      const at = replayTimes(steps)
      const ids = at.map((ms, i) =>
        window.setTimeout(() => {
          if (i === steps.length - 1) dispatch({ type: 'finish', slug })
          else dispatch({ type: 'line', slug, shown: i + 1 })
        }, ms),
      )
      timers.current.set(slug, ids)
    },
    [state],
  )

  const skip = useCallback(
    (slug: string) => {
      clear(slug)
      dispatch({ type: 'finish', slug })
    },
    [clear],
  )

  const reset = useCallback(
    (slug: string) => {
      clear(slug)
      dispatch({ type: 'reset', slug })
    },
    [clear],
  )

  const store = useMemo<Store>(
    () => ({
      get: (slug) => state[slug] ?? blank,
      enrich,
      skip,
      answer: (slug, field, option) => dispatch({ type: 'answer', slug, field, option }),
      write: (slug) => dispatch({ type: 'write', slug }),
      reset,
    }),
    [state, enrich, skip, reset],
  )

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
