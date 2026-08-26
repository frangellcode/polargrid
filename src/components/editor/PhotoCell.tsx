import { useRef, useState } from 'react'
import { Group, Image as KonvaImage, Shape, Text } from 'react-konva'
import type Konva from 'konva'
import type { CellShape, LoadedPhoto, PhotoFit, PhotoTransform } from '../../types'
import { clampTransform, getImageDrawRect, MAX_ZOOM } from '../../lib/cropMath'
import { shapeRadiusRatio, traceRoundedRectPath } from '../../lib/shapeClip'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { GrainOverlay } from './GrainOverlay'

interface PhotoCellProps {
  x: number
  y: number
  width: number
  height: number
  photo: LoadedPhoto | null
  transform: PhotoTransform
  onTransformChange: (t: PhotoTransform) => void
  onEmptyClick?: () => void
  /** 'cover' (default) crops to fill; 'contain' shows the whole photo (border-unlocked
   *  mode); a number 0..1 blends between them, for animating the toggle smoothly. */
  fit?: PhotoFit | number
  /** Tweens x/y/width/height whenever they jump, instead of snapping — for Collage's
   *  grid mode, where switching templates changes every cell's rect outright. */
  animateLayout?: boolean
  /** How the cell is clipped: plain rect (default) or rounded corners. */
  shape?: CellShape
  /** 0..1 film-grain amount over this photo, 0/undefined = no overlay drawn. */
  grain?: number
}

/** One photo inside a clipped rect: cover- or contain-fit, draggable to pan, wheel/pinch to zoom. */
export function PhotoCell({
  x: xTarget,
  y: yTarget,
  width: widthTarget,
  height: heightTarget,
  photo,
  transform,
  onTransformChange,
  onEmptyClick,
  fit = 'cover',
  animateLayout = false,
  shape = 'rect',
  grain = 0,
}: PhotoCellProps) {
  const pinchDist = useRef<number | null>(null)
  const imageRef = useRef<Konva.Image>(null)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // True while actively dragging/pinching/wheel-zooming this photo. The grain
  // overlay below is skipped while true — it blends with 'overlay' at partial
  // opacity, which forces Konva into an off-screen buffer-canvas composite
  // every redraw, and redrawing that on every pointer-move frame during a
  // drag/pinch made the gesture itself feel laggy/unresponsive on real
  // phones. Grain is a static effect anyway (independent of pan/zoom), so
  // hiding it mid-gesture and letting it snap back on release costs nothing
  // visually once your finger is off the screen.
  const [interacting, setInteracting] = useState(false)

  // Always called (never behind the `animateLayout` flag) so this instance's hook
  // count stays identical across renders regardless of that flag's value.
  const animatedX = useAnimatedNumber(xTarget)
  const animatedY = useAnimatedNumber(yTarget)
  const animatedWidth = useAnimatedNumber(widthTarget)
  const animatedHeight = useAnimatedNumber(heightTarget)
  const x = animateLayout ? animatedX : xTarget
  const y = animateLayout ? animatedY : yTarget
  const width = animateLayout ? animatedWidth : widthTarget
  const height = animateLayout ? animatedHeight : heightTarget
  // Eases the corner radius itself between shapes (rect <-> rounded) instead
  // of the clip snapping straight to the new corners.
  const cornerRadius = useAnimatedNumber(shapeRadiusRatio(shape))

  if (width <= 0 || height <= 0) return null

  if (!photo) {
    return (
      <Group x={x} y={y} onClick={onEmptyClick} onTap={onEmptyClick}>
        <Shape
          width={width}
          height={height}
          fill="#f0f9ff"
          stroke="#bae6fd"
          strokeWidth={2}
          dash={[8, 6]}
          sceneFunc={(ctx, node) => {
            traceRoundedRectPath(ctx, cornerRadius, width, height)
            ctx.fillStrokeShape(node)
          }}
        />
        <Text
          text="+"
          width={width}
          height={height}
          align="center"
          verticalAlign="middle"
          fontSize={Math.min(width, height) * 0.3}
          fill="#7dd3fc"
        />
      </Group>
    )
  }

  const draw = getImageDrawRect(width, height, photo.width, photo.height, transform, fit)

  // Konva's dragBoundFunc receives/returns ABSOLUTE (stage) coordinates, which are
  // in canvas-pixel space — i.e. our virtual (unscaled) coordinates multiplied by
  // the Stage's scaleX/scaleY (see CanvasStage). Convert through that scale before
  // comparing against width/x/etc, which are all in virtual/unscaled units.
  const dragBounds = (pos: { x: number; y: number }) => {
    const scale = imageRef.current?.getStage()?.scaleX() || 1
    const minX = Math.min(0, width - draw.width)
    const maxX = Math.max(0, width - draw.width)
    const minY = Math.min(0, height - draw.height)
    const maxY = Math.max(0, height - draw.height)
    const localX = pos.x / scale - x
    const localY = pos.y / scale - y
    return {
      x: (Math.min(Math.max(localX, minX), maxX) + x) * scale,
      y: (Math.min(Math.max(localY, minY), maxY) + y) * scale,
    }
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const slackX = Math.max(0, (draw.width - width) / 2)
    const slackY = Math.max(0, (draw.height - height) / 2)
    const centeredX = (width - draw.width) / 2
    const centeredY = (height - draw.height) / 2
    const offsetX = slackX === 0 ? 0 : (centeredX - e.target.x()) / slackX
    const offsetY = slackY === 0 ? 0 : (centeredY - e.target.y()) / slackY
    onTransformChange(clampTransform({ ...transform, offsetX, offsetY }))
    setInteracting(false)
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const delta = -e.evt.deltaY * 0.0015
    const zoom = Math.min(MAX_ZOOM, Math.max(1, transform.zoom + delta))
    onTransformChange(clampTransform({ ...transform, zoom }))
    setInteracting(true)
    clearTimeout(wheelIdleTimer.current)
    // Wheel fires many events per gesture with no discrete "end" — treat
    // 200ms of silence as the gesture being over.
    wheelIdleTimer.current = setTimeout(() => setInteracting(false), 200)
  }

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length < 2) return
    e.evt.preventDefault()
    setInteracting(true)
    const [a, b] = [touches[0], touches[1]]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (pinchDist.current != null) {
      const scaleDelta = dist / pinchDist.current
      const zoom = Math.min(MAX_ZOOM, Math.max(1, transform.zoom * scaleDelta))
      onTransformChange(clampTransform({ ...transform, zoom }))
    }
    pinchDist.current = dist
  }

  const handleTouchEnd = () => {
    pinchDist.current = null
    setInteracting(false)
  }

  return (
    <Group
      x={x}
      y={y}
      clipFunc={(ctx) => traceRoundedRectPath(ctx, cornerRadius, width, height)}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <KonvaImage
        ref={imageRef}
        image={photo.bitmap as unknown as CanvasImageSource}
        x={draw.x}
        y={draw.y}
        width={draw.width}
        height={draw.height}
        draggable
        dragBoundFunc={dragBounds}
        onDragStart={() => setInteracting(true)}
        onDragEnd={handleDragEnd}
      />
      <GrainOverlay
        width={width}
        height={height}
        intensity={interacting ? 0 : grain}
        referenceWidth={photo.width}
        referenceHeight={photo.height}
      />
    </Group>
  )
}
