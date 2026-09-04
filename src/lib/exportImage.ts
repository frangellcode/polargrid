import type { CellAssignment, CellShape, ExportQuality, FreeItem, GridTemplate, LoadedPhoto, Orientation, PhotoFit, PhotoTransform } from '../types'
import { computeNativeCanvasSize, computeNativeCanvasSizeContain, computeOutputPixelSize, getImageDrawRect } from './cropMath'
import { ASPECT_RATIOS } from './aspectRatios'
import { capLongEdge, getMaxLongEdge } from './exportQuality'
import { traceShapePath } from './shapeClip'
import { drawGrainOverlay } from './grain'

const JPEG_QUALITY = 1.0

/** Presets store their ratio in portrait form — flip to landscape (1/ratio) for orientable presets. */
export function resolveRatio(aspectRatioId: string, fallbackRatio: number, orientation: Orientation = 'vertical'): number {
  const preset = ASPECT_RATIOS.find((r) => r.id === aspectRatioId)
  if (!preset || preset.ratio == null) return fallbackRatio
  return preset.orientable && orientation === 'horizontal' ? 1 / preset.ratio : preset.ratio
}

/** Decodes the ONE photo actually being drawn right now, at full resolution,
 *  straight from its original file — never held any longer than this single
 *  draw call. Exporting a batch/collage this way means at most one full
 *  camera-resolution bitmap exists at a time, no matter how many photos are
 *  in it; holding all of them decoded at once (as every photo's LoadedPhoto
 *  used to) is what was exceeding iOS's per-tab memory budget and getting
 *  the whole app killed and silently reloaded on a phone with less RAM than
 *  an iPad. */
async function drawPhotoInRect(
  ctx: CanvasRenderingContext2D,
  photo: LoadedPhoto,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  transform: PhotoTransform,
  rotationDeg = 0,
  fit: PhotoFit = 'cover',
  shape: CellShape = 'rect',
  grainIntensity = 0,
) {
  if (rectW <= 0 || rectH <= 0) return
  const bitmap = await createImageBitmap(photo.file, { imageOrientation: 'from-image' })
  try {
    ctx.save()
    ctx.translate(rectX + rectW / 2, rectY + rectH / 2)
    if (rotationDeg) ctx.rotate((rotationDeg * Math.PI) / 180)
    ctx.translate(-rectW / 2, -rectH / 2)
    traceShapePath(ctx, shape, rectW, rectH)
    ctx.clip()
    const draw = getImageDrawRect(rectW, rectH, photo.width, photo.height, transform, fit)
    ctx.drawImage(bitmap, draw.x, draw.y, draw.width, draw.height)
    // Grain is drawn over the photo's own rect, intersected with the cell's own
    // bounds — NOT the raw draw size. In 'contain' fit the photo can letterbox
    // inside the cell smaller than it, which is why this isn't just rectW/rectH
    // (grain over the full cell would speckle noise onto that empty gap). But
    // in 'cover' fit (the common case) `draw` routinely OVERSHOOTS the cell —
    // any time the photo's aspect ratio doesn't match the crop, or the person
    // zoomed in — and the shape clip above trims that overflow at render time
    // anyway, so sizing the grain canvas itself to the full uncropped draw size
    // was pure waste at best. At worst, for a native-resolution export with a
    // zoomed-in mismatched-aspect photo, `draw` can balloon to many times the
    // cell size, and grain.ts allocates a same-proportioned noise canvas from
    // whatever size it's given — large enough to blow past a canvas's real
    // pixel-area limit and throw, silently failing the whole export.
    const grainX = Math.max(0, draw.x)
    const grainY = Math.max(0, draw.y)
    const grainW = Math.max(0, Math.min(rectW, draw.x + draw.width) - grainX)
    const grainH = Math.max(0, Math.min(rectH, draw.y + draw.height) - grainY)
    ctx.save()
    ctx.translate(grainX, grainY)
    drawGrainOverlay(ctx, grainW, grainH, grainIntensity)
    ctx.restore()
    ctx.restore()
  } finally {
    bitmap.close()
  }
}

/** What happened to an export.
 *  - `saved`: the file(s) reached the share sheet / download.
 *  - `dismissed`: the person backed out of the share sheet — not an error.
 *  - `needs-gesture`: the files are rendered and ready, but the browser refused
 *    to open the share sheet because the tap that started the export had already
 *    expired. The caller must hand them back to saveExportedFiles() from a fresh
 *    tap (see saveExportedFiles below for why this can't be papered over here). */
export type SaveResult = 'saved' | 'dismissed' | 'needs-gesture'

/** The outcome of an export plus the rendered files themselves, so a caller that
 *  got `needs-gesture` can hand the very same files to saveExportedFiles() on the
 *  next tap instead of re-rendering the whole batch. */
export interface ExportOutcome {
  result: SaveResult
  files: File[]
}

/** Saves or shares the rendered file(s). A batch is always passed as a SINGLE
 *  array to ONE navigator.share() call (not one call per file): calling share()
 *  again per file would fire without a fresh user gesture on the 2nd+ call and get
 *  silently rejected, and would mean N separate share-sheet prompts instead of one
 *  native "Save 10 Images" action.
 *
 *  WebKit only allows share() while the tap that triggered it is still "live"
 *  (transient activation, a few seconds). Rendering ten native-resolution photos
 *  takes far longer than that, so by the time the batch is ready the original
 *  Export tap is stale and iOS rejects the call with NotAllowedError. That is
 *  what `needs-gesture` reports: the work is done and the files are in hand, they
 *  just need a fresh tap to hand to the share sheet. */
export async function saveExportedFiles(files: File[]): Promise<SaveResult> {
  if (files.length === 0) return 'dismissed'

  // In an installed iOS PWA, an <a download> anchor can't trigger a real
  // download — Safari instead opens the image in its own full-screen blob
  // viewer (the "black screen"), and returning from it is what causes the
  // app shell to visibly reflow. Worse for a batch: each click replaces the
  // previous one, so only the LAST photo ever reaches the viewer. The native
  // share sheet stays inside the app and gives "Save Image" (or "Save N
  // Images") as one action, so where sharing is possible it is the only path
  // — never fall back to the anchor there.
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files })
      return 'saved'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'dismissed'
      // Anything else (NotAllowedError from a stale activation, most often)
      // means the sheet never opened. Ask for a fresh tap rather than dumping
      // the batch into the blob viewer one file at a time.
      return 'needs-gesture'
    }
  }

  // Desktop fallback: one <a download> click per file. Browsers may prompt to
  // allow "this site is downloading multiple files" starting on the 2nd — a
  // browser-level protection, not something to route around here.
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking synchronously can pull the blob out from under a download the
    // browser hasn't started reading yet; one turn of the event loop is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return 'saved'
}

async function canvasToFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('Could not generate the image')
  return new File([blob], filename, { type: 'image/jpeg' })
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<ExportOutcome> {
  const files = [await canvasToFile(canvas, filename)]
  return { result: await saveExportedFiles(files), files }
}

async function renderBorderCanvas(
  photo: LoadedPhoto,
  ratio: number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality,
  locked: boolean,
  grainIntensity: number,
  borderColorHex: string,
): Promise<HTMLCanvasElement> {
  const sizeFn = locked ? computeNativeCanvasSize : computeNativeCanvasSizeContain
  // Cap the PHOTO's own resolution to the quality tier first, then build the
  // bordered canvas around that. Capping the final (photo + border) canvas
  // instead — as this used to — meant a thicker border ate into the same
  // pixel budget as the photo, so "High"/"Web" got visibly softer just from
  // adding a border. This way the border only ever adds pixels on top.
  const { width: effPhotoW, height: effPhotoH } = capLongEdge(photo.width, photo.height, getMaxLongEdge(quality))
  const { width, height } = sizeFn(effPhotoW, effPhotoH, ratio, borderThicknessPct, transform.zoom)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = borderColorHex
  ctx.fillRect(0, 0, width, height)

  const borderPx = borderThicknessPct * Math.min(width, height)
  await drawPhotoInRect(
    ctx,
    photo,
    borderPx,
    borderPx,
    width - borderPx * 2,
    height - borderPx * 2,
    transform,
    0,
    locked ? 'cover' : 'contain',
    'rect',
    grainIntensity,
  )
  return canvas
}

export async function exportBorderPhoto(
  photo: LoadedPhoto,
  ratio: number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality = 'native',
  locked = true,
  grainIntensity = 0,
  borderColorHex = '#ffffff',
) {
  const canvas = await renderBorderCanvas(photo, ratio, borderThicknessPct, transform, quality, locked, grainIntensity, borderColorHex)
  return downloadCanvas(canvas, `polargrid-border-${Date.now()}.jpg`)
}

/** Same shared adjustment (ratio/border/transform/etc.) rendered against every
 *  photo in `photos`, saved as one batch — see saveFiles' own comment for why
 *  this collects every File first and shares them in a single call, rather than
 *  one exportBorderPhoto()-style call (and share-sheet prompt) per photo. */
export async function exportBorderPhotosBatch(
  photos: LoadedPhoto[],
  ratio: number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality,
  locked: boolean,
  grainIntensity: number,
  borderColorHex: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportOutcome> {
  const stamp = Date.now()
  const files: File[] = []
  for (let i = 0; i < photos.length; i++) {
    const canvas = await renderBorderCanvas(photos[i], ratio, borderThicknessPct, transform, quality, locked, grainIntensity, borderColorHex)
    files.push(await canvasToFile(canvas, `polargrid-border-${stamp}-${i + 1}.jpg`))
    onProgress?.(i + 1, photos.length)
  }
  return { result: await saveExportedFiles(files), files }
}

/**
 * Reference long-edge used to measure grid geometry proportionally, independent
 * of final pixel size (cell/gutter/border sizes all scale linearly with it).
 */
const REF_LONG_EDGE = 10000

export async function exportCollageGrid(
  template: GridTemplate,
  assignments: CellAssignment[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  outerBorderPct: number,
  gutterPct: number,
  quality: ExportQuality = 'native',
  shape: CellShape = 'rect',
  grainIntensity = 0,
  borderColorHex = '#ffffff',
) {
  const refSize = computeOutputPixelSize(ratio, REF_LONG_EDGE)
  const refShortSide = Math.min(refSize.width, refSize.height)
  const refOuterBorderPx = outerBorderPct * refShortSide
  const refGutterPx = gutterPct * refShortSide
  const refContentW = refSize.width - refOuterBorderPx * 2
  const refContentH = refSize.height - refOuterBorderPx * 2
  const refCellW = (refContentW - refGutterPx * (template.cols - 1)) / template.cols
  const refCellH = (refContentH - refGutterPx * (template.rows - 1)) / template.rows

  // Find the largest canvas scale (relative to the reference) at which no photo
  // needs to be upscaled beyond its native resolution inside its own cell.
  let maxScale = Infinity
  template.cells.forEach((cell, i) => {
    const assignment = assignments[i]
    const photo = assignment?.photoId ? photos[assignment.photoId] : null
    if (!photo) return
    const w = refCellW * cell.colSpan + refGutterPx * (cell.colSpan - 1)
    const h = refCellH * cell.rowSpan + refGutterPx * (cell.rowSpan - 1)
    const zoom = Math.max(1, assignment.transform.zoom)
    maxScale = Math.min(maxScale, photo.width / zoom / w, photo.height / zoom / h)
  })
  const nativeLongEdge = Number.isFinite(maxScale) && maxScale > 0 ? REF_LONG_EDGE * maxScale : 2000

  const native = computeOutputPixelSize(ratio, nativeLongEdge)
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = borderColorHex
  ctx.fillRect(0, 0, width, height)

  const shortSide = Math.min(width, height)
  const outerBorderPx = outerBorderPct * shortSide
  const gutterPx = gutterPct * shortSide

  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = width - outerBorderPx * 2
  const contentH = height - outerBorderPx * 2

  const cellW = (contentW - gutterPx * (template.cols - 1)) / template.cols
  const cellH = (contentH - gutterPx * (template.rows - 1)) / template.rows

  // Sequential (not the equivalent forEach) so each cell's full-resolution
  // decode is closed before the next one is opened — see drawPhotoInRect.
  for (let i = 0; i < template.cells.length; i++) {
    const cell = template.cells[i]
    const assignment = assignments[i]
    const photo = assignment?.photoId ? photos[assignment.photoId] : null
    if (!photo) continue
    const x = contentX + cell.col * (cellW + gutterPx)
    const y = contentY + cell.row * (cellH + gutterPx)
    const w = cellW * cell.colSpan + gutterPx * (cell.colSpan - 1)
    const h = cellH * cell.rowSpan + gutterPx * (cell.rowSpan - 1)
    await drawPhotoInRect(ctx, photo, x, y, w, h, assignment.transform, 0, 'cover', shape, grainIntensity)
  }

  return downloadCanvas(canvas, `polargrid-collage-${Date.now()}.jpg`)
}

export async function exportCollageFree(
  freeItems: FreeItem[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  quality: ExportQuality = 'native',
  grainIntensity = 0,
  borderColorHex = '#ffffff',
) {
  const refSize = computeOutputPixelSize(ratio, REF_LONG_EDGE)

  let maxScale = Infinity
  freeItems.forEach((item) => {
    const photo = photos[item.photoId]
    if (!photo) return
    const w = item.width * refSize.width
    const h = item.height * refSize.height
    const zoom = Math.max(1, item.transform.zoom)
    maxScale = Math.min(maxScale, photo.width / zoom / w, photo.height / zoom / h)
  })
  const nativeLongEdge = Number.isFinite(maxScale) && maxScale > 0 ? REF_LONG_EDGE * maxScale : 2000

  const native = computeOutputPixelSize(ratio, nativeLongEdge)
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = borderColorHex
  ctx.fillRect(0, 0, width, height)

  for (const item of freeItems) {
    const photo = photos[item.photoId]
    if (!photo) continue
    await drawPhotoInRect(
      ctx,
      photo,
      item.x * width,
      item.y * height,
      item.width * width,
      item.height * height,
      item.transform,
      item.rotation,
      'cover',
      'rect',
      grainIntensity,
    )
  }

  return downloadCanvas(canvas, `polargrid-collage-${Date.now()}.jpg`)
}
