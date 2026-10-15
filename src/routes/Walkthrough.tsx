import type { ReactNode } from 'react'
import { DATASET_PAGE, HERO, meta, REPO, runBySlug, shortName, type Cite } from '../lib/data'
import { fmtDate, fmtKm, fmtMi, prettyUrl } from '../lib/format'
import { shownRows } from '../lib/record'
import { Link } from '../lib/router'
import { Chip, Dot } from '../components/Status'
import { Honesty, Owner } from '../components/Honesty'

function Before({ children }: { children: ReactNode }) {
  return (
    <p className="ba-diff">
      <span className="nil">empty</span>
      <span className="diff-arrow" aria-label="becomes">
        →
      </span>
      {children}
    </p>
  )
}

/** The county the run fills end to end, as the run left it. */
function HeroCard() {
  const run = runBySlug[HERO]
  const rows = shownRows(run, {})
  const row = (f: string) => rows.find((r) => r.field === f)!
  const [road, head, email, phone, brief] = ['road_length_km', 'roads_head', 'email', 'phone', 'brief'].map(row)
  const owned = run.validated.road_length_km.options[0]
  const data = owned.parts[0].cite
  const own = owned.agrees?.[0]
  const page = (head.sources[0] as Cite | undefined) ?? (email.sources[0] as Cite)
  const pct = own ? (Math.abs(own.km - owned.km) / owned.km) * 100 : 0

  return (
    <article className="card" aria-labelledby="card-h">
      <header className="card-head">
        <h2 id="card-h">{run.account.name}, before and after</h2>
        <p>One press of Enrich Account. Every value comes from the county's own Highway Department page or the state's road data, with the line it came from.</p>
      </header>

      <dl className="ba">
        <div className="ba-row ba-row--road">
          <dt>
            Road network (centerline km) <Chip kind={road.shown} />
          </dt>
          <dd>
            <Before>
              <strong>{fmtKm(owned.km)} km</strong>
            </Before>
            <p className="ba-quote">
              {fmtMi(data.sum_mi ?? 0)} mi of county-owned centerline roads, summed over the county's {data.rows} rows
              <a className="ba-src" href={DATASET_PAGE} target="_blank" rel="noreferrer">
                NYSDOT Highway Mileage, {data.year} (data.ny.gov)
              </a>
            </p>
            {own ? (
              <p className="ba-quote">
                Its own page: <q>{own.cite.quote}</q> The same roads, {pct.toFixed(1)}% apart, so the run doesn't ask.
                <a className="ba-src" href={own.cite.url} target="_blank" rel="noreferrer">
                  {prettyUrl(own.cite.url)}
                </a>
              </p>
            ) : null}
          </dd>
        </div>

        <div className="ba-row">
          <dt>
            Account brief <Chip kind={brief.shown} />
          </dt>
          <dd>
            <Before>
              <span>{run.brief.sentences[0]?.text}</span>
            </Before>
          </dd>
        </div>

        <div className="ba-row">
          <dt>
            Roads head, email and phone <Chip kind={head.shown} />
          </dt>
          <dd>
            <Before>
              <strong>
                <span className="nowrap">{String(head.proposed)}</span> <Dot /> <span className="nowrap">{String(email.proposed)}</span>{' '}
                <Dot /> <span className="nowrap">{String(phone.proposed)}</span>
              </strong>
            </Before>
            <p className="ba-quote">
              <span className="ba-src">
                printed on{' '}
                <a href={page.url} target="_blank" rel="noreferrer">
                  {prettyUrl(page.url)}
                </a>
                , fetched {fmtDate(page.fetched_at)}
              </span>
            </p>
          </dd>
        </div>
      </dl>
    </article>
  )
}

/** The question only Waysights can answer, framed as a reading of their own FAQ. */
function AskWaysights() {
  const run = runBySlug[HERO]
  const s = run.validated.road_length_km
  const owned = Math.round(s.value_km ?? 0)
  const within = Math.round(s.within_km ?? 0)
  return (
    <aside className="wt-ask" aria-labelledby="wt-ask-h">
      <h2 id="wt-ask-h">One question only you can answer</h2>
      <p>
        Your FAQ prices on <q>the total centerline length of roads within your jurisdiction.</q> For a county I read that as
        the roads it owns: <strong>{fmtKm(owned)} km</strong> for {run.account.name}, not the <strong>{fmtKm(within)} km</strong>{' '}
        of every road inside it (NYSDOT, {s.data_year}). Is that right? The run uses owned roads until you say otherwise.
      </p>
      <Link to={`/demo?account=${HERO}`}>See both numbers on {run.account.name}</Link>
    </aside>
  )
}

export function Walkthrough() {
  return (
    <div className="wt">
      <main className="wt-main">
        <section className="wt-intro">
          <p className="kicker">Waysights · Enrich Account · Riipen Level UP, October 2026</p>
          <h1>Enrich Account, run on six real municipalities</h1>
          <p>
            Your pricing form asks a town for one number: its road network in centerline kilometers. That number sits in the
            town's own documents, often split up and rarely labelled centerline. Your Riipen brief asks for a button that
            reads approved municipal sites and fills the Account, so I started there: a rep can size a town before it fills
            in your form.
          </p>
          <p>
            This is roughly the end of week two: a small Python service that reads a municipality's own pages, finds the
            road length and the roads contact, and checks every value against the line it came from. I ran it on three
            Niagara towns and three New York counties, the counties because you showed Waysights to their highway
            superintendents at their summer conference. When the documents can't settle something, it asks one question
            instead of guessing, as on <Link to="/demo?account=lincoln">Lincoln</Link>, whose plan never says centerline.
          </p>
          <nav className="wt-links" aria-label="Next">
            <Link to={`/demo?account=${HERO}`} className="btn btn--primary btn--lg">
              Watch the {shortName[HERO]} run
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="wt-link">
              Read the code
            </a>
            <Link to="/demo/plan" className="wt-link">
              My plan and five questions for you
            </Link>
          </nav>
          <AskWaysights />
        </section>
        <HeroCard />
      </main>
      <footer className="wt-foot">
        <Honesty date={meta.run_date} />
        <Owner />
      </footer>
    </div>
  )
}
