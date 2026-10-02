import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LoadedPhoto } from '../types'
import type { ProFeature } from '../store/proStore'
import { BORDER_COLORS } from '../lib/borderColors'
import { drawGrainOverlay } from '../lib/grain'
import { readPhoto } from '../lib/photoSource'
import { sharpenAmount, sharpenRadiusFor, unsharpMask } from '../lib/sharpen'
import { useTranslation } from '../store/languageStore'

/** The preview box's shape, width / height. */
const ASPECT = 4 / 5
/** The quality example zooms into this share of the photo's short side. */
const DETAIL_SHARE = 0.16
/** The long edge the "Web" export quality caps a photo to (exportQuality.ts). */
const WEB_LONG_EDGE = 1080
/** Border colours the colour example cycles through: the palette, then a few
 *  a custom pick could land on. */
const COLOR_CYCLE = [...BORDER_COLORS.map((c) => c.hex), '#d9a441', '#7a8b6f', '#b85c5c']
const COLOR_STEP_MS = 700

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
  feature: Exclude<ProFeature, 'colors' | 'batch'>,
  photo: LoadedPhoto,
  beforeCanvas: HTMLCanvasElement,
  afterCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  isCancelled: () => boolean,
) {
  const source = photo.previewBitmap

  if (feature === 'quality') {
    // A detail at the photo's own resolution ("Maximum") against the same
    // detail as a Web export would have it: fewer pixels, stretched up.
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
      const webScale = Math.min(1, WEB_LONG_EDGE / Math.max(photo.width, photo.height))
      const small = document.createElement('canvas')
      const smallCtx = prepare(small, Math.max(1, Math.round(detail.sw * webScale)), Math.max(1, Math.round(detail.sh * webScale)))
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

  const crop = coverCrop(source.width, source.height)
  const before = prepare(beforeCanvas, width, height)
  const after = prepare(afterCanvas, width, height)
  before.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  after.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  if (feature === 'grain') {
    drawGrainOverlay(after, width, height, 0.4)
  } else {
    const image = after.getImageData(0, 0, width, height)
    unsharpMask(image, sharpenRadiusFor(Math.max(width, height)), sharpenAmount(0.9))
    after.putImageData(image, 0, 0)
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

    if (feature === 'batch') {
      if (batchRef.current) drawBatch(batchRef.current, width, height)
      setShown('batch')
      return
    }

    // Fades the old split out while the new one draws, then back in.
    setShown((prev) => (prev === 'colors' || prev === 'batch' ? prev : null))
    drawSplit(feature, photo, before, after, width, height, () => cancelled)
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
  }, [feature, photo])

  // Released on the way out — WebKit caps the canvas memory a page may hold.
  useEffect(() => {
    const canvases = [beforeRef.current, afterRef.current, photoRef.current, batchRef.current]
    return () => {
      for (const c of canvases) {
        if (!c) continue
        c.width = 0
        c.height = 0
      }
    }
  }, [])

  useEffect(() => {
    if (feature !== 'colors') return
    const t = setInterval(() => setColorIndex((i) => (i + 1) % COLOR_CYCLE.length), COLOR_STEP_MS)
    return () => clearInterval(t)
  }, [feature])

  const moveDivider = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    setSplit(Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100)))
  }

  const splitShown = shown !== null && shown !== 'colors' && shown !== 'batch'
  const labels =
    shown === 'quality' ? [tr.pro.exampleWeb, tr.pro.exampleMaximum] : [tr.pro.exampleBefore, tr.pro.exampleAfter]
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
