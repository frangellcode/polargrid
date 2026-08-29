import { useCallback } from 'react'
import type { LoadedPhoto } from '../types'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `photo-${Date.now()}-${idCounter}`
}

// Modern phone cameras decode to bitmaps far bigger than any on-screen cell
// will ever show (48MP+ → 8000px+ on the long edge) — PhotoCell draws the
// whole bitmap stretched into a small cell rect with no source-side
// cropping, so every animation/drag frame was re-downsampling that huge
// source from scratch. Capped comfortably above the live canvas's own
// ~900px long edge (see PREVIEW_LONG_EDGE in the editors) so pinch/zoom
// still has headroom before looking soft.
const PREVIEW_BITMAP_MAX_LONG_EDGE = 1600

async function buildPreviewBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const longEdge = Math.max(bitmap.width, bitmap.height)
  if (longEdge <= PREVIEW_BITMAP_MAX_LONG_EDGE) return bitmap
  const scale = PREVIEW_BITMAP_MAX_LONG_EDGE / longEdge
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'medium',
  })
}

/** Decodes File objects into ImageBitmaps, respecting EXIF orientation. */
export function useImageBitmap() {
  const loadFiles = useCallback(async (files: FileList | File[]): Promise<LoadedPhoto[]> => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const loaded = await Promise.all(
      list.map(async (file) => {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const previewBitmap = await buildPreviewBitmap(bitmap)
        const photo: LoadedPhoto = {
          id: nextId(),
          bitmap,
          previewBitmap,
          width: bitmap.width,
          height: bitmap.height,
          name: file.name,
        }
        return photo
      }),
    )
    return loaded
  }, [])

  return { loadFiles }
}
