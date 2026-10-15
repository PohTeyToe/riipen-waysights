// Checks the page against the run's real outputs: every value it shows has a source the run saved,
// and an answer given on the page changes the Zoho preview the way writeback.py would.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCite, runBySlug, runs, sourceById } from './data'
import { datasetRows, findQuote, savedText, type SavedPage } from './pages'
import { replayTimes, shownRows, writePlan } from './record'

const root = join(__dirname, '..', '..')
const pages = (slug: string): SavedPage[] => JSON.parse(readFileSync(join(root, 'data/run/pages', `${slug}.json`), 'utf8'))

describe('every value on the page traces to a saved source', () => {
  for (const run of runs) {
    it(`${run.account.slug}: quotes appear in the saved text`, () => {
      const saved = pages(run.account.slug)
      const cites = [
        ...run.proposed.flatMap((r) => r.sources.filter(isCite)),
        ...run.proposed.flatMap((r) => (r.partial ?? []).flatMap((p) => p.sources)),
        ...run.rejected,
      ]
      expect(cites.length).toBeGreaterThan(0)
      for (const c of cites) {
        const page = saved.find((p) => p.id === c.source)
        expect(page, `${c.source} saved`).toBeDefined()
        const text = savedText(page!, c.pdf_page)
        expect(text, `${c.source} has text`).toBeTruthy()
        expect(findQuote(text!, c.quote), `"${c.quote}" in ${c.source}`).not.toBeNull()
      }
    })

    it(`${run.account.slug}: filled values have a source with a fetch date`, () => {
      for (const row of run.proposed) {
        if (row.field === 'brief' || row.status === 'not_found') continue
        expect(row.sources.length, row.field).toBeGreaterThan(0)
        for (const s of row.sources) expect(s.fetched_at).toMatch(/^2026-10-15T/)
      }
    })

    it(`${run.account.slug}: every brief sentence cites a source the run read`, () => {
      for (const s of run.brief.sentences) {
        expect(s.cites.length).toBeGreaterThan(0)
        for (const id of s.cites) expect(sourceById(run, id), id).toBeDefined()
      }
    })
  }

  it('Saratoga: the saved rows add up to the owned and all-roads totals', () => {
    const page = pages('saratoga').find((p) => p.kind === 'dataset')!
    const rows = datasetRows(page.text!)
    expect(rows).toHaveLength(31)
    const owned = rows.reduce((n, r) => n + r.owned, 0)
    const total = rows.reduce((n, r) => n + r.total, 0)
    expect(owned).toBeCloseTo(364.21, 2)
    expect(total).toBeCloseTo(2250.53, 2)
    expect(runBySlug.saratoga.validated.road_length_km.within_km).toBeCloseTo(total * 1.609344, 1)
  })
})

describe('answers change the preview, and only the preview', () => {
  const lincoln = runBySlug.lincoln

  it('before an answer, Lincoln writes 4 fields and 1 Note and needs review', () => {
    const plan = writePlan(lincoln, {})
    expect(plan.changes).toBe(4)
    expect(plan.notes).toBe(1)
    expect(plan.status).toBe('Needs review')
    expect(plan.changedByAnswer).toBe(false)
    expect(plan.requests).toEqual(lincoln.writeback.requests)
  })

  it('picking 310 km fills the field, drops the Note and finishes the run', () => {
    const plan = writePlan(lincoln, { road_length_km: 0 })
    const upsert = plan.requests[0].body.data[0]
    expect(upsert.Road_Network_Centerline_km).toBe(310)
    expect(upsert.Enrichment_Status).toBe('Done')
    expect(plan.notes).toBe(0)
    expect(plan.changes).toBe(5)
    expect(shownRows(lincoln, { road_length_km: 0 })[0].shown).toBe('filled')
    // The run's own data is untouched.
    expect(lincoln.writeback.requests[0].body.data[0].Road_Network_Centerline_km).toBeUndefined()
  })

  it('"Not sure" leaves the field blank and keeps the Note, with the answer on it', () => {
    const plan = writePlan(lincoln, { road_length_km: 2 })
    expect(plan.requests[0].body.data[0].Road_Network_Centerline_km).toBeUndefined()
    expect(plan.notes).toBe(1)
    expect(String(plan.requests[1].body.data[0].Note_Content)).toMatch(/Answered on the page: Not sure\.$/)
    expect(plan.status).toBe('Needs review')
  })

  it('Pelham "Lane km" leaves the field blank', () => {
    const pelham = runBySlug.pelham
    expect(shownRows(pelham, { road_length_km: 1 })[0].shown).toBe('blank')
    expect(writePlan(pelham, { road_length_km: 1 }).requests[0].body.data[0].Road_Network_Centerline_km).toBeUndefined()
  })

  it('Warren counts the Contact merge as a change', () => {
    const warren = runBySlug.warren
    const plan = writePlan(warren, { road_length_km: 1 })
    expect(plan.requests.some((r) => r.method === 'PUT' && r.url.endsWith('/Contacts'))).toBe(true)
    expect(plan.requests[0].body.data[0].Road_Network_Centerline_km).toBe(398.1)
  })
})

describe('replay', () => {
  it('keeps the order of the log and lands near ten seconds', () => {
    for (const run of runs) {
      const at = replayTimes(run.steps)
      expect(at).toHaveLength(run.steps.length)
      for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThanOrEqual(at[i - 1])
      expect(at[at.length - 1]).toBeGreaterThan(5_000)
      expect(at[at.length - 1]).toBeLessThan(16_000)
    }
  })
})

describe('copy', () => {
  it('has no em dashes', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : d.name.match(/\.(tsx?|css|html)$/) ? [join(dir, d.name)] : [],
      )
    for (const f of [...walk(join(root, 'src')), join(root, 'index.html')]) {
      expect(readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014)), f).toBe(false)
    }
  })
})
