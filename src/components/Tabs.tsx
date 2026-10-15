import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

/**
 * Tabs with the keyboard contract: one Tab stop, arrow keys and Home/End move between tabs,
 * and the panel is labelled by its tab.
 */
export function Tabs({
  label,
  items,
  selected,
  onSelect,
  listClass,
  tabClass,
  panelClass,
  children,
}: {
  label: string
  items: ReactNode[]
  selected: number
  onSelect: (i: number) => void
  listClass: string
  tabClass: string
  panelClass: string
  children: ReactNode
}) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => {
    const n = (i + items.length) % items.length
    onSelect(n)
    refs.current[n]?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(selected + 1),
      ArrowLeft: () => move(selected - 1),
      Home: () => move(0),
      End: () => move(items.length - 1),
    }
    if (keys[e.key]) {
      e.preventDefault()
      keys[e.key]()
    }
  }
  return (
    <>
      <div className={listClass} role="tablist" aria-label={label}>
        {items.map((item, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            id={`${id}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={selected === i}
            aria-controls={`${id}-panel`}
            tabIndex={selected === i ? 0 : -1}
            className={tabClass}
            onClick={() => onSelect(i)}
            onKeyDown={onKey}
          >
            {item}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} className={panelClass} tabIndex={0}>
        {children}
      </div>
    </>
  )
}
