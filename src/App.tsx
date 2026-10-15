import { useEffect } from 'react'
import { useLocation } from './lib/router'
import { Demo } from './routes/Demo'
import { Walkthrough } from './routes/Walkthrough'

const TITLES: Record<string, string> = {
  '/': 'Enrich Account demo',
  '/demo': 'Account record · Enrich Account demo',
  '/demo/zoho': 'Zoho side · Enrich Account demo',
  '/demo/plan': 'Plan and questions · Enrich Account demo',
}

export function App() {
  const { path, query } = useLocation()
  const account = query.get('account') ?? 'lincoln'

  useEffect(() => {
    document.title = TITLES[path] ?? TITLES['/']
  }, [path])

  if (path === '/demo') return <Demo tab="record" account={account} />
  if (path === '/demo/zoho') return <Demo tab="zoho" account={account} />
  if (path === '/demo/plan') return <Demo tab="plan" account={account} />
  return <Walkthrough />
}
