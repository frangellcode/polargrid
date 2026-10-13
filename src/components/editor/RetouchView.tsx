import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LoadedPhoto } from '../../types'
import { useTranslation } from '../../store/languageStore'
import { useEditorStore } from '../../store/editorStore'
import { readPhoto } from '../../lib/photoSource'
import { decodePatches, healStroke, previewWith } from '../../lib/retouch'
import type { LivePatch, Stroke } from '../../lib/retouch'

/** Longest side of the on-screen copy: sharp enough to zoom into a detail. */
const DISPLAY_LONG_EDGE = 2400
const MAX_ZOOM = 8
const BRUSH_MIN = 14
const BRUSH_MAX = 90

interface RetouchViewProps {
  photo: LoadedPhoto
  onClose: () => void
}

type Point = { x: number; y: number }

/**
 * The healing brush, full screen: paint over what should go and it's rebuilt
 * from the rest of the photo — no source to pick. One finger paints, two
 * pinch and pan to get at small things. Each stroke is its own step, undone
 * one at a time.
 */
export function RetouchView({ photo, onClose }: RetouchViewProps) {
  const tr = useTranslation()
  const replacePhoto = useEditorStore((s) => s.replacePhoto)
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokeRef = useRef<HTMLCanvasElement>(null)
  const fullRef = useRef<ImageBitmap | null>(null)
  const baseRef = useRef<ImageBitmap | null>(null)
  const patchesRef = useRef<LivePatch[]>([])
  const [count, setCount] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [brush, setBrush] = useState(36)
  const [fit, setFit] = useState({ width: 0, height: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view

  // The photo at full size (to heal from) and a screen-sized copy (to show).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const full = await createImageBitmap(await readPhoto(photo.file), { imageOrientation: 'from-image' })
      if (cancelled) {
        full.close()
        return
      }
      fullRef.current = full
      const scale = Math.min(1, DISPLAY_LONG_EDGE / Math.max(full.width, full.height))
      const canvas = canvasRef.current!
      canvas.width = Math.round(full.width * scale)
      canvas.height = Math.round(full.height * scale)
      strokeRef.current!.width = canvas.width
      strokeRef.current!.height = canvas.height
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(full, 0, 0, canvas.width, canvas.height)
      baseRef.current = await createImageBitmap(canvas)
      patchesRef.current = await decodePatches(photo.retouch?.patches ?? [])
      if (cancelled) return
      redraw()
      setCount(patchesRef.current.length)
      setReady(true)
    })().catch(() => {
      if (!cancelled) setError(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Everything decoded here is let go on the way out.
  useEffect(
    () => () => {
      fullRef.current?.close()
      baseRef.current?.close()
      for (const p of patchesRef.current) p.bitmap.close()
      for (const c of [canvasRef.current, strokeRef.current]) {
        if (!c) continue
        c.width = 0
        c.height = 0
      }
    },
    [],
  )

  // The photo fitted into the space between the bars.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const vw = el.clientWidth - 24
      const vh = el.clientHeight - 24
      const aspect = photo.width / photo.height
      setFit(vw / vh > aspect ? { width: vh * aspect, height: vh } : { width: vw, height: vw / aspect })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [photo.width, photo.height])

  /** The screen copy: the untouched photo, then every patch over it. */
  function redraw(original = false) {
    const canvas = canvasRef.current
    const base = baseRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(base, 0, 0)
    if (original) return
    const s = canvas.width / photo.width
    for (const { patch, bitmap } of patchesRef.current) ctx.drawImage(bitmap, patch.x * s, patch.y * s, patch.width * s, patch.height * s)
  }

  // --- Painting and pinching ---------------------------------------------
  const pointers = useRef(new Map<number, Point>())
  const stroke = useRef<Stroke | null>(null)
  const pinch = useRef<{ dist: number; mid: Point; view: typeof view; center: Point } | null>(null)
  /** After a pinch, the finger left on the glass doesn't start painting. */
  const holdOff = useRef(false)

  const toPhoto = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * photo.width, y: ((e.clientY - rect.top) / rect.height) * photo.height }
  }

  const drawStroke = () => {
    const canvas = strokeRef.current
    const s = stroke.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!s) return
    const k = canvas.width / photo.width
    ctx.strokeStyle = 'rgba(255, 70, 110, 0.55)'
    ctx.fillStyle = 'rgba(255, 70, 110, 0.55)'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = s.radius * 2 * k
    ctx.beginPath()
    if (s.points.length === 1) {
      ctx.arc(s.points[0].x * k, s.points[0].y * k, s.radius * k, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)))
    ctx.stroke()
  }

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    const rect = viewportRef.current!.getBoundingClientRect()
    pinch.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: viewRef.current,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the pointer is already gone
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // A second finger: this was a pinch all along, not a stroke.
      stroke.current = null
      drawStroke()
      holdOff.current = true
      startPinch()
      return
    }
    if (pointers.current.size > 2 || !ready || busy || saving || holdOff.current) return
    const rect = canvasRef.current!.getBoundingClientRect()
    stroke.current = { points: [toPhoto(e)], radius: (brush / 2 / rect.width) * photo.width }
    drawStroke()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const scale = Math.min(MAX_ZOOM, Math.max(1, (p.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.dist)))
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      // Keep the spot that was under the fingers under them.
      const px = (p.mid.x - p.center.x - p.view.x) / p.view.scale
      const py = (p.mid.y - p.center.y - p.view.y) / p.view.scale
      const limX = (fit.width * scale) / 2
      const limY = (fit.height * scale) / 2
      setView({
        scale,
        x: Math.max(-limX, Math.min(limX, mid.x - p.center.x - scale * px)),
        y: Math.max(-limY, Math.min(limY, mid.y - p.center.y - scale * py)),
      })
      return
    }
    const s = stroke.current
    if (!s) return
    const pt = toPhoto(e)
    const last = s.points[s.points.length - 1]
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < s.radius * 0.2) return
    s.points.push(pt)
    drawStroke()
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) holdOff.current = false
    const s = stroke.current
    if (!s || pointers.current.size > 0) return
    stroke.current = null
    void heal(s)
  }

  const heal = async (s: Stroke) => {
    const full = fullRef.current
    if (!full) return
    setBusy(true)
    stroke.current = s
    drawStroke()
    stroke.current = null
    try {
      const made = await healStroke(full, patchesRef.current, s)
      if (made) {
        patchesRef.current = [...patchesRef.current, made]
        setCount(patchesRef.current.length)
        setDirty(true)
        redraw()
      }
    } catch {
      setError(true)
      setTimeout(() => setError(false), 3000)
    } finally {
      drawStroke()
      setBusy(false)
    }
  }

  const undo = () => {
    const last = patchesRef.current.at(-1)
    if (!last || busy) return
    last.bitmap.close()
    patchesRef.current = patchesRef.current.slice(0, -1)
    setCount(patchesRef.current.length)
    setDirty(true)
    redraw()
  }

  const done = async () => {
    if (!dirty) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const base = photo.retouch?.basePreview ?? photo.previewBitmap
      const live = patchesRef.current
      const previewBitmap = live.length ? await previewWith(base, photo, live) : base
      replacePhoto({
        ...photo,
        previewBitmap,
        retouch: live.length ? { patches: live.map((p) => p.patch), basePreview: base } : undefined,
      })
      // The old preview, unless it's the untouched one still kept.
      if (photo.previewBitmap !== base && photo.previewBitmap !== previewBitmap) photo.previewBitmap.close()
    } finally {
      onClose()
    }
  }

  return (
    <div className="view-enter fixed inset-0 z-50 flex flex-col bg-black pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between px-3">
        <button
          type="button"
          onClick={onClose}
          className="font-label rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 transition active:scale-95"
        >
          {tr.retouch.cancel}
        </button>
        <p className="font-label text-xs font-semibold uppercase tracking-[0.14em] text-white">{tr.retouch.title}</p>
        <button
          type="button"
          onClick={done}
          disabled={busy || saving || !ready}
          className="font-label rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-900 transition active:scale-95 disabled:opacity-40"
        >
          {tr.retouch.done}
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: fit.width,
            height: fit.height,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`} />
          <canvas ref={strokeRef} className={`pointer-events-none absolute inset-0 h-full w-full ${busy ? 'animate-pulse' : ''}`} />
        </div>
        {(!ready || busy || error) && (
          <p className="fade-in font-label pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white">
            {error ? tr.retouch.failed : !ready ? tr.retouch.loading : tr.retouch.working}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <p className="font-label text-center text-[11px] text-white/50">{tr.retouch.hint}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={undo}
            disabled={!count || busy}
            className="font-label shrink-0 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition active:scale-95 disabled:opacity-30"
          >
            {tr.retouch.undo}
          </button>
          <span className="font-label shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/50">{tr.retouch.brush}</span>
          <input
            type="range"
            min={BRUSH_MIN}
            max={BRUSH_MAX}
            value={brush}
            aria-label={tr.retouch.brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
          />
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="rounded-full bg-[rgba(255,70,110,0.55)]" style={{ width: brush * 0.45, height: brush * 0.45 }} />
          </span>
          <button
            type="button"
            aria-label={tr.tools.compare}
            disabled={!count}
            onPointerDown={() => redraw(true)}
            onPointerUp={() => redraw()}
            onPointerLeave={() => redraw()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-90 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M12 4v16" />
              <path d="M4 20 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
