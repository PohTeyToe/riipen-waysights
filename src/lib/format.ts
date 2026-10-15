const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-15T19:10:27.341Z" or "2026-10-15" -> "Oct 15, 2026" (UTC, so every viewer sees the run's date). */
export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** "19:10:27.341" in UTC. */
export function fmtTime(iso: string, ms = true): string {
  const t = iso.slice(11, ms ? 23 : 19)
  return t
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)}, ${iso.slice(11, 16)} UTC`
}

const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
export function fmtKm(n: number): string {
  return nf1.format(n)
}

const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function fmtMi(n: number): string {
  return nf2.format(n)
}

export function fmtBytes(b: number): string {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`
  return `${Math.round(b / 1000)} KB`
}

/** A URL as people read it: no scheme, no www, spaces decoded. */
export function prettyUrl(url: string): string {
  let u = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
  try {
    u = decodeURI(u)
  } catch {
    /* keep it encoded */
  }
  return u.replace(/\/$/, '')
}

/** A page title without the site name tacked on the end ("Contact Us | Town of Lincoln" -> "Contact Us"). */
export function cleanTitle(title: string): string {
  const cut = title.split(/ \| | – /)[0].trim()
  return cut || title
}
