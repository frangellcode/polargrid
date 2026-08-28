import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CellAssignment, CellShape, ExportQuality, GridTemplate, LoadedPhoto, PhotoTransform } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { easeInOutCubic, useAnimatedColor, useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { COLLAGE_ASPECT_RATIOS } from '../../lib/aspectRatios'
import { computeOutputPixelSize, getImageDrawRect } from '../../lib/cropMath'
import { MIN_COLLAGE_PHOTOS, getTemplateById, transposeTemplate } from '../../lib/collageTemplates'
import { exportCollageFree, exportCollageGrid, resolveRatio } from '../../lib/exportImage'
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
import { WorkspaceBackgroundPicker } from './WorkspaceBackgroundPicker'
import { BorderColorPicker } from './BorderColorPicker'
import { IconCrop, IconDrop, IconFrame, IconGrain, IconGrid } from './icons'
import { GrainOverlay } from './GrainOverlay'

const PREVIEW_LONG_EDGE = 900
// Slightly gentler than CLOSE_MS (used for the toast's own open/close
// animation, unrelated to this) — the content->Dropzone cross-fade felt like
// a snap at 300ms, so it eases a bit longer here. Keep the setTimeout below
// and both `duration-[…]` classes in step with this, or the reset will fire
// mid-fade and cut the animation short.
const CONTENT_FADE_MS = 450

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
              image={photo.bitmap as unknown as CanvasImageSource}
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
  aFromX: number
  aFromY: number
  aToX: number
  aToY: number
  bFromX: number
  bFromY: number
  bToX: number
  bToY: number
  w: number
  h: number
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

  // Only cells with the same span as the one being dragged are valid drop
  // targets — anything else would need the template's actual shape to
  // reflow, which a same-position content swap can't do. Simplest correct
  // rule, not the cleverest one: an incompatible target just behaves like no
  // target at all (release cancels, no swap, no crash).
  const hitTestCell = (px: number, py: number, excludeCellId: string): string | null => {
    const source = cellRects.get(excludeCellId)
    if (!source) return null
    for (const [cellId, rect] of cellRects) {
      if (cellId === excludeCellId) continue
      if (rect.colSpan !== source.colSpan || rect.rowSpan !== source.rowSpan) continue
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
              aToX: bRect.x,
              aToY: bRect.y,
              bFromX: bRect.x,
              bFromY: bRect.y,
              bToX: aRect.x,
              bToY: aRect.y,
              w: aRect.w,
              h: aRect.h,
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
        const bx = swapAnim.bFromX + (swapAnim.bToX - swapAnim.bFromX) * e
        const by = swapAnim.bFromY + (swapAnim.bToY - swapAnim.bFromY) * e
        return (
          <>
            {swapAnim.photoA && (
              <PhotoCell
                x={ax}
                y={ay}
                width={swapAnim.w}
                height={swapAnim.h}
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
                width={swapAnim.w}
                height={swapAnim.h}
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
    { id: 'fondo', label: tr.collageEditor.toolBackground, icon: <IconDrop /> },
    { id: 'formato', label: tr.collageEditor.toolFormat, icon: <IconCrop /> },
    { id: 'plantilla', label: tr.collageEditor.toolTemplate, icon: <IconGrid /> },
    { id: 'bordes', label: tr.collageEditor.toolBorder, icon: <IconFrame /> },
    { id: 'grain', label: tr.collageEditor.toolGrain, icon: <IconGrain /> },
  ]
  const FREE_TOOLS: BottomBarTool[] = [
    { id: 'fondo', label: tr.collageEditor.toolBackground, icon: <IconDrop /> },
    { id: 'formato', label: tr.collageEditor.toolFormat, icon: <IconCrop /> },
    { id: 'grain', label: tr.collageEditor.toolGrain, icon: <IconGrain /> },
  ]
  const store = useEditorStore()
  const { photos, collage } = store
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  // True for the CONTENT_FADE_MS window between tapping "Create another" and the
  // collage actually being cleared — fades the current canvas/bottom bar
  // out instead of them just vanishing the instant resetCollage() fires.
  const [resetting, setResetting] = useState(false)
  const [pendingCellId, setPendingCellId] = useState<string | null>(null)
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [gutterLinked, setGutterLinked] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const toolbarRef = useRef<ToolbarHandle>(null)

  useEffect(() => {
    if (!uploadError) return
    const t = setTimeout(() => setUploadError(null), 3000)
    return () => clearTimeout(t)
  }, [uploadError])

  const ratio = useMemo(
    () => resolveRatio(collage.aspectRatioId, 1, collage.ratioOrientation),
    [collage.aspectRatioId, collage.ratioOrientation],
  )
  const { width: targetWidth, height: targetHeight } = useMemo(
    () => computeOutputPixelSize(ratio, PREVIEW_LONG_EDGE),
    [ratio],
  )
  // Animated for FREE mode's own frame size (no grid cells to desync from —
  // FreeItemsLayer's items are user-positioned, nothing auto-retiles). GRID
  // mode uses the raw target directly instead (see frameWidth/frameHeight
  // below) — read on for why.
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)

  const template = useMemo(() => {
    const base = getTemplateById(collage.templateId, collage.photoCount)
    return collage.orientation === 'vertical' ? transposeTemplate(base) : base
  }, [collage.templateId, collage.photoCount, collage.orientation])

  // Raw (unanimated) targetWidth/targetHeight on purpose. Every grid cell
  // used to ease into its new rect independently (animateLayout) on a
  // template/orientation/aspect-ratio switch, with no shared clock between
  // cells — they could visibly cross paths mid-move, or (for an aspect-ratio
  // change specifically) race ahead of CanvasStage's own separately-tweened
  // frame size and briefly render outside its current bounds. Three
  // different veils were tried to mask the crossover (opacity dip -> read as
  // a white flash; a dark veil at the same envelope -> read as a black flash
  // instead; a CSS blur pulse -> still read as an unwanted glitch) without
  // ever actually reading as intentional. Snapping straight to the target —
  // the same non-animated approach outerBorderPct/gutterPct's sliders
  // already use, for the unrelated laggy-slider reason below — sidesteps
  // the whole "how do we mask this" problem instead of trying a fourth veil.
  const shortSide = Math.min(targetWidth, targetHeight)
  const outerBorderPx = collage.outerBorderPct * shortSide
  const gutterPx = collage.gutterPct * shortSide
  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = targetWidth - outerBorderPx * 2
  const contentH = targetHeight - outerBorderPx * 2
  const cellW = (contentW - gutterPx * (template.cols - 1)) / template.cols
  const cellH = (contentH - gutterPx * (template.rows - 1)) / template.rows

  // GRID mode's own frame tracks the raw target too, in lockstep with the
  // cells above — letting it keep animating (like FREE mode's frame does)
  // while cells snap instantly would have cells sized/positioned for the
  // FINAL frame while the canvas itself is still mid-resize toward it,
  // clipping or leaving a gap around them until the frame caught up.
  const frameWidth = collage.layoutMode === 'grid' ? targetWidth : outputWidth
  const frameHeight = collage.layoutMode === 'grid' ? targetHeight : outputHeight

  const borderColorHex = getBorderColor(collage.borderColor).hex
  // Only the live preview eases between colors — the export just paints the
  // final picked color once, no animation needed for a static file.
  const animatedBorderColorHex = useAnimatedColor(borderColorHex)

  const tools = collage.layoutMode === 'grid' ? GRID_TOOLS : FREE_TOOLS
  const activeToolId = tools.some((t) => t.id === activeTool) ? activeTool : null

  const handleUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    if (pendingCellId) {
      store.addPhotos(loaded)
      store.assignPhotoToCell(pendingCellId, loaded[0].id)
      setPendingCellId(null)
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
    try {
      const saved =
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
      if (saved) setShowSuccessToast(true)
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

      <div
        className={`min-h-0 flex-1 p-4 transition-opacity duration-[450ms] ${resetting ? 'opacity-0' : 'opacity-100'}`}
      >
        {hasContent ? (
          <CanvasStage
            outputWidth={frameWidth}
            outputHeight={frameHeight}
            background={animatedBorderColorHex}
          >
            {collage.layoutMode === 'grid'
              ? (
                <GridCellsLayer
                  template={template}
                  assignments={collage.assignments}
                  photos={photos}
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
        <div className={`transition-opacity duration-[450ms] ${resetting ? 'opacity-0' : 'opacity-100'}`}>
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

          {activeToolId === 'fondo' && (
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

      <ExportSuccessToast
        open={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
        onCreateAnother={() => {
          setShowSuccessToast(false)
          setResetting(true)
          setTimeout(() => {
            store.resetCollage()
            // No rAF dance needed to bring this back in: unlike the fade-out
            // above (a CSS *transition*, which needs its "from" state
            // actually painted before flipping the target so there's
            // something to animate from), Dropzone mounts with `fade-in-slow`
            // — a CSS *animation*, which always plays its own 0% keyframe
            // regardless of when it's triggered. Snapping this wrapper
            // straight back to opacity-100 just uncovers that animation
            // already in motion. Flipping it via the old rAF dance instead
            // made this wrapper run its OWN opacity transition at the same
            // time as Dropzone's independent fade-in-up underneath it — two
            // competing opacity/translateY ramps on top of each other, which
            // is what actually read as things "snapping" into place.
            setResetting(false)
          }, CONTENT_FADE_MS)
        }}
        onGoHome={() => {
          setShowSuccessToast(false)
          store.setMode('home')
        }}
      />
    </div>
  )
}
