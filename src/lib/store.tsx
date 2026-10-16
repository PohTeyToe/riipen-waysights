// What a person did on the page: answers, rows they chose not to write, and approvals.
// It lives in this tab only and never changes the run's data. Nothing is sent anywhere.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Answers } from './record'

export type Review = { answers: Answers; dropped: ReadonlySet<string>; approved: boolean }

const blank: Review = { answers: {}, dropped: new Set(), approved: false }

type Store = {
  get: (slug: string) => Review
  answer: (slug: string, field: string, option: number | null) => void
  toggle: (slug: string, field: string) => void
  approve: (slug: string, on: boolean) => void
  /** Rule 4's tolerance for the what-if, as a share (0.02 is the recorded run). */
  near: number
  setNear: (n: number) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, initialNear }: { children: ReactNode; initialNear: number }) {
  const [state, setState] = useState<Record<string, Review>>({})
  const [near, setNear] = useState(initialNear)

  const edit = useCallback((slug: string, f: (r: Review) => Review) => {
    setState((s) => ({ ...s, [slug]: f(s[slug] ?? blank) }))
  }, [])

  const store = useMemo<Store>(
    () => ({
      get: (slug) => state[slug] ?? blank,
      answer: (slug, field, option) =>
        edit(slug, (r) => {
          const answers = { ...r.answers }
          if (option === null) delete answers[field]
          else answers[field] = option
          return { ...r, answers, approved: false }
        }),
      toggle: (slug, field) =>
        edit(slug, (r) => {
          const dropped = new Set(r.dropped)
          if (dropped.has(field)) dropped.delete(field)
          else dropped.add(field)
          return { ...r, dropped, approved: false }
        }),
      approve: (slug, on) => edit(slug, (r) => ({ ...r, approved: on })),
      near,
      setNear,
    }),
    [state, edit, near],
  )

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
