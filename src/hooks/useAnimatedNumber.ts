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
 * Opacity that briefly dips down and eases back to 1 whenever `trigger`
 * changes (a quick cross-fade), instead of staying at 1. Meant for content
 * that's about to reflow into a very different arrangement — e.g. every
 * collage cell re-tiling into a new template layout, where each cell tweens
 * its own position/size independently and can visibly cross over another
 * cell mid-move. Dipping opacity during that window hides the crossover
 * instead of it reading as a stray flicker. No dip on mount.
 *
 * `minOpacity` floors how low the dip goes (default 0.55, not 0): this value
 * is applied to a Konva Group sitting in front of a plain white canvas
 * background, so a dip all the way to fully transparent reads as a stark
 * white flash, not a subtle cross-fade — the whole point was to trade the
 * crossover glitch for something LESS jarring, and a full-white pop isn't
 * that. Never pass 1 (that's just "no dip at all", defeating the hook).
 */
export function useReflowFade(trigger: string | number, duration = 320, minOpacity = 0.55): number {
  const [opacity, setOpacity] = useState(1)
  const rafRef = useRef<number | undefined>(undefined)
  const prevTrigger = useRef(trigger)
  const isMounted = useRef(false)

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      prevTrigger.current = trigger
      return
    }
    if (prevTrigger.current === trigger) return
    prevTrigger.current = trigger

    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      // Triangular envelope (1 -> 0 -> 1) run through the same ease as the
      // position tween, so the dip and the reflow finish in step.
      const wave = t < 0.5 ? 1 - easeInOutCubic(t * 2) : easeInOutCubic((t - 0.5) * 2)
      setOpacity(minOpacity + (1 - minOpacity) * wave)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setOpacity(1)
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [trigger, duration, minOpacity])

  return opacity
}

/**
 * True starting the exact render `trigger` changes, for `duration` ms after —
 * never true on mount. Meant for gating a consumer's OWN animation (e.g. a
 * cell's `animateLayout`) on "is a reflow transition in flight right now",
 * where a one-render lag would matter: an effect-based version of this (like
 * useReflowFade above) returns stale state for the render where `trigger`
 * actually changes, so a consumer using it to pick between an animated and a
 * raw value would render the raw (snapped) value for one frame, THEN switch
 * to the animated value — which by then has already started easing from the
 * OLD position — producing a visible snap-then-jump-back-then-ease glitch.
 * Updating state during render (React's documented "adjust state when a prop
 * changes" pattern) instead makes the flip take effect in the same commit as
 * the trigger change, so no such frame exists.
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
