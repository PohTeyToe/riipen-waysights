import { meta, REPO, runBySlug } from '../lib/data'
import { Link } from '../lib/router'
import { Honesty, Owner } from '../components/Honesty'
import { PlanTab } from '../components/PlanTab'
import { RecordView } from '../components/Record'
import { ZohoTab } from '../components/ZohoTab'

export type Tab = 'record' | 'zoho' | 'plan'

const TABS: { id: Tab; label: string; path: string }[] = [
  { id: 'record', label: 'Account record', path: '/demo' },
  { id: 'zoho', label: 'Zoho side', path: '/demo/zoho' },
  { id: 'plan', label: 'Plan and questions', path: '/demo/plan' },
]

export function Demo({ tab, account }: { tab: Tab; account: string }) {
  const slug = runBySlug[account] ? account : 'lincoln'
  const q = `?account=${slug}`
  return (
    <div className="app">
      <header className="bar">
        <div className="bar-in">
          <Link to="/" className="brand" aria-label="Enrich Account, back to the walkthrough">
            <span className="brand-mark" aria-hidden="true" />
            Enrich Account
          </Link>
          <span className="tag tag--weeks">weeks 1 to 2 of 8</span>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <Link key={t.id} to={`${t.path}${q}`} className="tab" aria-current={t.id === tab ? 'page' : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="bar-links">
            <Link to="/">Walkthrough</Link>
            <a href={REPO} target="_blank" rel="noreferrer">
              Code
            </a>
          </div>
        </div>
      </header>
      <main className={`main main--${tab}`}>
        {tab === 'record' ? <RecordView slug={slug} /> : tab === 'zoho' ? <ZohoTab /> : <PlanTab />}
      </main>
      <footer className="foot">
        <Honesty date={meta.run_date} />
        <Owner />
      </footer>
    </div>
  )
}
