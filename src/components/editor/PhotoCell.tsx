import { useEffect, useRef, useState } from 'react'
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
  // Non-null for the whole life of a two-finger gesture. Zoom is derived from
  // the CURRENT finger spread against the spread at pick-up (an absolute
  // ratio), not accumulated frame by frame: the incremental version had to
  // clamp its running total at every step, so pinching past MAX_ZOOM threw the
  // overshoot away and un-pinching then did nothing until you'd given back the
  // slack you never saw applied — the gesture felt stuck at the ends.
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null)
  // Removes whatever native listeners the in-flight pinch installed. Held in a
  // ref (rather than rebuilt from props) so teardown always removes the exact
  // function identities that were added.
  const pinchCleanup = useRef<(() => void) | null>(null)
  // Tracks zoom DURING an active wheel/pinch gesture without going through
  // React — see applyLiveZoom below for why. Outside a gesture it's kept equal
  // to the committed zoom (see the sync below the animated values), so every
  // read of it is meaningful whether or not one is running.
  const liveZoomRef = useRef(transform.zoom)
  // The latest committed transform, readable from handlers that fire long
  // after the render that created them (the wheel's idle-commit timer, a
  // native pinch listener). Spreading the captured `transform` there would
  // resurrect whatever it held at bind time and silently undo any commit made
  // in between — e.g. a pan committed mid-wheel-gesture.
  const transformRef = useRef(transform)
  transformRef.current = transform
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
  // While true the KonvaImage stops being `draggable`, so a two-finger gesture
  // is purely a zoom. See beginPinch for why a drag running underneath it is
  // fatal rather than merely untidy.
  const [pinching, setPinching] = useState(false)

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

  // Outside a gesture the live zoom IS the committed zoom. Keeping them in
  // step here means dragBounds/handleDragEnd can read liveZoomRef
  // unconditionally instead of guessing which of the two is authoritative.
  if (!interacting) liveZoomRef.current = transform.zoom

  // Any listener still attached when this cell goes away (unmounted mid-pinch,
  // template switched out from under it) would keep firing against a detached
  // node; the timers would fire a commit for a cell that no longer exists.
  useEffect(() => {
    return () => {
      pinchCleanup.current?.()
      pinchCleanup.current = null
      clearTimeout(wheelIdleTimer.current)
      clearTimeout(holdTimer.current)
    }
  }, [])

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
    // The node's OWN size, not `draw`'s. `draw` is derived from the committed
    // transform, so right after a wheel zoom (which only mutates the node
    // until its idle timer commits) it still describes the pre-zoom photo —
    // clamping a pan against those smaller bounds yanked the freshly enlarged
    // photo back toward centre. The node is always the enlarged truth.
    const drawW = imageRef.current?.width() ?? draw.width
    const drawH = imageRef.current?.height() ?? draw.height
    const minX = Math.min(0, width - drawW)
    const maxX = Math.max(0, width - drawW)
    const minY = Math.min(0, height - drawH)
    const maxY = Math.max(0, height - drawH)
    const localX = pos.x / scale - x
    const localY = pos.y / scale - y
    return {
      x: (Math.min(Math.max(localX, minX), maxX) + x) * scale,
      y: (Math.min(Math.max(localY, minY), maxY) + y) * scale,
    }
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // A pinch owns the transform outright while it runs. beginPinch's own
    // stopDrag() lands here BEFORE pinch.current is set, on purpose — that one
    // should commit, since it's the pan the first finger genuinely made and
    // endPinch will build on top of it. This guard is for a stray dragend
    // arriving mid-gesture (Konva ends drags from a window-level listener, so
    // one can still surface after we've taken the node off `draggable`);
    // committing there would overwrite the live zoom with a stale one.
    if (pinch.current) return
    // Measured off the node, and paired with the LIVE zoom, for the same
    // reason dragBounds is: `draw` lags a wheel zoom that hasn't committed
    // yet, and normalising a pan against the wrong slack lands the photo
    // somewhere the finger never put it. Carrying liveZoomRef into the commit
    // (rather than spreading `transform`'s stale zoom) is also what stops a
    // dragend from silently reverting an uncommitted zoom.
    const drawW = e.target.width()
    const drawH = e.target.height()
    const slackX = Math.max(0, (drawW - width) / 2)
    const slackY = Math.max(0, (drawH - height) / 2)
    const centeredX = (width - drawW) / 2
    const centeredY = (height - drawH) / 2
    const offsetX = slackX === 0 ? 0 : (centeredX - e.target.x()) / slackX
    const offsetY = slackY === 0 ? 0 : (centeredY - e.target.y()) / slackY
    onTransformChange(clampTransform({ zoom: liveZoomRef.current, offsetX, offsetY }))
    setInteracting(false)
  }

  // Wheel/pinch used to call onTransformChange (a full store commit, which
  // re-renders the whole editor screen — toolbar, bottom bar, everything)
  // on EVERY tick of the gesture, tens of times a second. Panning already
  // avoided this (Konva's own `draggable` moves the node directly; only
  // handleDragEnd above commits once), but zoom never got the same
  // treatment — on a real phone that per-frame full-tree re-render is what
  // read as the gesture stuttering before the zoom visibly caught up. Now
  // each tick just mutates the Konva node directly and repaints the layer;
  // the store only gets the final value once, when the gesture ends.
  const applyLiveZoom = (zoom: number) => {
    liveZoomRef.current = zoom
    const liveDraw = getImageDrawRect(width, height, photo.width, photo.height, { ...transformRef.current, zoom }, fit)
    const node = imageRef.current
    if (node) {
      node.x(liveDraw.x)
      node.y(liveDraw.y)
      node.width(liveDraw.width)
      node.height(liveDraw.height)
      node.getLayer()?.batchDraw()
    }
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    if (!interacting) liveZoomRef.current = transform.zoom
    const delta = -e.evt.deltaY * 0.0015
    const zoom = Math.min(MAX_ZOOM, Math.max(1, liveZoomRef.current + delta))
    applyLiveZoom(zoom)
    setInteracting(true)
    clearTimeout(wheelIdleTimer.current)
    // Wheel fires many events per gesture with no discrete "end" — treat
    // 200ms of silence as the gesture being over, and commit then.
    wheelIdleTimer.current = setTimeout(() => {
      setInteracting(false)
      onTransformChange(clampTransform({ ...transformRef.current, zoom: liveZoomRef.current }))
    }, 200)
  }

  const touchSpread = (touches: TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    )

  const endPinch = (commit: boolean) => {
    if (!pinch.current) return
    pinch.current = null
    pinchCleanup.current?.()
    pinchCleanup.current = null
    setPinching(false)
    setInteracting(false)
    if (commit) {
      onTransformChange(clampTransform({ ...transformRef.current, zoom: liveZoomRef.current }))
    }
  }

  /**
   * Pinch-to-zoom, wired to the stage's DOM element rather than to this
   * Group's Konva `onTouchMove`, because Konva will not deliver touchmove to
   * ANY shape while a drag is running:
   *
   *   // Stage._pointermove
   *   const eventsEnabled = !(Konva.isDragging() || ...) || Konva.hitOnDragEnabled
   *   if (!eventsEnabled) return
   *
   * The KonvaImage below is `draggable` (that's the one-finger pan), and
   * Konva's default dragDistance is 0, so the first finger is already
   * "dragging" before the second one lands. The old handler hung off
   * onTouchMove and therefore never ran once on a touch device: pinch-to-zoom
   * was silently dead in both editors, which is exactly the "the photo won't
   * enlarge" report. Verified against the running app — dispatching a real
   * two-finger sequence left the image at 407px wide; flipping
   * Konva.hitOnDragEnabled on made the same sequence zoom it to 1629px.
   *
   * Turning hitOnDragEnabled on globally would be the small fix, but it makes
   * Konva hit-test every drag frame — the per-frame cost this file already
   * goes out of its way to avoid (see `interacting` and the grain overlay).
   * So instead: stop the drag, take the node off `draggable` for the gesture,
   * and listen natively, where nothing can intercept us.
   */
  const beginPinch = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const stage = e.target.getStage()
    const container = stage?.content
    if (!container || pinch.current) return
    const startDist = touchSpread(e.evt.touches)
    if (!(startDist > 0)) return

    // Before anything else: end the one-finger pan that's already underway.
    // Konva's drag rewrites the node's x/y on every pointer move, so left
    // running it fights applyLiveZoom for the same two attributes every
    // frame — the photo judders instead of scaling. stopDrag() also drops the
    // node out of DD._dragElements, which is what un-blocks Konva's own event
    // routing for the rest of the gesture.
    imageRef.current?.stopDrag()
    clearHold()

    pinch.current = { startDist, startZoom: transformRef.current.zoom }
    liveZoomRef.current = transformRef.current.zoom
    setPinching(true)
    setInteracting(true)

    const onMove = (evt: TouchEvent) => {
      const active = pinch.current
      if (!active || evt.touches.length < 2) return
      // The page must not pan/zoom underneath us. CanvasStage sets
      // touch-action: none as well; this covers browsers that have already
      // begun the gesture by the time that applies.
      if (evt.cancelable) evt.preventDefault()
      const dist = touchSpread(evt.touches)
      if (!(dist > 0)) return
      applyLiveZoom(
        Math.min(MAX_ZOOM, Math.max(1, active.startZoom * (dist / active.startDist))),
      )
    }
    // Only finish once EVERY finger is up. Lifting just one of two used to end
    // the gesture and commit, while the remaining finger carried straight on
    // into a pan — so a pinch that ended one finger at a time committed a zoom
    // and a pan that disagreed about which photo size they were measured on.
    const onEnd = (evt: TouchEvent) => {
      if (evt.touches.length > 0) return
      endPinch(true)
    }
    const onCancel = () => endPinch(true)

    container.addEventListener('touchmove', onMove, { passive: false })
    container.addEventListener('touchend', onEnd)
    container.addEventListener('touchcancel', onCancel)
    pinchCleanup.current = () => {
      container.removeEventListener('touchmove', onMove)
      container.removeEventListener('touchend', onEnd)
      container.removeEventListener('touchcancel', onCancel)
    }
  }

  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length >= 2) {
      beginPinch(e)
      return
    }
    handleHoldStart(e)
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
      onTouchMove={handleHoldCheckMove}
      onTouchEnd={clearHold}
      onMouseDown={handleHoldStart}
      onTouchStart={handleTouchStart}
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
        // Off for the duration of a pinch so Konva can't restart the pan that
        // beginPinch just stopped — dropping the mousedown/touchstart listener
        // it installs is the only thing that keeps a second finger landing
        // mid-gesture from re-arming it.
        draggable={interactive && !pinching}
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
