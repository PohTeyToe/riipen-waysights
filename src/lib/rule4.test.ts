// Rule 4 re-run in the browser must agree with the pipeline at the setting the run used.
import { describe, expect, it } from 'vitest'
import { runBySlug, runs, scorecard } from './data'
import { nearGap, RECORDED_NEAR, rescore, roadAt } from './rule4'

describe('rule 4 what-if', () => {
  it('at 2% it reproduces every recorded road row and the recorded scorecard', () => {
    for (const run of runs) {
      const saved = run.validated.road_length_km
      const at = roadAt(run, RECORDED_NEAR)
      expect(at.status, run.account.slug).toBe(saved.status)
      expect(at.value_km ?? null, run.account.slug).toBe(saved.value_km ?? null)
      expect(at.options.map((o) => o.km), run.account.slug).toEqual(saved.options.map((o) => o.km))
    }
    const r = rescore(RECORDED_NEAR)
    expect(r.counts).toEqual(scorecard.counts)
    expect(r.keyAgrees).toBe(scorecard.sent_to_person_key_agrees)
    expect(r.changed).toEqual([])
  })

  it('at 0% Warren and Tompkins go to a person, as the answer key wanted', () => {
    const r = rescore(0)
    expect(r.changed.sort()).toEqual(['tompkins', 'warren'])
    expect(r.counts).toEqual({ right: 24, wrong: 0, correctly_blank: 7, missed: 0, sent_to_person: 5 })
    expect(r.keyAgrees).toBe(4)
    const warren = roadAt(runBySlug.warren, 0)
    expect(warren.status).toBe('needs_human')
    // The state's centerline figure comes first; the county page never says centerline.
    expect(warren.options.map((o) => o.km)).toEqual([393.2, 398.1])
    expect(roadAt(runBySlug.tompkins, 0).options.map((o) => o.km)).toEqual([483.8, 486])
  })

  it('flips each county exactly where its two figures stop agreeing', () => {
    const tompkins = nearGap(runBySlug.tompkins)!
    const warren = nearGap(runBySlug.warren)!
    expect(tompkins).toBeCloseTo(0.0045, 4)
    expect(warren).toBeCloseTo(0.0123, 4)
    expect(roadAt(runBySlug.tompkins, tompkins).status).toBe('filled')
    expect(roadAt(runBySlug.tompkins, tompkins - 0.0001).status).toBe('needs_human')
    expect(rescore(0.005).changed).toEqual(['warren'])
  })

  it('never touches Lincoln\'s rounded figure, whatever the tolerance', () => {
    for (const n of [0, 0.01, 0.03]) expect(roadAt(runBySlug.lincoln, n).options.map((o) => o.km)).toEqual([310])
  })
})

// pipeline/sweep_near.py runs the real Checker.road_length on the saved model output at 0% to 5%.
// The slider must decide exactly what the pipeline would, at every one of those settings.
import sweep from './rule4.sweep.json'

describe('rule 4 what-if against the pipeline itself', () => {
  it('matches pipeline/validate.py at every tolerance from 0% to 5%', () => {
    expect(sweep.recorded_near).toBe(RECORDED_NEAR)
    const by = sweep.by_account as Record<string, Record<string, { status: string; value_km: number | null; options: number[] }>>
    let checked = 0
    for (const run of runs) {
      for (const [near, want] of Object.entries(by[run.account.slug])) {
        const got = roadAt(run, Number(near))
        expect({ status: got.status, value_km: got.value_km ?? null, options: got.options.map((o) => o.km) }, `${run.account.slug} @ ${near}`).toEqual(want)
        checked++
      }
    }
    expect(checked).toBe(6 * 51)
  })
})
