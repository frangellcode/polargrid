import type { PhotoTransform } from '../types'
import { applyAdjustments, hasColourWork, type PhotoAdjustments } from './adjustments'
import { drawOrientedImage, orientedSize } from './cropMath'

/** A background made from the photo itself: blurred, or as it is. */
export type PhotoBackdropKind = 'blur' | 'sharp'

/** What a 9:16 story export sits on: a colour, or the photo itself. */
export type StoryBackground = { hex: string } | { fromPhoto: PhotoBackdropKind }

/** The blurred backdrop is worked at this long edge: plenty once blurred. */
const BLUR_LONG_EDGE = 240
const BLUR_RADIUS = 9
/** Dims the blurred backdrop a little so the bordered photo stands out on it. */
const BLUR_DIM = 0.88

/** Three box blurs in a row: close enough to a gaussian, and it runs in plain
 *  JS (canvas filters only reached WebKit with iOS 18). */
function boxBlur(image: ImageData, radius: number) {
  const { width: w, height: h, data } = image
  const tmp = new Float32Array(w * h * 3)
  const pass = (horizontal: boolean) => {
    const outer = horizontal ? h : w
    const inner = horizontal ? w : h
    for (let o = 0; o < outer; o++) {
      const at = (i: number) => {
        const c = Math.min(inner - 1, Math.max(0, i))
        return horizontal ? o * w + c : c * w + o
      }
      let r = 0
      let g = 0
      let b = 0
      for (let i = -radius; i <= radius; i++) {
        const p = at(i) * 4
        r += data[p]
        g += data[p + 1]
        b += data[p + 2]
      }
      const n = radius * 2 + 1
      for (let i = 0; i < inner; i++) {
        const q = at(i)
        tmp[q * 3] = r / n
        tmp[q * 3 + 1] = g / n
        tmp[q * 3 + 2] = b / n
        const add = at(i + radius + 1) * 4
        const drop = at(i - radius) * 4
        r += data[add] - data[drop]
        g += data[add + 1] - data[drop + 1]
        b += data[add + 2] - data[drop + 2]
      }
    }
    for (let q = 0; q < w * h; q++) {
      data[q * 4] = tmp[q * 3]
      data[q * 4 + 1] = tmp[q * 3 + 1]
      data[q * 4 + 2] = tmp[q * 3 + 2]
    }
  }
  for (let k = 0; k < 3; k++) {
    pass(true)
    pass(false)
  }
}

/**
 * The photo as a backdrop: turned and flipped like the photo, with its Edit
 * colours, and blurred for 'blur'. Small on purpose — it's drawn stretched to
 * cover the background, on screen and in the export alike, so the two match.
 */
export function photoBackdrop(
  source: CanvasImageSource & { width: number; height: number },
  transform: PhotoTransform,
  adjustments: PhotoAdjustments | null | undefined,
  kind: PhotoBackdropKind,
  longEdge = kind === 'blur' ? BLUR_LONG_EDGE : 1600,
): HTMLCanvasElement {
  const shown = orientedSize(source.width, source.height, transform)
  const scale = Math.min(1, longEdge / Math.max(shown.width, shown.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(shown.width * scale))
  canvas.height = Math.max(1, Math.round(shown.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  drawOrientedImage(ctx, source, { x: 0, y: 0, width: canvas.width, height: canvas.height }, transform)
  if (kind === 'sharp' && !hasColourWork(adjustments)) return canvas
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  if (hasColourWork(adjustments)) applyAdjustments(image, adjustments)
  if (kind === 'blur') {
    boxBlur(image, BLUR_RADIUS)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] *= BLUR_DIM
      image.data[i + 1] *= BLUR_DIM
      image.data[i + 2] *= BLUR_DIM
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Draws `backdrop` over a `w`×`h` rect at ctx's origin, cropped to fill it. */
export function drawBackdropCover(ctx: CanvasRenderingContext2D, backdrop: HTMLCanvasElement, w: number, h: number) {
  const scale = Math.max(w / backdrop.width, h / backdrop.height)
  const dw = backdrop.width * scale
  const dh = backdrop.height * scale
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(backdrop, (w - dw) / 2, (h - dh) / 2, dw, dh)
  ctx.restore()
}
