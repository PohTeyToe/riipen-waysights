import { useEffect, useState } from 'react'
import { HERO, runBySlug, runs, shortName, wholeRoadKm } from '../lib/data'
import { fmtKm } from '../lib/format'
import { Link } from '../lib/router'

type State = 'working' | 'draft' | 'none'

// The Riipen brief, item by item (paraphrased from the project page, so no quote marks).
const ITEMS: { item: string; now: string; when: string; state: State }[] = [
  { item: 'Custom button and Deluge workflow', now: 'Draft, never run', when: 'Weeks 1-2, in your sandbox', state: 'draft' },
  { item: 'Rate limit and status logic', now: 'Working in the service', when: 'Week 2', state: 'working' },
  { item: 'Crawl approved municipal sites', now: 'Working, on a list I chose', when: 'Week 1, with your list', state: 'working' },
  { item: 'Extract contacts and documents', now: 'Working on 6 Accounts', when: 'Weeks 2-3, wider', state: 'working' },
  { item: 'Summarize with company context', now: '', when: 'Week 3', state: 'working' },
  { item: 'Write back to Account and Contact', now: 'Payload built, never sent', when: 'Weeks 3-4', state: 'draft' },
  { item: 'Duplicate handling', now: 'Working on sample rows', when: 'Week 4, your rules', state: 'working' },
  { item: 'Validation', now: 'Working', when: 'Ongoing', state: 'working' },
  { item: 'Logging', now: 'Run log per Account', when: 'Week 5', state: 'working' },
  { item: 'Monitoring', now: 'Not started', when: 'Weeks 5-6', state: 'none' },
  { item: 'Tests', now: 'Working, on saved pages', when: 'Ongoing', state: 'working' },
]

// A brief only when the pages say something about the town's signs; otherwise it would repeat the fields.
const briefs = runs.filter((r) => r.brief.sentences.length).length
const items = ITEMS.map((x) => (x.item.startsWith('Summarize') ? { ...x, now: `Working on ${briefs} of ${runs.length}` } : x))

const SPLIT: [string, string][] = [
  ['Me', 'The service and its contract with Zoho: what the button sends, the checks, the write-back.'],
  ['Seat 2', 'The Zoho side: button, Deluge function, fields, layout, Notes.'],
  ['Seat 3', 'The test set and monitoring: about 30 municipalities, run on every change.'],
]

export function Plan() {
  const { owned, within } = wholeRoadKm(runBySlug[HERO])
  const plan = runBySlug.lincoln.validated.road_length_km.options[0]?.parts ?? []
  const pelham = runBySlug.pelham.validated.road_length_km.options[0]

  // The page renders after load, so :target never matches; mark the question the link points at.
  const [target, setTarget] = useState('')
  useEffect(() => {
    const id = window.location.hash.slice(1)
    setTarget(id)
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  // Policy questions first: one answer each settles every Account like it.
  const questions: { q: string; see?: { slug: string; label: string } }[] = [
    {
      q: `Your FAQ prices on "the total centerline length of roads within your jurisdiction." For a county, is that the ${fmtKm(owned)} km ${shortName[HERO]} owns, or the ${fmtKm(within)} km of every road inside it?`,
      see: { slug: HERO, label: shortName[HERO] },
    },
    {
      q: `Do plain km in an Ontario asset management plan count as centerline? Lincoln's plan prints ${plan.map((p) => `${p.value} km of ${p.road_type}`).join(' and ')}, Pelham's ${fmtKm(pelham?.km ?? 0)} km. Neither says which.`,
      see: { slug: 'lincoln', label: 'Lincoln' },
    },
    { q: 'Which sites count as approved? Are asset management plans, council agendas and budgets in?' },
    { q: 'Which Account and Contact fields matter, and how do you spot a duplicate today?' },
    { q: 'Which Zoho CRM edition do you run, and where should the service live?' },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <h1>Plan</h1>
        <p className="hint">A starting point for a first call.</p>
      </header>

      <section aria-labelledby="q-h">
        <h2 id="q-h" className="sec-title">
          Questions for you
        </h2>
        <ol className="questions">
          {questions.map((x, i) => (
            <li key={i} id={`q${i + 1}`} className={target === `q${i + 1}` ? 'is-target' : undefined}>
              <span className="q-n">{i + 1}</span>
              <p>
                {x.q}{' '}
                {x.see ? (
                  <Link to={`/demo?account=${x.see.slug}`} className="q-see">
                    See {x.see.label}
                  </Link>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="sec-title">
          Your brief, item by item
        </h2>
        <div className="table-box">
          <table className="items">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Now</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.item}>
                  <th scope="row">{x.item}</th>
                  <td>
                    <span className={`state state--${x.state}`}>{x.now}</span>
                  </td>
                  <td>{x.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="split-h">
        <h2 id="split-h" className="sec-title">
          One way to split three seats
        </h2>
        <dl className="split">
          {SPLIT.map(([who, what]) => (
            <div key={who}>
              <dt>{who}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
