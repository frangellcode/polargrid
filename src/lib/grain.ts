/** Grain "dot" size in actual output pixels — deliberately NOT a fraction of
 *  the rect's size. A percentage-of-size dot (tried first) means a big
 *  export gets huge dots, which stretch-smooth into a blurry cloud instead
 *  of reading as grain at all. Real film grain looks like a few physical
 *  pixels of speckle regardless of how big the photo is; keeping this fixed
 *  is what makes it look "chulo" (fine, visible) at both preview and
 *  multi-thousand-pixel export sizes. */
export const GRAIN_DOT_PX = 2.4

/** Caps how big a reference size the PREVIEW (only) generates samples for —
 *  a native photo can be 4000px+ on a side, and 12M+ noise samples is a
 *  real (if one-time, memoized) cost, especially with several photos in a
 *  collage. Deliberately NOT applied to the export path: the export already
 *  works from its own true final pixel size, and capping it there thinned
 *  out the sample density (fewer samples stretched over the same big
 *  canvas = each dot covering more real pixels = visibly coarser grain) —
 *  a regression from how the export used to look before this cap existed. */
export const GRAIN_PREVIEW_REF_MAX_LONG_EDGE = 2400

/** Scales (w, h) down to fit within GRAIN_PREVIEW_REF_MAX_LONG_EDGE, for
 *  callers (the live preview) that want the performance cap. Export calls
 *  grainSampleCounts/buildGrainNoise directly with its true size instead. */
export function capGrainPreviewReference(w: number, h: number): { w: number; h: number } {
  const long = Math.max(w, h)
  if (!(long > GRAIN_PREVIEW_REF_MAX_LONG_EDGE)) return { w, h }
  const s = GRAIN_PREVIEW_REF_MAX_LONG_EDGE / long
  return { w: w * s, h: h * s }
}

/** How many independent noise samples fit across a REFERENCE size at the
 *  configured dot size. Pass the photo's true (or near-true) final pixel
 *  size here — not whatever small size a live preview happens to render
 *  at — so a preview rect that's much smaller than the real export just
 *  shows this same fine noise naturally shrunk/softened by the stretch,
 *  instead of a separately-computed, comparatively chunky pattern (see
 *  GrainOverlay's referenceWidth/Height doc for why that mismatch mattered).
 *  Rounded so a barely-changing reference (e.g. mid-animation) mostly keeps
 *  the same sample count instead of reshuffling every frame. */
export function grainSampleCounts(referenceW: number, referenceH: number): { x: number; y: number } {
  return {
    x: Math.max(1, Math.round(referenceW / GRAIN_DOT_PX)),
    y: Math.max(1, Math.round(referenceH / GRAIN_DOT_PX)),
  }
}

/**
 * A tiny random-noise canvas, one pixel per grain "dot" — meant to be
 * stretched (never tiled/repeated) to fill the target rect. Repeating any
 * finite noise texture shows a seam at every tile boundary once you blur or
 * scale it (tried that first); a single non-repeating stretch has no
 * boundary to show a seam at, and the stretch's own smoothing is what turns
 * flat dots into the soft, clumped look of real photographic grain.
 */
export function buildGrainNoise(referenceW: number, referenceH: number): HTMLCanvasElement {
  const { x: samplesX, y: samplesY } = grainSampleCounts(referenceW, referenceH)
  const canvas = document.createElement('canvas')
  canvas.width = samplesX
  canvas.height = samplesY
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(samplesX, samplesY)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.floor(Math.random() * 255)
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** 0..1 intensity slider -> the overlay's actual opacity. Capped at 0.5:
 *  'overlay' blending already does most of the contrast work, so pushing
 *  opacity to 1 just looks like broken TV static instead of heavier grain. */
export function grainOverlayOpacity(intensity: number): number {
  return Math.max(0, Math.min(1, intensity)) * 0.5
}

/** How much of the real opacity the LIVE PREVIEW actually shows, as a
 *  fraction — export always uses grainOverlayOpacity() at full strength.
 *  Once the preview's sample density genuinely matched the export's (see
 *  referenceWidth/Height on GrainOverlay), the correctly-strong grain made
 *  the whole canvas read as "noisy/low quality" while actively framing and
 *  cropping a photo — accurate, but unpleasant to edit against. Editing
 *  should still look clean; the export is where the real intensity lands.
 *  This only softens how the SAME texture is blended in, so scrubbing the
 *  slider is still one continuous opacity change, no separate look to snap
 *  between at 0. */
export const GRAIN_PREVIEW_OPACITY_DAMPING = 0.55

export function grainPreviewOverlayOpacity(intensity: number): number {
  return grainOverlayOpacity(intensity) * GRAIN_PREVIEW_OPACITY_DAMPING
}

/** Draws the grain overlay into a canvas 2D context that's already clipped
 *  to the target shape, covering (0,0)-(rectW,rectH) in the CURRENT
 *  transform (i.e. call this right where you'd otherwise draw the photo's
 *  local rect, before restoring any translate/rotate/clip). */
export function drawGrainOverlay(ctx: CanvasRenderingContext2D, rectW: number, rectH: number, intensity: number) {
  if (intensity <= 0 || rectW <= 0 || rectH <= 0) return
  const noise = buildGrainNoise(rectW, rectH)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = grainOverlayOpacity(intensity)
  ctx.drawImage(noise, 0, 0, rectW, rectH)
  ctx.restore()
}
