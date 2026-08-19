import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { ExportQuality } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { COLLAGE_ASPECT_RATIOS } from '../../lib/aspectRatios'
import { computeOutputPixelSize, getImageDrawRect } from '../../lib/cropMath'
import { MAX_COLLAGE_PHOTOS, getTemplate, transposeTemplate } from '../../lib/collageTemplates'
import { exportCollageFree, exportCollageGrid, resolveRatio } from '../../lib/exportImage'
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
import { IconCrop, IconDrop, IconFrame, IconGrid } from './icons'

const PREVIEW_LONG_EDGE = 900

const GRID_TOOLS: BottomBarTool[] = [
  { id: 'fondo', label: 'Fondo', icon: <IconDrop /> },
  { id: 'formato', label: 'Formato', icon: <IconCrop /> },
  { id: 'plantilla', label: 'Plantilla', icon: <IconGrid /> },
  { id: 'bordes', label: 'Bordes', icon: <IconFrame /> },
]

const FREE_TOOLS: BottomBarTool[] = [
  { id: 'fondo', label: 'Fondo', icon: <IconDrop /> },
  { id: 'formato', label: 'Formato', icon: <IconCrop /> },
]

interface FreeItemsLayerProps {
  outputWidth: number
  outputHeight: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function FreeItemsLayer({ outputWidth, outputHeight, selectedId, onSelect }: FreeItemsLayerProps) {
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

export function CollageEditor() {
  const store = useEditorStore()
  const { photos, collage } = store
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [pendingCellId, setPendingCellId] = useState<string | null>(null)
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [gutterLinked, setGutterLinked] = useState(false)
  const toolbarRef = useRef<ToolbarHandle>(null)

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

  const template = useMemo(() => {
    const base = getTemplate(collage.photoCount, collage.style)
    return collage.orientation === 'vertical' ? transposeTemplate(base) : base
  }, [collage.photoCount, collage.style, collage.orientation])

  const shortSide = Math.min(outputWidth, outputHeight)
  const outerBorderPx = collage.outerBorderPct * shortSide
  const gutterPx = collage.gutterPct * shortSide
  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = outputWidth - outerBorderPx * 2
  const contentH = outputHeight - outerBorderPx * 2
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
    store.addCollagePhotos(loaded)
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
            )
          : await exportCollageFree(collage.freeItems, photos, ratio, quality)
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
        onBack={() => {
          store.setMode('home')
          store.resetCollage()
        }}
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

      <div className="min-h-0 flex-1 p-4">
        {hasContent ? (
          <CanvasStage outputWidth={outputWidth} outputHeight={outputHeight}>
            {collage.layoutMode === 'grid'
              ? template.cells.map((cell, i) => {
                  const assignment = collage.assignments[i]
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
                      photo={photo}
                      transform={assignment.transform}
                      onTransformChange={(t) => store.setCellTransform(assignment.cellId, t)}
                      onEmptyClick={() => {
                        setPendingCellId(assignment.cellId)
                        toolbarRef.current?.openFilePicker()
                      }}
                    />
                  )
                })
              : (
                <FreeItemsLayer
                  outputWidth={outputWidth}
                  outputHeight={outputHeight}
                  selectedId={selectedFreeId}
                  onSelect={setSelectedFreeId}
                />
              )}
          </CanvasStage>
        ) : (
          <Dropzone label="Toca para subir tus fotos" hint="o arrástralas aquí (varias a la vez)" onFiles={handleUpload} />
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
            <div className="flex flex-wrap justify-center gap-4">
              <div>
                <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Estilo</p>
                <div className="flex justify-center gap-2">
                  {(['normal', 'creative'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => store.setCollageStyle(s)}
                      className={`font-label rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
                        collage.style === s ? 'bg-white text-ink-900' : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {s === 'normal' ? 'Normal' : 'Creativo'}
                    </button>
                  ))}
                </div>
              </div>
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
            </div>
            <div>
              <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">
                Cantidad de fotos (máx. {MAX_COLLAGE_PHOTOS})
              </p>
              <GridTemplatePicker
                value={collage.photoCount}
                style={collage.style}
                orientation={collage.orientation}
                onChange={store.setCollagePhotoCount}
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
            <div className="space-y-1.5">
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
      </EditorBottomBar>

      <ExportSuccessToast
        open={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
        onCreateAnother={() => {
          setShowSuccessToast(false)
          store.setMode('home')
          store.resetCollage()
        }}
      />
    </div>
  )
}
