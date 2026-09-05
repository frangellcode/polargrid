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
    const list = Array.from(files)
    // One at a time, not Promise.all — decoding every file's full-resolution
    // bitmap in parallel means all of them are briefly resident together,
    // the exact spike this whole file is trying to avoid for a multi-photo
    // batch/collage upload.
    const loaded: LoadedPhoto[] = []
    for (const file of list) {
      // A file can pass every check the caller can make and still fail here —
      // a truncated download, a format this browser doesn't have a decoder
      // for. Skipping it keeps the rest of the selection: letting the throw
      // escape rejected the whole upload, and since no caller caught it, the
      // screen simply never changed.
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      } catch {
        continue
      }
      const previewBitmap = await buildPreviewBitmap(bitmap)
      const width = bitmap.width
      const height = bitmap.height
      // Free the full-res decode right away — only the (much smaller)
      // preview and the original file (for export, see exportImage.ts) are
      // kept for the rest of the session.
      if (previewBitmap !== bitmap) bitmap.close()
      loaded.push({ id: nextId(), file, previewBitmap, width, height, name: file.name })
    }
    return loaded
  }, [])

  return { loadFiles }
}
