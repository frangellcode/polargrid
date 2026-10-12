import { Rect } from 'react-konva'
import { vignetteStops } from '../../lib/adjustments'

interface VignetteOverlayProps {
  x?: number
  y?: number
  width: number
  height: number
  /** 0..1, 0 renders nothing. */
  strength: number
}

/** Konva-side Retro vignette over a photo's visible rect — the same gradient
 *  the export draws with drawVignette, so the two agree. */
export function VignetteOverlay({ x = 0, y = 0, width, height, strength }: VignetteOverlayProps) {
  if (strength <= 0 || width <= 0 || height <= 0) return null
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      listening={false}
      fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
      fillRadialGradientStartRadius={0}
      fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
      fillRadialGradientEndRadius={Math.hypot(width, height) / 2}
      fillRadialGradientColorStops={vignetteStops(strength).flatMap(([stop, alpha]) => [stop, `rgba(0,0,0,${alpha})`])}
    />
  )
}
