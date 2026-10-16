import { checkItems } from '../lib/checks'
import { runBySlug } from '../lib/data'
import type { Focus } from '../lib/marks'
import { writePlan } from '../lib/record'
import { useStore } from '../lib/store'
import { laneBySlug } from '../lib/timeline'
import { ChecksView } from './ChecksView'
import { RunLog } from './RunLog'
import { SourceView } from './SourceView'
import { Tabs } from './Tabs'
import { ZohoView } from './ZohoView'

export type ITab = 'log' | 'checks' | 'source' | 'zoho'
const ORDER: ITab[] = ['log', 'checks', 'source', 'zoho']

export function Inspector({
  slug,
  shown,
  playing,
  tab,
  setTab,
  focus,
  active,
  onOpen,
}: {
  slug: string
  shown: number
  playing: boolean
  tab: ITab
  setTab: (t: ITab) => void
  focus: Focus | null
  active: number | null
  onOpen: (f: Focus) => void
}) {
  const run = runBySlug[slug]
  const lane = laneBySlug[slug]
  const review = useStore().get(slug)
  const done = shown >= lane.times.length
  const checked = lane.checkStep >= 0 && shown > lane.checkStep
  const labels = [
    <>
      Run log <span className="tab-n mono">{shown}</span>
    </>,
    <>
      Checks {checked ? <span className="tab-n mono">{checkItems(run).length}</span> : null}
    </>,
    <>Source</>,
    <>
      Zoho {done ? <span className="tab-n mono">{writePlan(run, review.answers, review.dropped).requests.length}</span> : null}
    </>,
  ]
  return (
    <aside className="inspector" aria-label="Inspector">
      <Tabs
        label="Inspector"
        items={labels}
        selected={ORDER.indexOf(tab)}
        onSelect={(i) => setTab(ORDER[i])}
        listClass="itabs"
        tabClass="itab"
        panelClass="ipanel"
      >
        {tab === 'log' ? (
          <RunLog slug={slug} shown={shown} playing={playing} active={active} onOpen={onOpen} />
        ) : tab === 'checks' ? (
          <ChecksView slug={slug} shown={shown} focus={focus} onOpen={onOpen} />
        ) : tab === 'source' ? (
          focus ? (
            <SourceView key={`${slug}-${focus.source}`} slug={slug} focus={focus} />
          ) : (
            <p className="panel-empty">Click any value or quote to open the page it came from, with the line marked.</p>
          )
        ) : (
          <ZohoView slug={slug} ready={done} />
        )}
      </Tabs>
    </aside>
  )
}
