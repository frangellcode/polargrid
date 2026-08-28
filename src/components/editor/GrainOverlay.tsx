import { useMemo } from 'react'
import { Image as KonvaImage } from 'react-konva'
import { buildGrainNoise, capGrainPreviewReference, grainPreviewOverlayOpacity, grainSampleCounts } from '../../lib/grain'

interface GrainOverlayProps {
  /** Local offset within the parent Group — lets the overlay track a photo
   *  rect that doesn't start at the Group's own origin (e.g. a letterboxed
   *  'contain' fit, or an animateLayout cell easing toward a smaller target).
   *  Defaults to 0 for callers that always cover their full parent. */
  x?: number
  y?: number
  width: number
  height: number
  /** 0..1, 0 renders nothing. */
  intensity: number
  /** The photo's real (or near-real) native pixel size — NOT this node's own
   *  width/height. Konva's live preview draws everything at a small virtual
   *  canvas size (capped around 900px) that then gets stretched to fill the
   *  screen; sampling grain from that small size made it look chunky in
   *  preview while the export (working in true, much larger pixels) came out
   *  correctly fine — a jarring mismatch. Generating the noise from the
   *  photo's real resolution instead, then letting it be stretched down into
   *  this small node the same way a real high-res grain photo would be, is
   *  what makes the preview a faithful shrunk-down predictor of the export. */
  referenceWidth: number
  referenceHeight: number
}

/** Konva-side film-grain overlay, shared by PhotoCell and Collage's free-mode
 *  items. Memoized on the noise's sample counts (not raw reference size) so
 *  a barely-changing reference mostly keeps the same texture instead of
 *  reshuffling every frame — see grain.ts for why the counts round the way
 *  they do. */
export function GrainOverlay({ x = 0, y = 0, width, height, intensity, referenceWidth, referenceHeight }: GrainOverlayProps) {
  // Capped here (preview only) for performance — see GRAIN_PREVIEW_REF_MAX_LONG_EDGE's
  // doc for why the export path must NOT share this cap.
  const { w: refW, h: refH } = capGrainPreviewReference(referenceWidth, referenceHeight)
  const { x: samplesX, y: samplesY } = grainSampleCounts(refW, refH)
  const texture = useMemo(
    () => (intensity > 0 ? buildGrainNoise(refW, refH) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on sample counts, not raw reference size, on purpose
    [intensity > 0, samplesX, samplesY],
  )

  if (!texture || width <= 0 || height <= 0) return null

  return (
    <KonvaImage
      image={texture}
      x={x}
      y={y}
      width={width}
      height={height}
      globalCompositeOperation="overlay"
      opacity={grainPreviewOverlayOpacity(intensity)}
      listening={false}
    />
  )
}
