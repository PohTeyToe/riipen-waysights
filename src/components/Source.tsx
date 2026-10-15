import { useEffect, useState, type ReactNode } from 'react'
import type { Cite } from '../lib/data'
import { cleanTitle, fmtDate, fmtMi, prettyUrl } from '../lib/format'
import { datasetRows, findQuote, loadPages, savedText, type DatasetRow, type SavedPage } from '../lib/pages'

/** Wrap the first case-insensitive match of `value` in a mark. */
export function highlight(text: string, value?: string | null): ReactNode {
  if (!value) return text
  const at = text.toLowerCase().indexOf(value.toLowerCase())
  if (at === -1) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + value.length)}</mark>
      {text.slice(at + value.length)}
    </>
  )
}

export function SourceLine({ cite, children }: { cite: Pick<Cite, 'url' | 'title' | 'pdf_page' | 'fetched_at'>; children?: ReactNode }) {
  return (
    <p className="src">
      <a href={cite.url} target="_blank" rel="noreferrer" title={prettyUrl(cite.url)}>
        {cleanTitle(cite.title)}
      </a>
      {cite.pdf_page ? <span> · PDF p. {cite.pdf_page}</span> : null}
      <span> · fetched {fmtDate(cite.fetched_at)}</span>
      {children}
    </p>
  )
}

function useSaved(slug: string, open: boolean) {
  const [pages, setPages] = useState<SavedPage[] | null>(null)
  useEffect(() => {
    if (!open || pages) return
    let live = true
    loadPages(slug).then((p) => live && setPages(p))
    return () => {
      live = false
    }
  }, [slug, open, pages])
  return pages
}

/** The quote in its place in the saved page text, the same text validate.py checked it against. */
function InPlace({ slug, cite }: { slug: string; cite: Cite }) {
  const pages = useSaved(slug, true)
  if (!pages) return <p className="inplace inplace--loading">Loading the saved text…</p>
  const page = pages.find((p) => p.id === cite.source)
  const text = page ? savedText(page, cite.pdf_page) : null
  const span = text ? findQuote(text, cite.quote) : null
  if (!page || !text || !span) return <p className="inplace">The saved text for this page isn't in the repo.</p>
  const R = 260
  const from = Math.max(0, span.start - R)
  const to = Math.min(text.length, span.end + R)
  return (
    <div className="inplace">
      <p className="inplace-head">
        Saved text, {cite.source}
        {cite.pdf_page ? `, PDF page ${cite.pdf_page}` : ''} · sha256 {page.sha256.slice(0, 12)}
      </p>
      <pre>
        {from > 0 ? '… ' : ''}
        {text.slice(from, span.start)}
        <mark>{text.slice(span.start, span.end)}</mark>
        {text.slice(span.end, to)}
        {to < text.length ? ' …' : ''}
      </pre>
    </div>
  )
}

export function Quote({ slug, cite, value }: { slug: string; cite: Cite; value?: string | null }) {
  const [open, setOpen] = useState(false)
  const isDataset = cite.column !== undefined
  return (
    <figure className="quote">
      <blockquote>
        <span className="qmark" aria-hidden="true">
          “
        </span>
        {highlight(cite.quote, value)}
        <span className="qmark" aria-hidden="true">
          ”
        </span>
      </blockquote>
      <figcaption>
        <SourceLine cite={cite}>
          <span> · </span>
          <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : isDataset ? `Show the ${cite.rows} rows` : 'Show it in the saved text'}
          </button>
        </SourceLine>
      </figcaption>
      {open ? isDataset ? <Rows slug={slug} cite={cite} /> : <InPlace slug={slug} cite={cite} /> : null}
    </figure>
  )
}

function Rows({ slug, cite }: { slug: string; cite: Cite }) {
  const pages = useSaved(slug, true)
  if (!pages) return <p className="inplace inplace--loading">Loading the saved rows…</p>
  const page = pages.find((p) => p.id === cite.source)
  const rows: DatasetRow[] = page?.text ? datasetRows(page.text) : []
  const owned = rows.reduce((n, r) => n + r.owned, 0)
  const total = rows.reduce((n, r) => n + r.total, 0)
  return (
    <div className="inplace rows">
      <p className="inplace-head">
        Saved rows, {cite.source} · data.ny.gov, year {cite.year} · sha256 {page?.sha256.slice(0, 12)}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Municipality</th>
              <th scope="col" className="num">
                county_mileage
              </th>
              <th scope="col" className="num">
                total_centerline_highway_mileage
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.place}>
                <td>{r.place}</td>
                <td className="num">{r.owned}</td>
                <td className="num">{r.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Sum, miles</th>
              <td className="num">{fmtMi(owned)}</td>
              <td className="num">{fmtMi(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
