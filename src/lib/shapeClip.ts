import type { CellShape } from '../types'

/** Minimal 2D path surface shared by CanvasRenderingContext2D and Konva.Context,
 *  so this same tracing works both for the live Konva preview and the final
 *  canvas export. */
interface PathContext {
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
  rect(x: number, y: number, w: number, h: number): void
  closePath(): void
}

/** Fraction of the shorter side used as the corner radius for 'rounded' cells. */
const ROUNDED_RADIUS_RATIO = 0.12

/** Traces a cell's clip path (in its own local 0,0..width,height space) for the
 *  given shape. Caller is responsible for beginPath/clip/fill — this only builds
 *  the path so it can be reused for both Konva's clipFunc and canvas export. */
export function traceShapePath(ctx: PathContext, shape: CellShape, width: number, height: number) {
  ctx.beginPath()
  if (shape === 'circle') {
    const r = Math.min(width, height) / 2
    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2)
  } else if (shape === 'rounded') {
    const r = Math.min(width, height) * ROUNDED_RADIUS_RATIO
    ctx.moveTo(r, 0)
    ctx.lineTo(width - r, 0)
    ctx.arc(width - r, r, r, -Math.PI / 2, 0)
    ctx.lineTo(width, height - r)
    ctx.arc(width - r, height - r, r, 0, Math.PI / 2)
    ctx.lineTo(r, height)
    ctx.arc(r, height - r, r, Math.PI / 2, Math.PI)
    ctx.lineTo(0, r)
    ctx.arc(r, r, r, Math.PI, Math.PI * 1.5)
  } else {
    ctx.rect(0, 0, width, height)
  }
  ctx.closePath()
}
