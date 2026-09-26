/**
 * Sharpness: a classic unsharp mask, out = photo + amount · (photo − blurred).
 *
 * Plain JS on ImageData rather than ctx.filter: canvas filters only reached
 * WebKit with iOS 18, and the app supports iOS 16. The blur is two passes of a
 * separable box blur, close enough to a Gaussian for this and linear in the
 * radius.
 *
 * The blur is done on premultiplied colour and divided back out, so pixels
 * next to transparent ones (a photo's edge inside a letterboxed cell, a
 * rotated free-mode photo) don't pick up a dark or bright rim from averaging
 * with the empty area around them.
 */

/** Blur radius tracks how many pixels the photo is drawn at, so a 1080px and
 *  a 12000px export — and the on-screen preview — sharpen the same features. */
export function sharpenRadiusFor(drawnLongEdgePx: number): number {
  return Math.max(1, Math.round(drawnLongEdgePx / 1500))
}

/** Slider 0..1 → mask strength. */
export function sharpenAmount(sharpness: number): number {
  return sharpness * 1.6
}

function boxBlurHorizontal(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number) {
  const span = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const x = Math.min(width - 1, Math.max(0, k))
        sum += src[row + x * 4 + c]
      }
      for (let x = 0; x < width; x++) {
        dst[row + x * 4 + c] = sum / span
        const out = Math.max(0, x - radius)
        const inn = Math.min(width - 1, x + radius + 1)
        sum += src[row + inn * 4 + c] - src[row + out * 4 + c]
      }
    }
  }
}

function boxBlurVertical(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number) {
  const span = radius * 2 + 1
  const stride = width * 4
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 4; c++) {
      const col = x * 4 + c
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const y = Math.min(height - 1, Math.max(0, k))
        sum += src[y * stride + col]
      }
      for (let y = 0; y < height; y++) {
        dst[y * stride + col] = sum / span
        const out = Math.max(0, y - radius)
        const inn = Math.min(height - 1, y + radius + 1)
        sum += src[inn * stride + col] - src[out * stride + col]
      }
    }
  }
}

/** Sharpens `image` in place. */
export function unsharpMask(image: ImageData, radius: number, amount: number) {
  if (amount <= 0) return
  const { data, width, height } = image
  const n = width * height * 4
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i += 4) {
    const alpha = data[i + 3] / 255
    a[i] = data[i] * alpha
    a[i + 1] = data[i + 1] * alpha
    a[i + 2] = data[i + 2] * alpha
    a[i + 3] = alpha
  }
  boxBlurHorizontal(a, b, width, height, radius)
  boxBlurVertical(b, a, width, height, radius)
  boxBlurHorizontal(a, b, width, height, radius)
  boxBlurVertical(b, a, width, height, radius)
  for (let i = 0; i < n; i += 4) {
    if (data[i + 3] === 0 || a[i + 3] <= 0) continue
    const inv = 1 / a[i + 3]
    for (let c = 0; c < 3; c++) {
      const orig = data[i + c]
      const blurred = a[i + c] * inv
      data[i + c] = orig + amount * (orig - blurred)
    }
  }
}

/** Preview: a sharpened copy of an already-downscaled preview bitmap. */
export function sharpenedPreview(source: CanvasImageSource & { width: number; height: number }, sharpness: number): HTMLCanvasElement | null {
  const { width, height } = source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, width, height)
  unsharpMask(image, sharpenRadiusFor(Math.max(width, height)), sharpenAmount(sharpness))
  ctx.putImageData(image, 0, 0)
  return canvas
}

const TILE = 1024

/**
 * Export: draws `bitmap` at `draw` (in ctx's current coordinates, under
 * whatever clip is active) sharpened. Works tile by tile in device pixels over
 * only the part of the canvas the photo covers, each tile drawn with a margin
 * of neighbouring pixels so the mask has real context at its edges — which is
 * also what keeps the native build's horizontal bands from showing a seam.
 * No tile is ever bigger than about a megapixel, whatever the export size.
 */
export function drawSharpened(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  draw: { x: number; y: number; width: number; height: number },
  /** The photo's visible part in ctx's current coordinates (cell ∩ draw). */
  visible: { x: number; y: number; width: number; height: number },
  sharpness: number,
) {
  const m = ctx.getTransform()
  // Device-space box around the visible part, clamped to this canvas (a band).
  const corners = [
    m.transformPoint(new DOMPoint(visible.x, visible.y)),
    m.transformPoint(new DOMPoint(visible.x + visible.width, visible.y)),
    m.transformPoint(new DOMPoint(visible.x, visible.y + visible.height)),
    m.transformPoint(new DOMPoint(visible.x + visible.width, visible.y + visible.height)),
  ]
  const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))))
  const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))))
  const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))))
  const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))))
  if (right <= left || bottom <= top) return

  // The photo's drawn size in device pixels sets the radius, the same measure
  // the preview uses against its own bitmap.
  const scale = Math.hypot(m.a, m.b)
  const radius = sharpenRadiusFor(Math.max(draw.width, draw.height) * scale)
  const amount = sharpenAmount(sharpness)
  const margin = radius * 3

  const scratch = document.createElement('canvas')
  const sctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!sctx) {
    ctx.drawImage(bitmap, draw.x, draw.y, draw.width, draw.height)
    return
  }
  try {
    for (let ty = top; ty < bottom; ty += TILE) {
      for (let tx = left; tx < right; tx += TILE) {
        const tw = Math.min(TILE, right - tx)
        const th = Math.min(TILE, bottom - ty)
        const sw = tw + margin * 2
        const sh = th + margin * 2
        if (scratch.width !== sw || scratch.height !== sh) {
          scratch.width = sw
          scratch.height = sh
        } else {
          sctx.setTransform(1, 0, 0, 1, 0, 0)
          sctx.clearRect(0, 0, sw, sh)
        }
        sctx.imageSmoothingEnabled = true
        sctx.imageSmoothingQuality = 'high'
        sctx.setTransform(m.a, m.b, m.c, m.d, m.e - (tx - margin), m.f - (ty - margin))
        sctx.drawImage(bitmap, draw.x, draw.y, draw.width, draw.height)
        const image = sctx.getImageData(0, 0, sw, sh)
        unsharpMask(image, radius, amount)
        sctx.putImageData(image, 0, 0)
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(scratch, margin, margin, tw, th, tx, ty, tw, th)
        ctx.restore()
      }
    }
  } finally {
    // Released at once — WebKit caps the canvas memory a page may hold.
    scratch.width = 0
    scratch.height = 0
  }
}
