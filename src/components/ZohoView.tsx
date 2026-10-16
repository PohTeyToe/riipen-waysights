// The Zoho requests the button would send, after this tab's answers and dropped fields, as a line
// diff against what the recorded run built. Nothing is sent.
import { useMemo } from 'react'
import { runBySlug } from '../lib/data'
import { writePlan } from '../lib/record'
import { useStore } from '../lib/store'
import { requestDiff, type DiffLine } from '../lib/diff'

export function ZohoView({ slug, ready }: { slug: string; ready: boolean }) {
  const store = useStore()
  const review = store.get(slug)
  const run = runBySlug[slug]
  const plan = writePlan(run, review.answers, review.dropped)
  const lines: DiffLine[] = useMemo(() => requestDiff(run.writeback.requests, plan.requests), [run, plan.requests])
  const edits = lines.filter((l) => l.op !== 'same').length

  if (!ready) return <p className="panel-empty">Built at the end of the run. Nothing is ever sent.</p>
  return (
    <div className="zoho">
      <p className="zoho-sum">
        {plan.requests.length} {plan.requests.length === 1 ? 'request' : 'requests'}, status <b>{plan.status}</b>.{' '}
        {edits ? `${edits} lines changed by your edits.` : 'As the run built them.'} Preview only, nothing is sent.
      </p>
      <pre className="json" aria-label="Zoho requests">
        <code>
          {lines.map((l, i) => (
            <span key={i} className={`jl jl--${l.op}`}>
              <span className="jl-op" aria-hidden="true">
                {l.op === 'add' ? '+' : l.op === 'del' ? '-' : ' '}
              </span>
              <Json line={l.text} />
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
      <p className="hint">Field API names are guesses until the sandbox</p>
    </div>
  )
}

/** Keys, strings and methods in their own colors; nothing else needs it. */
function Json({ line }: { line: string }) {
  const m = line.match(/^(\s*)"([^"]+)":\s?(.*)$/)
  if (m) {
    const [, pad, key, rest] = m
    return (
      <>
        {pad}
        <span className="j-key">"{key}"</span>: <span className={rest.startsWith('"') ? 'j-str' : 'j-lit'}>{rest}</span>
      </>
    )
  }
  const req = line.match(/^(GET|PUT|POST|PATCH) (.+)$/)
  if (req)
    return (
      <>
        <span className="j-method">{req[1]}</span> <span className="j-url">{req[2]}</span>
      </>
    )
  return <>{line}</>
}
