// The Zoho tab's diff must show exactly what an answer changes, request by request.
import { describe, expect, it } from 'vitest'
import { diffLines, requestDiff } from './diff'
import { runBySlug } from './data'
import { writePlan } from './record'

describe('diff', () => {
  it('keeps unchanged lines and marks the rest', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ])
  })

  it('Lincoln "Centerline": the road length is added, the Note goes, the status turns Done, the brief stays', () => {
    const run = runBySlug.lincoln
    const lines = requestDiff(run.writeback.requests, writePlan(run, { road_length_km: 0 }).requests)
    const added = lines.filter((l) => l.op === 'add').map((l) => l.text.trim())
    const removed = lines.filter((l) => l.op === 'del').map((l) => l.text.trim())
    // The road length lands where the pipeline puts it, so it is a clean one-line add.
    expect(added).toEqual(['"Enrichment_Status": "Done",', '"Road_Network_Centerline_km": 310,'])
    expect(removed).toContain('POST /crm/v8/Notes')
    expect(removed.some((l) => l.startsWith('"Account_Brief"'))).toBe(false)
  })

  it('no answers, no changes', () => {
    const run = runBySlug.tompkins
    expect(requestDiff(run.writeback.requests, writePlan(run, {}).requests).every((l) => l.op === 'same')).toBe(true)
  })
})
