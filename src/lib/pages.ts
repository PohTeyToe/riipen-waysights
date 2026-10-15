// The exact text each quote was checked against (data/run/pages), loaded only when someone asks to see it.
export type SavedPage = {
  id: string
  url: string
  kind: 'html' | 'pdf' | 'dataset'
  sha256: string
  fetched_at: string
  used: boolean
  text: string | null
  pdf_pages: Record<string, string> | null
}

const modules = import.meta.glob<{ default: SavedPage[] }>('../../data/run/pages/*.json')
const cache = new Map<string, Promise<SavedPage[]>>()

export function loadPages(slug: string): Promise<SavedPage[]> {
  const key = `../../data/run/pages/${slug}.json`
  if (!cache.has(key)) {
    const load = modules[key]
    cache.set(key, load ? load().then((m) => m.default) : Promise.resolve([]))
  }
  return cache.get(key)!
}

export function savedText(page: SavedPage, pdfPage: number | null): string | null {
  if (page.kind === 'pdf') return pdfPage && page.pdf_pages ? (page.pdf_pages[String(pdfPage)] ?? null) : null
  return page.text
}

// Same typographic folding as validate.norm: soft hyphen dropped, curly quotes and dashes made plain.
const SAME: Record<string, string> = Object.fromEntries(
  [[0xad, ''], [0x2018, "'"], [0x2019, "'"], [0x201c, '"'], [0x201d, '"'], [0x2013, '-'], [0x2014, '-'], [0xa0, ' ']].map(
    ([c, to]) => [String.fromCharCode(c as number), to as string],
  ),
)

function fold(text: string): { norm: string; map: number[] } {
  const map: number[] = []
  let norm = ''
  let prevSpace = true
  for (let i = 0; i < text.length; i++) {
    const ch = (SAME[text[i]] ?? text[i]).normalize('NFKC').toLowerCase()
    for (const c of ch) {
      if (/\s/.test(c)) {
        if (!prevSpace) {
          norm += ' '
          map.push(i)
        }
        prevSpace = true
      } else {
        norm += c
        map.push(i)
        prevSpace = false
      }
    }
  }
  return { norm: norm.trimEnd(), map }
}

/**
 * Find a quote in saved text the way validate.py does (case, spacing and typography ignored).
 * Returns the span in the original text, so the page can show the quote in place.
 */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const t = fold(text)
  const q = fold(quote).norm
  if (!q) return null
  const at = t.norm.indexOf(q)
  if (at === -1) return null
  return { start: t.map[at], end: t.map[at + q.length - 1] + 1 }
}

export type DatasetRow = { place: string; owned: number; total: number }

/** data.ny.gov rows as the run saved them: "Town of Day | county_mileage 20.88 | total_centerline_highway_mileage 52.67". */
export function datasetRows(text: string): DatasetRow[] {
  const out: DatasetRow[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^(.+?) \| county_mileage ([\d.]+) \| total_centerline_highway_mileage ([\d.]+)/)
    if (m) out.push({ place: m[1], owned: Number(m[2]), total: Number(m[3]) })
  }
  return out
}
