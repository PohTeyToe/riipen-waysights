import { meta, REPO, runBySlug, type Cite, type DocLink } from '../lib/data'
import { cleanTitle, fmtDate, fmtKm, prettyUrl } from '../lib/format'
import { shownRows } from '../lib/record'
import { Link } from '../lib/router'
import { Chip, Dot } from '../components/Status'
import { Honesty, Owner } from '../components/Honesty'

/** Lincoln as the run left it. The question is answered in the run itself, not here. */
function LincolnCard() {
  const run = runBySlug.lincoln
  const rows = shownRows(run, {})
  const road = rows.find((r) => r.field === 'road_length_km')!
  const email = rows.find((r) => r.field === 'email')!
  const phone = rows.find((r) => r.field === 'phone')!
  const docs = rows.find((r) => r.field === 'key_documents')!
  const head = rows.find((r) => r.field === 'roads_head')!
  const plan = run.validated.road_length_km.options[0]
  const planCite = plan.parts[0].cite
  const rounded = plan.agrees?.[0]?.cite
  const contactPages = [...new Set([email, phone].flatMap((r) => (r.sources as Cite[]).map((c) => c.url)))]
  const fetched = (email.sources[0] as Cite).fetched_at
  // The plan's full title is long, so the card shortens it; the link goes to the PDF itself.
  const docLinks = (docs.sources as DocLink[]).map((d) => ({
    url: d.url,
    label: d.url === planCite.url ? '2025 Asset Management Plan (PDF)' : cleanTitle(d.title),
  }))

  return (
    <article className="card" aria-labelledby="card-h">
      <header className="card-head">
        <h2 id="card-h">Town of Lincoln, before and after</h2>
        <p>
          Lincoln goes first. Its roads page lists{' '}
          <q>Road signage inventory, inspections, maintenance and repairs</q> as a key Public Works activity.
        </p>
      </header>

      <dl className="ba">
        <div className="ba-row ba-row--road">
          <dt>
            Road network (centerline km) <Chip kind={road.shown} />
          </dt>
          <dd>
            <p className="ba-diff">
              <span className="nil">empty</span>
              <span className="diff-arrow" aria-label="becomes">
                →
              </span>
              <strong>{fmtKm(plan.km)} km proposed</strong>
            </p>
            <p className="ba-quote">
              {plan.parts.map((p, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : null}
                  <q>{p.cite.quote.replace('Quantity - ', '')}</q>
                </span>
              ))}
              <a className="ba-src" href={planCite.url} target="_blank" rel="noreferrer">
                2025 Asset Management Plan, Table 21, PDF p. {planCite.pdf_page}
              </a>
            </p>
            {rounded ? (
              <p className="ba-quote">
                roads page: <q>approximately 300km of roadway</q>, the same figure rounded
                <a className="ba-src" href={rounded.url} target="_blank" rel="noreferrer">
                  {prettyUrl(rounded.url)}
                </a>
              </p>
            ) : null}
            <div className="ba-ask">
              <p>{road.question?.text}</p>
              <Link to="/demo?account=lincoln" className="ba-ask-link">
                Answer it in the Lincoln run
              </Link>
            </div>
          </dd>
        </div>

        <div className="ba-row">
          <dt>
            Public Works email and phone <Chip kind="filled" />
          </dt>
          <dd>
            <p className="ba-diff">
              <span className="nil">empty</span>
              <span className="diff-arrow" aria-label="becomes">
                →
              </span>
              <strong>
                <span className="nowrap">{String(email.proposed)}</span> <Dot /> <span className="nowrap">{String(phone.proposed)}</span>
              </strong>
            </p>
            <p className="ba-quote">
              <span className="ba-src">
                printed on{' '}
                {contactPages.map((url, i) => (
                  <span key={url}>
                    {i > 0 ? ' and ' : null}
                    <a href={url} target="_blank" rel="noreferrer">
                      {prettyUrl(url)}
                    </a>
                  </span>
                ))}
                , fetched {fmtDate(fetched)}
              </span>
            </p>
          </dd>
        </div>

        <div className="ba-row">
          <dt>
            Key documents <Chip kind={docs.shown} />
          </dt>
          <dd>
            <p className="ba-diff">
              <span className="nil">none</span>
              <span className="diff-arrow" aria-label="becomes">
                →
              </span>
              <span className="ba-docs">
                {docLinks.map((d, i) => (
                  <span key={d.url}>
                    {i > 0 ? (
                      <>
                        {' '}
                        <Dot />{' '}
                      </>
                    ) : null}
                    <a href={d.url} target="_blank" rel="noreferrer">
                      {d.label}
                    </a>
                  </span>
                ))}
              </span>
            </p>
          </dd>
        </div>

        <div className="ba-row">
          <dt>
            Roads head <Chip kind={head.shown} />
          </dt>
          <dd>
            <p className="ba-diff">
              <span className="nil">empty</span>
              <span className="diff-arrow" aria-label="becomes">
                →
              </span>
              <span>{head.detail}</span>
            </p>
          </dd>
        </div>
      </dl>
    </article>
  )
}

/** The question only Waysights can answer, and the one that changes a price. */
function AskWaysights() {
  const s = runBySlug.saratoga.validated.road_length_km
  const owned = Math.round(s.value_km ?? 0)
  const within = Math.round(s.within_km ?? 0)
  return (
    <aside className="wt-ask" aria-labelledby="wt-ask-h">
      <h2 id="wt-ask-h">One question only you can answer</h2>
      <p>
        Do you quote a county on the roads it owns, or every road inside it? Saratoga County: <strong>{fmtKm(owned)} km</strong>{' '}
        or <strong>{fmtKm(within)} km</strong> (NYSDOT, 2020), about {Math.round(within / owned)} times apart. The run uses
        owned roads until you say otherwise.
      </p>
      <Link to="/demo?account=saratoga">See both numbers on Saratoga County</Link>
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
            Your pricing form asks a town for one number: the length of its road network, in centerline kilometers. That
            number is spread across the town's own documents. The asset management plan says one thing, the roads page
            another, and often neither says centerline. Your Riipen brief asks for a button that reads approved municipal
            sites and fills the Account, so I started with the number your pricing runs on.
          </p>
          <p>
            This is roughly where I'd want to be at the end of week two: a small Python service that reads a
            municipality's own pages, finds the road length and the roads contact, and checks every value against the line
            it came from before it proposes a change. I ran it on three Niagara towns and three New York counties. When the
            documents can't settle something, it asks one question instead of guessing.
          </p>
          <nav className="wt-links" aria-label="Next">
            <Link to="/demo?account=lincoln" className="btn btn--primary btn--lg">
              Watch the Lincoln run
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
        <LincolnCard />
      </main>
      <footer className="wt-foot">
        <Honesty date={meta.run_date} />
        <Owner />
      </footer>
    </div>
  )
}
