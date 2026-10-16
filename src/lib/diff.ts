// A line diff (longest common subsequence). The Zoho requests are under a hundred lines, so the
// plain O(n*m) table is fine.
export type DiffLine = { op: 'same' | 'add' | 'del'; text: string }

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: 'del', text: a[i++] })
    else out.push({ op: 'add', text: b[j++] })
  }
  while (i < n) out.push({ op: 'del', text: a[i++] })
  while (j < m) out.push({ op: 'add', text: b[j++] })
  return out
}

type Req = { method: string; url: string; body: unknown }
const head = (r: Req) => `${r.method} ${r.url.replace('https://www.zohoapis.com', '')}`
const text = (r: Req) => `${head(r)}\n${JSON.stringify(r.body, null, 2)}`

/** Each request diffed against the same request in the recorded run, so lines never pair across requests. */
export function requestDiff(before: Req[], after: Req[]): DiffLine[] {
  const out: DiffLine[] = []
  const keys = [...new Set([...before.map(head), ...after.map(head)])]
  keys.forEach((k, i) => {
    const a = before.find((r) => head(r) === k)
    const b = after.find((r) => head(r) === k)
    if (i) out.push({ op: 'same', text: '' })
    if (!a) out.push(...text(b!).split('\n').map((t) => ({ op: 'add' as const, text: t })))
    else if (!b) out.push(...text(a).split('\n').map((t) => ({ op: 'del' as const, text: t })))
    else out.push(...diffLines(text(a), text(b)))
  })
  return out
}
