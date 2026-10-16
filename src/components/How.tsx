import { useEffect, useId, useRef, useState } from 'react'
import { REPO } from '../lib/data'

/** The method, behind one click. Under 120 words. */
export function How() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div className="how">
      <button ref={btn} type="button" className="tbtn tbtn--how" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        How it works
      </button>
      {open ? (
        <div ref={box} id={id} className="how-panel" role="region" aria-label="How it works">
          <ol className="how-steps">
            <li>Each Account runs on its own worker, three at a time. One shared clock keeps a 2 second pause between requests to any one site.</li>
            <li>A worker reads robots.txt, then follows the site's own menu links to roads, contact and plan pages. Approved sites only, 15 pages at most. New York counties also get 3 requests to NYSDOT road data.</li>
            <li>Claude reads the saved text and returns each value with the line it came from.</li>
            <li>Code, not the model, checks every value against that line with five rules and drops what fails.</li>
            <li>When the pages can't settle a field, it asks a person. Nothing is sent to Zoho.</li>
          </ol>
          <a className="how-code" href={`${REPO}/tree/main/pipeline`} target="_blank" rel="noreferrer">
            Read the pipeline code
          </a>
        </div>
      ) : null}
    </div>
  )
}
