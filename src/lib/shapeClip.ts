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
export const ROUNDED_RADIUS_RATIO = 0.12

/** A cell shape's target corner-radius fraction (0 = sharp rect). Feed this
 *  through useAnimatedNumber and into traceRoundedRectPath to ease a shape
 *  change instead of snapping straight to the new corners. */
export function shapeRadiusRatio(shape: CellShape): number {
  return shape === 'rounded' ? ROUNDED_RADIUS_RATIO : 0
}

/** Traces a rounded-rect clip path (in its own local 0,0..width,height space)
 *  for an arbitrary corner-radius fraction — 0 is a plain rect, any value in
 *  between renders a partial round, so this same function drives both the
 *  static shapes and an eased transition between them. Caller is responsible
 *  for beginPath/clip/fill — this only builds the path. */
export function traceRoundedRectPath(ctx: PathContext, radiusRatio: number, width: number, height: number) {
  ctx.beginPath()
  const r = Math.min(width, height) * Math.max(0, radiusRatio)
  if (r < 0.5) {
    ctx.rect(0, 0, width, height)
  } else {
    ctx.moveTo(r, 0)
    ctx.lineTo(width - r, 0)
    ctx.arc(width - r, r, r, -Math.PI / 2, 0)
    ctx.lineTo(width, height - r)
    ctx.arc(width - r, height - r, r, 0, Math.PI / 2)
    ctx.lineTo(r, height)
    ctx.arc(r, height - r, r, Math.PI / 2, Math.PI)
    ctx.lineTo(0, r)
    ctx.arc(r, r, r, Math.PI, Math.PI * 1.5)
  }
  ctx.closePath()
}

/** Traces a cell's clip path for a fixed (non-animated) shape — used where
 *  there's no live component to ease through, like the final canvas export. */
export function traceShapePath(ctx: PathContext, shape: CellShape, width: number, height: number) {
  traceRoundedRectPath(ctx, shapeRadiusRatio(shape), width, height)
}
