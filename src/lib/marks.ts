// Which lines of a saved page the run used, and which it refused. The source viewer highlights them.
import { isCite, type Cite, type Run } from './data'

/** What the viewer opens: a page the run read, and optionally one line on it. */
export type Focus = { source: string; quote?: string; pdf_page?: number | null; row?: string }

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

/** The source id the run gave a URL (key documents carry the URL, not the id). */
export function sourceIdFor(run: Run, url: string): string | undefined {
  return run.sources.find((s) => s.url === url)?.id
}
