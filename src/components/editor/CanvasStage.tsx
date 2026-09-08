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
}

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
}: CanvasStageProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
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

  const scale =
    box.width > 0 && box.height > 0 && outputWidth > 0 && outputHeight > 0
      ? Math.min(box.width / outputWidth, box.height / outputHeight)
      : 0

  useEffect(() => {
    if (scale > 0) onScaleChange?.(scale)
  }, [scale, onScaleChange])

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
          style={{ boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.25)', touchAction: 'none' }}
        >
          {frozenSrc ? (
            <img
              src={frozenSrc}
              alt=""
              width={outputWidth * scale}
              height={outputHeight * scale}
              className="block"
              style={{ width: outputWidth * scale, height: outputHeight * scale }}
            />
          ) : (
            <Stage
              ref={stageRef}
              width={outputWidth * scale}
              height={outputHeight * scale}
              scaleX={scale}
              scaleY={scale}
            >
              <Layer>
                <Rect x={0} y={0} width={outputWidth} height={outputHeight} fill={background} />
                {children}
              </Layer>
            </Stage>
          )}
        </div>
      )}
    </div>
  )
})
