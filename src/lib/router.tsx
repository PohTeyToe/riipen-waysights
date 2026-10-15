// A small history router: four paths and one query parameter don't need a library.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const EVENT = 'app:navigate'

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(EVENT, cb)
  }
}

const snapshot = () => window.location.pathname + window.location.search
const here = () => snapshot() + window.location.hash

export function useLocation(): { path: string; query: URLSearchParams } {
  const loc = useSyncExternalStore(subscribe, snapshot, () => '/')
  const [path, search = ''] = loc.split('?')
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(search) }
}

export function navigate(to: string, { keepScroll = false } = {}) {
  if (to === here()) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(EVENT))
  const hash = to.split('#')[1]
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }))
  else if (!keepScroll) window.scrollTo({ top: 0 })
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; keepScroll?: boolean }

export function Link({ to, keepScroll, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to, { keepScroll })
  }
  return <a href={to} onClick={handle} {...rest} />
}
