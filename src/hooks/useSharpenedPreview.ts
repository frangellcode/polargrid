import { useEffect, useRef, useState } from 'react'
import { sharpenedPreview } from '../lib/sharpen'
import { adjustmentsKey, hasColourWork, type PhotoAdjustments } from '../lib/adjustments'

/** How long the slider has to rest before the preview is re-sharpened — one
 *  pass over a preview bitmap takes long enough on a phone that doing it on
 *  every slider tick would make the slider itself stutter. */
const SETTLE_MS = 90
/** The Edit sliders are something you judge while dragging, so they redraw
 *  at most this often mid-drag instead of only once the finger rests. */
const EDIT_THROTTLE_MS = 70

/**
 * The preview bitmap with the photo's Edit, Retro and sharpness applied, for
 * the live canvas. Returns the untouched bitmap when none is set, and keeps
 * showing the previous result while a new one is being worked out so the
 * photo never flickers back to the original.
 *
 * `original` (the before/after button) shows the untouched bitmap WITHOUT
 * dropping the processed one, so letting go swaps straight back to it instead
 * of working it all out again.
 */
type Source = CanvasImageSource & { width: number; height: number }

export function useSharpenedPreview<T extends Source | null>(
  bitmap: T,
  adjustments: PhotoAdjustments | null | undefined,
  original = false,
): CanvasImageSource | T {
  const [result, setResult] = useState<{ bitmap: Source; canvas: HTMLCanvasElement } | null>(null)
  const sharpness = adjustments?.sharpness ?? 0
  const editKey = adjustmentsKey(adjustments)
  const active = sharpness > 0 || editKey !== ''
  const lastRun = useRef(0)
  const lastEditKey = useRef(editKey)

  useEffect(() => {
    if (!active || !bitmap) {
      setResult(null)
      return
    }
    // Only an Edit change is throttled; sharpness and a new photo settle first.
    const editChanged = lastEditKey.current !== editKey
    lastEditKey.current = editKey
    const delay = editChanged ? Math.max(0, EDIT_THROTTLE_MS - (performance.now() - lastRun.current)) : SETTLE_MS
    const t = setTimeout(() => {
      lastRun.current = performance.now()
      const canvas = sharpenedPreview(bitmap, sharpness, hasColourWork(adjustments) ? adjustments : null)
      if (canvas) setResult({ bitmap: bitmap as Source, canvas })
    }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `adjustments` is tracked by its values (editKey)
  }, [bitmap, sharpness, editKey, active])

  // Release each processed canvas once it's replaced — WebKit caps the canvas
  // memory a page may hold.
  useEffect(() => {
    if (!result) return
    const { canvas } = result
    return () => {
      canvas.width = 0
      canvas.height = 0
    }
  }, [result])

  if (original || !active || !result || result.bitmap !== bitmap) return bitmap
  return result.canvas
}
