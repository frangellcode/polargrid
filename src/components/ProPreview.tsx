import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LoadedPhoto } from '../types'
import type { ProFeature } from '../store/proStore'
import { BORDER_COLORS } from '../lib/borderColors'
import { WORKSPACE_BACKGROUNDS } from '../lib/workspaceBackgrounds'
import { drawGrainOverlay } from '../lib/grain'
import { readPhoto } from '../lib/photoSource'
import { applyAdjustments, DEFAULT_ADJUSTMENTS, drawVignette, getRetroPreset } from '../lib/adjustments'
import { useTranslation } from '../store/languageStore'
import { drawBackdropCover, photoBackdrop } from '../lib/storyBackdrop'
import { DEFAULT_TRANSFORM } from '../lib/cropMath'
import { captionBandPct, captionFont, captionInk, DEFAULT_CAPTION, loadCaptionFont, type BorderCaption } from '../lib/caption'

/** The preview box's shape, width / height. */
const ASPECT = 4 / 5
/** The quality example zooms into this share of the photo's short side. */
const DETAIL_SHARE = 0.16
/** The paywall's stand-in photo when none is loaded yet (ProSheet). */
export const PRO_SAMPLE_ID = 'pro-sample'
/** Long edge of that photo's original, which public/pro/quality-detail.jpg
 *  is a DETAIL_SHARE crop of at full resolution. */
const SAMPLE_ORIGINAL_LONG_EDGE = 8381
/** The long edge "High" — the best a free export gets — caps a photo to
 *  (exportQuality.ts). The quality example compares against that, not the
 *  much smaller "Web", so it shows the real difference Pro makes. */
const HIGH_LONG_EDGE = 2048
/** Border colours the colour example cycles through: the palette, then a few
 *  a custom pick could land on. */
const COLOR_CYCLE = [...BORDER_COLORS.map((c) => c.hex), '#d9a441', '#7a8b6f', '#b85c5c']
const COLOR_STEP_MS = 700
/** Backgrounds the 9:16 example cycles through — the workspace palette. */
const STORY_CYCLE = WORKSPACE_BACKGROUNDS.flatMap((b) => (b.hex ? [b.hex] : []))

type Crop = { sx: number; sy: number; sw: number; sh: number }

/** The centred crop of a `srcW`×`srcH` source that fills the preview box. */
function coverCrop(srcW: number, srcH: number): Crop {
  const srcAspect = srcW / srcH
  if (srcAspect > ASPECT) {
    const sw = srcH * ASPECT
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  const sh = srcW / ASPECT
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}

/** Sizes a canvas the component owns and hands back a fresh context for it. */
function prepare(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/** Draws the before / after pair for one of the split examples. */
/** A Pro batch as it comes out: fifteen different photos, each in the same
 *  white border. Not the person's own photo fifteen times over — repeated, it
 *  read as duplicates rather than as fifteen photos edited at once — but
 *  small drawn landscapes, each in its own light. */
const BATCH_COLS = 3
const BATCH_ROWS = 5
/** Sky top, sky bottom, far hills, near hills, sun/moon. */
const BATCH_SCENES: [string, string, string, string, string][] = [
  ['#f6a65a', '#fde3b0', '#b4636a', '#5b3550', '#fff4d6'],
  ['#1b2a4a', '#4a5f8f', '#2b3a5c', '#141d33', '#f2f0e6'],
  ['#7ec8e3', '#d6f0fa', '#4f8a6b', '#2f5d45', '#ffffff'],
  ['#e85d75', '#f9b384', '#8c3b5a', '#4a2140', '#ffe2b8'],
  ['#9bb7d4', '#e9eef4', '#9aa7b8', '#6d7a8c', '#ffffff'],
  ['#f2c14e', '#f7e2a8', '#c97b3d', '#8a4b2a', '#fff7dc'],
  ['#2e1f47', '#8d4f8a', '#4b2c5e', '#24163a', '#ffd9a8'],
  ['#5fb3b3', '#c8ece6', '#3b7f7a', '#245652', '#fefefe'],
  ['#ff8a5b', '#ffd29d', '#a6544a', '#5a2e33', '#fff1d0'],
  ['#3d5a80', '#98c1d9', '#29486b', '#16304d', '#e0fbfc'],
  ['#c3d9a5', '#f1f5e1', '#7da36b', '#4c7043', '#fffbe8'],
  ['#d4a5a5', '#f5e1da', '#9e7a7a', '#6b4f57', '#fff6f0'],
  ['#0f2027', '#2c5364', '#203a43', '#0b161b', '#cfe8ef'],
  ['#ffb7a1', '#fff0e0', '#d98c7a', '#9c5b55', '#ffffff'],
  ['#6a8caf', '#c9d6e3', '#4e6b88', '#2e4560', '#fdf6e3'],
]

function drawScene(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, i: number) {
  const [skyTop, skyBottom, far, near, sun] = BATCH_SCENES[i % BATCH_SCENES.length]
  const rand = (n: number) => {
    const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453
    return v - Math.floor(v)
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const sky = ctx.createLinearGradient(0, y, 0, y + h)
  sky.addColorStop(0, skyTop)
  sky.addColorStop(1, skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = sun
  ctx.beginPath()
  ctx.arc(x + w * (0.2 + rand(1) * 0.6), y + h * (0.22 + rand(2) * 0.2), Math.min(w, h) * (0.09 + rand(3) * 0.05), 0, Math.PI * 2)
  ctx.fill()
  const ridge = (color: string, base: number, amp: number, seed: number) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    const steps = 6
    for (let s = 0; s <= steps; s++) {
      const px = x + (w * s) / steps
      const py = y + h * (base - amp * Math.abs(Math.sin(seed + s * (1.1 + rand(seed) * 0.8))))
      ctx.lineTo(px, py)
    }
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    ctx.fill()
  }
  ridge(far, 0.68, 0.22, 4)
  ridge(near, 0.86, 0.16, 7)
  ctx.restore()
}

function drawBatch(canvas: HTMLCanvasElement, width: number, height: number) {
  const ctx = prepare(canvas, width, height)
  ctx.fillStyle = '#1b2233'
  ctx.fillRect(0, 0, width, height)
  const gap = width * 0.035
  const tileW = (width - gap * (BATCH_COLS + 1)) / BATCH_COLS
  const tileH = (height - gap * (BATCH_ROWS + 1)) / BATCH_ROWS
  const pad = Math.min(tileW, tileH) * 0.08
  for (let r = 0; r < BATCH_ROWS; r++) {
    for (let c = 0; c < BATCH_COLS; c++) {
      const x = gap + c * (tileW + gap)
      const y = gap + r * (tileH + gap)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, tileW, tileH)
      drawScene(ctx, x + pad, y + pad, tileW - pad * 2, tileH - pad * 2, r * BATCH_COLS + c)
    }
  }
}

async function drawSplit(
  feature: Exclude<ProFeature, 'colors' | 'batch' | 'story'>,
  photo: LoadedPhoto,
  beforeCanvas: HTMLCanvasElement,
  afterCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  isCancelled: () => boolean,
  /** The caption example's text. */
  sample = '',
) {
  const source = photo.previewBitmap

  if (feature === 'backdrop') {
    // The same print on a plain background, and on the photo itself, blurred.
    const short = Math.min(width, height)
    const blurred = photoBackdrop(source, DEFAULT_TRANSFORM, null, 'blur')
    const scene = (canvas: HTMLCanvasElement, withPhoto: boolean) => {
      const ctx = prepare(canvas, width, height)
      ctx.fillStyle = '#ece9e4'
      ctx.fillRect(0, 0, width, height)
      if (withPhoto) drawBackdropCover(ctx, blurred, width, height)
      const pw = width * 0.62
      const ph = pw * 1.18
      const x = (width - pw) / 2
      const y = (height - ph) / 2
      const pad = pw * 0.05
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = short * 0.04
      ctx.shadowOffsetY = short * 0.012
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, pw, ph)
      ctx.restore()
      const iw = pw - pad * 2
      const ih = ph - pad - pw * 0.17
      const scale = Math.max(iw / source.width, ih / source.height)
      const sw = iw / scale
      const sh = ih / scale
      ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, x + pad, y + pad, iw, ih)
    }
    scene(beforeCanvas, false)
    scene(afterCanvas, true)
    return true
  }

  if (feature === 'caption') {
    // The same print with an even border, and as a polaroid with a caption.
    const caption: BorderCaption = { ...DEFAULT_CAPTION, text: sample, size: 0.065 }
    await loadCaptionFont(caption)
    if (isCancelled()) return false
    const short = Math.min(width, height)
    const border = short * 0.06
    const band = captionBandPct(caption, 0.06) * short
    const print = (canvas: HTMLCanvasElement, bottom: number) => {
      const ctx = prepare(canvas, width, height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      const w = width - border * 2
      const h = height - border - bottom
      const scale = Math.max(w / source.width, h / source.height)
      const sw = w / scale
      const sh = h / scale
      ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, border, border, w, h)
      return ctx
    }
    print(beforeCanvas, border)
    const ctx = print(afterCanvas, band)
    ctx.font = captionFont(caption, caption.size * short)
    ctx.fillStyle = captionInk('#ffffff')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(caption.text, width / 2, height - band / 2, width - border * 2)
    return true
  }

  if (feature === 'quality' && photo.id === PRO_SAMPLE_ID) {
    // No photo of the person's yet: the tour's resort photo is only 640px,
    // which has no detail to show. A crop of its full-resolution original
    // (public/pro, cut from assets/originals) stands in, against the same
    // crop as a High export of the whole photo would have it.
    const crop = await createImageBitmap(await (await fetch(`${import.meta.env.BASE_URL}pro/quality-detail.jpg`)).blob())
    try {
      if (isCancelled()) return false
      const highScale = Math.min(1, HIGH_LONG_EDGE / SAMPLE_ORIGINAL_LONG_EDGE)
      const small = document.createElement('canvas')
      prepare(small, Math.max(1, Math.round(crop.width * highScale)), Math.max(1, Math.round(crop.height * highScale))).drawImage(crop, 0, 0, small.width, small.height)
      prepare(beforeCanvas, width, height).drawImage(small, 0, 0, width, height)
      prepare(afterCanvas, width, height).drawImage(crop, 0, 0, width, height)
      small.width = 0
      small.height = 0
    } finally {
      crop.close()
    }
    return true
  }

  if (feature === 'quality') {
    // A detail at the photo's own resolution ("Maximum") against the same
    // detail as a High export would have it: fewer pixels, stretched up.
    const side = Math.min(photo.width, photo.height) * DETAIL_SHARE
    const detail: Crop = {
      sx: (photo.width - side * ASPECT) / 2,
      sy: (photo.height - side) / 2,
      sw: side * ASPECT,
      sh: side,
    }
    const full = await createImageBitmap(await readPhoto(photo.file), { imageOrientation: 'from-image' })
    try {
      if (isCancelled()) return false
      const highScale = Math.min(1, HIGH_LONG_EDGE / Math.max(photo.width, photo.height))
      const small = document.createElement('canvas')
      const smallCtx = prepare(small, Math.max(1, Math.round(detail.sw * highScale)), Math.max(1, Math.round(detail.sh * highScale)))
      smallCtx.drawImage(full, detail.sx, detail.sy, detail.sw, detail.sh, 0, 0, small.width, small.height)
      prepare(beforeCanvas, width, height).drawImage(small, 0, 0, width, height)
      prepare(afterCanvas, width, height).drawImage(full, detail.sx, detail.sy, detail.sw, detail.sh, 0, 0, width, height)
      small.width = 0
      small.height = 0
    } finally {
      full.close()
    }
    return true
  }

  if (feature === 'retouch') {
    // Not the person's photo: the brush needs something to take out. A boat
    // on a sandbar, before and after the brush, made by the same fill.
    const [shotBefore, shotAfter] = await Promise.all(
      ['tour/retouch-before.jpg', 'tour/retouch-after.jpg'].map(async (url) => createImageBitmap(await (await fetch(url)).blob())),
    )
    try {
      if (isCancelled()) return false
      const c = coverCrop(shotBefore.width, shotBefore.height)
      prepare(beforeCanvas, width, height).drawImage(shotBefore, c.sx, c.sy, c.sw, c.sh, 0, 0, width, height)
      prepare(afterCanvas, width, height).drawImage(shotAfter, c.sx, c.sy, c.sw, c.sh, 0, 0, width, height)
    } finally {
      shotBefore.close()
      shotAfter.close()
    }
    return true
  }

  const crop = coverCrop(source.width, source.height)
  const before = prepare(beforeCanvas, width, height)
  const after = prepare(afterCanvas, width, height)
  before.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  after.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  const image = after.getImageData(0, 0, width, height)
  if (feature === 'curves') {
    // A film-style S-curve, a little warmer in the reds and cooler in the
    // shadows' blues — the kind of grade curves are for.
    applyAdjustments(image, {
      ...DEFAULT_ADJUSTMENTS,
      toneCurves: {
        rgb: [[0, 0.04], [0.25, 0.19], [0.75, 0.83], [1, 1]],
        r: [[0, 0], [0.5, 0.54], [1, 1]],
        g: [[0, 0], [1, 1]],
        b: [[0, 0.06], [0.5, 0.48], [1, 0.95]],
      },
    })
    after.putImageData(image, 0, 0)
  } else if (feature === 'retro') {
    // A warm film style, full strength, with its vignette and grain.
    applyAdjustments(image, { ...DEFAULT_ADJUSTMENTS, retro: 'retrato' })
    after.putImageData(image, 0, 0)
    drawVignette(after, width, height, getRetroPreset('retrato')?.vignette ?? 0)
    drawGrainOverlay(after, width, height, getRetroPreset('retrato')?.grain ?? 0)
  } else {
    // Film grain — strong enough to read at a glance in a small box.
    drawGrainOverlay(after, width, height, 0.4)
  }
  return true
}

interface ProPreviewProps {
  feature: ProFeature
  photo: LoadedPhoto
}

/**
 * The paywall's example: the photo being edited, with the chosen Pro feature
 * applied to half of it (a draggable divider compares the two) or, for
 * colours, framed in a border that keeps changing colour. A "PolarGrid Pro"
 * watermark sits across the whole example, so a screenshot of it is no
 * substitute for the real export.
 */
export function ProPreview({ feature, photo }: ProPreviewProps) {
  const tr = useTranslation()
  const boxRef = useRef<HTMLDivElement>(null)
  const beforeRef = useRef<HTMLCanvasElement>(null)
  const afterRef = useRef<HTMLCanvasElement>(null)
  const photoRef = useRef<HTMLCanvasElement>(null)
  const batchRef = useRef<HTMLCanvasElement>(null)
  const storyRef = useRef<HTMLCanvasElement>(null)
  const [split, setSplit] = useState(55)
  // Which example is actually drawn right now — trails `feature` until the new
  // one is ready, so a switch is a crossfade rather than a flash of empty box.
  const [shown, setShown] = useState<ProFeature | null>(null)
  const [colorIndex, setColorIndex] = useState(0)

  useEffect(() => {
    const box = boxRef.current
    const before = beforeRef.current
    const after = afterRef.current
    const framed = photoRef.current
    if (!box || !before || !after || !framed) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const width = Math.round(box.clientWidth * dpr)
    const height = Math.round(width / ASPECT)
    let cancelled = false

    if (feature === 'colors') {
      const crop = coverCrop(photo.previewBitmap.width, photo.previewBitmap.height)
      prepare(framed, width, height).drawImage(photo.previewBitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
      setShown('colors')
      return
    }

    if (feature === 'story') {
      // The photo in a white border, as it would sit on the 9:16 background.
      const story = storyRef.current
      if (story) {
        const pw = width
        const ph = Math.round((photo.height / photo.width) * pw)
        const pad = Math.round(pw * 0.05)
        const ctx = prepare(story, pw + pad * 2, ph + pad * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, story.width, story.height)
        ctx.drawImage(photo.previewBitmap, pad, pad, pw, ph)
      }
      setShown('story')
      return
    }

    if (feature === 'batch') {
      if (batchRef.current) drawBatch(batchRef.current, width, height)
      setShown('batch')
      return
    }

    // Fades the old split out while the new one draws, then back in.
    setShown((prev) => (prev === 'colors' || prev === 'batch' || prev === 'story' ? prev : null))
    drawSplit(feature, photo, before, after, width, height, () => cancelled, tr.caption.sample)
      .then((drawn) => {
        if (drawn && !cancelled) {
          setSplit(55)
          setShown(feature)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [feature, photo, tr.caption.sample])

  // Released on the way out — WebKit caps the canvas memory a page may hold.
  useEffect(() => {
    const canvases = [beforeRef.current, afterRef.current, photoRef.current, batchRef.current, storyRef.current]
    return () => {
      for (const c of canvases) {
        if (!c) continue
        c.width = 0
        c.height = 0
      }
    }
  }, [])

  useEffect(() => {
    if (feature !== 'colors' && feature !== 'story') return
    const t = setInterval(() => setColorIndex((i) => (i + 1) % COLOR_CYCLE.length), COLOR_STEP_MS)
    return () => clearInterval(t)
  }, [feature])

  const moveDivider = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    setSplit(Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100)))
  }

  const splitShown = shown !== null && shown !== 'colors' && shown !== 'batch' && shown !== 'story'
  const labels =
    shown === 'quality' ? [tr.quality.high.label, tr.pro.exampleMaximum] : [tr.pro.exampleBefore, tr.pro.exampleAfter]
  const layer = 'absolute inset-0 transition-opacity duration-300 ease-out'

  return (
    <div
      ref={boxRef}
      className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-2xl bg-white/5"
      // Capped by height as well: at full card width a 4:5 example took most
      // of a phone's screen and pushed the card to its edges.
      style={{ aspectRatio: `${ASPECT}`, maxWidth: `calc(34vh * ${ASPECT})` }}
      onPointerDown={(e) => {
        if (!splitShown) return
        e.currentTarget.setPointerCapture(e.pointerId)
        moveDivider(e)
      }}
      onPointerMove={(e) => {
        if (splitShown && e.currentTarget.hasPointerCapture(e.pointerId)) moveDivider(e)
      }}
    >
      {/* Split examples: before under, after clipped to the divider's right. */}
      <div className={`${layer} ${splitShown ? 'opacity-100' : 'opacity-0'}`}>
        <canvas ref={beforeRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={afterRef} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${split}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-ink-900 shadow-lg">
            ‹›
          </span>
        </div>
        <span className="font-label absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          {labels[0]}
        </span>
        <span className="font-label absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          {labels[1]}
        </span>
      </div>

      {/* Colour example: the photo framed in a border that keeps changing. */}
      <div
        className={`${layer} p-[9%] ${shown === 'colors' ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: COLOR_CYCLE[colorIndex], transition: 'opacity 300ms ease-out, background-color 350ms ease-in-out' }}
      >
        <canvas ref={photoRef} className="h-full w-full object-cover" />
      </div>

      {/* 9:16 example: the bordered photo on a Story-shaped background. */}
      <div className={`${layer} flex items-center justify-center bg-white/5 ${shown === 'story' ? 'opacity-100' : 'opacity-0'}`}>
        <div
          className="flex aspect-[9/16] h-[92%] items-center justify-center rounded-md shadow-xl"
          style={{ backgroundColor: STORY_CYCLE[colorIndex % STORY_CYCLE.length], transition: 'background-color 350ms ease-in-out' }}
        >
          <canvas ref={storyRef} className="w-[84%] shadow-lg" />
        </div>
        <span className="font-label absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          9:16
        </span>
      </div>

      {/* Batch example: a sheet of fifteen bordered copies. */}
      <div className={`${layer} ${shown === 'batch' ? 'opacity-100' : 'opacity-0'}`}>
        <canvas ref={batchRef} className="absolute inset-0 h-full w-full" />
        <span className="font-label absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          {tr.pro.exampleBatch(BATCH_COLS * BATCH_ROWS)}
        </span>
      </div>

      {/* Watermark over the whole example — the real thing is the export. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-around overflow-hidden">
        {[0, 1, 2, 3].map((row) => (
          <p
            key={row}
            className="font-display -rotate-[24deg] whitespace-nowrap text-center text-[15px] font-bold uppercase tracking-[0.3em] text-white/30"
            style={{ marginLeft: row % 2 ? '-30%' : '-10%' }}
          >
            PolarGrid Pro · PolarGrid Pro · PolarGrid Pro
          </p>
        ))}
      </div>
    </div>
  )
}
