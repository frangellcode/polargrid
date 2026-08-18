import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Stage, Layer, Rect } from 'react-konva'

interface CanvasStageProps {
  /** Logical (virtual) canvas size — children should be authored in this coordinate space. */
  outputWidth: number
  outputHeight: number
  background?: string
  children: ReactNode
  /** Reports the current display scale (virtual px -> screen px), useful for export. */
  onScaleChange?: (scale: number) => void
}

export function CanvasStage({
  outputWidth,
  outputHeight,
  background = '#ffffff',
  children,
  onScaleChange,
}: CanvasStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

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
      className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#eef2f6_0%_50%)] bg-[length:20px_20px]"
    >
      {scale > 0 && (
        <div
          className="rounded-sm ring-1 ring-slate-900/10"
          style={{ boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.25)' }}
        >
          <Stage width={outputWidth * scale} height={outputHeight * scale} scaleX={scale} scaleY={scale}>
            <Layer>
              <Rect x={0} y={0} width={outputWidth} height={outputHeight} fill={background} />
              {children}
            </Layer>
          </Stage>
        </div>
      )}
    </div>
  )
}
