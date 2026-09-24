import { useCallback } from 'react'
import type { LoadedPhoto } from '../types'
import { readPhoto } from '../lib/photoSource'
import type { PhotoSource } from '../lib/photoSource'

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
  const scale = Math.min(1, PREVIEW_BITMAP_MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  // Drawn through a canvas rather than createImageBitmap's own resize, so the
  // preview is real pixels by the time the import card closes. WebKit is free
  // to hand back a bitmap it hasn't actually decoded yet — and on a real
  // iPhone, with real HEIC photos, it did: the import finished quickly and all
  // nine full decodes then landed on the collage's first draw, which held the
  // screen blank for about a second. Here that work happens under the import
  // card's own progress, where it belongs.
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  try {
    return await createImageBitmap(canvas)
  } finally {
    // Released at once — WebKit caps the canvas memory a page may hold.
    canvas.width = 0
    canvas.height = 0
  }
}

/** Decodes File objects into ImageBitmaps, respecting EXIF orientation.
 *
 *  `onProgress` fires after each file is decoded (done, total). Decoding a
 *  five-photo batch takes seconds on a phone, and until this existed the
 *  screen simply sat on the upload prompt for all of it — indistinguishable
 *  from the tap not having landed. Every caller now puts a progress card up
 *  for the duration. */
export function useImageBitmap() {
  const loadFiles = useCallback(async (
    files: FileList | PhotoSource[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<LoadedPhoto[]> => {
    const list = Array.from(files)
    onProgress?.(0, list.length)
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
      let bitmap: ImageBitmap | null = null
      try {
        bitmap = await createImageBitmap(await readPhoto(file), { imageOrientation: 'from-image' })
        // Inside the same try as the decode: downscaling allocates a second
        // bitmap and can fail on its own (it is the tail end of a big
        // selection that runs closest to the memory ceiling). Letting that
        // throw escape rejected the WHOLE selection — which is how a
        // 15-photo pick could end up half-placed, with cells built for
        // photos that never arrived.
        const previewBitmap = await buildPreviewBitmap(bitmap)
        const width = bitmap.width
        const height = bitmap.height
        // Free the full-res decode right away — only the (much smaller)
        // preview and the original file (for export, see exportImage.ts) are
        // kept for the rest of the session.
        if (previewBitmap !== bitmap) bitmap.close()
        loaded.push({ id: nextId(), file, previewBitmap, width, height, name: file.name })
      } catch {
        // Don't leave the full-res decode resident just because the resize
        // after it failed — that is exactly the memory this path is short of.
        try {
          bitmap?.close()
        } catch {
          // already released
        }
        continue
      }
      onProgress?.(loaded.length, list.length)
      // A turn of the event loop between decodes, so the progress card above
      // actually repaints — createImageBitmap resolves in a microtask and the
      // loop would otherwise run to completion without ever yielding a frame,
      // leaving the counter frozen at 0/N until everything was done.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return loaded
  }, [])

  return { loadFiles }
}
