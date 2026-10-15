// Status is the only thing that gets color, and it always comes with a shape and a word.
// Shapes borrow from road signs: guide rectangle, warning diamond, stop octagon.
import type { ShownStatus } from '../lib/record'

export type GlyphKind = ShownStatus | 'rejected'

export function Glyph({ kind }: { kind: GlyphKind }) {
  const cls = `glyph glyph--${kind}`
  switch (kind) {
    case 'filled':
      return (
        <svg className={cls} viewBox="0 0 14 10" width="14" height="10" aria-hidden="true">
          <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="2.25" />
        </svg>
      )
    case 'needs_human':
      return (
        <svg className={cls} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M6 0.7 11.3 6 6 11.3 0.7 6Z" />
        </svg>
      )
    case 'rejected':
      return (
        <svg className={cls} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3.7 0.6h4.6l3.1 3.1v4.6l-3.1 3.1H3.7L0.6 8.3V3.7Z" />
        </svg>
      )
    case 'merge':
      return (
        <svg className={cls} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.2" />
        </svg>
      )
    case 'not_found':
    case 'blank':
    case 'empty':
      return (
        <svg className={cls} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="1" />
        </svg>
      )
  }
}

const LABEL: Record<GlyphKind, string> = {
  filled: 'Filled',
  needs_human: 'Needs a human',
  not_found: 'Not found',
  merge: 'Merge',
  blank: 'Left blank',
  empty: 'Not run',
  rejected: 'Rejected',
}

export function Chip({ kind, label }: { kind: GlyphKind; label?: string }) {
  return (
    <span className={`chip chip--${kind}`}>
      <Glyph kind={kind} />
      {label ?? LABEL[kind]}
    </span>
  )
}

/** One mark per field, for the Account list. */
export function Marks({ marks, label }: { marks: ShownStatus[]; label: string }) {
  return (
    <span className="marks" role="img" aria-label={label}>
      {marks.map((m, i) => (
        <Glyph key={i} kind={m} />
      ))}
    </span>
  )
}

/** A middle dot that keeps even spacing (Overpass's own sits off-center). */
export function Dot() {
  return (
    <span className="dot" aria-hidden="true">
      ·
    </span>
  )
}
