import type { PhotoFit, PhotoTransform } from '../types'

export const DEFAULT_TRANSFORM: PhotoTransform = { offsetX: 0, offsetY: 0, zoom: 1 }

export const MAX_ZOOM = 4

/** Scale needed so the image fully covers a rect of innerW x innerH (no gaps). */
export function coverScale(innerW: number, innerH: number, imgW: number, imgH: number): number {
  if (imgW <= 0 || imgH <= 0) return 1
  return Math.max(innerW / imgW, innerH / imgH)
}

/** Scale needed so the image fits entirely inside a rect of innerW x innerH (no crop). */
export function containScale(innerW: number, innerH: number, imgW: number, imgH: number): number {
  if (imgW <= 0 || imgH <= 0) return 1
  return Math.min(innerW / imgW, innerH / imgH)
}

/** Normalizes a fit value to a 0 (cover) .. 1 (contain) blend amount, so callers
 *  can pass either the exact mode or an animated in-between value. */
function fitMix(fit: PhotoFit | number): number {
  if (typeof fit === 'number') return Math.min(1, Math.max(0, fit))
  return fit === 'contain' ? 1 : 0
}

/**
 * Where to draw the image, in coordinates local to the inner rect's own top-left
 * corner. offsetX/offsetY are normalized pan amounts in [-1, 1]: 0 = centered,
 * +-1 = panned all the way to the edge of the fit area. `fit` picks 'cover'
 * (crop to fill, the default) or 'contain' (shrink to show the whole image,
 * leaving gaps on the mismatched axis for the border-unlocked mode) — or any
 * number in between, so the border-lock toggle can animate smoothly through
 * every in-between scale instead of snapping between the two fits.
 */
export function getImageDrawRect(
  innerW: number,
  innerH: number,
  imgW: number,
  imgH: number,
  transform: PhotoTransform,
  fit: PhotoFit | number = 'cover',
) {
  const mix = fitMix(fit)
  const cover = coverScale(innerW, innerH, imgW, imgH)
  const contain = containScale(innerW, innerH, imgW, imgH)
  const base = cover + (contain - cover) * mix
  const scale = base * Math.max(1, transform.zoom)
  const width = imgW * scale
  const height = imgH * scale

  const slackX = Math.max(0, (width - innerW) / 2)
  const slackY = Math.max(0, (height - innerH) / 2)

  const centeredX = (innerW - width) / 2
  const centeredY = (innerH - height) / 2

  const x = centeredX - transform.offsetX * slackX
  const y = centeredY - transform.offsetY * slackY

  return { x, y, width, height, scale }
}

/**
 * Clamp a transform to valid ranges. Offsets are normalized to the pan slack at
 * the current zoom, so they stay valid in [-1, 1] regardless of cell/image size.
 */
export function clampTransform(transform: PhotoTransform): PhotoTransform {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, transform.zoom))
  const offsetX = Math.min(1, Math.max(-1, transform.offsetX))
  const offsetY = Math.min(1, Math.max(-1, transform.offsetY))
  const clamped: PhotoTransform = { zoom, offsetX, offsetY }
  // Orientation rides along only when set, so an untouched transform stays
  // exactly the three fields it always was.
  const turns = (((transform.turns ?? 0) % 4) + 4) % 4
  if (turns) clamped.turns = turns
  if (transform.flipH) clamped.flipH = true
  if (transform.flipV) clamped.flipV = true
  return clamped
}

/** How a photo is turned and mirrored, in the terms a canvas or Konva node
 *  needs: rotate by `degrees`, then scale by (scaleX, scaleY) in the
 *  rotated image's own axes. The flips are stored as seen on screen, so on a
 *  quarter turn they swap axes. */
export function photoOrientation(transform: PhotoTransform) {
  const turns = (((transform.turns ?? 0) % 4) + 4) % 4
  const swapped = turns % 2 === 1
  const screenX = transform.flipH ? -1 : 1
  const screenY = transform.flipV ? -1 : 1
  return {
    turns,
    degrees: turns * 90,
    swapped,
    scaleX: swapped ? screenY : screenX,
    scaleY: swapped ? screenX : screenY,
    identity: turns === 0 && !transform.flipH && !transform.flipV,
  }
}

/** The photo's width and height as it appears once turned. */
export function orientedSize(width: number, height: number, transform: PhotoTransform) {
  return photoOrientation(transform).swapped ? { width: height, height: width } : { width, height }
}

/** Turns a transform a quarter clockwise (or counter-clockwise). The pan is
 *  re-centred: an offset measured along one axis means nothing along the
 *  other. Zoom is kept. */
export function rotateTransform(transform: PhotoTransform, direction: 1 | -1): PhotoTransform {
  return clampTransform({ ...transform, offsetX: 0, offsetY: 0, turns: (transform.turns ?? 0) + direction })
}

export function flipTransform(transform: PhotoTransform, axis: 'h' | 'v'): PhotoTransform {
  return clampTransform(
    axis === 'h'
      ? { ...transform, flipH: !transform.flipH, offsetX: -transform.offsetX }
      : { ...transform, flipV: !transform.flipV, offsetY: -transform.offsetY },
  )
}

/**
 * Draws `source` into the rect `draw` (coordinates of the photo as it appears
 * once turned) honouring the transform's turn and flips. With no orientation
 * it's a plain drawImage, so nothing changes for untouched photos.
 */
export function drawOrientedImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  draw: { x: number; y: number; width: number; height: number },
  transform: PhotoTransform,
) {
  const o = photoOrientation(transform)
  if (o.identity) {
    ctx.drawImage(source, draw.x, draw.y, draw.width, draw.height)
    return
  }
  const w = o.swapped ? draw.height : draw.width
  const h = o.swapped ? draw.width : draw.height
  ctx.save()
  ctx.translate(draw.x + draw.width / 2, draw.y + draw.height / 2)
  ctx.rotate((o.degrees * Math.PI) / 180)
  ctx.scale(o.scaleX, o.scaleY)
  ctx.drawImage(source, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/**
 * Output canvas pixel size for a given target ratio (w/h), keeping the longer
 * edge at `baseLongEdge` px so exports stay at (or above) native resolution.
 */
export function computeOutputPixelSize(ratio: number, baseLongEdge: number) {
  if (ratio >= 1) {
    return { width: Math.round(baseLongEdge), height: Math.round(baseLongEdge / ratio) }
  }
  return { width: Math.round(baseLongEdge * ratio), height: Math.round(baseLongEdge) }
}

/**
 * Largest canvas size (at the given crop ratio, border thickness and zoom) whose
 * inner photo area never needs to be upscaled beyond the source photo's native
 * pixels. The border is added on top of that native resolution rather than
 * carved out of it, so exports never lose detail. `zoom` should match the
 * transform's current zoom (>=1) — zooming in uses fewer native pixels, so the
 * max no-upscale canvas shrinks accordingly.
 */
export function computeNativeCanvasSize(
  photoW: number,
  photoH: number,
  ratio: number,
  borderPct: number,
  zoom = 1,
) {
  const pct = Math.min(0.45, Math.max(0, borderPct))
  const z = Math.max(1, zoom)

  const shortSide =
    ratio >= 1
      ? Math.min(photoH / Math.max(0.05, 1 - 2 * pct), photoW / Math.max(0.05, ratio - 2 * pct)) / z
      : Math.min(photoW / Math.max(0.05, 1 - 2 * pct), photoH / Math.max(0.05, 1 / ratio - 2 * pct)) / z

  const width = ratio >= 1 ? ratio * shortSide : shortSide
  const height = ratio >= 1 ? shortSide : shortSide / ratio
  return { width: Math.round(width), height: Math.round(height) }
}

/**
 * Same idea as `computeNativeCanvasSize`, but for the border-unlocked
 * ('contain') mode: the photo is never upscaled past native there either,
 * except contain's binding axis is the *loose* one (Math.max of the two
 * candidate short sides instead of Math.min) since the photo only needs to
 * fill the tighter axis exactly — the other axis is where the extra border
 * (the whole point of unlocking) shows up.
 */
export function computeNativeCanvasSizeContain(
  photoW: number,
  photoH: number,
  ratio: number,
  borderPct: number,
  zoom = 1,
) {
  const pct = Math.min(0.45, Math.max(0, borderPct))
  const z = Math.max(1, zoom)

  const shortSide =
    ratio >= 1
      ? Math.max(photoH / Math.max(0.05, 1 - 2 * pct), photoW / Math.max(0.05, ratio - 2 * pct)) / z
      : Math.max(photoW / Math.max(0.05, 1 - 2 * pct), photoH / Math.max(0.05, 1 / ratio - 2 * pct)) / z

  const width = ratio >= 1 ? ratio * shortSide : shortSide
  const height = ratio >= 1 ? shortSide : shortSide / ratio
  return { width: Math.round(width), height: Math.round(height) }
}

/** Convert a screen-space drag delta into a transform offset delta. */
export function panDeltaToOffset(
  dx: number,
  dy: number,
  innerW: number,
  innerH: number,
  imgW: number,
  imgH: number,
  transform: PhotoTransform,
  fit: PhotoFit | number = 'cover',
): { offsetX: number; offsetY: number } {
  const mix = fitMix(fit)
  const cover = coverScale(innerW, innerH, imgW, imgH)
  const contain = containScale(innerW, innerH, imgW, imgH)
  const base = cover + (contain - cover) * mix
  const scale = base * Math.max(1, transform.zoom)
  const width = imgW * scale
  const height = imgH * scale
  const slackX = Math.max(0, (width - innerW) / 2)
  const slackY = Math.max(0, (height - innerH) / 2)

  const offsetX = slackX === 0 ? 0 : transform.offsetX - dx / slackX
  const offsetY = slackY === 0 ? 0 : transform.offsetY - dy / slackY

  return {
    offsetX: Math.min(1, Math.max(-1, offsetX)),
    offsetY: Math.min(1, Math.max(-1, offsetY)),
  }
}
