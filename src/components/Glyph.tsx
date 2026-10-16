import type { ScoreOutcome } from '../lib/data'

// Status is the only thing that gets strong color, and it always comes with a shape and a word.
// The shapes are road-sign shapes: guide-sign rectangle, warning diamond, stop octagon.

export type GlyphKind = 'filled' | 'person' | 'rejected' | 'blank' | 'merge'

export function Glyph({ kind, size = 12 }: { kind: GlyphKind; size?: number }) {
  const cls = `glyph glyph--${kind}`
  switch (kind) {
    case 'filled':
      return (
        <svg className={cls} viewBox="0 0 14 10" width={size + 2} height={size - 2} aria-hidden="true">
          <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="2" />
        </svg>
      )
    case 'person':
      return (
        <svg className={cls} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
          <path d="M6 0.6 11.4 6 6 11.4 0.6 6Z" />
        </svg>
      )
    case 'rejected':
      return (
        <svg className={cls} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
          <path d="M3.7 0.6h4.6l3.1 3.1v4.6l-3.1 3.1H3.7L0.6 8.3V3.7Z" />
        </svg>
      )
    case 'merge':
      return (
        <svg className={cls} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
          <circle cx="6" cy="6" r="5.2" />
        </svg>
      )
    case 'blank':
      return (
        <svg className={cls} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
          <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="1.5" />
        </svg>
      )
  }
}

export const OUTCOME: Record<ScoreOutcome, { glyph: GlyphKind; word: string }> = {
  right: { glyph: 'filled', word: 'right' },
  correctly_blank: { glyph: 'blank', word: 'blank, correctly' },
  sent_to_person: { glyph: 'person', word: 'to a person' },
  wrong: { glyph: 'rejected', word: 'wrong' },
  missed: { glyph: 'rejected', word: 'missed' },
}
