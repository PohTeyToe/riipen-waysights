// The replay clock. It moves a time t through the recorded run at a chosen speed.
// Two kinds of listener: per-frame ones move the playhead in the DOM directly, and React only
// re-renders when a lane gains a step (useReplay), so a 60 fps replay stays cheap.
import { useSyncExternalStore } from 'react'
import { lanes, shownAt, SPAN } from './timeline'

type FrameListener = (t: number) => void

export type ReplayState = { t: number; shown: number[]; playing: boolean; speed: number }

class Player {
  t = 0
  playing = false
  speed = 10
  private stopAt = SPAN
  private raf = 0
  private last = 0
  private frames = new Set<FrameListener>()
  private subs = new Set<() => void>()
  private state: ReplayState = { t: 0, shown: lanes.map(() => 0), playing: false, speed: 10 }

  /** Start from `from` and stop at `to` (ms into the run). */
  play(from = this.t >= this.stopAt || this.t >= SPAN ? 0 : this.t, to = SPAN) {
    this.stopAt = Math.min(SPAN, to)
    this.t = Math.max(0, Math.min(from, SPAN))
    this.playing = true
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.tick)
    this.emit()
  }

  pause() {
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.emit()
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(t, SPAN))
    this.emit()
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.emit()
  }

  /** Jump to the end of the run, every lane finished. */
  finish() {
    this.pause()
    this.seek(SPAN)
  }

  private tick = (now: number) => {
    const dt = Math.min(100, now - this.last)
    this.last = now
    this.t = Math.min(this.stopAt, this.t + dt * this.speed)
    if (this.t >= this.stopAt) this.playing = false
    this.emit()
    if (this.playing) this.raf = requestAnimationFrame(this.tick)
  }

  private emit() {
    this.frames.forEach((f) => f(this.t))
    const shown = lanes.map((l) => shownAt(l, this.t))
    const s = this.state
    if (s.playing !== this.playing || s.speed !== this.speed || shown.some((n, i) => n !== s.shown[i]) || (!this.playing && s.t !== this.t)) {
      this.state = { t: this.t, shown, playing: this.playing, speed: this.speed }
      this.subs.forEach((f) => f())
    }
  }

  onFrame(f: FrameListener) {
    this.frames.add(f)
    f(this.t)
    return () => {
      this.frames.delete(f)
    }
  }

  subscribe = (f: () => void) => {
    this.subs.add(f)
    return () => {
      this.subs.delete(f)
    }
  }

  snapshot = () => this.state
}

export const player = new Player()

export function useReplay(): ReplayState {
  return useSyncExternalStore(player.subscribe, player.snapshot, player.snapshot)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
