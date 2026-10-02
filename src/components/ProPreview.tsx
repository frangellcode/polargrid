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
const COLOR_STEP_MS = 1400

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
/** Fifteen bordered copies of the photo, the way a Pro batch comes out. */
const BATCH_COLS = 3
const BATCH_ROWS = 5
function drawBatch(canvas: HTMLCanvasElement, source: LoadedPhoto['previewBitmap'], width: number, height: number) {
  const ctx = prepare(canvas, width, height)
  ctx.fillStyle = '#1b2233'
  ctx.fillRect(0, 0, width, height)
  const gap = width * 0.035
  const tileW = (width - gap * (BATCH_COLS + 1)) / BATCH_COLS
  const tileH = (height - gap * (BATCH_ROWS + 1)) / BATCH_ROWS
  const pad = Math.min(tileW, tileH) * 0.08
  const innerW = tileW - pad * 2
  const innerH = tileH - pad * 2
  const srcAspect = source.width / source.height
  const innerAspect = innerW / innerH
  const sw = srcAspect > innerAspect ? source.height * innerAspect : source.width
  const sh = srcAspect > innerAspect ? source.height : source.width / innerAspect
  const sx = (source.width - sw) / 2
  const sy = (source.height - sh) / 2
  for (let r = 0; r < BATCH_ROWS; r++) {
    for (let c = 0; c < BATCH_COLS; c++) {
      const x = gap + c * (tileW + gap)
      const y = gap + r * (tileH + gap)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, tileW, tileH)
      ctx.drawImage(source, sx, sy, sw, sh, x + pad, y + pad, innerW, innerH)
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
    drawGrainOverlay(after, width, height, 0.75)
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
      if (batchRef.current) drawBatch(batchRef.current, photo.previewBitmap, width, height)
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
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl bg-white/5"
      style={{ aspectRatio: `${ASPECT}` }}
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
        style={{ backgroundColor: COLOR_CYCLE[colorIndex], transition: 'opacity 300ms ease-out, background-color 700ms ease-in-out' }}
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
