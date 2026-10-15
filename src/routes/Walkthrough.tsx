import { meta, REPO, runBySlug, type Cite } from '../lib/data'
import { fmtDate, fmtKm, prettyUrl } from '../lib/format'
import { shownRows } from '../lib/record'
import { Link } from '../lib/router'
import { useStore } from '../lib/store'
import { Chip, Dot } from '../components/Status'
import { Honesty, Owner } from '../components/Honesty'

function LincolnCard() {
  const store = useStore()
  const run = runBySlug.lincoln
  const st = store.get('lincoln')
  const rows = shownRows(run, st.answers)
  const road = rows.find((r) => r.field === 'road_length_km')!
  const email = rows.find((r) => r.field === 'email')!
  const phone = rows.find((r) => r.field === 'phone')!
  const docs = rows.find((r) => r.field === 'key_documents')!
  const head = rows.find((r) => r.field === 'roads_head')!
  const [plan, roadsPage] = run.validated.road_length_km.options
  const q = road.question!
  const contact = email.sources[0] as Cite

  return (
    <article className="card" aria-labelledby="card-h">
      <header className="card-head">
        <h2 id="card-h">Town of Lincoln, before and after</h2>
        <p>
          Lincoln goes first. It borders St. Catharines, and its roads page lists{' '}
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
              <strong>
                {road.answered?.result === 'filled' ? `${fmtKm(road.answered.option.value_km!)} km` : `${fmtKm(plan.km)} km proposed`}
              </strong>
            </p>
            <p className="ba-quote">
              <q>{plan.parts[0].cite.quote.replace('Quantity - ', '')}</q>, <q>{plan.parts[1].cite.quote.replace('Quantity - ', '')}</q>
              <span className="ba-src">
                2025 Asset Management Plan, Table 21, PDF p. {plan.parts[0].cite.pdf_page}
              </span>
            </p>
            <p className="ba-quote">
              roads page: <q>approximately 300km of roadway</q>
              <span className="ba-src">{prettyUrl(roadsPage.parts[0].cite.url)}</span>
            </p>
            {road.answered ? (
              <p className="ba-said">
                {road.answered.result === 'filled'
                  ? `${fmtKm(road.answered.option.value_km!)} km, confirmed by you.`
                  : 'Left blank. It becomes a Note on the Account for a person to check.'}{' '}
                <button type="button" className="linkish" onClick={() => store.answer('lincoln', 'road_length_km', null)}>
                  Change
                </button>
              </p>
            ) : (
              <div className="ba-ask" role="group" aria-label={q.text}>
                <p>{q.text}</p>
                <div className="ba-buttons">
                  <button type="button" className="btn btn--answer" onClick={() => store.answer('lincoln', 'road_length_km', 0)}>
                    {fmtKm(plan.km)} km, the plan
                  </button>
                  <button type="button" className="btn btn--answer" onClick={() => store.answer('lincoln', 'road_length_km', 1)}>
                    about {fmtKm(roadsPage.km)} km, the roads page
                  </button>
                  <button type="button" className="btn btn--answer" onClick={() => store.answer('lincoln', 'road_length_km', 2)}>
                    Not sure
                  </button>
                </div>
              </div>
            )}
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
              <span className="ba-src">printed on {prettyUrl(contact.url)}, fetched {fmtDate(contact.fetched_at)}</span>
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
                2025 Asset Management Plan <Dot /> Roads & Transportation <Dot /> Contact Us
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

export function Walkthrough() {
  return (
    <div className="wt">
      <main className="wt-main">
        <section className="wt-intro">
          <p className="kicker">Waysights · Enrich Account · Riipen Level UP, October 2026</p>
          <h1>Enrich Account, run on six real municipalities</h1>
          <p>
            Your pricing form asks a town one thing about its roads: the total length of its network, in centerline
            kilometers. That number is spread across the town's own documents. An asset management plan says one thing, the
            roads page says another, and neither always says centerline. The person who runs the roads might be a
            Superintendent of Public Works in one county and a Commissioner of Public Works in another. Your Riipen brief asks
            for an Enrich Account button in Zoho that does this digging.
          </p>
          <p>
            So I built roughly where I'd want to be at the end of week two. A small Python service reads a municipality's own
            public pages, finds the road length and the roads contact, and keeps the exact line each value came from. It checks
            every value against that line before it proposes a change to the Account. I ran it on three Niagara towns and three
            New York counties. When the documents can't settle something, it asks you one question instead of guessing.
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
