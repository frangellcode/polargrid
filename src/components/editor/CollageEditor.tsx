import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CellAssignment, CellShape, ExportQuality, GridTemplate, LoadedPhoto, PhotoTransform } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { easeInOutCubic, useAnimatedColor, useAnimatedNumber, useIsReflowing } from '../../hooks/useAnimatedNumber'
import { COLLAGE_ASPECT_RATIOS } from '../../lib/aspectRatios'
import { computeOutputPixelSize, getImageDrawRect } from '../../lib/cropMath'
import { MIN_COLLAGE_PHOTOS, getTemplateById, transposeTemplate } from '../../lib/collageTemplates'
import { exportCollageFree, exportCollageGrid, resolveRatio, saveExportedFiles } from '../../lib/exportImage'
import { getBorderColor } from '../../lib/borderColors'
import { Toolbar, type ToolbarHandle } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { GridTemplatePicker } from './GridTemplatePicker'
import { CanvasStage } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { ExportSuccessToast } from './ExportSuccessToast'
import { BatchExportModal } from './BatchExportModal'
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

function FreeItemsLayer({ outputWidth, outputHeight, selectedId, onSelect, grain }: FreeItemsLayerProps) {
  const { collage, photos, updateFreeItem } = useEditorStore()
  const shapeRefs = useRef<Record<string, Konva.Group>>({})
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!trRef.current) return
    const node = selectedId ? shapeRefs.current[selectedId] : null
    trRef.current.nodes(node ? [node] : [])
    trRef.current.getLayer()?.batchDraw()
  }, [selectedId, collage.freeItems.length])

  return (
    <>
      {collage.freeItems.map((item) => {
        const photo = photos[item.photoId]
        if (!photo) return null
        const x = item.x * outputWidth
        const y = item.y * outputHeight
        const w = item.width * outputWidth
        const h = item.height * outputHeight
        const draw = getImageDrawRect(w, h, photo.width, photo.height, item.transform)
        return (
          <Group
            key={item.id}
            ref={(node) => {
              if (node) shapeRefs.current[item.id] = node
            }}
            x={x}
            y={y}
            rotation={item.rotation}
            draggable
            clipX={0}
            clipY={0}
            clipWidth={w}
            clipHeight={h}
            onClick={() => onSelect(item.id)}
            onTap={() => onSelect(item.id)}
            onDragEnd={(e) => {
              updateFreeItem(item.id, {
                x: e.target.x() / outputWidth,
                y: e.target.y() / outputHeight,
              })
            }}
            // Fires continuously while a Transformer handle is being dragged
            // (not just once at the end). Konva's Transformer works by
            // applying scaleX/scaleY to this whole Group live, which stretches
            // the KonvaImage below — it was already cropped to `w`/`h` at its
            // OLD size — uniformly with it, distorting the photo for the
            // entire drag; only on release did the crop get recomputed
            // against the real new size. Committing width/height to the store
            // (and resetting scale back to 1) on every tick instead means
            // `draw` below re-crops against the CURRENT size each frame, so
            // the photo tracks the handle properly instead of visibly
            // stretching then snapping straight at the end.
            onTransform={(e) => {
              const node = e.target
              const scaleX = node.scaleX()
              const scaleY = node.scaleY()
              const newW = Math.max(30, w * scaleX)
              const newH = Math.max(30, h * scaleY)
              node.scaleX(1)
              node.scaleY(1)
              updateFreeItem(item.id, {
                x: node.x() / outputWidth,
                y: node.y() / outputHeight,
                width: newW / outputWidth,
                height: newH / outputHeight,
                rotation: node.rotation(),
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
      <Transformer
        ref={trRef}
        rotateEnabled
        keepRatio={false}
        boundBoxFunc={(oldBox, newBox) => (newBox.width < 30 || newBox.height < 30 ? oldBox : newBox)}
      />
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
  const [showSuccessToast, setShowSuccessToast] = useState(false)
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
  // The rendered collage iOS wouldn't share because the Export tap had already
  // expired (see saveExportedFiles). Kept so the modal can hand this exact file
  // to the share sheet from a fresh tap, with no re-render.
  const [pendingSave, setPendingSave] = useState<File[] | null>(null)
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

  const handleUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
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
    setPendingSave(null)
    try {
      const outcome =
        collage.layoutMode === 'grid'
          ? await exportCollageGrid(
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
          : await exportCollageFree(collage.freeItems, photos, ratio, quality, collage.grainIntensity, borderColorHex)
      if (outcome.result === 'saved') setShowSuccessToast(true)
      else if (outcome.result === 'needs-gesture') setPendingSave(outcome.files)
    } catch {
      // Nothing upstream ever surfaced a failed export — it just quietly
      // reset the button, with no way to tell a real error apart from a
      // dismissed share sheet. Whatever the cause (a canvas too large for
      // this device to render, an out-of-memory decode, ...), the person
      // needs SOME signal instead of silence.
      setExportError(tr.toolbar.exportFailed)
    } finally {
      setExporting(false)
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
            hint={tr.collageEditor.dropHint}
            error={uploadError}
            onFiles={handleUpload}
          />
        )}
        </div>
      </div>

      {collage.layoutMode === 'free' && selectedFreeId && (
        <div className="fade-in flex items-center justify-end border-t border-white/10 bg-ink-900 px-4 py-2">
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

      {/* Same centered, dimmed prompt the border batch uses — an edge banner
          for this was easy to miss, and the export just looked stalled. */}
      <BatchExportModal
        open={!!pendingSave}
        phase="ready"
        done={1}
        total={1}
        onSave={async () => {
          if (!pendingSave) return
          const result = await saveExportedFiles(pendingSave)
          // Backing out of the share sheet keeps the rendered file — only a
          // real save retires it.
          if (result !== 'saved') return
          setPendingSave(null)
          setShowSuccessToast(true)
        }}
        onClose={() => setPendingSave(null)}
      />

      <ExportSuccessToast
        open={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
        onCreateAnother={() => {
          setShowSuccessToast(false)
          swapContent(() => store.resetCollage())
        }}
        onGoHome={() => {
          setShowSuccessToast(false)
          store.setMode('home')
        }}
      />
    </div>
  )
}
