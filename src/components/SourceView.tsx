import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readableUrl, runBySlug, type Source } from '../lib/data'
import { cleanTitle, fmtBytes, fmtKm1, fmtMi, fmtTime, prettyUrl } from '../lib/format'
import { locate, marksFor, spansIn, type Focus, type Span } from '../lib/marks'
import { datasetRows, loadPages, savedText, type SavedPage } from '../lib/pages'

const MI_KM = 1.609344

function useSaved(slug: string) {
  const [pages, setPages] = useState<{ slug: string; pages: SavedPage[] } | null>(null)
  useEffect(() => {
    let live = true
    loadPages(slug).then((p) => live && setPages({ slug, pages: p }))
    return () => {
      live = false
    }
  }, [slug])
  return pages?.slug === slug ? pages.pages : null
}

function Marked({ text, spans }: { text: string; spans: Span[] }) {
  const parts: ReactNode[] = []
  let at = 0
  spans.forEach((s, i) => {
    parts.push(text.slice(at, s.start))
    parts.push(
      <mark key={i} className={`m m--${s.mark.tone}${s.focused ? ' is-focus' : ''}`} data-focus={s.focused || undefined}>
        {text.slice(s.start, s.end)}
      </mark>,
    )
    at = s.end
  })
  parts.push(text.slice(at))
  return <>{parts}</>
}

/** The page a value came from, as the run saved it, with every line it used or refused marked. */
export function SourceView({ slug, focus, onClose }: { slug: string; focus: Focus; onClose?: () => void }) {
  const run = runBySlug[slug]
  const src = run.sources.find((s) => s.id === focus.source)
  const pages = useSaved(slug)
  const page = pages?.find((p) => p.id === focus.source)
  const pdfPages = page?.pdf_pages ? Object.keys(page.pdf_pages).map(Number) : []
  // A brief citation names its sentence's quotes, with no page: open on the one this source prints.
  const found = useMemo(() => (page && focus.quotes ? locate(page, focus.quotes) : null), [page, focus.quotes])
  const quote = focus.quote ?? found?.quote
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [focus])
  const shownPdf = page?.kind === 'pdf' ? (picked ?? focus.pdf_page ?? found?.pdf_page ?? pdfPages[0] ?? null) : null

  const marks = useMemo(() => marksFor(run, focus.source), [run, focus.source])
  const text = page ? savedText(page, shownPdf) : null
  const spans = useMemo(() => (text ? spansIn(text, marks, shownPdf, quote) : []), [text, marks, shownPdf, quote])

  const box = useRef<HTMLPreElement>(null)
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('mark[data-focus]') ?? box.current?.querySelector<HTMLElement>('mark')
    const pre = box.current
    if (!el || !pre) return
    // Measured against the scroll box itself, so the marked line lands near the top of it.
    const top = el.getBoundingClientRect().top - pre.getBoundingClientRect().top + pre.scrollTop
    pre.scrollTop = Math.max(0, top - 48)
  }, [spans])

  if (!src) return null
  const used = spans.filter((s) => s.mark.tone === 'used').length
  const refused = spans.filter((s) => s.mark.tone === 'rejected').length

  return (
    <div className="srcv">
      <Head src={src} pdfPage={shownPdf} onClose={onClose} />
      {pdfPages.length > 1 ? (
        <div className="srcv-pages" role="group" aria-label="Saved PDF pages">
          {pdfPages.map((n) => (
            <button key={n} type="button" className="seg" aria-pressed={n === shownPdf} onClick={() => setPicked(n)}>
              p. {n}
            </button>
          ))}
        </div>
      ) : null}
      {!pages ? (
        <p className="srcv-empty">Loading the saved text</p>
      ) : !page || (!text && page.kind !== 'dataset') ? (
        <p className="srcv-empty">Read during the run, no value taken from it, so its text isn't saved.</p>
      ) : page.kind === 'dataset' ? (
        <Rows page={page} focusQuote={focus.quote} />
      ) : (
        <>
          <p className="srcv-legend">
            <span className="m m--used">{used} used</span>
            {refused ? <span className="m m--rejected">{refused} refused by a check</span> : null}
            <span className="srcv-sha" title={src.sha256}>
              sha256 {src.sha256.slice(0, 10)}
            </span>
          </p>
          <pre className="srcv-text" ref={box} tabIndex={0} aria-label="Saved page text">
            <Marked text={text!} spans={spans} />
          </pre>
        </>
      )}
    </div>
  )
}

function Head({ src, pdfPage, onClose }: { src: Source & { elapsed_ms?: number }; pdfPage: number | null; onClose?: () => void }) {
  const url = readableUrl(src.url)
  return (
    <header className="srcv-head">
      <div className="srcv-title">
        <span className="srcv-id">{src.id}</span>
        <strong>{cleanTitle(src.title)}</strong>
        {onClose ? (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close source">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      <a className="srcv-url" href={url} target="_blank" rel="noreferrer">
        {prettyUrl(url)}
      </a>
      <p className="srcv-meta">
        <span className={src.status >= 400 ? 'bad' : undefined}>HTTP {src.status}</span>
        <span>{fmtBytes(src.bytes)}</span>
        {src.elapsed_ms ? <span>{src.elapsed_ms} ms</span> : null}
        <span>fetched {fmtTime(src.fetched_at, false)} UTC</span>
        {pdfPage && src.pdf_page_count ? (
          <span>
            PDF page {pdfPage} of {src.pdf_page_count}
          </span>
        ) : null}
      </p>
    </header>
  )
}

function Rows({ page, focusQuote }: { page: SavedPage; focusQuote?: string }) {
  const lines = page.text!.split('\n')
  const about = lines.filter((l) => /^[a-z_]+: /.test(l))
  const rows = datasetRows(page.text!)
  const owned = rows.reduce((n, r) => n + r.owned, 0)
  const total = rows.reduce((n, r) => n + r.total, 0)
  return (
    <div className="rows">
      <ul className="rows-about">
        {about.map((l) => {
          const [col, ...rest] = l.split(': ')
          return (
            <li key={col} className={focusQuote?.startsWith(col) ? 'is-focus' : undefined}>
              <code>{col}</code> {rest.join(': ')}
            </li>
          )
        })}
      </ul>
      <div className="rows-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Municipality</th>
              <th scope="col" className="num is-sum">
                county_mileage
              </th>
              <th scope="col" className="num">
                total_centerline
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.place}>
                <td>{r.place}</td>
                <td className="num is-sum">{r.owned}</td>
                <td className="num">{r.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Sum, mi</th>
              <td className="num is-sum">{fmtMi(owned)}</td>
              <td className="num">{fmtMi(total)}</td>
            </tr>
            <tr>
              <th scope="row">× 1.609344, km</th>
              <td className="num is-sum">{fmtKm1(owned * MI_KM)}</td>
              <td className="num">{fmtKm1(total * MI_KM)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
