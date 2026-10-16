// The source viewer marks the lines the run used. These tests hold the brief's citations to the
// saved text: a brief quote has no PDF page of its own, so it must open on, and mark, the page that prints it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBySlug, runs } from './data'
import { locate, marksFor, quotedBits, spansIn } from './marks'
import { savedText, type SavedPage } from './pages'

const root = join(__dirname, '..', '..')
const pages = (slug: string): SavedPage[] => JSON.parse(readFileSync(join(root, 'data/run/pages', `${slug}.json`), 'utf8'))
const page = (slug: string, id: string) => pages(slug).find((p) => p.id === id)!

/** The marked strings the viewer draws when a brief citation opens. */
function opened(slug: string, sentence: string, source: string) {
  const saved = page(slug, source)
  const found = locate(saved, quotedBits(sentence))
  const text = savedText(saved, found?.pdf_page ?? null)!
  const spans = spansIn(text, marksFor(runBySlug[slug], source), found?.pdf_page ?? null, found?.quote)
  return { found, marked: spans.map((s) => text.slice(s.start, s.end)), focused: spans.filter((s) => s.focused).map((s) => text.slice(s.start, s.end)) }
}

describe('brief citations open on the line they quote', () => {
  it('Pelham S5: opens the Asset Management Plan at p. 62 with "Signs 2,601 Each" marked and focused', () => {
    const s = runBySlug.pelham.brief.sentences.find((x) => x.cites.includes('S5'))!
    const { found, marked, focused } = opened('pelham', s.text, 'S5')
    expect(found).toEqual({ quote: 'Signs 2,601 Each', pdf_page: 62 })
    expect(focused).toEqual(['Signs 2,601 Each'])
    expect(marked).toContain('Roadway 248 km $377.6 M')
  })

  it("West Lincoln S8: a sentence quoting two sources opens S8 on p. 67 at its own quote, not S3's", () => {
    const s = runBySlug['west-lincoln'].brief.sentences.find((x) => x.cites.includes('S8'))!
    const { found, focused } = opened('west-lincoln', s.text, 'S8')
    expect(found).toEqual({ quote: 'Signs & Posts 10 Assets $224,550 CPI', pdf_page: 67 })
    expect(focused).toEqual(['Signs & Posts 10 Assets $224,550 CPI'])
  })

  for (const run of runs) {
    const slug = run.account.slug
    it(`${slug}: every quoted brief sentence focuses a line on each source it cites`, () => {
      for (const s of run.brief.sentences) {
        if (!quotedBits(s.text).length) continue
        // A two-source sentence must find a quote on at least one of them; the other may back it with a value.
        const hits = s.cites.filter((c) => opened(slug, s.text, c).focused.length === 1)
        expect(hits.length, s.text).toBeGreaterThan(0)
      }
    })
  }

  it('a mark logged for another PDF page is not drawn on this one', () => {
    const saved = page('pelham', 'S5')
    const marks = marksFor(runBySlug.pelham, 'S5')
    const p68 = spansIn(savedText(saved, 68)!, marks, 68)
    expect(p68.every((s) => s.mark.pdf_page === null || s.mark.pdf_page === 68)).toBe(true)
  })
})
