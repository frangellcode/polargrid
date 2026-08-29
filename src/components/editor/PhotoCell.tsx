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
  /** Fades the whole cell — used to dim the source cell nearly out of sight
   *  while it's being long-press-dragged (or mid-swap-flight), without
   *  disturbing the grid's layout by actually removing it. */
  opacity?: number
  /** False for the floating drag/swap overlay copies Collage renders on top
   *  of the grid — a static, non-interactive picture with no pan/zoom/long-
   *  press wiring of its own (those belong to the real cell underneath). */
  interactive?: boolean
  /** Fires once a press has been held roughly still for LONG_PRESS_MS —
   *  Collage's grid uses this to pick the cell up for a drag-to-reorder,
   *  as distinct from the quick drag directly below that pans/crops the
   *  photo in place. Never wired when `interactive` is false or there's no
   *  photo (nothing to pick up). */
  onLongPressStart?: (evt: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
}

/** How long a still press has to be held before it's treated as "pick this
 *  cell up to move it" instead of "pan/crop the photo in place". Long enough
 *  that a normal quick drag (the far more common gesture) never gets
 *  mistaken for it, short enough that it doesn't feel like the tap failed. */
const LONG_PRESS_MS = 550
/** How far the pointer can drift during that hold before it's treated as the
 *  start of a normal pan instead — real fingers/mice never sit perfectly
 *  still, so this needs slack, but not so much it eats into an intentional
 *  quick pan gesture. */
const LONG_PRESS_CANCEL_PX = 8

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
  opacity = 1,
  interactive = true,
  onLongPressStart,
}: PhotoCellProps) {
  const pinchDist = useRef<number | null>(null)
  const imageRef = useRef<Konva.Image>(null)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const holdStart = useRef<{ x: number; y: number } | null>(null)
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
    clearHold()
  }

  // Long-press-to-pick-up detection lives here rather than on the KonvaImage
  // itself, so it can watch the gesture in parallel with (not instead of)
  // that image's own `draggable` pan — a quick drag should keep behaving
  // exactly as it always has. Whichever fires first wins: real movement
  // beyond LONG_PRESS_CANCEL_PX cancels the hold (Konva's own drag threshold
  // is smaller, so a genuine pan gesture is already underway well before
  // that), while holding still for LONG_PRESS_MS instead fires
  // `onLongPressStart` — Collage's grid takes it from there.
  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    holdStart.current = null
  }

  const handleHoldStart = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!interactive || !onLongPressStart) return
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    holdStart.current = pos
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = undefined
      onLongPressStart(e)
    }, LONG_PRESS_MS)
  }

  const handleHoldCheckMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!holdStart.current) return
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const dist = Math.hypot(pos.x - holdStart.current.x, pos.y - holdStart.current.y)
    if (dist > LONG_PRESS_CANCEL_PX) clearHold()
  }

  return (
    <Group
      x={x}
      y={y}
      opacity={opacity}
      clipFunc={(ctx) => traceRoundedRectPath(ctx, cornerRadius, width, height)}
      onWheel={handleWheel}
      onTouchMove={(e) => {
        handleTouchMove(e)
        handleHoldCheckMove(e)
      }}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleHoldStart}
      onTouchStart={handleHoldStart}
      onMouseMove={handleHoldCheckMove}
      onMouseUp={clearHold}
    >
      <KonvaImage
        ref={imageRef}
        image={photo.previewBitmap as unknown as CanvasImageSource}
        x={draw.x}
        y={draw.y}
        width={draw.width}
        height={draw.height}
        draggable={interactive}
        dragBoundFunc={dragBounds}
        onDragStart={() => {
          clearHold()
          setInteracting(true)
        }}
        onDragEnd={handleDragEnd}
      />
      <GrainOverlay
        // Sized to the actual drawn photo rect intersected with the cell's
        // safe bounds — NOT the raw cell size. In 'cover' fit `draw` always
        // covers the whole cell, so this is a no-op there; but in 'contain'
        // fit (border-unlocked mode) the photo can letterbox inside the cell,
        // and painting the overlay over the full cell would speckle grain
        // onto that empty gap too — which reads as the border/background
        // color, so it looked like grain leaking onto the border. The
        // min(width, widthTarget)/min(height, heightTarget) half of the
        // intersection is the same animateLayout safety as before: while a
        // cell is easing into a smaller size (border/gutter thickened),
        // `width`/`height` still lag the new, un-animated target for a few
        // frames, so clamping to whichever is smaller keeps this inside the
        // real cell edge too.
        x={Math.max(0, draw.x)}
        y={Math.max(0, draw.y)}
        width={Math.max(0, Math.min(width, widthTarget, draw.x + draw.width) - Math.max(0, draw.x))}
        height={Math.max(0, Math.min(height, heightTarget, draw.y + draw.height) - Math.max(0, draw.y))}
        intensity={interacting ? 0 : grain}
        referenceWidth={photo.width}
        referenceHeight={photo.height}
      />
    </Group>
  )
}
