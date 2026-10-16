// Which lines of a saved page the run used, and which it refused. The source viewer highlights them.
import { isCite, type Cite, type Run } from './data'
import { findQuote, type SavedPage } from './pages'

/**
 * What the viewer opens: a page the run read, and optionally one line on it. `quotes` is for a brief
 * sentence that quotes several sources: the viewer focuses whichever of them this page prints.
 */
export type Focus = { source: string; quote?: string; quotes?: string[]; pdf_page?: number | null; row?: string }

export type Tone = 'used' | 'rejected'
export type LineMark = { quote: string; tone: Tone; row: string; pdf_page: number | null }

/** The words a brief sentence puts in quote marks: the part copied from the page. */
export function quotedBits(sentence: string): string[] {
  return [...sentence.matchAll(/"([^"]{6,})"/g)].map((m) => m[1].replace(/[.,]$/, ''))
}

export function marksFor(run: Run, source: string): LineMark[] {
  const out: LineMark[] = []
  const add = (c: Pick<Cite, 'quote' | 'source' | 'pdf_page'> | undefined, tone: Tone, row: string) => {
    if (c && c.source === source && c.quote) out.push({ quote: c.quote, tone, row, pdf_page: c.pdf_page ?? null })
  }
  for (const r of run.proposed) {
    for (const s of r.sources) if (isCite(s)) add(s, 'used', r.field)
    for (const p of r.partial ?? []) for (const s of p.sources) add(s, 'used', r.field)
  }
  for (const o of run.validated.road_length_km.options) for (const a of o.agrees ?? []) add(a.cite, 'used', 'road_length_km')
  for (const r of run.rejected) if (r.source && r.quote) add({ quote: r.quote, source: r.source, pdf_page: r.pdf_page ?? null }, 'rejected', 'rejected')
  for (const s of run.brief.sentences)
    if (s.cites.includes(source)) for (const q of quotedBits(s.text)) out.push({ quote: q, tone: 'used', row: 'brief', pdf_page: null })
  // One mark per line: the same quote can back several rows.
  const seen = new Set<string>()
  return out.filter((m) => {
    const k = `${m.tone}|${m.pdf_page}|${m.quote}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * The first of `quotes` a saved page prints, and on a PDF the saved page it is on. The brief logs
 * its quotes without a page, so this is how its citation opens on the right PDF page.
 */
export function locate(page: SavedPage, quotes: string[]): { quote: string; pdf_page: number | null } | null {
  for (const quote of quotes) {
    if (page.kind !== 'pdf') {
      if (page.text && findQuote(page.text, quote)) return { quote, pdf_page: null }
      continue
    }
    for (const [n, text] of Object.entries(page.pdf_pages ?? {})) if (findQuote(text, quote)) return { quote, pdf_page: Number(n) }
  }
  return null
}

export type Span = { start: number; end: number; mark: LineMark; focused: boolean }

/**
 * Where each mark sits in one saved text, overlaps merged. On a PDF page, a mark logged for another
 * page is skipped; a mark logged without a page (a brief quote) is drawn wherever this page prints it.
 */
export function spansIn(text: string, marks: LineMark[], pdfPage: number | null, focus?: string): Span[] {
  const spans: Span[] = []
  for (const m of marks) {
    if (pdfPage !== null && m.pdf_page !== null && m.pdf_page !== pdfPage) continue
    const at = findQuote(text, m.quote)
    if (at) spans.push({ ...at, mark: m, focused: !!focus && m.quote === focus })
  }
  spans.sort((a, b) => a.start - b.start || Number(b.focused) - Number(a.focused))
  const out: Span[] = []
  for (const s of spans) {
    const prev = out[out.length - 1]
    if (prev && s.start < prev.end) {
      if (s.focused) prev.focused = true
      continue
    }
    out.push(s)
  }
  return out
}

/** The source id the run gave a URL (key documents carry the URL, not the id). */
export function sourceIdFor(run: Run, url: string): string | undefined {
  return run.sources.find((s) => s.url === url)?.id
}
