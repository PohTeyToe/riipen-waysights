import { useEffect } from 'react'
import { fmtKm } from '../lib/format'
import { runBySlug } from '../lib/data'
import { Link } from '../lib/router'

// The Riipen brief, item by item (paraphrased from the project page, so no quote marks).
const ITEMS: { item: string; here: string; when: string; state: 'working' | 'draft' | 'none' }[] = [
  { item: 'Custom button and Deluge workflow', here: 'Draft, never run', when: 'Weeks 1-2 in your sandbox', state: 'draft' },
  { item: 'Rate limit and status logic', here: 'Working in the service', when: 'Week 2', state: 'working' },
  { item: 'Crawl approved municipal sites', here: 'Working, on a list I chose', when: 'Week 1 with your list', state: 'working' },
  { item: 'Extract contacts and documents', here: 'Working on 6 Accounts', when: 'Weeks 2-3, wider', state: 'working' },
  { item: 'Summarize with company context', here: 'Working, from your public pages only', when: 'Week 3', state: 'working' },
  { item: 'Write back to Account and Contact', here: 'Payload built, never sent', when: 'Weeks 3-4', state: 'draft' },
  { item: 'Duplicate handling', here: 'Working on sample rows', when: 'Week 4, your rules', state: 'working' },
  { item: 'Validation', here: 'Working', when: 'Ongoing', state: 'working' },
  { item: 'Logging', here: 'Run log per Account', when: 'Week 5', state: 'working' },
  { item: 'Monitoring', here: 'Not started', when: 'Weeks 5-6', state: 'none' },
  { item: 'Tests', here: 'Working, on saved pages', when: 'Ongoing', state: 'working' },
]

const WEEKS: { when: string; what: string; now?: boolean }[] = [
  {
    when: 'Weeks 1-2',
    what: 'Agree on fields and approved sites, get sandbox access, and get the button to service to status round trip working in the sandbox. This demo is roughly the service half.',
    now: true,
  },
  { when: 'Weeks 3-4', what: 'Write-back with your duplicate rules. Questions land as Notes on the Account.' },
  { when: 'Weeks 5-6', what: 'Logs and monitoring, about 30 municipalities, tests on every change.' },
  {
    when: 'Weeks 7-8',
    what: 'Hardening, docs, handoff. A batch run over a list, for example the Ontario Directory of Institutions as a starting list of every Ontario municipality.',
  },
]

export function PlanTab() {
  const s = runBySlug.saratoga.validated.road_length_km
  const owned = Math.round(s.value_km ?? 0)
  const within = Math.round(s.within_km ?? 0)
  const plainKm = (slug: string) => fmtKm(runBySlug[slug].validated.road_length_km.options[0]?.km ?? 0)

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  // Policy questions: one answer each settles every Account like it, instead of one question per Account.
  const questions: { q: string; see?: { slug: string; label: string } }[] = [
    {
      q: `Do you quote on the roads a county owns, or every road inside it? For Saratoga County that's ${fmtKm(owned)} km or ${fmtKm(within)} km.`,
      see: { slug: 'saratoga', label: 'See both numbers on Saratoga County' },
    },
    {
      q: `Do plain km in an Ontario asset management plan count as centerline for your pricing? Lincoln's plan prints ${plainKm('lincoln')} km and Pelham's ${plainKm('pelham')} km, and neither says centerline or lane.`,
      see: { slug: 'lincoln', label: 'See it on Lincoln' },
    },
    { q: 'Which sites count as approved? Are asset management plans, council agendas and budgets in or out?' },
    { q: 'Which Account and Contact fields matter, and how do you spot a duplicate today?' },
    { q: 'Which Zoho CRM edition do you run, and where should the outside service live?' },
  ]

  return (
    <div className="doc-page">
      <header className="doc-head">
        <h1>What I'd own, and one way to split the rest</h1>
        <p>
          A starting point for our first call, not a decision. Up to three of us could be on this, each with our own Riipen
          seat, so this is how the work could split without anyone waiting on anyone.
        </p>
      </header>

      <dl className="split">
        <div>
          <dt>The part I'd own</dt>
          <dd>
            The service and its contract with Zoho. That covers what the button sends, what comes back, the checks in between,
            and the write-back.
          </dd>
        </div>
        <div>
          <dt>One way to split the rest</dt>
          <dd>
            <ol>
              <li>The Zoho side: button, Deluge function, fields, layout, Notes.</li>
              <li>The test set and monitoring: grow the answer key to about 30 municipalities, run it on every change, alert on failures.</li>
            </ol>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="weeks-h">
        <h2 id="weeks-h" className="doc-h2">
          Eight weeks
        </h2>
        <ol className="weeks">
          {WEEKS.map((w) => (
            <li key={w.when} className={w.now ? 'weeks-now' : undefined}>
              <p className="weeks-when">
                {w.when}
                {w.now ? <span className="tag">this demo</span> : null}
              </p>
              <p className="weeks-what">{w.what}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="doc-h2">
          Your brief, item by item
        </h2>
        <div className="table-scroll">
          <table className="items">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Here</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((x) => (
                <tr key={x.item}>
                  <th scope="row">{x.item}</th>
                  <td className={`items-here items-here--${x.state}`}>{x.here}</td>
                  <td>{x.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="q-h" className="questions">
        <h2 id="q-h" className="doc-h2">
          Five questions for you
        </h2>
        <ol>
          {questions.map((x, i) => (
            <li key={i} id={`q${i + 1}`}>
              <span>
                {x.q}
                {x.see ? (
                  <Link to={`/demo?account=${x.see.slug}`} className="q-see">
                    {x.see.label}
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
