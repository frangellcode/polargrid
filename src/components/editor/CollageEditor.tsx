import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Rect } from 'react-konva'
import type Konva from 'konva'
import type { CellAssignment, CellShape, ExportQuality, FreeItem, GridTemplate, LoadedPhoto, PhotoTransform } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { easeInOutCubic, useAnimatedColor, useAnimatedNumber, useIsReflowing } from '../../hooks/useAnimatedNumber'
import { COLLAGE_ASPECT_RATIOS } from '../../lib/aspectRatios'
import { computeOutputPixelSize, getImageDrawRect } from '../../lib/cropMath'
import { MAX_PHOTO_MB, screenPhotoFiles } from '../../lib/photoInput'
import { holdImportCard } from '../../lib/uiTiming'
import { MAX_COLLAGE_PHOTOS, MIN_COLLAGE_PHOTOS, getTemplateById, transposeTemplate } from '../../lib/collageTemplates'
import { renderCollageFree, renderCollageGrid, resolveRatio, saveExportedFiles, yieldToBrowser } from '../../lib/exportImage'
import { getBorderColor } from '../../lib/borderColors'
import { Toolbar, type ToolbarHandle } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { GridTemplatePicker } from './GridTemplatePicker'
import { CanvasStage, type CanvasStageHandle } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { ExportFlowModal, type ExportFlowPhase } from './ExportFlowModal'
import { ImportProgressModal } from './ImportProgressModal'
import { WorkspaceBackgroundPicker } from './WorkspaceBackgroundPicker'
import { BorderColorPicker } from './BorderColorPicker'
import { IconCrop, IconDrop, IconFrame, IconGrain, IconGrid } from './icons'
import { GrainOverlay } from './GrainOverlay'

const PREVIEW_LONG_EDGE = 900
// Reuses the app's own view-exit/view-enter pair (index.css) — the same
// crossfade+scale already used for full-screen navigation — instead of a
// bespoke opacity-only fade, so the Dropzone<->canvas swap ("create
// another", and the very first photo turning the empty Dropzone into a
// collage) reads as one consistent, on-brand motion. Must match .view-exit's
// animation-duration exactly, since the timeout below is what actually
// triggers the content swap.
const EXIT_MS = 200

interface FreeItemsLayerProps {
  outputWidth: number
  outputHeight: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** 0..1 film-grain amount applied to every item at once, 0 = no overlay. */
  grain: number
}

/** How small and how large a free item may be made, as a fraction of the
 *  canvas. The upper bound is deliberately above 1: using one photo as a
 *  backdrop the others sit on top of is a normal thing to want, and the stage
 *  clips whatever spills past the canvas edge anyway. */
const MIN_ITEM_FRACTION = 0.08
const MAX_ITEM_FRACTION = 3

/** Handles are authored in virtual canvas units (long edge 900), which the
 *  stage scales down to roughly 0.4x on a phone — so this draws as a ~11px
 *  dot. HANDLE_HIT_PADDING is what actually gets tapped: it widens the hit
 *  region to comfortably past the 44px of real screen a fingertip needs,
 *  without making the dot itself big enough to cover the photo. */
const HANDLE_RADIUS = 26
const HANDLE_HIT_PADDING = 80

interface HandleDrag {
  id: string
  kind: 'resize' | 'rotate'
  /** The item's center, which both gestures pivot around and neither moves. */
  cx: number
  cy: number
  startW: number
  startH: number
  startRotation: number
  /** Pointer distance from the center at grab time (resize), so the photo
   *  scales by the RATIO the finger travels rather than jumping to put the
   *  corner exactly under a fingertip that grabbed slightly off-center. */
  startDist: number
  /** Pointer angle at grab time (rotate), same reasoning. */
  startAngle: number
}

/**
 * The free-layout canvas: photos that move, resize and rotate independently.
 *
 * This used to be a Konva Transformer — the eight little square anchors and a
 * rotate stalk you'd find in a desktop editor. On a phone that is close to
 * unusable: each anchor is a handful of real pixels once the stage is scaled
 * down to fit a phone screen, none of them are where a finger lands, and the
 * two gestures a touch device actually has (drag, pinch) did nothing but move
 * the photo. Hence: pinch to resize and rotate, drag to move, and exactly two
 * finger-sized handles for anyone doing it one-handed or with a mouse.
 *
 * Geometry note: the store keeps each item as a top-left origin plus a size,
 * both as canvas fractions, but everything here is drawn around the item's
 * CENTER (Konva `offset`). That is the only origin under which a pinch grows
 * the photo where the fingers are holding it and a rotation turns it about
 * its middle. It also settles a disagreement with the exporter, which has
 * always rotated each item about its own center (see drawPhotoInRect) while
 * the preview rotated about the top-left corner — the same collage came out
 * of the export differently from how it looked on screen.
 */
function FreeItemsLayer({ outputWidth, outputHeight, selectedId, onSelect, grain }: FreeItemsLayerProps) {
  const { collage, photos, updateFreeItem } = useEditorStore()
  const nodeRefs = useRef<Record<string, Konva.Group>>({})
  // Non-null for the whole life of a two-finger gesture on one item. Scale is
  // derived from the CURRENT finger spread against the spread at pick-up (an
  // absolute ratio) rather than accumulated per frame, for the same reason
  // PhotoCell's own pinch is: a running total has to be clamped at every
  // step, so pinching past the limit throws the overshoot away and the
  // gesture feels stuck coming back.
  const pinch = useRef<
    | {
        id: string
        startDist: number
        startAngle: number
        startRotation: number
        startW: number
        startH: number
        cx: number
        cy: number
        scale: number
        rotation: number
      }
    | null
  >(null)
  const pinchCleanup = useRef<(() => void) | null>(null)
  // While set, that item's Group stops being `draggable`, so the finger that
  // started the pinch can't also be panning it underneath — Konva rewrites
  // the node's x/y on every drag move and would fight the live scale for the
  // same frames.
  const [pinchingId, setPinchingId] = useState<string | null>(null)
  // Set for the length of a plain move. A drag never touches the store until
  // it ends (Konva moves the node itself), so the outline and handles below —
  // which are positioned from the STORE — would otherwise hang behind at the
  // photo's old spot for the whole gesture.
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // A gesture still attached when this layer goes away (mode switched, photo
  // removed mid-pinch) would keep firing against a detached node.
  useEffect(() => {
    return () => {
      pinchCleanup.current?.()
      pinchCleanup.current = null
    }
  }, [])

  const geom = (item: FreeItem) => {
    const w = item.width * outputWidth
    const h = item.height * outputHeight
    return { w, h, cx: item.x * outputWidth + w / 2, cy: item.y * outputHeight + h / 2 }
  }

  /** Keeps a scale factor inside the size bounds on BOTH axes. */
  const clampScale = (item: FreeItem, scale: number) => {
    const minScale = Math.max(MIN_ITEM_FRACTION / item.width, MIN_ITEM_FRACTION / item.height)
    const maxScale = Math.min(MAX_ITEM_FRACTION / item.width, MAX_ITEM_FRACTION / item.height)
    return Math.min(maxScale, Math.max(minScale, scale))
  }

  /** Resizes about the center: the item keeps its middle exactly where it is,
   *  so growing a photo doesn't also walk it across the canvas. */
  const commitSize = (id: string, cx: number, cy: number, w: number, h: number, rotation: number) => {
    updateFreeItem(id, {
      x: (cx - w / 2) / outputWidth,
      y: (cy - h / 2) / outputHeight,
      width: w / outputWidth,
      height: h / outputHeight,
      rotation,
    })
  }

  const touchGeometry = (touches: TouchList) => ({
    dist: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY),
    angle: Math.atan2(touches[1].clientY - touches[0].clientY, touches[1].clientX - touches[0].clientX),
  })

  const endPinch = (commit: boolean) => {
    const active = pinch.current
    pinch.current = null
    pinchCleanup.current?.()
    pinchCleanup.current = null
    setPinchingId(null)
    if (!active) return
    const node = nodeRefs.current[active.id]
    // Scale was applied straight to the node (never through the store, so the
    // gesture doesn't re-render the whole editor on every frame) and react-
    // konva doesn't manage what it never rendered — so it has to be put back
    // by hand before the committed width/height take over.
    node?.scaleX(1)
    node?.scaleY(1)
    if (!commit) return
    commitSize(active.id, active.cx, active.cy, active.startW * active.scale, active.startH * active.scale, active.rotation)
  }

  /**
   * Two-finger resize + rotate, wired to the stage's DOM element rather than
   * to Konva's own onTouchMove, because Konva will not deliver touchmove to
   * ANY shape while a drag is running (Stage._pointermove bails on
   * Konva.isDragging()) — and the Group below is draggable, so the first
   * finger is already dragging before the second one lands. This is the same
   * workaround, for the same reason, as PhotoCell.beginPinch.
   */
  const beginPinch = (item: FreeItem, e: Konva.KonvaEventObject<TouchEvent>) => {
    const container = e.target.getStage()?.content
    if (!container || pinch.current) return
    const { dist, angle } = touchGeometry(e.evt.touches)
    if (!(dist > 0)) return
    // End the one-finger pan already underway before taking the node off
    // `draggable`, so it can't keep rewriting x/y for the rest of the gesture.
    nodeRefs.current[item.id]?.stopDrag()
    const { w, h, cx, cy } = geom(item)
    pinch.current = {
      id: item.id,
      startDist: dist,
      startAngle: angle,
      startRotation: item.rotation,
      startW: w,
      startH: h,
      cx,
      cy,
      scale: 1,
      rotation: item.rotation,
    }
    setPinchingId(item.id)

    const onMove = (evt: TouchEvent) => {
      const active = pinch.current
      if (!active || evt.touches.length < 2) return
      // The page must not pan or zoom underneath us. CanvasStage sets
      // touch-action: none too; this covers browsers that have already begun
      // the gesture by the time that applies.
      if (evt.cancelable) evt.preventDefault()
      const next = touchGeometry(evt.touches)
      if (!(next.dist > 0)) return
      active.scale = clampScale(item, next.dist / active.startDist)
      // Rotation follows the angle BETWEEN the fingers, so the photo turns
      // exactly as much as the hand does.
      active.rotation = active.startRotation + ((next.angle - active.startAngle) * 180) / Math.PI
      const node = nodeRefs.current[active.id]
      if (!node) return
      // Uniform on both axes, so the photo can never be squashed by a pinch —
      // and since the Group is drawn around its center, scaling it grows the
      // photo where the fingers are rather than dragging its top-left corner
      // around.
      node.scaleX(active.scale)
      node.scaleY(active.scale)
      node.rotation(active.rotation)
      node.getLayer()?.batchDraw()
    }
    // Only finish once EVERY finger is up: lifting one of two used to end the
    // gesture while the remaining finger carried straight on into a pan.
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

  /**
   * The one-finger (or mouse) path for the same two operations: drag the
   * corner handle to resize, the opposite one to rotate.
   *
   * Tracked through the stage's own event bus rather than Konva's `draggable`
   * on the handle itself: a draggable handle moves where the finger goes,
   * while these two have to stay pinned to a corner that is being recomputed
   * from the item's live size on every frame — the two would fight over the
   * node's position for the whole gesture.
   */
  const beginHandleDrag = (
    kind: HandleDrag['kind'],
    item: FreeItem,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!stage || !pos) return
    e.cancelBubble = true
    const scale = stage.scaleX() || 1
    const { w, h, cx, cy } = geom(item)
    const px = pos.x / scale
    const py = pos.y / scale
    const drag: HandleDrag = {
      id: item.id,
      kind,
      cx,
      cy,
      startW: w,
      startH: h,
      startRotation: item.rotation,
      startDist: Math.hypot(px - cx, py - cy),
      startAngle: Math.atan2(py - cy, px - cx),
    }
    if (!(drag.startDist > 0)) return

    const handleMove = () => {
      const p = stage.getPointerPosition()
      if (!p) return
      const s = stage.scaleX() || 1
      const lx = p.x / s - drag.cx
      const ly = p.y / s - drag.cy
      if (drag.kind === 'resize') {
        const factor = clampScale(item, Math.hypot(lx, ly) / drag.startDist)
        commitSize(drag.id, drag.cx, drag.cy, drag.startW * factor, drag.startH * factor, drag.startRotation)
      } else {
        const delta = ((Math.atan2(ly, lx) - drag.startAngle) * 180) / Math.PI
        updateFreeItem(drag.id, { rotation: drag.startRotation + delta })
      }
    }
    const handleRelease = () => {
      stage.off('mousemove.freehandle touchmove.freehandle')
      stage.off('mouseup.freehandle touchend.freehandle touchcancel.freehandle')
    }
    stage.on('mousemove.freehandle touchmove.freehandle', handleMove)
    stage.on('mouseup.freehandle touchend.freehandle touchcancel.freehandle', handleRelease)
  }

  const selected = collage.freeItems.find((i) => i.id === selectedId) ?? null

  return (
    <>
      {/* Tapping bare canvas clears the selection, so the outline and handles
          aren't left sitting over a collage you've finished arranging. Needs
          an explicit hitFunc: an unfilled Rect draws nothing into Konva's hit
          graph and would never receive the tap. */}
      <Rect
        x={0}
        y={0}
        width={outputWidth}
        height={outputHeight}
        hitFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(0, 0, outputWidth, outputHeight)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
        onMouseDown={() => onSelect(null)}
        onTouchStart={() => onSelect(null)}
      />

      {collage.freeItems.map((item) => {
        const photo = photos[item.photoId]
        if (!photo) return null
        const { w, h, cx, cy } = geom(item)
        const draw = getImageDrawRect(w, h, photo.width, photo.height, item.transform)
        return (
          <Group
            key={item.id}
            ref={(node) => {
              if (node) nodeRefs.current[item.id] = node
            }}
            x={cx}
            y={cy}
            offsetX={w / 2}
            offsetY={h / 2}
            rotation={item.rotation}
            draggable={pinchingId !== item.id}
            clipX={0}
            clipY={0}
            clipWidth={w}
            clipHeight={h}
            onMouseDown={() => onSelect(item.id)}
            onTouchStart={(e) => {
              onSelect(item.id)
              if (e.evt.touches.length >= 2) beginPinch(item, e)
            }}
            onDragStart={() => setDraggingId(item.id)}
            onDragEnd={(e) => {
              setDraggingId(null)
              // Back from center coordinates to the top-left origin the store
              // keeps (the node carries offsetX/offsetY, so its position IS
              // the center).
              updateFreeItem(item.id, {
                x: (e.target.x() - w / 2) / outputWidth,
                y: (e.target.y() - h / 2) / outputHeight,
              })
            }}
          >
            <Rect width={w} height={h} fill="#f8fafc" />
            <KonvaImage
              image={photo.previewBitmap as unknown as CanvasImageSource}
              x={draw.x}
              y={draw.y}
              width={draw.width}
              height={draw.height}
            />
            <GrainOverlay width={w} height={h} intensity={grain} referenceWidth={photo.width} referenceHeight={photo.height} />
          </Group>
        )
      })}

      {/* Selection outline and handles, drawn last so they sit above every
          photo. Hidden for the duration of a pinch: the item they'd frame is
          being scaled straight on its node, so they would be a frame behind
          it the whole way — and both hands are already on the photo. */}
      {selected &&
        pinchingId !== selected.id &&
        draggingId !== selected.id &&
        (() => {
          const { w, h, cx, cy } = geom(selected)
          const rad = (selected.rotation * Math.PI) / 180
          // A corner of the (rotated) item, in canvas coordinates.
          const corner = (dx: number, dy: number) => ({
            x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
            y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
          })
          // Kept inside the canvas: a photo pushed against an edge (or simply
          // made bigger than the canvas, which is allowed) puts its corners
          // outside the stage, and anything drawn there is clipped away —
          // leaving a selected photo with no reachable handles at all. Both
          // gestures measure the pointer against the item's CENTER, so a
          // handle that has been pulled back from its corner still behaves
          // exactly the same when grabbed.
          const onCanvas = (p: { x: number; y: number }) => ({
            x: Math.min(outputWidth - HANDLE_RADIUS, Math.max(HANDLE_RADIUS, p.x)),
            y: Math.min(outputHeight - HANDLE_RADIUS, Math.max(HANDLE_RADIUS, p.y)),
          })
          const resizeAt = onCanvas(corner(w / 2, h / 2))
          const rotateAt = onCanvas(corner(-w / 2, -h / 2))
          return (
            <>
              <Rect
                x={cx}
                y={cy}
                offsetX={w / 2}
                offsetY={h / 2}
                width={w}
                height={h}
                rotation={selected.rotation}
                stroke="#ffffff"
                strokeWidth={3}
                dash={[14, 10]}
                shadowColor="#0f172a"
                shadowBlur={8}
                shadowOpacity={0.6}
                listening={false}
              />
              {/* Bottom-right: resize. Top-left: rotate — kept diagonally
                  opposite so a thumb on one is never near the other. */}
              <Circle
                x={resizeAt.x}
                y={resizeAt.y}
                radius={HANDLE_RADIUS}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth={3}
                hitStrokeWidth={HANDLE_HIT_PADDING}
                onMouseDown={(e) => beginHandleDrag('resize', selected, e)}
                onTouchStart={(e) => beginHandleDrag('resize', selected, e)}
              />
              <Circle
                x={rotateAt.x}
                y={rotateAt.y}
                radius={HANDLE_RADIUS}
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth={4}
                hitStrokeWidth={HANDLE_HIT_PADDING}
                onMouseDown={(e) => beginHandleDrag('rotate', selected, e)}
                onTouchStart={(e) => beginHandleDrag('rotate', selected, e)}
              />
            </>
          )
        })()}
    </>
  )
}

interface GridCellsLayerProps {
  template: GridTemplate
  assignments: CellAssignment[]
  photos: Record<string, LoadedPhoto>
  /** True only for the brief window right after a template/orientation/aspect-
   *  ratio switch — see the comment above its computation in CollageEditor
   *  for why cells only animate their layout during that window, not on
   *  every border/gutter-slider tick. */
  animateCells: boolean
  contentX: number
  contentY: number
  cellW: number
  cellH: number
  gutterPx: number
  shape: CellShape
  /** 0..1 film-grain amount applied to every cell at once, 0 = no overlay. */
  grain: number
  onCellTransformChange: (cellId: string, transform: PhotoTransform) => void
  onEmptyCellClick: (cellId: string) => void
}

/** How long the flying overlay pair takes to land in each other's spot once
 *  a long-press-drag is dropped on a valid target — matches the ~320-380ms
 *  feel of every other eased move in this file. */
const SWAP_FLIGHT_MS = 380

interface CellRect {
  x: number
  y: number
  w: number
  h: number
  colSpan: number
  rowSpan: number
}

interface CellDragState {
  sourceCellId: string
  /** Pointer position, in the SAME unscaled/virtual units as cell rects
   *  (Konva's own pointer position is in real stage pixels — see the same
   *  scale division `dragBounds` does in PhotoCell). */
  pointerX: number
  pointerY: number
  /** Pointer position minus the source cell's own x/y at pick-up time, so the
   *  floating copy keeps the same spot under the finger it was grabbed at
   *  instead of snapping to center it. */
  grabDX: number
  grabDY: number
  hoverCellId: string | null
}

interface SwapAnimState {
  aCellId: string
  bCellId: string
  // Each side carries its own from/to rect (position AND size) rather than
  // sharing one — swapping between cells of different spans means A and B
  // both change size as they fly, not just position.
  aFromX: number
  aFromY: number
  aFromW: number
  aFromH: number
  aToX: number
  aToY: number
  aToW: number
  aToH: number
  bFromX: number
  bFromY: number
  bFromW: number
  bFromH: number
  bToX: number
  bToY: number
  bToW: number
  bToH: number
  photoA: LoadedPhoto | null
  transformA: PhotoTransform
  photoB: LoadedPhoto | null
  transformB: PhotoTransform
}

const noopTransformChange = () => {}

/** Renders one grid cell per photo. Split out of CollageEditor mainly to keep
 *  that component's render body shorter — nothing here depends on it being a
 *  separate component.
 *
 *  Also owns the long-press-drag-to-reorder gesture: each PhotoCell only
 *  knows how to report "I've been held still long enough to pick up" (see
 *  LONG_PRESS_MS in PhotoCell.tsx) — everything after that (tracking the
 *  pointer wherever it goes next, figuring out which OTHER cell it's over,
 *  and animating the swap once released) needs the full set of cell rects,
 *  which only this layer has. Pointer tracking during the drag is done via
 *  Konva's own Stage-level event bus (`stage.on(...)`) rather than React
 *  props, since the finger can move over any cell (or the gutters between
 *  them) — a per-cell React handler would only ever see moves within its
 *  own hit area. */
function GridCellsLayer({
  template,
  assignments,
  photos,
  animateCells,
  contentX,
  contentY,
  cellW,
  cellH,
  gutterPx,
  shape,
  grain,
  onCellTransformChange,
  onEmptyCellClick,
}: GridCellsLayerProps) {
  const [dragState, setDragState] = useState<CellDragState | null>(null)
  const [swapAnim, setSwapAnim] = useState<SwapAnimState | null>(null)
  const [swapProgress, setSwapProgress] = useState(0)

  const cellRects = new Map<string, CellRect>()
  template.cells.forEach((cell, i) => {
    const assignment = assignments[i]
    if (!assignment) return
    cellRects.set(assignment.cellId, {
      x: contentX + cell.col * (cellW + gutterPx),
      y: contentY + cell.row * (cellH + gutterPx),
      w: cellW * cell.colSpan + gutterPx * (cell.colSpan - 1),
      h: cellH * cell.rowSpan + gutterPx * (cell.rowSpan - 1),
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
    })
  })

  // Any other cell is a valid drop target, regardless of span — swapping
  // never reflows the template (each cellId keeps its own fixed position
  // and size from the template), it only exchanges which photo+transform
  // lives in cellIdA vs cellIdB. A photo landing in a differently-sized
  // cell just gets re-cropped against that cell's own cover-fit at render
  // time, same as PhotoCell already does for any photo in any cell.
  const hitTestCell = (px: number, py: number, excludeCellId: string): string | null => {
    const source = cellRects.get(excludeCellId)
    if (!source) return null
    for (const [cellId, rect] of cellRects) {
      if (cellId === excludeCellId) continue
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return cellId
    }
    return null
  }

  const beginDrag = (cellId: string, evt: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = evt.target.getStage()
    const rect = cellRects.get(cellId)
    const pos = stage?.getPointerPosition()
    if (!stage || !rect || !pos) return
    const scale = stage.scaleX() || 1
    const localX = pos.x / scale
    const localY = pos.y / scale

    setDragState({
      sourceCellId: cellId,
      pointerX: localX,
      pointerY: localY,
      grabDX: localX - rect.x,
      grabDY: localY - rect.y,
      hoverCellId: null,
    })

    const handleMove = () => {
      const p = stage.getPointerPosition()
      if (!p) return
      const s = stage.scaleX() || 1
      const lx = p.x / s
      const ly = p.y / s
      const hover = hitTestCell(lx, ly, cellId)
      setDragState((current) => (current ? { ...current, pointerX: lx, pointerY: ly, hoverCellId: hover } : current))
    }

    const handleRelease = () => {
      stage.off('mousemove.celldrag touchmove.celldrag')
      stage.off('mouseup.celldrag touchend.celldrag touchcancel.celldrag')
      setDragState((current) => {
        if (current?.hoverCellId) {
          const aRect = cellRects.get(current.sourceCellId)
          const bRect = cellRects.get(current.hoverCellId)
          const aAssignment = assignments.find((a) => a.cellId === current.sourceCellId)
          const bAssignment = assignments.find((a) => a.cellId === current.hoverCellId)
          if (aRect && bRect && aAssignment && bAssignment) {
            setSwapAnim({
              aCellId: current.sourceCellId,
              bCellId: current.hoverCellId,
              aFromX: aRect.x,
              aFromY: aRect.y,
              aFromW: aRect.w,
              aFromH: aRect.h,
              aToX: bRect.x,
              aToY: bRect.y,
              aToW: bRect.w,
              aToH: bRect.h,
              bFromX: bRect.x,
              bFromY: bRect.y,
              bFromW: bRect.w,
              bFromH: bRect.h,
              bToX: aRect.x,
              bToY: aRect.y,
              bToW: aRect.w,
              bToH: aRect.h,
              photoA: aAssignment.photoId ? photos[aAssignment.photoId] : null,
              transformA: aAssignment.transform,
              photoB: bAssignment.photoId ? photos[bAssignment.photoId] : null,
              transformB: bAssignment.transform,
            })
          }
        }
        return null
      })
    }

    stage.on('mousemove.celldrag touchmove.celldrag', handleMove)
    stage.on('mouseup.celldrag touchend.celldrag touchcancel.celldrag', handleRelease)
  }

  // Drives the two flying overlays below from a single shared progress value
  // (rather than two independent tweens) so they're guaranteed to land in
  // perfect sync — depends on `swapAnim`'s own identity, which is only ever
  // set once per swap (progress lives in its own state instead of inside
  // `swapAnim`), so this doesn't re-fire on every animation tick.
  useEffect(() => {
    if (!swapAnim) return
    setSwapProgress(0)
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SWAP_FLIGHT_MS)
      setSwapProgress(t)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        useEditorStore.getState().swapCellAssignments(swapAnim.aCellId, swapAnim.bCellId)
        setSwapAnim(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [swapAnim])

  const draggedRect = dragState ? cellRects.get(dragState.sourceCellId) : null

  return (
    <Group>
      {template.cells.map((_cell, i) => {
        const assignment = assignments[i]
        const photo = assignment?.photoId ? photos[assignment.photoId] : null
        const rect = cellRects.get(assignment.cellId)
        if (!rect) return null
        // Dimmed nearly out of sight (not removed — that would reflow the
        // grid) while it's the drag source or one half of an in-flight swap;
        // a floating overlay carries the actual visible motion instead.
        const isGhosted =
          dragState?.sourceCellId === assignment.cellId ||
          swapAnim?.aCellId === assignment.cellId ||
          swapAnim?.bCellId === assignment.cellId
        const isHoverTarget = dragState?.hoverCellId === assignment.cellId
        return (
          <Group key={assignment.cellId}>
            <PhotoCell
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              animateLayout={animateCells}
              shape={shape}
              grain={grain}
              photo={photo}
              transform={assignment.transform}
              opacity={isGhosted ? 0.12 : 1}
              // Once picked up, this cell's own KonvaImage must stop being
              // draggable: otherwise the very next pointer move re-triggers
              // Konva's native pan/crop drag on it (its own 3px threshold is
              // well under LONG_PRESS_CANCEL_PX), which swallows all pointer
              // events for the gesture and starves the stage-level
              // mousemove/touchmove listener that tracks the swap's
              // hoverCellId — the swap can never see a drop target.
              interactive={dragState?.sourceCellId !== assignment.cellId}
              onTransformChange={(t) => onCellTransformChange(assignment.cellId, t)}
              onEmptyClick={() => onEmptyCellClick(assignment.cellId)}
              onLongPressStart={(evt) => beginDrag(assignment.cellId, evt)}
            />
            {isHoverTarget && (
              <Rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                stroke="#ffffff"
                strokeWidth={3}
                cornerRadius={shape === 'rounded' ? Math.min(rect.w, rect.h) * 0.08 : 0}
                listening={false}
              />
            )}
          </Group>
        )
      })}

      {/* Floating pick-up copy: follows the pointer, lifted with a scale-up
          and drop shadow so it visibly detaches from the grid. Wrapped in its
          own Group (rather than adding shadow/scale props to PhotoCell
          itself) purely so PhotoCell doesn't need to know this overlay use
          case exists at all. */}
      {dragState && draggedRect && (() => {
        const assignment = assignments.find((a) => a.cellId === dragState.sourceCellId)
        const photo = assignment?.photoId ? photos[assignment.photoId] : null
        if (!assignment || !photo) return null
        const cx = dragState.pointerX - dragState.grabDX + draggedRect.w / 2
        const cy = dragState.pointerY - dragState.grabDY + draggedRect.h / 2
        return (
          <Group
            x={cx}
            y={cy}
            offsetX={draggedRect.w / 2}
            offsetY={draggedRect.h / 2}
            scaleX={1.06}
            scaleY={1.06}
            shadowColor="black"
            shadowBlur={24}
            shadowOpacity={0.45}
            shadowOffsetY={6}
            listening={false}
          >
            <PhotoCell
              x={0}
              y={0}
              width={draggedRect.w}
              height={draggedRect.h}
              shape={shape}
              grain={grain}
              photo={photo}
              transform={assignment.transform}
              interactive={false}
              onTransformChange={noopTransformChange}
            />
          </Group>
        )
      })()}

      {/* The dropped swap itself: two copies fly to each other's rects in
          lockstep, then the real assignments swap underneath them — landing
          exactly where these overlays end up, so nothing pops. */}
      {swapAnim && (() => {
        const e = easeInOutCubic(swapProgress)
        const ax = swapAnim.aFromX + (swapAnim.aToX - swapAnim.aFromX) * e
        const ay = swapAnim.aFromY + (swapAnim.aToY - swapAnim.aFromY) * e
        const aw = swapAnim.aFromW + (swapAnim.aToW - swapAnim.aFromW) * e
        const ah = swapAnim.aFromH + (swapAnim.aToH - swapAnim.aFromH) * e
        const bx = swapAnim.bFromX + (swapAnim.bToX - swapAnim.bFromX) * e
        const by = swapAnim.bFromY + (swapAnim.bToY - swapAnim.bFromY) * e
        const bw = swapAnim.bFromW + (swapAnim.bToW - swapAnim.bFromW) * e
        const bh = swapAnim.bFromH + (swapAnim.bToH - swapAnim.bFromH) * e
        return (
          <>
            {swapAnim.photoA && (
              <PhotoCell
                x={ax}
                y={ay}
                width={aw}
                height={ah}
                shape={shape}
                grain={grain}
                photo={swapAnim.photoA}
                transform={swapAnim.transformA}
                interactive={false}
                onTransformChange={noopTransformChange}
              />
            )}
            {swapAnim.photoB && (
              <PhotoCell
                x={bx}
                y={by}
                width={bw}
                height={bh}
                shape={shape}
                grain={grain}
                photo={swapAnim.photoB}
                transform={swapAnim.transformB}
                interactive={false}
                onTransformChange={noopTransformChange}
              />
            )}
          </>
        )
      })()}
    </Group>
  )
}

export function CollageEditor() {
  const tr = useTranslation()
  const GRID_TOOLS: BottomBarTool[] = [
    { id: 'workspace', label: tr.tools.workspace, icon: <IconDrop /> },
    { id: 'formato', label: tr.collageEditor.toolAspect, icon: <IconCrop /> },
    { id: 'plantilla', label: tr.collageEditor.toolTemplate, icon: <IconGrid /> },
    { id: 'bordes', label: tr.collageEditor.toolBorder, icon: <IconFrame /> },
    { id: 'grain', label: tr.collageEditor.toolGrain, icon: <IconGrain /> },
  ]
  const FREE_TOOLS: BottomBarTool[] = [
    { id: 'workspace', label: tr.tools.workspace, icon: <IconDrop /> },
    { id: 'formato', label: tr.collageEditor.toolAspect, icon: <IconCrop /> },
    { id: 'grain', label: tr.collageEditor.toolGrain, icon: <IconGrain /> },
  ]
  const store = useEditorStore()
  const { photos, collage } = store
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  // Drives the content area's crossfade for a full content swap (the very
  // first photo turning the empty Dropzone into a collage, or "create
  // another" clearing it back out): 'exiting' plays view-exit on the
  // always-mounted wrapper, then the timeout below applies the actual state
  // change and flips to 'entering', which mounts a freshly-keyed child with
  // view-enter. onAnimationEnd drops back to 'idle' — same pattern App.tsx
  // uses for its own view transitions, and for the same reason: `animation:
  // ... both` pins a transform (and its compositing layer) forever unless
  // the class is removed once the animation finishes, and a permanently
  // composited layer is what breaks iOS taps/drags — this content area sits
  // right on top of each cell's own drag gesture.
  const [swapPhase, setSwapPhase] = useState<'idle' | 'exiting' | 'entering'>('idle')
  const [swapKey, setSwapKey] = useState(0)
  const [pendingCellId, setPendingCellId] = useState<string | null>(null)
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [gutterLinked, setGutterLinked] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  // Non-null for exactly as long as a selection is being decoded — see
  // ImportProgressModal for why that window needs something on screen.
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  // The export's own modal — the confirmation, or, when iOS wouldn't open the
  // share sheet because the Export tap had already expired, the tap that hands
  // this exact file to it with no re-render. See BorderEditor's own exportFlow.
  const [exportFlow, setExportFlow] = useState<{ phase: ExportFlowPhase; files: File[] } | null>(null)
  // The live preview is taken down for the render and rebuilt afterwards —
  // same reasoning as BorderEditor's own previewSuspended: WebKit blanks the
  // preview's canvas to stay inside its per-tab canvas budget while a
  // full-resolution collage is being rendered, and a blanked canvas never
  // recovers on its own. A nine-photo collage is the heaviest render in the
  // app, so this matters more here, not less.
  const [previewSuspended, setPreviewSuspended] = useState(false)
  // The still shown in the preview's place while it is suspended, captured off
  // the live canvas the instant before it comes down — so the export screen
  // looks exactly as it did rather than opening a hole where the photo was.
  const [frozenPreview, setFrozenPreview] = useState<string | null>(null)
  const stageRef = useRef<CanvasStageHandle>(null)
  const toolbarRef = useRef<ToolbarHandle>(null)

  useEffect(() => {
    if (!uploadError) return
    const t = setTimeout(() => setUploadError(null), 3000)
    return () => clearTimeout(t)
  }, [uploadError])

  useEffect(() => {
    if (!exportError) return
    const t = setTimeout(() => setExportError(null), 4000)
    return () => clearTimeout(t)
  }, [exportError])

  const ratio = useMemo(
    () => resolveRatio(collage.aspectRatioId, 1, collage.ratioOrientation),
    [collage.aspectRatioId, collage.ratioOrientation],
  )
  const { width: targetWidth, height: targetHeight } = useMemo(
    () => computeOutputPixelSize(ratio, PREVIEW_LONG_EDGE),
    [ratio],
  )
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)
  // Border/gutter thickness is a proportion of the canvas's SHORT side, and
  // `Math.min(outputWidth, outputHeight)` is the wrong way to get that mid-
  // transition: min() of two crossing tweens peaks as the canvas passes
  // through square, so flipping 9:16 -> 16:9 (same 506px short side at both
  // ends) made the white border and every gutter swell ~39% and deflate
  // again. Tweening the short side itself holds them steady through a flip
  // and eases monotonically otherwise. Always <= min(outputWidth,
  // outputHeight) — min() of two linear ramps is concave, so it never
  // exceeds the straight interpolation between its own endpoints — so the
  // border can't overflow the canvas mid-animation. The sliders only move
  // outerBorderPct/gutterPct, which are fed through raw below, so they still
  // track 1:1 with no added lag.
  const shortSide = useAnimatedNumber(Math.min(targetWidth, targetHeight))

  const template = useMemo(() => {
    const base = getTemplateById(collage.templateId, collage.photoCount)
    return collage.orientation === 'vertical' ? transposeTemplate(base) : base
  }, [collage.templateId, collage.photoCount, collage.orientation])

  // Cell rects are derived from the SAME animated canvas size the frame uses,
  // so the grid is a pure function of the frame and the two can never
  // disagree by construction. They used to be built from the raw (un-tweened)
  // targetWidth/targetHeight and left to PhotoCell's own animateLayout tween
  // to catch up, which is what produced the worst glitch on this screen: a
  // vertical<->horizontal flip changes ratioOrientation, which wasn't in
  // reflowKey below, so animateCells stayed false and every cell SNAPPED to
  // the landscape layout on the very first frame while the white frame spent
  // 320ms morphing around them. Measured on a 4-up 9:16 grid: the right-hand
  // column jumped to x=454 inside a canvas still only 506px wide, i.e. the
  // photos shot off the right edge and slid back in as the frame caught up.
  // Even with the key fixed it couldn't be exact — animateLayout eases
  // linearly between the two END layouts, while the frame eases its width and
  // height separately, and the layout isn't linear in (width, height) because
  // of the min() above — so the two only agree when the short side never
  // switches axis. Deriving from the animated size removes the whole class:
  // no second tween to keep in phase.
  const outerBorderPx = collage.outerBorderPct * shortSide
  const gutterPx = collage.gutterPct * shortSide
  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = outputWidth - outerBorderPx * 2
  const contentH = outputHeight - outerBorderPx * 2
  const cellW = (contentW - gutterPx * (template.cols - 1)) / template.cols
  const cellH = (contentH - gutterPx * (template.rows - 1)) / template.rows

  // animateLayout is now ONLY for re-tiles that leave the canvas size alone —
  // switching template, transposing it, adding/removing a photo. Those change
  // every cell's rect with nothing else moving, so each cell easing to its new
  // spot on its own is exactly the motion the person wants, and there's no
  // second animation to stay in phase with.
  //
  // Everything else is deliberately NOT in this key:
  // - aspectRatioId / ratioOrientation: the canvas size tween above already
  //   carries that motion, and cell rects are derived from it, so the cells
  //   follow the frame frame-for-frame. Turning animateLayout on here would
  //   double-animate — each cell chasing a target that is itself still moving
  //   every frame, which reads as lag and lands late.
  // - outerBorderPct / gutterPct: a slider drag fires a new target on every
  //   'input' event and animateLayout's tween restarts on each one before the
  //   last finishes, so the cell perpetually chases the live slider value
  //   instead of tracking it. A slider must track 1:1 with zero added lag.
  //
  // The ratio guard covers the one case where both could overlap (retiling
  // while a ratio tween is still in flight — e.g. tapping template right
  // after 9:16): the frame tween wins and the cells just follow it.
  //
  // No masking veil this time around: an opacity dip read as a white flash,
  // a same-shaped dark veil read as a black flash instead, and a CSS blur
  // pulse still read as an unwanted glitch — three different attempts to
  // hide cells crossing paths mid-move, none of which ever read as
  // intentional (see git history). Turned out the plain slide, with nothing
  // trying to hide it, reads fine on its own — it's normal reflow motion,
  // not an error, and doesn't need a veil to sell that.
  //
  // Windows run slightly longer than the 320ms tweens they gate so the flag
  // can't drop on the second-to-last frame and snap the final pixel.
  const retileKey = `${collage.templateId}|${collage.orientation}|${collage.photoCount}`
  const ratioKey = `${collage.aspectRatioId}|${collage.ratioOrientation}`
  const ratioReflowing = useIsReflowing(ratioKey, 360)
  const animateCells = useIsReflowing(retileKey, 360) && !ratioReflowing

  const borderColorHex = getBorderColor(collage.borderColor).hex
  // Only the live preview eases between colors — the export just paints the
  // final picked color once, no animation needed for a static file.
  const animatedBorderColorHex = useAnimatedColor(borderColorHex)

  const tools = collage.layoutMode === 'grid' ? GRID_TOOLS : FREE_TOOLS
  const activeToolId = tools.some((t) => t.id === activeTool) ? activeTool : null

  const swapContent = (apply: () => void) => {
    setSwapPhase('exiting')
    setTimeout(() => {
      apply()
      setSwapKey((k) => k + 1)
      setSwapPhase('entering')
    }, EXIT_MS)
  }

  /** How many more photos this collage can hold right now. */
  const freeSlots = () =>
    MAX_COLLAGE_PHOTOS -
    (collage.layoutMode === 'free'
      ? collage.freeItems.length
      : collage.assignments.filter((a) => a.photoId).length)

  const handleUpload = async (files: FileList) => {
    // RAW and over-sized files are dropped before anything is decoded — see
    // photoInput.ts. Saying which of the two happened matters: silently
    // ignoring a selection reads as the app losing the photos.
    const { accepted, rejectedType, rejectedSize } = screenPhotoFiles(files)
    if (rejectedType > 0) setUploadError(tr.toolbar.unsupportedFormat)
    else if (rejectedSize > 0) setUploadError(tr.toolbar.tooHeavy(MAX_PHOTO_MB))
    if (accepted.length === 0) return
    // The picker has no notion of a maximum, so an over-sized selection has to
    // be caught here — and it is rejected WHOLE rather than trimmed to what
    // fits. Silently keeping the first nine of fifteen is what produced a
    // collage laid out for more photos than it actually got: cells built for
    // files that were never placed, and no way to tell which ones went.
    // Nothing is decoded until the count is known to be good, so an
    // over-sized pick costs no memory at all.
    // Filling ONE empty cell: the picker still hands back everything that was
    // selected, but only the first photo has anywhere to go. Trimming here
    // (rather than refusing the selection) means the rest are never decoded.
    const selection = pendingCellId ? accepted.slice(0, 1) : accepted
    const slots = pendingCellId ? 1 : freeSlots()
    if (slots <= 0) {
      setUploadError(tr.collageEditor.full(MAX_COLLAGE_PHOTOS))
      return
    }
    if (selection.length > slots) {
      setUploadError(
        slots === MAX_COLLAGE_PHOTOS ? tr.collageEditor.tooMany(MAX_COLLAGE_PHOTOS) : tr.collageEditor.onlyRoomFor(slots),
      )
      return
    }
    const startedAt = performance.now()
    setImporting({ done: 0, total: selection.length })
    let loaded
    try {
      loaded = await loadFiles(selection, (done, total) => setImporting({ done, total }))
    } finally {
      // Held for a beat even when the decode was instant — see holdImportCard.
      await holdImportCard(startedAt, selection.length)
      setImporting(null)
    }
    // Whatever the decoder itself refused (a truncated file, a format this
    // browser has no decoder for) is reported rather than left to look like
    // the app having dropped photos on its own.
    if (loaded.length < selection.length) setUploadError(tr.toolbar.someFailed(selection.length - loaded.length))
    if (loaded.length === 0) return
    if (pendingCellId) {
      store.addPhotos(loaded)
      store.assignPhotoToCell(pendingCellId, loaded[0].id)
      setPendingCellId(null)
      return
    }
    // Only the very first photo — the Dropzone->canvas swap — gets the
    // crossfade; adding more photos to an already-visible collage stays
    // instant, since nothing is being replaced (Collage's own grid reflow
    // already animates those in).
    if (!hasContent) {
      swapContent(() => {
        const added = store.addCollagePhotos(loaded)
        if (!added) setUploadError(tr.collageEditor.selectAtLeast(MIN_COLLAGE_PHOTOS))
      })
      return
    }
    const added = store.addCollagePhotos(loaded)
    if (!added) {
      setUploadError(tr.collageEditor.selectAtLeast(MIN_COLLAGE_PHOTOS))
    }
  }

  const handleExport = async (quality: ExportQuality) => {
    store.setCollageExportQuality(quality)
    setExporting(true)
    // Straight into the modal's rendering phase rather than waiting for the
    // render to finish: with the preview suspended below, the export screen
    // would otherwise be blank for however many seconds a nine-photo
    // native-resolution collage takes.
    setExportFlow({ phase: 'rendering', files: [] })
    setFrozenPreview(stageRef.current?.snapshot() ?? null)
    setPreviewSuspended(true)
    // One frame with the preview already swapped for its still before the
    // first decode starts — otherwise React's re-render is queued behind the
    // whole synchronous render and the canvas stays up for exactly the window
    // it must not. yieldToBrowser, not a bare requestAnimationFrame: a
    // backgrounded tab gets no frames at all, and waiting on one there stalled
    // the export before it had rendered a single photo.
    await yieldToBrowser()
    try {
      // Rendered here, saved on a deliberate tap — never shared off the Export
      // tap itself. A collage is the heaviest render in the app and routinely
      // outlives WebKit's activation window, so trying first and recovering
      // afterwards made a fast run and a slow run two different flows; this is
      // now the same three steps the border editor shows, every time.
      const file =
        collage.layoutMode === 'grid'
          ? await renderCollageGrid(
              template,
              collage.assignments,
              photos,
              ratio,
              collage.outerBorderPct,
              collage.gutterPct,
              quality,
              collage.shape,
              collage.grainIntensity,
              borderColorHex,
            )
          : await renderCollageFree(collage.freeItems, photos, ratio, quality, collage.grainIntensity, borderColorHex)
      setExportFlow({ phase: 'ready', files: [file] })
    } catch {
      // Nothing upstream ever surfaced a failed export — it just quietly
      // reset the button, with no way to tell a real error apart from a
      // dismissed share sheet. Whatever the cause (a canvas too large for
      // this device to render, an out-of-memory decode, ...), the person
      // needs SOME signal instead of silence.
      setExportError(tr.toolbar.exportFailed)
      // A render that threw has no file to offer — take its modal down so the
      // error banner isn't hidden behind a stalled progress card.
      setExportFlow(null)
    } finally {
      setExporting(false)
      // Dropping frozenSrc remounts the Stage outright (CanvasStage renders
      // one or the other, never both), which is the point: a canvas WebKit
      // blanked during the render is gone for good, and only a brand-new one
      // draws again.
      setPreviewSuspended(false)
      setFrozenPreview(null)
    }
  }

  const hasContent =
    collage.layoutMode === 'grid' ? collage.assignments.some((a) => a.photoId) : collage.freeItems.length > 0

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <Toolbar
        ref={toolbarRef}
        title={tr.home.collageTitle}
        onBack={() => store.setMode('home')}
        onUpload={handleUpload}
        onExport={handleExport}
        exportQuality={collage.exportQuality}
        exporting={exporting}
        canExport={hasContent}
        uploadLabel={tr.collageEditor.addPhotos}
        multiple
      />

      {/* Only the empty Dropzone shows its own error inline, so once a collage
          exists this banner is the ONLY place a refused selection is
          accounted for — without it, adding ten photos to a collage that has
          room for two just looked like the app ignoring the tap. */}
      {uploadError && hasContent && (
        <p className="fade-in font-label mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-300">
          {uploadError}
        </p>
      )}

      {exportError && (
        <p className="fade-in font-label mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-300">
          {exportError}
        </p>
      )}

      <div className="flex items-center justify-center gap-2 border-b border-white/10 bg-ink-900 px-4 py-2">
        {(['grid', 'free'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => store.setCollageLayoutMode(m)}
            className={`font-label rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
              collage.layoutMode === m ? 'bg-white text-ink-900' : 'bg-white/10 text-white/70'
            }`}
          >
            {m === 'grid' ? tr.collageEditor.modeTemplate : tr.collageEditor.modeFree}
          </button>
        ))}
      </div>

      <div className={`min-h-0 flex-1 p-4 ${swapPhase === 'exiting' ? 'view-exit' : ''}`}>
        <div
          key={swapKey}
          className={`h-full ${swapPhase === 'entering' ? 'view-enter' : ''}`}
          onAnimationEnd={() => setSwapPhase((p) => (p === 'entering' ? 'idle' : p))}
        >
        {hasContent ? (
          <CanvasStage
            ref={stageRef}
            frozenSrc={previewSuspended ? frozenPreview : null}
            outputWidth={outputWidth}
            outputHeight={outputHeight}
            background={animatedBorderColorHex}
          >
            {collage.layoutMode === 'grid'
              ? (
                <GridCellsLayer
                  template={template}
                  assignments={collage.assignments}
                  photos={photos}
                  animateCells={animateCells}
                  contentX={contentX}
                  contentY={contentY}
                  cellW={cellW}
                  cellH={cellH}
                  gutterPx={gutterPx}
                  shape={collage.shape}
                  grain={collage.grainIntensity}
                  onCellTransformChange={(cellId, t) => store.setCellTransform(cellId, t)}
                  onEmptyCellClick={(cellId) => {
                    setPendingCellId(cellId)
                    toolbarRef.current?.openFilePicker()
                  }}
                />
              )
              : (
                <FreeItemsLayer
                  outputWidth={outputWidth}
                  outputHeight={outputHeight}
                  selectedId={selectedFreeId}
                  onSelect={setSelectedFreeId}
                  grain={collage.grainIntensity}
                />
              )}
          </CanvasStage>
        ) : (
          <Dropzone
            label={tr.collageEditor.dropLabel}
            hint={tr.collageEditor.dropHint(MIN_COLLAGE_PHOTOS, MAX_COLLAGE_PHOTOS, MAX_PHOTO_MB)}
            error={uploadError}
            onFiles={handleUpload}
          />
        )}
        </div>
      </div>

      {/* The gestures are invisible until someone tries them, so the hint sits
          here permanently in free mode rather than only alongside a selection
          — it's the answer to "how do I make this photo bigger", which is
          exactly the question asked before anything is selected. */}
      {collage.layoutMode === 'free' && hasContent && (
        <div className="fade-in flex items-center justify-between gap-3 border-t border-white/10 bg-ink-900 px-4 py-2">
          <p className="font-label text-[11px] leading-snug text-white/40">{tr.collageEditor.freeHint}</p>
          {selectedFreeId && (
          <button
            type="button"
            onClick={() => {
              store.removeFreeItem(selectedFreeId)
              setSelectedFreeId(null)
            }}
            className="font-label rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-300 transition duration-200 hover:bg-red-500/25 active:scale-90"
          >
            {tr.collageEditor.removePhoto}
          </button>
          )}
        </div>
      )}

      {hasContent && (
        <div
          key={swapKey}
          className={swapPhase === 'exiting' ? 'view-exit' : swapPhase === 'entering' ? 'view-enter' : ''}
        >
        <EditorBottomBar tools={tools} activeId={activeToolId} onSelect={setActiveTool}>
          {activeToolId === 'formato' && (
            <div>
              <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.collageEditor.canvasFormat}</p>
              <AspectRatioPicker
                value={collage.aspectRatioId}
                onChange={store.setCollageAspectRatio}
                options={COLLAGE_ASPECT_RATIOS}
                orientation={collage.ratioOrientation}
                onOrientationChange={store.setCollageRatioOrientation}
              />
            </div>
          )}

          {activeToolId === 'plantilla' && (
            <>
              <div>
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.collageEditor.orientation}</p>
                <div className="flex justify-center gap-2">
                  {(['vertical', 'horizontal'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => store.setCollageOrientation(o)}
                      className={`font-label rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
                        collage.orientation === o
                          ? 'bg-white text-ink-900'
                          : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {o === 'vertical' ? tr.collageEditor.vertical : tr.collageEditor.horizontal}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.collageEditor.shape}</p>
                <div className="flex justify-center gap-2">
                  {(
                    [
                      { shape: 'rect' as const, label: tr.collageEditor.rectangular },
                      { shape: 'rounded' as const, label: tr.collageEditor.rounded },
                    ]
                  ).map(({ shape, label }) => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => store.setCollageShape(shape)}
                      className={`font-label rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
                        collage.shape === shape
                          ? 'bg-white text-ink-900'
                          : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">
                  {tr.collageEditor.layout(collage.photoCount)}
                </p>
                <GridTemplatePicker
                  count={collage.photoCount}
                  value={collage.templateId}
                  shape={collage.shape}
                  orientation={collage.orientation}
                  onChange={store.setCollageTemplateId}
                />
              </div>
              <p className="font-label text-center text-xs text-white/40">{tr.collageEditor.emptyCellHint}</p>
            </>
          )}

          {activeToolId === 'bordes' && (
            <>
              <BorderThicknessSlider
                label={tr.collageEditor.outerBorder}
                value={collage.outerBorderPct}
                onChange={(pct) => {
                  store.setOuterBorderPct(pct)
                  if (gutterLinked) store.setGutterPct(pct)
                }}
              />
              <div className="space-y-3">
                <BorderThicknessSlider
                  label={tr.collageEditor.spaceBetween}
                  value={collage.gutterPct}
                  onChange={(pct) => {
                    store.setGutterPct(pct)
                    setGutterLinked(false)
                  }}
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (gutterLinked) {
                        setGutterLinked(false)
                      } else {
                        store.setGutterPct(collage.outerBorderPct)
                        setGutterLinked(true)
                      }
                    }}
                    className={`font-label rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
                      gutterLinked
                        ? 'bg-white text-ink-900 hover:bg-white/90'
                        : 'bg-white/10 text-white/70 hover:bg-white/15'
                    }`}
                  >
                    {gutterLinked ? tr.collageEditor.linked : tr.collageEditor.matchOuter}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeToolId === 'workspace' && (
            <>
              <WorkspaceBackgroundPicker value={store.workspaceBackground} onChange={store.setWorkspaceBackground} />
              <BorderColorPicker value={collage.borderColor} onChange={store.setCollageBorderColor} />
            </>
          )}

          {activeToolId === 'grain' && (
            <BorderThicknessSlider
              label={tr.collageEditor.grain}
              value={collage.grainIntensity}
              onChange={store.setCollageGrain}
              min={0}
              max={1}
            />
          )}
        </EditorBottomBar>
        </div>
      )}

      <ImportProgressModal open={!!importing} done={importing?.done ?? 0} total={importing?.total ?? 0} />

      <ExportFlowModal
        open={!!exportFlow}
        phase={exportFlow?.phase ?? 'ready'}
        done={1}
        total={1}
        onSave={async () => {
          if (!exportFlow) return
          setExportFlow((f) => (f ? { ...f, phase: 'saving' } : f))
          const result = await saveExportedFiles(exportFlow.files)
          // Anything but a save keeps the rendered file and the button — only a
          // real save moves the card on to the confirmation.
          setExportFlow((f) => (f ? { ...f, phase: result === 'saved' ? 'saved' : 'ready' } : f))
        }}
        onClose={() => setExportFlow(null)}
        onCreateAnother={() => {
          setExportFlow(null)
          swapContent(() => store.resetCollage())
        }}
        onGoHome={() => {
          setExportFlow(null)
          store.setMode('home')
        }}
      />
    </div>
  )
}
