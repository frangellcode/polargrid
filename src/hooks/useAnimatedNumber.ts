import { useEffect, useRef, useState } from 'react'

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Smoothly cross-fades between hex colors whenever `target` changes,
 *  instead of snapping — e.g. the border-color swatches. */
export function useAnimatedColor(target: string, duration = 320): string {
  const [value, setValue] = useState(target)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (value === target) return
    const [fr, fg, fb] = hexToRgb(value)
    const [tr, tg, tb] = hexToRgb(target)
    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      const e = easeInOutCubic(t)
      setValue(rgbToHex(fr + (tr - fr) * e, fg + (tg - fg) * e, fb + (tb - fb) * e))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}

/** Smoothly tweens a numeric value whenever `target` changes, instead of snapping to it. */
export function useAnimatedNumber(target: number, duration = 320): number {
  const [value, setValue] = useState(target)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const from = value
    const delta = target - from
    if (delta === 0) return

    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      setValue(from + delta * easeInOutCubic(t))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}


/**
 * True starting the exact render `trigger` changes, for `duration` ms after —
 * never true on mount. Meant for gating a consumer's OWN animation (e.g. a
 * cell's `animateLayout`) on "is a reflow transition in flight right now",
 * where a one-render lag would matter: a plain effect-based version of this
 * returns stale state for the render where `trigger` actually changes, so a
 * consumer using it to pick between an animated and a raw value would render
 * the raw (snapped) value for one frame, THEN switch to the animated value —
 * which by then has already started easing from the OLD position —
 * producing a visible snap-then-jump-back-then-ease glitch. Updating state
 * during render (React's documented "adjust state when a prop changes"
 * pattern) instead makes the flip take effect in the same commit as the
 * trigger change, so no such frame exists.
 */
export function useIsReflowing(trigger: string | number, duration = 320): boolean {
  const [prevTrigger, setPrevTrigger] = useState(trigger)
  const [reflowing, setReflowing] = useState(false)

  if (trigger !== prevTrigger) {
    setPrevTrigger(trigger)
    setReflowing(true)
  }

  useEffect(() => {
    if (!reflowing) return
    const t = setTimeout(() => setReflowing(false), duration)
    return () => clearTimeout(t)
  }, [reflowing, duration])

  return reflowing
}
