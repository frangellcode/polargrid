import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Shape, Text } from 'react-konva'
import type Konva from 'konva'
import type { CellShape, LoadedPhoto, PhotoFit, PhotoTransform } from '../../types'
import { clampTransform, drawOrientedImage, getImageDrawRect, MAX_ZOOM, orientedSize, photoOrientation } from '../../lib/cropMath'
import { shapeRadiusRatio, traceRoundedRectPath } from '../../lib/shapeClip'
import { easeInOutCubic, useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { GrainOverlay } from './GrainOverlay'
import { useSharpenedPreview } from '../../hooks/useSharpenedPreview'
import { isNativeApp } from '../../lib/native'

/** The one cell currently being pinched (its pinch ref), across every
 *  PhotoCell on screen — see beginPinch. */
let activePinchCell: { current: unknown } | null = null
/** Same, for a trackpad pinch. */
let activeTrackpadCell: { current: unknown } | null = null

const TURN_MS = 420
const FLIP_MS = 380

/** Where the photo sits mid turn/flip, relative to the cell's centre: drawn
 *  at its new orientation, then rotated by `deg`, scaled by `k` (times the
 *  mirror `sx`/`sy`), and moved by (tx, ty). All at rest = the identity. */
interface OrientationPose { deg: number; k: number; sx: number; sy: number; tx: number; ty: number }
const REST_POSE: OrientationPose = { deg: 0, k: 1, sx: 1, sy: 1, tx: 0, ty: 0 }

/** WebKit's non-standard GestureEvent (trackpad and touch pinches). */
type GestureLikeEvent = Event & { scale: number; rotation: number; clientX: number; clientY: number }

interface PhotoCellProps {
  x: number
  y: number
  width: number
  height: number
  photo: LoadedPhoto | null
  transform: PhotoTransform
  onTransformChange: (t: PhotoTransform) => void
  onEmptyClick?: () => void
  /** Tapped while it HAS a photo — Collage's grid uses this to select the cell
   *  (which is what puts Replace/Remove on screen). Konva only fires this when
   *  the press wasn't a drag, so panning the photo never selects by accident. */
  onPhotoClick?: () => void
  /** Draws the selection outline. Purely visual; the cell stays interactive. */
  selected?: boolean
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
  /** 0..1 unsharp-mask amount on this photo's preview, 0/undefined = off. */
  sharpness?: number
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
  /** Animate a quarter turn or flip of the photo inside the cell (default).
   *  Off when the caller turns the whole canvas itself instead. */
  animateOrientation?: boolean
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
  onPhotoClick,
  selected = false,
  fit = 'cover',
  animateLayout = false,
  shape = 'rect',
  grain = 0,
  sharpness = 0,
  opacity = 1,
  interactive = true,
  onLongPressStart,
  animateOrientation = true,
}: PhotoCellProps) {
  // Sharpened as it comes, never turned: an unsharp mask doesn't care which
  // way up the photo is, so a turn or flip reuses the same result and costs
  // nothing. The turn itself happens at draw time (see the KonvaImage's
  // sceneFunc) rather than in a pre-turned copy — building that copy meant a
  // new full-size canvas on every tap, plus re-sharpening it, which on a
  // phone holding a whole collage froze the screen for about a second before
  // the turn could even start.
  const previewImage = useSharpenedPreview(photo?.previewBitmap ?? null, sharpness)
  // Non-null for the whole life of a two-finger gesture. Zoom is derived from
  // the CURRENT finger spread against the spread at pick-up (an absolute
  // ratio), not accumulated frame by frame: the incremental version had to
  // clamp its running total at every step, so pinching past MAX_ZOOM threw the
  // overshoot away and un-pinching then did nothing until you'd given back the
  // slack you never saw applied — the gesture felt stuck at the ends.
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null)
  // The trackpad's counterpart (see gestureHandlers below).
  const trackpadPinch = useRef<{ startZoom: number } | null>(null)
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
  // The selection outline fades rather than blinking on and off. 180ms: quick
  // enough to feel like a direct response to the tap, slow enough not to read
  // as a flash.
  const selectionAlpha = useAnimatedNumber(selected ? 1 : 0, 180)

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
      if (activePinchCell === pinch) activePinchCell = null
      if (activeTrackpadCell === trackpadPinch) activeTrackpadCell = null
      clearTimeout(wheelIdleTimer.current)
      clearTimeout(holdTimer.current)
    }
  }, [])

  // Trackpad pinch (iPad with a Magic Keyboard/trackpad, Safari on a Mac).
  // WebKit reports it as its own gesturestart/change/end events carrying a
  // `scale` — not as touches, and not as wheel events — so neither the touch
  // pinch nor the wheel zoom above ever saw it. Listened for on the stage's
  // container, and only taken when the pointer is over this cell. The
  // handlers live in a ref so the listeners, bound once, always run the
  // current render's code.
  const groupRef = useRef<Konva.Group>(null)
  // Whether a point in stage pixels (getPointerPosition's space) is on THIS
  // cell. Measured off the cell's own rect, never group.getClientRect(): that
  // is the bounds of what's inside, and a cover-fit photo always overhangs
  // its cell (more so once zoomed) — Konva ignores the clipFunc there — so
  // near a shared edge two neighbours both claimed the same pinch and both
  // zoomed.
  const cellSizeRef = useRef({ width: 0, height: 0 })
  const containsStagePoint = (pos: { x: number; y: number }) => {
    const group = groupRef.current
    if (!group) return false
    const t = group.getAbsoluteTransform()
    const a = t.point({ x: 0, y: 0 })
    const b = t.point({ x: cellSizeRef.current.width, y: cellSizeRef.current.height })
    return pos.x >= Math.min(a.x, b.x) && pos.x <= Math.max(a.x, b.x) && pos.y >= Math.min(a.y, b.y) && pos.y <= Math.max(a.y, b.y)
  }
  const gestureHandlers = useRef<{
    start: (e: GestureLikeEvent) => void
    change: (e: GestureLikeEvent) => void
    end: (e: GestureLikeEvent) => void
  } | null>(null)
  const hasPhoto = photo != null
  useEffect(() => {
    if (!interactive || !hasPhoto) return
    const container = groupRef.current?.getStage()?.container()
    if (!container) return
    const handlers = () => gestureHandlers.current

    if (isNativeApp) {
      // The app forwards trackpad pinches itself (MainViewController.swift);
      // finger pinches never come this way, so they can't reach another cell.
      const onTrackpad = (e: Event) => {
        const { phase, scale, x, y } = (e as CustomEvent<{ phase: string; scale: number; x: number; y: number }>).detail
        const event = { scale, rotation: 0, clientX: x, clientY: y, preventDefault() {} } as unknown as GestureLikeEvent
        if (phase === 'start') handlers()?.start(event)
        else if (phase === 'change') handlers()?.change(event)
        else handlers()?.end(event)
      }
      window.addEventListener('trackpadpinch', onTrackpad)
      return () => window.removeEventListener('trackpadpinch', onTrackpad)
    }

    // Web (Safari on a Mac): WebKit's gesture events. A finger pinch on a
    // touchscreen fires them too — with the pointer wherever a finger landed,
    // which could be over a neighbouring cell — so they're ignored while any
    // finger is down; touch pinches are the touch handler's alone.
    let fingers = 0
    const onTouches = (e: TouchEvent) => {
      fingers = e.touches.length
    }
    const guard = (fn: 'start' | 'change' | 'end') => (e: Event) => {
      if (fingers > 0) return
      handlers()?.[fn](e as GestureLikeEvent)
    }
    const start = guard('start')
    const change = guard('change')
    const end = guard('end')
    container.addEventListener('touchstart', onTouches, { capture: true, passive: true })
    container.addEventListener('touchend', onTouches, { capture: true, passive: true })
    container.addEventListener('touchcancel', onTouches, { capture: true, passive: true })
    container.addEventListener('gesturestart', start)
    container.addEventListener('gesturechange', change)
    container.addEventListener('gestureend', end)
    return () => {
      container.removeEventListener('touchstart', onTouches, { capture: true })
      container.removeEventListener('touchend', onTouches, { capture: true })
      container.removeEventListener('touchcancel', onTouches, { capture: true })
      container.removeEventListener('gesturestart', start)
      container.removeEventListener('gesturechange', change)
      container.removeEventListener('gestureend', end)
    }
  }, [interactive, hasPhoto])

  // ---- Turn / flip animation ------------------------------------------------
  // The oriented preview swaps in the same render as the new transform, so on
  // its own a turn or flip just happened. Instead, the image (inside `poseRef`)
  // starts posed so that its NEW orientation looks exactly like the old one —
  // turned back a quarter and scaled to the old size, or mirrored back — and
  // eases to rest. Driven straight on the Konva node, like the live zoom, so
  // it costs no React renders.
  const poseRef = useRef<Konva.Group>(null)
  const pose = useRef<OrientationPose>(REST_POSE)
  const poseFrame = useRef<number | undefined>(undefined)
  const orient = photoOrientation(transform)
  const orientKey = `${orient.turns}|${transform.flipH ? 1 : 0}|${transform.flipV ? 1 : 0}`
  const shownNow = photo ? orientedSize(photo.width, photo.height, transform) : null
  const drawNow = shownNow ? getImageDrawRect(width, height, shownNow.width, shownNow.height, transform, fit) : null
  const coverFit = fit === 'cover' || fit === 0
  const lastDrawn = useRef<{ key: string; photoId: string | undefined; draw: NonNullable<typeof drawNow> } | null>(null)

  const applyPose = (p: OrientationPose, cover: { w: number; h: number; draw: NonNullable<typeof drawNow> } | null) => {
    const node = poseRef.current
    if (!node) return
    const rad = (p.deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    let k = p.k
    // Mid-turn a cover-fit photo would leave the cell's corners bare. Grow it
    // just enough that every corner stays on the photo, like a crop tool's
    // straighten does.
    if (cover) {
      const { w, h, draw } = cover
      const x0 = draw.x - w / 2
      const x1 = x0 + draw.width
      const y0 = draw.y - h / 2
      const y1 = y0 + draw.height
      for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) {
        const qx = cx - p.tx
        const qy = cy - p.ty
        const u = cos * qx + sin * qy
        const v = -sin * qx + cos * qy
        if (u > 0 && x1 > 0) k = Math.max(k, u / x1)
        if (u < 0 && x0 < 0) k = Math.max(k, u / x0)
        if (v > 0 && y1 > 0) k = Math.max(k, v / y1)
        if (v < 0 && y0 < 0) k = Math.max(k, v / y0)
      }
    }
    pose.current = { ...p, k }
    // About the cell centre C: visual = C + t + M(p - C), M = rotate·scale.
    const cx = width / 2
    const cy = height / 2
    const ax = k * p.sx
    const ay = k * p.sy
    const mcx = cos * ax * cx - sin * ay * cy
    const mcy = sin * ax * cx + cos * ay * cy
    node.setAttrs({ x: cx + p.tx - mcx, y: cy + p.ty - mcy, rotation: p.deg, scaleX: ax, scaleY: ay })
    node.getLayer()?.batchDraw()
  }

  useLayoutEffect(() => {
    const prev = lastDrawn.current
    lastDrawn.current = drawNow ? { key: orientKey, photoId: photo?.id, draw: drawNow } : null
    if (!prev || !drawNow || prev.key === orientKey || prev.photoId !== photo?.id) return
    if (!animateOrientation) return
    const [prevTurns, prevFlipH, prevFlipV] = prev.key.split('|').map(Number)
    const turnDelta = (((orient.turns - prevTurns) % 4) + 4) % 4
    const dir = turnDelta === 1 ? 1 : turnDelta === 3 ? -1 : 0
    const flipX = (transform.flipH ? 1 : 0) !== prevFlipH
    const flipY = (transform.flipV ? 1 : 0) !== prevFlipV
    if (turnDelta === 2 || (dir === 0 && !flipX && !flipY)) return

    // The pose that makes the new image look like the old one: rotate back
    // a quarter and scale to the old width, or mirror back; then move its
    // centre onto the old centre.
    const deg0 = -90 * dir
    const k0 = dir !== 0 ? prev.draw.width / drawNow.height : 1
    const sx0 = flipX ? -1 : 1
    const sy0 = flipY ? -1 : 1
    const rad0 = (deg0 * Math.PI) / 180
    const nx = drawNow.x + drawNow.width / 2 - width / 2
    const ny = drawNow.y + drawNow.height / 2 - height / 2
    const ox = prev.draw.x + prev.draw.width / 2 - width / 2
    const oy = prev.draw.y + prev.draw.height / 2 - height / 2
    let start: OrientationPose = {
      deg: deg0,
      k: k0,
      sx: sx0,
      sy: sy0,
      tx: ox - k0 * (Math.cos(rad0) * sx0 * nx - Math.sin(rad0) * sy0 * ny),
      ty: oy - k0 * (Math.sin(rad0) * sx0 * nx + Math.cos(rad0) * sy0 * ny),
    }
    // A tap while a turn is still running carries on from where the photo is
    // rather than jumping: compose with the pose on screen. Only a pure turn
    // composes cleanly (a half-done mirror isn't a rotation), so a flip still
    // in flight just restarts.
    const cur = pose.current
    if (poseFrame.current !== undefined && cur.sx === 1 && cur.sy === 1) {
      const r = (cur.deg * Math.PI) / 180
      start = {
        deg: cur.deg + start.deg,
        k: cur.k * start.k,
        sx: start.sx,
        sy: start.sy,
        tx: cur.tx + cur.k * (Math.cos(r) * start.tx - Math.sin(r) * start.ty),
        ty: cur.ty + cur.k * (Math.sin(r) * start.tx + Math.cos(r) * start.ty),
      }
    }
    if (poseFrame.current !== undefined) cancelAnimationFrame(poseFrame.current)

    const turning = start.deg !== 0
    const duration = turning ? TURN_MS : FLIP_MS
    const cover = turning && coverFit ? { w: width, h: height, draw: drawNow } : null
    // Timed from the first frame actually drawn, not from now: if the phone
    // is slow to get that frame out, the turn starts late rather than
    // skipping its opening.
    let began: number | undefined
    const step = (now: number) => {
      began ??= now
      const t = Math.min(1, (now - began) / duration)
      const e = easeInOutCubic(t)
      const lerp = (a: number, b: number) => a + (b - a) * e
      applyPose(
        { deg: lerp(start.deg, 0), k: lerp(start.k, 1), sx: lerp(start.sx, 1), sy: lerp(start.sy, 1), tx: lerp(start.tx, 0), ty: lerp(start.ty, 0) },
        cover,
      )
      if (t < 1) {
        poseFrame.current = requestAnimationFrame(step)
      } else {
        poseFrame.current = undefined
        applyPose(REST_POSE, null)
      }
    }
    applyPose(start, cover)
    poseFrame.current = requestAnimationFrame(step)
  })

  useEffect(() => () => {
    if (poseFrame.current !== undefined) cancelAnimationFrame(poseFrame.current)
  }, [])

  cellSizeRef.current = { width, height }

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

  const shown = shownNow ?? orientedSize(photo.width, photo.height, transform)
  const draw = drawNow ?? getImageDrawRect(width, height, shown.width, shown.height, transform, fit)

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
    onTransformChange(clampTransform({ ...transformRef.current, zoom: liveZoomRef.current, offsetX, offsetY }))
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
    const liveDraw = getImageDrawRect(width, height, shown.width, shown.height, { ...transformRef.current, zoom }, fit)
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

  gestureHandlers.current = {
    start: (e) => {
      // A finger pinch on a touchscreen fires these too, alongside the
      // touches beginPinch already follows — leave that one to it.
      if (pinch.current) return
      const group = groupRef.current
      const stage = group?.getStage()
      if (!group || !stage) return
      if (activeTrackpadCell && activeTrackpadCell !== trackpadPinch) return
      stage.setPointersPositions(e as unknown as MouseEvent)
      const pos = stage.getPointerPosition()
      if (!pos || !containsStagePoint(pos)) return
      activeTrackpadCell = trackpadPinch
      e.preventDefault()
      imageRef.current?.stopDrag()
      clearHold()
      trackpadPinch.current = { startZoom: transformRef.current.zoom }
      liveZoomRef.current = transformRef.current.zoom
      setInteracting(true)
    },
    change: (e) => {
      const active = trackpadPinch.current
      if (!active) return
      e.preventDefault()
      applyLiveZoom(Math.min(MAX_ZOOM, Math.max(1, active.startZoom * e.scale)))
    },
    end: (e) => {
      if (!trackpadPinch.current) return
      e.preventDefault()
      trackpadPinch.current = null
      if (activeTrackpadCell === trackpadPinch) activeTrackpadCell = null
      setInteracting(false)
      onTransformChange(clampTransform({ ...transformRef.current, zoom: liveZoomRef.current }))
    },
  }

  const touchSpread = (touches: TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    )

  const endPinch = (commit: boolean) => {
    if (!pinch.current) return
    pinch.current = null
    if (activePinchCell === pinch) activePinchCell = null
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

    // One pinch, one photo. With both fingers landing in the same instant on
    // two different cells, Konva hands the touchstart to each of them — and
    // both used to zoom. Only the cell holding the point between the two
    // fingers takes the gesture, and only if no other cell already has.
    if (activePinchCell && activePinchCell !== pinch) return
    const box = container.getBoundingClientRect()
    // Client px -> stage px; they differ while CanvasStage is CSS-scaling
    // its render during a resize.
    const k = box.width > 0 ? container.clientWidth / box.width : 1
    const [a, b] = [e.evt.touches[0], e.evt.touches[1]]
    const mid = { x: ((a.clientX + b.clientX) / 2 - box.left) * k, y: ((a.clientY + b.clientY) / 2 - box.top) * k }
    if (!containsStagePoint(mid)) return
    activePinchCell = pinch

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
      ref={groupRef}
      x={x}
      y={y}
      opacity={opacity}
      clipFunc={(ctx) => traceRoundedRectPath(ctx, cornerRadius, width, height)}
      onWheel={handleWheel}
      onClick={onPhotoClick}
      onTap={onPhotoClick}
      onTouchMove={handleHoldCheckMove}
      onTouchEnd={clearHold}
      onMouseDown={handleHoldStart}
      onTouchStart={handleTouchStart}
      onMouseMove={handleHoldCheckMove}
      onMouseUp={clearHold}
    >
      <Group ref={poseRef}>
      <KonvaImage
        ref={imageRef}
        image={(previewImage ?? photo.previewBitmap) as unknown as CanvasImageSource}
        x={draw.x}
        y={draw.y}
        width={draw.width}
        height={draw.height}
        sceneFunc={(ctx, node) => {
          const image = node.getAttr('image') as CanvasImageSource | undefined
          if (!image) return
          drawOrientedImage(ctx._context, image, { x: 0, y: 0, width: node.width(), height: node.height() }, transform)
        }}
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
      </Group>
      {/* Inside the clip, so it follows the cell's own rounded corners, and
          drawn last so no photo covers it. Two strokes: a dark one under a
          dashed white one, which stays legible over a photo of any colour. */}
      {selectionAlpha > 0.01 && (
        <>
          <Shape
            listening={false}
            sceneFunc={(ctx, node) => {
              traceRoundedRectPath(ctx, cornerRadius, width, height)
              ctx.strokeShape(node)
            }}
            stroke="#0f172a"
            strokeWidth={6}
            opacity={0.45 * selectionAlpha}
          />
          <Shape
            listening={false}
            sceneFunc={(ctx, node) => {
              traceRoundedRectPath(ctx, cornerRadius, width, height)
              ctx.strokeShape(node)
            }}
            stroke="#ffffff"
            strokeWidth={3}
            dash={[14, 10]}
            opacity={selectionAlpha}
          />
        </>
      )}
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
