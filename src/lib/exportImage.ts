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

function drawPhotoInRect(
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
  ctx.save()
  ctx.translate(rectX + rectW / 2, rectY + rectH / 2)
  if (rotationDeg) ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.translate(-rectW / 2, -rectH / 2)
  traceShapePath(ctx, shape, rectW, rectH)
  ctx.clip()
  const draw = getImageDrawRect(rectW, rectH, photo.width, photo.height, transform, fit)
  ctx.drawImage(photo.bitmap, draw.x, draw.y, draw.width, draw.height)
  // Grain is drawn over the photo's own rect, not the full cell: in 'cover'
  // fit `draw` already covers the whole cell (the shape clip above trims any
  // overflow), but in 'contain' fit the photo can letterbox inside the cell —
  // grain over the full cell would then speckle noise onto that empty gap,
  // which shows through as the border/background color.
  ctx.save()
  ctx.translate(draw.x, draw.y)
  drawGrainOverlay(ctx, draw.width, draw.height, grainIntensity)
  ctx.restore()
  ctx.restore()
}

/** Resolves true once the image is actually saved/shared, false if the person backed out of the share sheet. */
async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<boolean> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('Could not generate the image')

  // In an installed iOS PWA, an <a download> anchor can't trigger a real
  // download — Safari instead opens the image in its own full-screen blob
  // viewer (the "black screen"), and returning from it is what causes the
  // app shell to visibly reflow. The native share sheet stays inside the
  // app and gives "Save Image" as one of its actions, so prefer it
  // whenever the platform can share files.
  const file = new File([blob], filename, { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (err) {
      // User dismissed the share sheet — not an error, just stop here.
      if (err instanceof Error && err.name === 'AbortError') return false
      // Any other failure falls through to the download-link fallback below.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
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
  drawPhotoInRect(
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

  return downloadCanvas(canvas, `polargrid-border-${Date.now()}.jpg`)
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

  template.cells.forEach((cell, i) => {
    const assignment = assignments[i]
    const photo = assignment?.photoId ? photos[assignment.photoId] : null
    if (!photo) return
    const x = contentX + cell.col * (cellW + gutterPx)
    const y = contentY + cell.row * (cellH + gutterPx)
    const w = cellW * cell.colSpan + gutterPx * (cell.colSpan - 1)
    const h = cellH * cell.rowSpan + gutterPx * (cell.rowSpan - 1)
    drawPhotoInRect(ctx, photo, x, y, w, h, assignment.transform, 0, 'cover', shape, grainIntensity)
  })

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
    drawPhotoInRect(
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
