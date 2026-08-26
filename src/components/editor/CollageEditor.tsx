import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CellAssignment, CellShape, ExportQuality, GridTemplate, LoadedPhoto, PhotoTransform } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedNumber, useReflowFade } from '../../hooks/useAnimatedNumber'
import { COLLAGE_ASPECT_RATIOS } from '../../lib/aspectRatios'
import { computeOutputPixelSize, getImageDrawRect } from '../../lib/cropMath'
import { MIN_COLLAGE_PHOTOS, getTemplateById, transposeTemplate } from '../../lib/collageTemplates'
import { exportCollageFree, exportCollageGrid, resolveRatio } from '../../lib/exportImage'
import { Toolbar, type ToolbarHandle } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { GridTemplatePicker } from './GridTemplatePicker'
import { CanvasStage } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { CLOSE_MS, ExportSuccessToast } from './ExportSuccessToast'
import { WorkspaceBackgroundPicker } from './WorkspaceBackgroundPicker'
import { IconCrop, IconDrop, IconFrame, IconGrain, IconGrid } from './icons'
import { GrainOverlay } from './GrainOverlay'

const PREVIEW_LONG_EDGE = 900

const GRID_TOOLS: BottomBarTool[] = [
  { id: 'fondo', label: 'Fondo', icon: <IconDrop /> },
  { id: 'formato', label: 'Formato', icon: <IconCrop /> },
  { id: 'plantilla', label: 'Plantilla', icon: <IconGrid /> },
  { id: 'bordes', label: 'Bordes', icon: <IconFrame /> },
  { id: 'grain', label: 'Grain', icon: <IconGrain /> },
]

const FREE_TOOLS: BottomBarTool[] = [
  { id: 'fondo', label: 'Fondo', icon: <IconDrop /> },
  { id: 'formato', label: 'Formato', icon: <IconCrop /> },
  { id: 'grain', label: 'Grain', icon: <IconGrain /> },
]

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
            onTransformEnd={(e) => {
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
  /** `${templateId}|${orientation}|${aspectRatioId}` — reflowFade below dips whenever this changes. */
  reflowKey: string
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

/** Renders one grid cell per photo. Split out of CollageEditor mainly to keep
 *  that component's render body shorter — nothing here depends on it being a
 *  separate component. */
function GridCellsLayer({
  reflowKey,
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
  // Switching to a different layout, flipping orientation, or changing the
  // canvas aspect ratio re-tiles/rescales every cell at once; each one eases
  // to its new rect independently via animateLayout (in PhotoCell), which is
  // the actual motion the person wants to see — but with no shared clock
  // between cells, they can visibly cross paths or drift out of step with
  // the border/gutter mid-move. A synchronized dip all the way toward
  // transparent used to read as "everything went white for a second" (see
  // git history) and was removed; this floors much higher (0.82) so it
  // softens that crossover into a barely-there cross-fade instead of a flash.
  const reflowFade = useReflowFade(reflowKey, 320, 0.82)

  return (
    <Group opacity={reflowFade}>
      {template.cells.map((cell, i) => {
        const assignment = assignments[i]
        const photo = assignment?.photoId ? photos[assignment.photoId] : null
        const x = contentX + cell.col * (cellW + gutterPx)
        const y = contentY + cell.row * (cellH + gutterPx)
        const w = cellW * cell.colSpan + gutterPx * (cell.colSpan - 1)
        const h = cellH * cell.rowSpan + gutterPx * (cell.rowSpan - 1)
        return (
          <PhotoCell
            key={assignment.cellId}
            x={x}
            y={y}
            width={w}
            height={h}
            animateLayout
            shape={shape}
            grain={grain}
            photo={photo}
            transform={assignment.transform}
            onTransformChange={(t) => onCellTransformChange(assignment.cellId, t)}
            onEmptyClick={() => onEmptyCellClick(assignment.cellId)}
          />
        )
      })}
    </Group>
  )
}

export function CollageEditor() {
  const store = useEditorStore()
  const { photos, collage } = store
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  // True for the CLOSE_MS window between tapping "Hacer otro" and the
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
  // Animated only for CanvasStage's own frame size below — grid cell rects
  // deliberately use the raw (unanimated) targetWidth/targetHeight instead
  // (see contentW/cellW/etc. further down), fed through animateLayout on
  // each PhotoCell instead of this tween, so a slider drag isn't stuck
  // chasing a value that's itself still moving (see BorderEditor's history
  // for the full writeup — same bug, same fix). Since animateLayout has no
  // shared clock across cells, ratio/orientation/template changes are also
  // smoothed by reflowFade's opacity dip below, on top of the position tween.
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)

  const template = useMemo(() => {
    const base = getTemplateById(collage.templateId, collage.photoCount)
    return collage.orientation === 'vertical' ? transposeTemplate(base) : base
  }, [collage.templateId, collage.photoCount, collage.orientation])

  // Raw (unanimated) targetWidth/targetHeight on purpose — outputWidth stays
  // reserved for CanvasStage's own frame size. GridCellsLayer's PhotoCells
  // animate themselves (animateLayout), so feeding them a rect derived from
  // an outer value that's ALSO mid-animation would double-animate (see
  // BorderEditor's git history for that bug). Using the raw target here is
  // what actually lets animateLayout smoothly reorganize cells on a template
  // switch — outputWidth doesn't change for that case at all (only the
  // template does), so without this, cells had nothing to animate from and
  // just snapped straight to their new spot.
  const shortSide = Math.min(targetWidth, targetHeight)
  const outerBorderPx = collage.outerBorderPct * shortSide
  const gutterPx = collage.gutterPct * shortSide
  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = targetWidth - outerBorderPx * 2
  const contentH = targetHeight - outerBorderPx * 2
  const cellW = (contentW - gutterPx * (template.cols - 1)) / template.cols
  const cellH = (contentH - gutterPx * (template.rows - 1)) / template.rows

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
      setUploadError(`Selecciona al menos ${MIN_COLLAGE_PHOTOS} fotos para armar un collage`)
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
            )
          : await exportCollageFree(collage.freeItems, photos, ratio, quality, collage.grainIntensity)
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
        title="Collage"
        onBack={() => store.setMode('home')}
        onUpload={handleUpload}
        onExport={handleExport}
        exportQuality={collage.exportQuality}
        exporting={exporting}
        canExport={hasContent}
        uploadLabel="Agregar fotos"
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
            {m === 'grid' ? 'Plantilla' : 'Libre'}
          </button>
        ))}
      </div>

      <div
        className={`min-h-0 flex-1 p-4 transition-opacity duration-300 ${resetting ? 'opacity-0' : 'opacity-100'}`}
      >
        {hasContent ? (
          <CanvasStage outputWidth={outputWidth} outputHeight={outputHeight}>
            {collage.layoutMode === 'grid'
              ? (
                <GridCellsLayer
                  reflowKey={`${collage.templateId}|${collage.orientation}|${collage.aspectRatioId}`}
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
            label="Toca para subir tus fotos"
            hint="o arrástralas aquí (varias a la vez)"
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
            Eliminar foto
          </button>
        </div>
      )}

      {hasContent && (
        <div className={`transition-opacity duration-300 ${resetting ? 'opacity-0' : 'opacity-100'}`}>
        <EditorBottomBar tools={tools} activeId={activeToolId} onSelect={setActiveTool}>
          {activeToolId === 'formato' && (
            <div>
              <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Formato del lienzo</p>
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
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Orientación</p>
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
                      {o === 'vertical' ? 'Vertical' : 'Horizontal'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Forma</p>
                <div className="flex justify-center gap-2">
                  {(
                    [
                      { shape: 'rect' as const, label: 'Rectangular' },
                      { shape: 'rounded' as const, label: 'Redondeado' },
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
                  Diseño ({collage.photoCount} fotos)
                </p>
                <GridTemplatePicker
                  count={collage.photoCount}
                  value={collage.templateId}
                  shape={collage.shape}
                  orientation={collage.orientation}
                  onChange={store.setCollageTemplateId}
                />
              </div>
              <p className="font-label text-center text-xs text-white/40">Toca una celda vacía en el lienzo para subir una foto.</p>
            </>
          )}

          {activeToolId === 'bordes' && (
            <>
              <BorderThicknessSlider
                label="Borde exterior"
                value={collage.outerBorderPct}
                onChange={(pct) => {
                  store.setOuterBorderPct(pct)
                  if (gutterLinked) store.setGutterPct(pct)
                }}
              />
              <div className="space-y-3">
                <BorderThicknessSlider
                  label="Espacio entre fotos"
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
                    {gutterLinked ? 'Vinculado con el borde exterior ✓' : 'Igualar con el borde exterior'}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeToolId === 'fondo' && (
            <WorkspaceBackgroundPicker value={store.workspaceBackground} onChange={store.setWorkspaceBackground} />
          )}

          {activeToolId === 'grain' && (
            <BorderThicknessSlider
              label="Grano"
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
            setResetting(false)
          }, CLOSE_MS)
        }}
        onGoHome={() => {
          setShowSuccessToast(false)
          store.setMode('home')
        }}
      />
    </div>
  )
}
