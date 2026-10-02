import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import { useEditorStore } from '../../store/editorStore'
import { getWorkspaceBackground } from '../../lib/workspaceBackgrounds'

// Matches the lighter of the checkerboard gradient's two square colors below,
// so fading the backing color into this tone reads as blending toward the
// pattern rather than toward an unrelated color.
const CHECKER_BASE_HEX = '#c2c6ca'

interface CanvasStageProps {
  /** Logical (virtual) canvas size — children should be authored in this coordinate space. */
  outputWidth: number
  outputHeight: number
  background?: string
  children: ReactNode
  /** Reports the current display scale (virtual px -> screen px), useful for export. */
  onScaleChange?: (scale: number) => void
  /**
   * A still picture of this canvas (a data URL from snapshot() below) shown in
   * place of the live Stage, which is UNMOUNTED for as long as this is set.
   *
   * Exists for the export. WebKit caps the total canvas backing store a tab
   * may hold, and a native-resolution render spends the whole time sitting
   * against that ceiling; the preview's canvas is just another claim on it and
   * the one WebKit blanks — permanently, since a canvas it has dropped never
   * repaints again. Taking the Stage down for the duration hands that memory
   * to the export, and the frozen image keeps the screen looking exactly as it
   * did, rather than leaving a hole where the photo was.
   */
  frozenSrc?: string | null
  /**
   * Bump `key` to turn the whole canvas a quarter in `dir` (1 = clockwise):
   * the frame and photo rotate together into their new shape. For a change
   * that turns the canvas itself — a photo on "Original" rotated, so the
   * frame goes from landscape to portrait. `outputWidth`/`outputHeight` must
   * already be the new (swapped) size in the same render, not a tween.
   */
  turn?: { key: number; dir: 1 | -1 }
}

/** How long the container has to hold still before the Stage is re-rendered
 *  at its new size. Until then the old render is scaled on the GPU — see
 *  `renderBox` below. Long enough to outlast the frames of a panel opening. */
const RESIZE_SETTLE_MS = 140

const TURN_MS = 420
const TURN_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export interface CanvasStageHandle {
  /** A JPEG data URL of the canvas as it looks right now, or null before it
   *  has drawn anything. Feed it back as `frozenSrc`. */
  snapshot: () => string | null
}

export const CanvasStage = forwardRef<CanvasStageHandle, CanvasStageProps>(function CanvasStage({
  outputWidth,
  outputHeight,
  background = '#ffffff',
  children,
  onScaleChange,
  frozenSrc = null,
  turn,
}: CanvasStageProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const turnRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<import('konva/lib/Stage').Stage>(null)
  // `withContainer` records whether the FIRST usable measurement arrived
  // before the browser had painted this container even once. It decides
  // whether the canvas needs an entrance animation of its own — see the
  // layout effect and the `fade-in-slow` class below.
  const [box, setBox] = useState({ width: 0, height: 0, withContainer: false })
  const workspaceBackground = useEditorStore((s) => s.workspaceBackground)
  const workspaceBg = getWorkspaceBackground(workspaceBackground)

  // Measured here, synchronously, rather than waiting for the ResizeObserver
  // below to report the first size. The Stage only renders once a size is
  // known, and a ResizeObserver's first callback lands AFTER the frame that
  // painted this container — so the workspace background appeared alone for
  // a frame, and the canvas then arrived separately with its own fade. On a
  // nine-photo collage, coming straight out of the import card, that read as
  // the photos dropping in a beat after the background. A layout effect runs
  // before the paint, so the canvas is on screen in the same frame as the
  // background it sits on, and the two ride the caller's crossfade together.
  //
  // clientWidth/Height minus padding rather than getBoundingClientRect: this
  // element is usually mid-`view-enter` at this point, and that animation's
  // scale(0.98) would otherwise be baked into the canvas size for good
  // (a transform never triggers the observer, so nothing would correct it).
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const style = getComputedStyle(el)
    const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    if (width > 0 && height > 0) setBox({ width, height, withContainer: true })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setBox((prev) => ({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
          withContainer: prev.withContainer,
        }))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The size the Stage is actually RENDERED at, which trails `box`.
  //
  // A tool panel or the selection's action row opening eases the container's
  // height over ~300ms, and re-rendering the Stage at every one of those
  // sizes meant reallocating the canvas and redrawing every photo (grain,
  // sharpening and all) each frame — far more than a phone gets done in a
  // frame, so the collage shrank and grew in visible steps, and each redraw
  // resampled the photos a little differently, so they seemed to shimmer
  // in sharpness on the way. Now the existing render is scaled with a CSS
  // transform while the container moves (composited, so every frame lands),
  // and redrawn crisp at the final size once, after it settles. The
  // container is never bigger than the render by more than a panel's
  // height, and the preview already renders at the screen's pixel ratio, so
  // the brief upscale on the way back isn't visibly softer.
  const [renderBox, setRenderBox] = useState({ width: 0, height: 0 })
  const boxReady = box.width > 0 && box.height > 0
  const renderReady = renderBox.width > 0 && renderBox.height > 0
  if (boxReady && !renderReady) setRenderBox({ width: box.width, height: box.height })
  useEffect(() => {
    if (!boxReady) return
    if (box.width === renderBox.width && box.height === renderBox.height) return
    const t = setTimeout(() => setRenderBox({ width: box.width, height: box.height }), RESIZE_SETTLE_MS)
    return () => clearTimeout(t)
  }, [box.width, box.height, boxReady, renderBox.width, renderBox.height])

  useImperativeHandle(ref, () => ({
    // Off the Konva stage itself rather than the DOM canvas, so the pixel
    // ratio and the layer composition are whatever Konva already decided —
    // the still is then indistinguishable from the live canvas it replaces.
    // JPEG, not PNG: this is a throwaway that lives for the length of one
    // export, and a lossless copy of a full-bleed photo is megabytes of
    // base64 held at the exact moment memory is tightest.
    snapshot: () => {
      const stage = stageRef.current
      if (!stage) return null
      try {
        // At the screen's own pixel ratio, not Konva's default of 1: the still
        // is displayed at the same CSS size the canvas had, so capturing it at
        // 1x would hand back a visibly softer picture than the one it
        // replaces — which reads as the export having degraded the photo.
        return stage.toDataURL({
          mimeType: 'image/jpeg',
          quality: 0.92,
          pixelRatio: window.devicePixelRatio || 1,
        })
      } catch {
        // Better a hole than a thrown export.
        return null
      }
    },
  }))

  const fitScale = (b: { width: number; height: number }) =>
    b.width > 0 && b.height > 0 && outputWidth > 0 && outputHeight > 0
      ? Math.min(b.width / outputWidth, b.height / outputHeight)
      : 0
  // What the canvas looks like on screen right now…
  const scale = fitScale(box)
  // …and what it's drawn at; the CSS scale between them covers the difference.
  const renderScale = fitScale(renderBox) || scale
  const settleScale = renderScale > 0 ? scale / renderScale : 1

  useEffect(() => {
    if (scale > 0) onScaleChange?.(scale)
  }, [scale, onScaleChange])

  // The quarter turn. Runs before the paint of the render that already has
  // the new size, starting from a transform that makes the new canvas look
  // exactly like the old one (turned back, scaled to the old size), so the
  // first frame matches what was on screen and the rest is one rotation.
  const shownSize = { width: outputWidth * scale, height: outputHeight * scale }
  const lastShown = useRef(shownSize)
  const lastTurnKey = useRef(turn?.key)
  useLayoutEffect(() => {
    const prev = lastShown.current
    lastShown.current = shownSize
    if (turn?.key === lastTurnKey.current) return
    lastTurnKey.current = turn?.key
    const el = turnRef.current
    if (!turn || !el || !(shownSize.height > 0) || !(prev.width > 0)) return
    // Stacked on top of a turn still in flight, so a quick second tap
    // carries on from where the canvas is rather than jumping back.
    const current = getComputedStyle(el).transform
    const from = current && current !== 'none' ? current : 'matrix(1, 0, 0, 1, 0, 0)'
    el.getAnimations().forEach((a) => a.cancel())
    const k = prev.width / shownSize.height
    el.animate(
      [
        { transform: `${from} rotate(${-90 * turn.dir}deg) scale(${k})` },
        { transform: 'matrix(1, 0, 0, 1, 0, 0) rotate(0deg) scale(1)' },
      ],
      { duration: TURN_MS, easing: TURN_EASE },
    )
  })

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl p-[5px] transition-colors duration-300"
      // Backed by CHECKER_BASE_HEX (one of the checkerboard's own two square
      // colors) instead of literal 'transparent' for "No background". Animating
      // background-color THROUGH transparent made the browser interpolate
      // through transparent's implicit (0,0,0) RGB — a black-tinted fade —
      // on top of which the checker layer below was also fading, compounding
      // into the "washed-out double-exposure" look. With a real, checker-
      // matched color on both ends, this fades cleanly like any other
      // color<->color transition, and the checker layer's own opacity fade
      // (below) blends into it seamlessly once it's mostly faded in.
      style={{ backgroundColor: workspaceBg.hex ?? CHECKER_BASE_HEX }}
    >
      {/* Checkered "No background" pattern as its own opacity-animated layer, in
          sync with the color fade above. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[repeating-conic-gradient(#b6bcc4_0%_25%,#c2c6ca_0%_50%)] bg-[length:20px_20px] transition-opacity duration-300"
        style={{ opacity: workspaceBg.hex ? 0 : 1 }}
      />
      {scale > 0 && (
        <div ref={turnRef}>
        <div
          // The entrance fade is only for a canvas that could NOT be shown in
          // its container's first painted frame (the container was laid out
          // at zero size and only the observer above ever reported a real
          // one) — appearing late, unannounced, is what needs softening.
          // When the size was known before the first paint the canvas is
          // simply part of that frame, and a second fade on top of the
          // caller's own crossfade is the double entrance this used to look
          // like.
          className={`relative rounded-sm ring-1 ring-slate-900/10 ${box.withContainer ? '' : 'fade-in-slow'}`}
          // touchAction 'none' so a two-finger pinch on the canvas is OURS to
          // handle (PhotoCell's zoom) instead of the browser's page zoom, and
          // a one-finger pan doesn't fight page scrolling. Konva never sets
          // this itself, and touch-action intersects down the ancestor chain,
          // so putting it on this wrapper covers the <canvas> Konva creates
          // inside. Safe here because the editor screen never scrolls.
          style={{
            boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.25)',
            touchAction: 'none',
            transform: settleScale === 1 ? undefined : `scale(${settleScale})`,
          }}
        >
          {frozenSrc ? (
            <img
              src={frozenSrc}
              alt=""
              width={outputWidth * renderScale}
              height={outputHeight * renderScale}
              className="block"
              style={{ width: outputWidth * renderScale, height: outputHeight * renderScale }}
            />
          ) : (
            <Stage
              ref={stageRef}
              width={outputWidth * renderScale}
              height={outputHeight * renderScale}
              scaleX={renderScale}
              scaleY={renderScale}
            >
              <Layer>
                <Rect x={0} y={0} width={outputWidth} height={outputHeight} fill={background} />
                {children}
              </Layer>
            </Stage>
          )}
        </div>
        </div>
      )}
    </div>
  )
})
