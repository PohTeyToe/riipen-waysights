import { useState } from 'react'
import deluge from '../../pipeline/zoho/enrich_account.deluge?raw'
import writeback from '../../pipeline/writeback.py?raw'
import service from '../../pipeline/service.py?raw'
import { Tabs } from '../components/Tabs'
import { REPO } from '../lib/data'

const FILES = [
  { path: 'pipeline/zoho/enrich_account.deluge', what: 'The button function', code: deluge, comment: '//' },
  { path: 'pipeline/writeback.py', what: 'Account, Contact and Note writes', code: writeback, comment: '#' },
  { path: 'pipeline/service.py', what: 'The FastAPI service', code: service, comment: '#' },
]

const FLOW: { title: string; body: string }[] = [
  { title: 'Button on the Account', body: 'Sends the record id.' },
  { title: 'Deluge function', body: 'Checks Last Enriched, calls the service, sets Queued.' },
  { title: 'Service reads approved sites', body: 'Up to 15 pages. Every value checked against its line.' },
  { title: 'Account and Contact updated', body: 'By record id, never by name.' },
  { title: 'Unsettled fields become Notes', body: 'Each quote with its URL and fetch date.' },
  { title: 'Status set', body: 'Done or Needs review, plus Last Enriched.' },
]

const lineCount = (code: string) => code.replace(/\n$/, '').split('\n').length
const DOC = '"'.repeat(3)

function Code({ code, comment }: { code: string; comment: string }) {
  const lines = code.replace(/\n$/, '').split('\n')
  let inDoc = false
  return (
    <pre className="code">
      <code>
        {lines.map((l, i) => {
          // Comments and Python docstrings are dimmed; that's all the highlighting this needs.
          const quotes = comment === '#' ? l.split(DOC).length - 1 : 0
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

export function Zoho() {
  const [file, setFile] = useState(0)
  const f = FILES[file]
  return (
    <div className="page">
      <header className="page-head">
        <h1>Zoho side</h1>
        <p className="hint">Draft, never run in a Zoho org. Field names are guesses.</p>
      </header>

      <section aria-labelledby="flow-h">
        <h2 id="flow-h" className="sec-title">
          When someone presses the button
        </h2>
        <ol className="flow">
          {FLOW.map((s, i) => (
            <li key={i}>
              <span className="flow-n">{i + 1}</span>
              <p className="flow-title">{s.title}</p>
              <p className="flow-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="code-h">
        <h2 id="code-h" className="sec-title">
          Code
        </h2>
        <div className="file-box">
          <Tabs
            label="Files"
            items={FILES.map((x) => x.path.split('/').at(-1))}
            selected={file}
            onSelect={setFile}
            listClass="files"
            tabClass="file-tab"
            panelClass="file"
          >
            <p className="file-head">
              <a href={`${REPO}/blob/main/${f.path}`} target="_blank" rel="noreferrer">
                <code>{f.path}</code>
              </a>
              <span>
                {f.what}, {lineCount(f.code)} lines
              </span>
            </p>
            <Code code={f.code} comment={f.comment} />
          </Tabs>
        </div>
      </section>
    </div>
  )
}
