import { useEffect } from 'react'
import { HERO, REPO, runBySlug } from './lib/data'
import { Link, useLocation } from './lib/router'
import { Plan } from './routes/Plan'
import { Run } from './routes/Run'
import { Zoho } from './routes/Zoho'

type View = 'run' | 'zoho' | 'plan'
const VIEWS: Record<string, View> = { '/': 'run', '/demo': 'run', '/demo/zoho': 'zoho', '/demo/plan': 'plan' }

function Header({ view, account }: { view: View; account: string }) {
  const q = account === HERO ? '' : `?account=${account}`
  const nav: [View, string, string][] = [
    ['run', 'Run', `/demo${q}`],
    ['zoho', 'Zoho side', '/demo/zoho'],
    ['plan', 'Plan', '/demo/plan'],
  ]
  return (
    <header className="top">
      <div className="top-in">
        <Link to="/" className="brand" aria-label="Enrich Account, home">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <rect x="2" y="6" width="28" height="20" rx="5" fill="#0b6e4f" />
            <rect x="4.5" y="8.5" width="23" height="15" rx="3" fill="none" stroke="#f4f4f1" strokeWidth="1.6" />
            <path d="M10 16h12M18 12l4 4-4 4" fill="none" stroke="#f4f4f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Enrich Account
        </Link>
        <p className="byline">Built by Abdallah Safi for Waysights' Level UP project</p>
        <nav className="nav" aria-label="Pages">
          {nav.map(([id, label, to]) => (
            <Link key={id} to={to} aria-current={id === view ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          <a className="code-link" href={REPO} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Code
          </a>
        </nav>
      </div>
    </header>
  )
}

export function App() {
  const { path, query } = useLocation()
  const asked = query.get('account')
  const account = asked && runBySlug[asked] ? asked : HERO
  const view = VIEWS[path] ?? 'run'

  useEffect(() => {
    document.title = view === 'run' ? `${runBySlug[account].account.name} · Enrich Account` : view === 'zoho' ? 'Zoho side · Enrich Account' : 'Plan · Enrich Account'
  }, [view, account])

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to the run
      </a>
      <Header view={view} account={account} />
      <main id="main" className={`main main--${view}`}>
        {view === 'run' ? <Run account={account} autoplay={!asked} /> : view === 'zoho' ? <Zoho /> : <Plan />}
      </main>
    </div>
  )
}
