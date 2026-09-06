import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
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
  const [box, setBox] = useState({ width: 0, height: 0 })
  const workspaceBackground = useEditorStore((s) => s.workspaceBackground)
  const workspaceBg = getWorkspaceBackground(workspaceBackground)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
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
          className="fade-in-slow relative rounded-sm ring-1 ring-slate-900/10"
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
