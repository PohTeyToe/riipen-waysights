import { useState } from 'react'
import deluge from '../../pipeline/zoho/enrich_account.deluge?raw'
import writeback from '../../pipeline/writeback.py?raw'
import service from '../../pipeline/service.py?raw'
import { REPO } from '../lib/data'
import { Dot } from './Status'

const FILES = [
  { path: 'pipeline/zoho/enrich_account.deluge', what: 'The button’s function on the Account', code: deluge, comment: '//' },
  { path: 'pipeline/writeback.py', what: 'The upsert, the Contact update and the Notes', code: writeback, comment: '#' },
  { path: 'pipeline/service.py', what: 'The FastAPI service the button calls', code: service, comment: '#' },
]

const FLOW: { title: string; body: string }[] = [
  { title: 'Enrich Account button on the Account', body: 'A custom button. It sends the record id.' },
  {
    title: 'Deluge function',
    body: 'Checks Last Enriched, posts the Account id and website to the service with a shared-secret header, and sets the status to Queued.',
  },
  {
    title: 'The service reads the approved sites',
    body: 'Honest user agent, robots.txt, 2 s per host, 15 requests per Account. Every value is checked against the line it came from.',
  },
  {
    title: 'Upsert to Account and Contact',
    body: 'Duplicate check first. A matched Contact is updated by its id, and a new one is made only when nothing matches.',
  },
  { title: 'Anything unsettled becomes a Note', body: 'The question and every quote, each with its URL and fetch date.' },
  { title: 'Status is Done or Needs review', body: 'Plus Last Enriched, which the next button press checks.' },
]

function Code({ code, comment }: { code: string; comment: string }) {
  const lines = code.replace(/\n$/, '').split('\n')
  let inDoc = false
  return (
    <pre className="code" tabIndex={0}>
      <code>
        {lines.map((l, i) => {
          // Comments and Python docstrings are dimmed; that's all the highlighting this needs.
          const quotes = comment === '#' ? (l.match(/"""/g) ?? []).length : 0
          const dim = inDoc || quotes > 0 || l.trim().startsWith(comment)
          if (quotes % 2 === 1) inDoc = !inDoc
          return (
            <span key={i} className={`code-line${dim ? ' code-line--comment' : ''}`}>
              <span className="code-n" aria-hidden="true">
                {i + 1}
              </span>
              {l || ' '}
              {'\n'}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

export function ZohoTab() {
  const [file, setFile] = useState(0)
  const f = FILES[file]
  return (
    <div className="doc-page">
      <header className="doc-head">
        <h1>The Zoho side (a draft)</h1>
        <p>This has never run in a Zoho org. The field names are my guesses until I see your layout.</p>
      </header>

      <section aria-labelledby="flow-h">
        <h2 id="flow-h" className="doc-h2">
          What happens when someone presses the button
        </h2>
        <ol className="flow">
          {FLOW.map((s, i) => (
            <li key={i}>
              <span className="flow-n">{i + 1}</span>
              <div>
                <p className="flow-title">{s.title}</p>
                <p className="flow-body">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="code-h">
        <h2 id="code-h" className="doc-h2">
          The code, as it is in the repo
        </h2>
        <div className="files" role="tablist" aria-label="Files">
          {FILES.map((x, i) => (
            <button key={x.path} type="button" role="tab" aria-selected={file === i} className="file-tab" onClick={() => setFile(i)}>
              {x.path.split('/').at(-1)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="file">
          <p className="file-head">
            <a href={`${REPO}/blob/main/${f.path}`} target="_blank" rel="noreferrer">
              <code>{f.path}</code>
            </a>
            <span>
              {f.what} <Dot /> {f.code.split('\n').length - 1} lines <Dot /> read-only
            </span>
          </p>
          <Code code={f.code} comment={f.comment} />
        </div>
      </section>
    </div>
  )
}
