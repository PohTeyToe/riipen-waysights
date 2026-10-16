// The run board draws only what the run logged. These tests hold its counts to the run's own totals.
import { describe, expect, it } from 'vitest'
import { meta, runs } from './data'
import { clock, lanes, laneNow, peakWorkers, shownAt, SPAN, totalsAt } from './timeline'

describe('run board', () => {
  it('spans the recorded run and starts every lane inside it', () => {
    expect(SPAN).toBe(Date.parse(meta.finished_at) - Date.parse(meta.started_at))
    expect(clock(SPAN)).toBe('1:42')
    for (const l of lanes) {
      expect(l.start).toBeGreaterThanOrEqual(0)
      expect(l.end).toBeLessThanOrEqual(SPAN)
    }
  })

  it('had three Accounts in flight at most, the run\'s --jobs 3', () => {
    expect(peakWorkers()).toBe(3)
    // The later three each start the moment an earlier one finishes.
    const firsts = lanes.slice(0, 3)
    expect(new Set(firsts.map((l) => l.start)).size).toBe(1)
    for (const late of lanes.slice(3)) {
      const freed = Math.min(...lanes.filter((l) => l.end <= late.start).map((l) => late.start - l.end))
      expect(freed).toBeLessThan(10)
    }
  })

  it('counts pages, requests, rejections and questions the way the run did', () => {
    for (const l of lanes) {
      const end = laneNow(l, l.times.length, SPAN)
      expect(end.pages, l.slug).toBe(l.run.run.pages_read)
      expect(end.requests, l.slug).toBe(l.run.run.http_requests)
      expect(end.rejected, l.slug).toBe(l.run.rejected.length)
      expect(end.questions, l.slug).toBe(l.run.questions.length)
      expect(end.phase).toBe(l.run.status === 'needs_review' ? 'needs_review' : 'done')
    }
  })

  it("sends three fields to a person: two road questions and Pelham's two phone numbers", () => {
    const t = totalsAt(lanes.map((x) => x.times.length), SPAN)
    expect(t.questions).toBe(runs.reduce((n, r) => n + r.questions.length, 0))
    expect(t.asks).toBe(3)
    // Warren's notes about hidden email addresses are the crawler's, not questions.
    const warren = lanes.find((l) => l.slug === 'warren')!
    expect(laneNow(warren, warren.times.length, SPAN).asks).toBe(0)
  })

  it('finds one extract call per Account and one brief call per brief written', () => {
    for (const l of lanes) {
      expect(l.blocks.filter((b) => b.kind === 'extract'), l.slug).toHaveLength(1)
      expect(l.blocks.filter((b) => b.kind === 'brief'), l.slug).toHaveLength(l.run.brief.sentences.length ? 1 : 0)
      for (const b of l.blocks) expect(b.to).toBeGreaterThan(b.from)
    }
  })

  it('reveals steps in order and has every lane finished at the end', () => {
    const l = lanes[0]
    expect(shownAt(l, -1)).toBe(0)
    expect(shownAt(l, l.start)).toBeGreaterThan(0)
    expect(shownAt(l, SPAN)).toBe(l.times.length)
    const t = totalsAt(lanes.map((x) => x.times.length), SPAN)
    expect(t.done).toBe(runs.length)
    expect(t.pages).toBe(runs.reduce((n, r) => n + r.run.pages_read, 0))
  })

  it('says a lane is waiting before its worker picks it up, and with the model while the call is out', () => {
    const late = lanes[lanes.length - 1]
    expect(laneNow(late, 0, 0).phase).toBe('waiting')
    const call = late.blocks[0]
    const mid = (call.from + call.to) / 2
    expect(laneNow(late, shownAt(late, mid), mid).phase).toBe('model')
  })
})
