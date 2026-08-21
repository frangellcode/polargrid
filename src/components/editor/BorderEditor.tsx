import { useMemo, useState } from 'react'
import type { ExportQuality } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { computeOutputPixelSize } from '../../lib/cropMath'
import { exportBorderPhoto, resolveRatio } from '../../lib/exportImage'
import { Toolbar } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { CanvasStage } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { CLOSE_MS, ExportSuccessToast } from './ExportSuccessToast'
import { WorkspaceBackgroundPicker } from './WorkspaceBackgroundPicker'
import { IconCrop, IconDrop, IconFrame } from './icons'

const PREVIEW_LONG_EDGE = 900

const TOOLS: BottomBarTool[] = [
  { id: 'fondo', label: 'Fondo', icon: <IconDrop /> },
  { id: 'recorte', label: 'Recorte', icon: <IconCrop /> },
  { id: 'bordes', label: 'Bordes', icon: <IconFrame /> },
]

export function BorderEditor() {
  const {
    photos,
    border,
    setMode,
    addPhotos,
    setBorderPhoto,
    setBorderAspectRatio,
    setBorderRatioOrientation,
    setBorderLocked,
    setBorderThickness,
    setBorderTransform,
    setBorderExportQuality,
    resetBorder,
    workspaceBackground,
    setWorkspaceBackground,
  } = useEditorStore()
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  // True for the CLOSE_MS window between tapping "Hacer otro" and the photo
  // actually being cleared — fades the current photo/bottom bar out instead
  // of them just vanishing the instant resetBorder() fires.
  const [resetting, setResetting] = useState(false)
  // Starts on 'recorte' so the panel opens with Recorte already selected the
  // moment a photo lands — the bottom bar itself is gated on `photo` below,
  // so this has no effect until then.
  const [activeTool, setActiveTool] = useState<string | null>('recorte')

  const photo = border.photoId ? photos[border.photoId] : null

  const ratio = useMemo(() => {
    const fallback = photo ? photo.width / photo.height : 1
    return resolveRatio(border.aspectRatioId, fallback, border.ratioOrientation)
  }, [border.aspectRatioId, border.ratioOrientation, photo])

  const { width: targetWidth, height: targetHeight } = useMemo(
    () => computeOutputPixelSize(ratio, PREVIEW_LONG_EDGE),
    [ratio],
  )
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)
  // Animates the cover<->contain blend itself (not just a CSS transition on the
  // toggle) so the photo's crop eases smoothly instead of snapping when Bloqueada/
  // Desbloqueada is switched.
  const fitMix = useAnimatedNumber(border.locked ? 0 : 1)

  const borderPx = border.borderThicknessPct * Math.min(outputWidth, outputHeight)

  const handleUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    addPhotos(loaded)
    setBorderPhoto(loaded[0].id)
  }

  const handleExport = async (quality: ExportQuality) => {
    if (!photo) return
    setBorderExportQuality(quality)
    setExporting(true)
    try {
      const saved = await exportBorderPhoto(photo, ratio, border.borderThicknessPct, border.transform, quality, border.locked)
      if (saved) setShowSuccessToast(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <Toolbar
        title="Bordes blancos"
        onBack={() => setMode('home')}
        onUpload={handleUpload}
        onExport={handleExport}
        exportQuality={border.exportQuality}
        exporting={exporting}
        canExport={!!photo}
        uploadLabel={photo ? 'Cambiar foto' : 'Subir foto'}
      />

      <div
        className={`min-h-0 flex-1 p-4 transition-opacity duration-300 ${resetting ? 'opacity-0' : 'opacity-100'}`}
      >
        {photo ? (
          <CanvasStage outputWidth={outputWidth} outputHeight={outputHeight}>
            <PhotoCell
              x={borderPx}
              y={borderPx}
              width={outputWidth - borderPx * 2}
              height={outputHeight - borderPx * 2}
              animateLayout
              photo={photo}
              transform={border.transform}
              onTransformChange={setBorderTransform}
              fit={fitMix}
            />
          </CanvasStage>
        ) : (
          <Dropzone
            label="Toca para subir una foto"
            hint="o arrástrala aquí"
            onFiles={handleUpload}
            multiple={false}
          />
        )}
      </div>

      {photo && (
        <div className={`transition-opacity duration-300 ${resetting ? 'opacity-0' : 'opacity-100'}`}>
        <EditorBottomBar tools={TOOLS} activeId={activeTool} onSelect={setActiveTool}>
          {activeTool === 'recorte' && (
            <div>
              <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Recorte</p>
              <AspectRatioPicker
                value={border.aspectRatioId}
                onChange={setBorderAspectRatio}
                orientation={border.ratioOrientation}
                onOrientationChange={setBorderRatioOrientation}
              />
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <div className="flex justify-center gap-2">
                  {([true, false] as const).map((isLocked) => (
                    <button
                      key={String(isLocked)}
                      type="button"
                      onClick={() => setBorderLocked(isLocked)}
                      className={`font-label rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-200 active:scale-90 ${
                        border.locked === isLocked
                          ? 'bg-white text-ink-900'
                          : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {isLocked ? 'Bloqueada' : 'Desbloqueada'}
                    </button>
                  ))}
                </div>
                {!border.locked && (
                  <p className="fade-in font-label max-w-[220px] text-center text-[11px] text-white/40">
                    El borde se ajusta para mostrar la foto completa, sin recortarla
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTool === 'bordes' && (
            <BorderThicknessSlider
              label="Grosor del borde"
              value={border.borderThicknessPct}
              onChange={setBorderThickness}
            />
          )}

          {activeTool === 'fondo' && (
            <WorkspaceBackgroundPicker value={workspaceBackground} onChange={setWorkspaceBackground} />
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
            resetBorder()
            setResetting(false)
          }, CLOSE_MS)
        }}
        onGoHome={() => {
          setShowSuccessToast(false)
          setMode('home')
        }}
      />
    </div>
  )
}
