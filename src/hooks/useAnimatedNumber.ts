import { useEffect, useRef, useState } from 'react'

function easeInOutCubic(t: number): number {
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
