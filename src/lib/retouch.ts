/**
 * The healing brush around the fill itself (heal.ts): turning a brush stroke
 * into a patch of rebuilt pixels, and laying those patches over the photo
 * wherever it's drawn — the preview, and every export at full resolution.
 *
 * The original file is never rewritten. A full-resolution canvas of a phone
 * photo is bigger than WebKit lets a page hold, so the photo can't be
 * re-encoded with the fix in it; instead each patch is just the healed area,
 * kept as a small PNG and drawn over the original in the same frame.
 */
import type { LoadedPhoto, RetouchPatch } from '../types'
import type { ImageOverlays } from './cropMath'

/** A patch decoded and ready to draw. */
export interface LivePatch {
  patch: RetouchPatch
  bitmap: ImageBitmap
}

/** A brush stroke in the photo's own pixels. */
export interface Stroke {
  points: { x: number; y: number }[]
  radius: number
}

/** The fill works on at most this many pixels across. A bigger stroke on a
 *  big photo is filled at this size and scaled up: a second's wait rather
 *  than ten, and the fill is texture copied from nearby either way. */
const WORK_LONG_EDGE = 1100
/** Soft edge, in working pixels, where the fill fades into the photo. */
const FEATHER = 3

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { c, ctx }
}

/** Released at once — WebKit caps the canvas memory a page may hold. */
function release(c: HTMLCanvasElement) {
  c.width = 0
  c.height = 0
}

let worker: Worker | null = null
let nextJob = 0
const jobs = new Map<number, { resolve: (rgba: Uint8ClampedArray) => void; reject: (e: Error) => void }>()

function fill(width: number, height: number, rgba: Uint8ClampedArray, mask: Uint8Array): Promise<Uint8ClampedArray> {
  if (!worker) {
    worker = new Worker(new URL('./healWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; rgba?: Uint8ClampedArray; error?: string }>) => {
      const job = jobs.get(e.data.id)
      if (!job) return
      jobs.delete(e.data.id)
      if (e.data.rgba) job.resolve(e.data.rgba)
      else job.reject(new Error(e.data.error ?? 'heal failed'))
    }
  }
  const id = ++nextJob
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject })
    worker!.postMessage({ id, width, height, rgba, mask }, [rgba.buffer, mask.buffer])
  })
}

/**
 * Heals what `stroke` covers on `full` (the photo decoded at full size), on
 * top of the patches already made. Null when the stroke misses the photo.
 */
export async function healStroke(full: ImageBitmap, existing: LivePatch[], stroke: Stroke): Promise<LivePatch | null> {
  const W0 = full.width
  const H0 = full.height
  const xs = stroke.points.map((p) => p.x)
  const ys = stroke.points.map((p) => p.y)
  // The area that changes: the stroke, plus room for its soft edge.
  const reach = stroke.radius * 1.15 + 2
  const hx0 = Math.max(0, Math.floor(Math.min(...xs) - reach))
  const hy0 = Math.max(0, Math.floor(Math.min(...ys) - reach))
  const hx1 = Math.min(W0, Math.ceil(Math.max(...xs) + reach))
  const hy1 = Math.min(H0, Math.ceil(Math.max(...ys) + reach))
  if (hx1 <= hx0 || hy1 <= hy0) return null
  // The photo around it the fill copies from: about the stroke's own size
  // again on every side.
  const margin = Math.max(48, Math.max(hx1 - hx0, hy1 - hy0))
  const rx = Math.max(0, hx0 - margin)
  const ry = Math.max(0, hy0 - margin)
  const rw = Math.min(W0, hx1 + margin) - rx
  const rh = Math.min(H0, hy1 + margin) - ry
  const ws = Math.min(1, WORK_LONG_EDGE / Math.max(rw, rh))
  const w = Math.max(1, Math.round(rw * ws))
  const h = Math.max(1, Math.round(rh * ws))

  // The region as it looks now, earlier fixes included.
  const region = canvas(w, h)
  const brush = canvas(w, h)
  const out = canvas(w, h)
  try {
    region.ctx.drawImage(full, rx, ry, rw, rh, 0, 0, w, h)
    for (const { patch, bitmap } of existing) {
      if (patch.x > rx + rw || patch.y > ry + rh || patch.x + patch.width < rx || patch.y + patch.height < ry) continue
      region.ctx.drawImage(bitmap, (patch.x - rx) * ws, (patch.y - ry) * ws, patch.width * ws, patch.height * ws)
    }
    const image = region.ctx.getImageData(0, 0, w, h)

    // The stroke, rasterised at the working size.
    const b = brush.ctx
    b.strokeStyle = '#fff'
    b.fillStyle = '#fff'
    b.lineCap = 'round'
    b.lineJoin = 'round'
    b.lineWidth = stroke.radius * 2 * ws
    b.beginPath()
    stroke.points.forEach((p, i) => (i ? b.lineTo((p.x - rx) * ws, (p.y - ry) * ws) : b.moveTo((p.x - rx) * ws, (p.y - ry) * ws)))
    if (stroke.points.length === 1) {
      b.arc((stroke.points[0].x - rx) * ws, (stroke.points[0].y - ry) * ws, stroke.radius * ws, 0, Math.PI * 2)
      b.fill()
    } else {
      b.stroke()
    }
    const painted = b.getImageData(0, 0, w, h).data

    // The hole is the stroke grown by the soft edge; alpha ramps across that
    // edge so the fill melts into the photo instead of ending on a line.
    const dist = new Int16Array(w * h).fill(-1)
    const queue: number[] = []
    for (let i = 0; i < w * h; i++) {
      if (painted[i * 4 + 3] >= 128) {
        dist[i] = 0
        queue.push(i)
      }
    }
    if (!queue.length) return null
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]
      if (dist[i] >= FEATHER) continue
      const x = i % w
      const y = (i - x) / w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || dist[j] >= 0) continue
        dist[j] = dist[i] + 1
        queue.push(j)
      }
    }
    const hole = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) hole[i] = dist[i] >= 0 ? 1 : 0

    const healed = await fill(w, h, image.data, hole)

    // Only the hole goes into the patch, faded at its edge.
    const patchPixels = new ImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      if (dist[i] < 0) continue
      patchPixels.data[i * 4] = healed[i * 4]
      patchPixels.data[i * 4 + 1] = healed[i * 4 + 1]
      patchPixels.data[i * 4 + 2] = healed[i * 4 + 2]
      patchPixels.data[i * 4 + 3] = Math.round(255 * (1 - dist[i] / (FEATHER + 1)))
    }
    out.ctx.putImageData(patchPixels, 0, 0)

    // Back to the photo's own pixels.
    const pw = hx1 - hx0
    const ph = hy1 - hy0
    const final = canvas(pw, ph)
    try {
      final.ctx.drawImage(out.c, (hx0 - rx) * ws, (hy0 - ry) * ws, pw * ws, ph * ws, 0, 0, pw, ph)
      const blob = await new Promise<Blob | null>((resolve) => final.c.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not encode the patch')
      const bitmap = await createImageBitmap(final.c)
      return { patch: { x: hx0, y: hy0, width: pw, height: ph, image: blob }, bitmap }
    } finally {
      release(final.c)
    }
  } finally {
    release(region.c)
    release(brush.c)
    release(out.c)
  }
}

/** Decodes a photo's saved patches. */
export async function decodePatches(patches: RetouchPatch[]): Promise<LivePatch[]> {
  return Promise.all(patches.map(async (patch) => ({ patch, bitmap: await createImageBitmap(patch.image) })))
}

/** A photo's patches, ready to hand to drawOrientedImage; undefined when it
 *  has none. Close them with closeOverlays once drawn. */
export async function decodeRetouch(photo: LoadedPhoto): Promise<ImageOverlays | undefined> {
  const patches = photo.retouch?.patches
  if (!patches?.length) return undefined
  const live = await decodePatches(patches)
  return {
    width: photo.width,
    height: photo.height,
    items: live.map(({ patch, bitmap }) => ({ image: bitmap, x: patch.x, y: patch.y, width: patch.width, height: patch.height })),
  }
}

export function closeOverlays(overlays?: ImageOverlays) {
  for (const item of overlays?.items ?? []) (item.image as ImageBitmap).close?.()
}

/** The photo's preview with its patches drawn in, from the untouched one. */
export async function previewWith(base: ImageBitmap, photo: { width: number; height: number }, patches: LivePatch[]): Promise<ImageBitmap> {
  const { c, ctx } = canvas(base.width, base.height)
  try {
    ctx.drawImage(base, 0, 0)
    const sx = base.width / photo.width
    const sy = base.height / photo.height
    for (const { patch, bitmap } of patches) ctx.drawImage(bitmap, patch.x * sx, patch.y * sy, patch.width * sx, patch.height * sy)
    return await createImageBitmap(c)
  } finally {
    release(c)
  }
}
