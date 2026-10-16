// The Checks tab lines up what Claude returned with what validate.py did. These tests hold it to
// the run's own counts, so the tab can't show a pass or a refusal the run didn't make.
import { describe, expect, it } from 'vitest'
import { checkItems, tally } from './checks'
import { runBySlug, runs } from './data'

describe('checks: model output next to the verdict', () => {
  for (const run of runs) {
    const slug = run.account.slug
    it(`${slug}: one item per thing the model returned, and every refusal the run logged`, () => {
      const ex = (run as unknown as { extracted: Record<string, unknown> }).extracted
      const lines = (ex.road_lines as unknown[]).length
      const phones = (ex.department_phones as unknown[] | undefined)?.length ?? 0
      const signs = (ex.sign_work as unknown[] | undefined)?.length ?? 0
      const expected = lines + phones + signs + (ex.roads_head ? 1 : 0) + (ex.department_email ? 1 : 0)
      const items = checkItems(run)
      expect(items).toHaveLength(expected)
      expect(tally(items).refused).toBe(run.rejected.length)
    })
  }

  it('Lincoln: three ratios refused, two lines summed into 310 km and sent to a person, "approximately 300km" shown as its rounded form', () => {
    const items = checkItems(runBySlug.lincoln).filter((x) => x.field === 'road_length_km')
    expect(items.filter((x) => x.verdict === 'refused').map((x) => x.said.split(' ')[0])).toEqual(['0', '0.43', '0.84'])
    expect(items.filter((x) => x.verdict === 'asked').map((x) => x.why)).toEqual([
      'summed into 310 km, sent to a person',
      'summed into 310 km, sent to a person',
    ])
    expect(items.find((x) => x.said.startsWith('300'))).toMatchObject({ verdict: 'shown', why: 'the rounded form of 310 km' })
  })

  it("Tompkins: the county page's 302 miles sits beside the state's figure, within 2%", () => {
    const [line] = checkItems(runBySlug.tompkins).filter((x) => x.field === 'road_length_km')
    expect(line).toMatchObject({ verdict: 'shown', why: 'within 2% of 483.8 km' })
  })

  it('West Lincoln: paved roads alone are not the network, and an area is refused', () => {
    const items = checkItems(runBySlug['west-lincoln']).filter((x) => x.field === 'road_length_km')
    expect(items.find((x) => x.said.startsWith('354,749'))).toMatchObject({ verdict: 'unused', why: 'covers only part of the roads' })
    expect(items.find((x) => x.said.startsWith('612,230'))).toMatchObject({ verdict: 'refused', why: 'an area, not a length' })
  })

  it('Pelham: a title with no name makes no Contact, and two phone numbers go to a person', () => {
    const items = checkItems(runBySlug.pelham)
    expect(items.find((x) => x.field === 'roads_head')).toMatchObject({ verdict: 'unused' })
    expect(items.filter((x) => x.field === 'phone').map((x) => x.verdict)).toEqual(['asked', 'asked'])
  })

  it('Warren: the roads head matches the existing Contact', () => {
    expect(checkItems(runBySlug.warren).find((x) => x.field === 'roads_head')).toMatchObject({ verdict: 'kept', why: 'matches an existing Contact' })
  })
})
