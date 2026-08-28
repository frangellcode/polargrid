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

