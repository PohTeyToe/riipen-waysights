// What Claude returned, next to what the five code checks did with it.
import { checkItems, tally, type CheckItem, type Verdict } from '../lib/checks'
import { runBySlug } from '../lib/data'
import type { Focus } from '../lib/marks'
import { laneBySlug } from '../lib/timeline'
import { Glyph, type GlyphKind } from './Glyph'

const GROUP: [CheckItem['field'], string][] = [
  ['road_length_km', 'Road length lines'],
  ['roads_head', 'Roads head'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['sign', 'Sign work, for the brief'],
]

const VERDICT: Record<Verdict, { glyph: GlyphKind; word: string }> = {
  kept: { glyph: 'filled', word: 'kept' },
  shown: { glyph: 'filled', word: 'agrees' },
  refused: { glyph: 'rejected', word: 'refused' },
  asked: { glyph: 'person', word: 'to a person' },
  unused: { glyph: 'blank', word: 'not used' },
}

export function ChecksView({ slug, shown, focus, onOpen }: { slug: string; shown: number; focus: Focus | null; onOpen: (f: Focus) => void }) {
  const run = runBySlug[slug]
  const lane = laneBySlug[slug]
  if (lane.checkStep < 0 || shown <= lane.checkStep) {
    const at = lane.checkStep >= 0 ? ((lane.times[lane.checkStep] - lane.start) / 1000).toFixed(1) : null
    return <p className="panel-empty">The checks run when Claude's answer comes back{at ? `, at +${at} s` : ''}.</p>
  }
  const items = checkItems(run)
  const n = tally(items)
  // New York's state figure never goes through the model: code sums the column (rule 3).
  const road = run.validated.road_length_km
  const own = road.options.find((o) => o.parts.some((p) => p.cite.column))
  const near = road.options.find((o) => (o.agrees ?? []).some((p) => p.cite.column))
  const state = own?.parts.find((p) => p.cite.column) ?? near?.agrees?.find((p) => p.cite.column)
  return (
    <div className="checks">
      <p className="checks-sum">
        Claude returned <b>{n.said}</b> items. Code kept <b>{n.kept}</b>, refused <b>{n.refused}</b> and sent <b>{n.asked}</b> to a person.
      </p>
      {state ? (
        <section className="chk-group">
          <h3>State road data, summed by code</h3>
          <ul>
            <li className="chk-item">
              <button type="button" className="chk-btn" onClick={() => onOpen({ source: state.cite.source, quote: state.cite.quote })}>
                <span className="chk-said mono">
                  {state.value} mi, {state.cite.column}
                </span>
                <span className="chk-v chk-v--filled">
                  <Glyph kind="filled" size={11} />
                  {own ? 'kept' : 'agrees'}
                </span>
                <span className="chk-why">{own ? `${own.km} km, centerline by the column's own description` : `within 2% of ${near!.km} km`}</span>
              </button>
            </li>
          </ul>
        </section>
      ) : null}
      {GROUP.map(([field, label]) => {
        const list = items.filter((x) => x.field === field)
        if (!list.length) return null
        return (
          <section key={field} className="chk-group">
            <h3>{label}</h3>
            <ul>
              {list.map((x, i) => {
                const v = VERDICT[x.verdict]
                const active = !!focus && focus.source === x.source && focus.quote === x.quote
                return (
                  <li key={i} className={`chk-item chk-item--${x.verdict}`}>
                    <button
                      type="button"
                      className={`chk-btn${active ? ' is-active' : ''}`}
                      onClick={() => onOpen({ source: x.source, quote: x.quote, pdf_page: x.pdf_page })}
                    >
                      <span className="chk-said mono">{x.said}</span>
                      <span className={`chk-v chk-v--${v.glyph}`}>
                        <Glyph kind={v.glyph} size={11} />
                        {v.word}
                      </span>
                      <span className="chk-why">{x.why}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
