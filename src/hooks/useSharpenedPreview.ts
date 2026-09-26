import { useEffect, useState } from 'react'
import { sharpenedPreview } from '../lib/sharpen'

/** How long the slider has to rest before the preview is re-sharpened — one
 *  pass over a preview bitmap takes long enough on a phone that doing it on
 *  every slider tick would make the slider itself stutter. */
const SETTLE_MS = 90

/**
 * The preview bitmap with the sharpness applied, for the live canvas. Returns
 * the untouched bitmap at 0, and keeps showing the previous result while a new
 * amount is being worked out so the photo never flickers back to unsharpened.
 */
export function useSharpenedPreview<T extends ImageBitmap | null>(bitmap: T, sharpness: number): CanvasImageSource | T {
  const [result, setResult] = useState<{ bitmap: ImageBitmap; canvas: HTMLCanvasElement } | null>(null)

  useEffect(() => {
    if (sharpness <= 0 || !bitmap) {
      setResult(null)
      return
    }
    const t = setTimeout(() => {
      const canvas = sharpenedPreview(bitmap, sharpness)
      if (canvas) setResult({ bitmap: bitmap as ImageBitmap, canvas })
    }, SETTLE_MS)
    return () => clearTimeout(t)
  }, [bitmap, sharpness])

  // Release each sharpened canvas once it's replaced — WebKit caps the canvas
  // memory a page may hold.
  useEffect(() => {
    if (!result) return
    const { canvas } = result
    return () => {
      canvas.width = 0
      canvas.height = 0
    }
  }, [result])

  if (sharpness <= 0 || !result || result.bitmap !== bitmap) return bitmap
  return result.canvas
}
