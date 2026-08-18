import type { CellAssignment, ExportQuality, FreeItem, GridTemplate, LoadedPhoto, PhotoTransform } from '../types'
import { computeNativeCanvasSize, computeOutputPixelSize, getImageDrawRect } from './cropMath'
import { ASPECT_RATIOS } from './aspectRatios'
import { capLongEdge, getMaxLongEdge } from './exportQuality'

const JPEG_QUALITY = 1.0

export function resolveRatio(aspectRatioId: string, fallbackRatio: number): number {
  const preset = ASPECT_RATIOS.find((r) => r.id === aspectRatioId)
  return preset?.ratio ?? fallbackRatio
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
) {
  if (rectW <= 0 || rectH <= 0) return
  ctx.save()
  ctx.translate(rectX + rectW / 2, rectY + rectH / 2)
  if (rotationDeg) ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.translate(-rectW / 2, -rectH / 2)
  ctx.beginPath()
  ctx.rect(0, 0, rectW, rectH)
  ctx.clip()
  const draw = getImageDrawRect(rectW, rectH, photo.width, photo.height, transform)
  ctx.drawImage(photo.bitmap, draw.x, draw.y, draw.width, draw.height)
  ctx.restore()
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('No se pudo generar la imagen')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportBorderPhoto(
  photo: LoadedPhoto,
  ratio: number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality = 'native',
) {
  const native = computeNativeCanvasSize(photo.width, photo.height, ratio, borderThicknessPct, transform.zoom)
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no soportado')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
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
  )

  await downloadCanvas(canvas, `polargrid-borde-${Date.now()}.jpg`)
}

export async function exportCollageGrid(
  template: GridTemplate,
  assignments: CellAssignment[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  outerBorderPct: number,
  gutterPct: number,
  quality: ExportQuality = 'native',
) {
  const usedPhotos = assignments.map((a) => (a.photoId ? photos[a.photoId] : null)).filter(Boolean) as LoadedPhoto[]
  const baseLongEdge = usedPhotos.length
    ? Math.max(...usedPhotos.map((p) => Math.max(p.width, p.height)))
    : 2000
  const native = computeOutputPixelSize(ratio, baseLongEdge)
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no soportado')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
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
    drawPhotoInRect(ctx, photo, x, y, w, h, assignment.transform)
  })

  await downloadCanvas(canvas, `polargrid-collage-${Date.now()}.jpg`)
}

export async function exportCollageFree(
  freeItems: FreeItem[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  quality: ExportQuality = 'native',
) {
  const usedPhotos = freeItems.map((f) => photos[f.photoId]).filter(Boolean) as LoadedPhoto[]
  const baseLongEdge = usedPhotos.length
    ? Math.max(...usedPhotos.map((p) => Math.max(p.width, p.height))) * 1.5
    : 2000
  const native = computeOutputPixelSize(ratio, baseLongEdge)
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no soportado')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
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
    )
  }

  await downloadCanvas(canvas, `polargrid-collage-${Date.now()}.jpg`)
}
