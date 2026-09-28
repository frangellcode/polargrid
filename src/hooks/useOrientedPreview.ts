import { useEffect, useMemo } from 'react'
import { drawOrientedImage, orientedSize, photoOrientation } from '../lib/cropMath'
import type { PhotoTransform } from '../types'

type Source = CanvasImageSource & { width: number; height: number }

/**
 * The preview bitmap turned and mirrored the way the transform says, as a
 * canvas the live Konva node can draw like any other image — so everything
 * that positions, pans and zooms the photo keeps working on a plain rect,
 * just with the width and height swapped on a quarter turn. The untouched
 * bitmap comes straight back when there's nothing to do.
 */
export function useOrientedPreview<T extends Source | null>(bitmap: T, transform: PhotoTransform): Source | T {
  const { turns, identity } = photoOrientation(transform)
  const flipH = !!transform.flipH
  const flipV = !!transform.flipV

  const canvas = useMemo(() => {
    if (!bitmap || identity) return null
    const orientation: PhotoTransform = { offsetX: 0, offsetY: 0, zoom: 1, turns, flipH, flipV }
    const size = orientedSize(bitmap.width, bitmap.height, orientation)
    const c = document.createElement('canvas')
    c.width = size.width
    c.height = size.height
    const ctx = c.getContext('2d')
    if (!ctx) return null
    drawOrientedImage(ctx, bitmap, { x: 0, y: 0, width: size.width, height: size.height }, orientation)
    return c
  }, [bitmap, identity, turns, flipH, flipV])

  // Released once replaced — WebKit caps the canvas memory a page may hold.
  useEffect(() => {
    if (!canvas) return
    return () => {
      canvas.width = 0
      canvas.height = 0
    }
  }, [canvas])

  return canvas ?? bitmap
}
