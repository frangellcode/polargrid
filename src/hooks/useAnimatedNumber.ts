import { useEffect, useRef, useState } from 'react'

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
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
 */
export function useReflowFade(trigger: string | number, duration = 320): number {
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
      setOpacity(wave)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setOpacity(1)
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [trigger, duration])

  return opacity
}
