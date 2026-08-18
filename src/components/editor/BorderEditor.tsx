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

const PREVIEW_LONG_EDGE = 900

export function BorderEditor() {
  const {
    photos,
    border,
    setMode,
    addPhotos,
    setBorderPhoto,
    setBorderAspectRatio,
    setBorderManualRatio,
    setBorderThickness,
    setBorderTransform,
    setBorderExportQuality,
    resetBorder,
  } = useEditorStore()
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)

  const photo = border.photoId ? photos[border.photoId] : null

  const ratio = useMemo(() => {
    if (border.aspectRatioId === 'manual') {
      return border.manualRatioW / border.manualRatioH
    }
    const fallback = photo ? photo.width / photo.height : 1
    return resolveRatio(border.aspectRatioId, fallback)
  }, [border.aspectRatioId, border.manualRatioW, border.manualRatioH, photo])

  const { width: targetWidth, height: targetHeight } = useMemo(
    () => computeOutputPixelSize(ratio, PREVIEW_LONG_EDGE),
    [ratio],
  )
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)

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
      await exportBorderPhoto(photo, ratio, border.borderThicknessPct, border.transform, quality)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <Toolbar
        title="Bordes blancos"
        onBack={() => {
          setMode('home')
          resetBorder()
        }}
        onUpload={handleUpload}
        onExport={handleExport}
        exportQuality={border.exportQuality}
        exporting={exporting}
        canExport={!!photo}
        uploadLabel={photo ? 'Cambiar foto' : 'Subir foto'}
      />

      <div className="min-h-0 flex-1 p-4">
        {photo ? (
          <CanvasStage outputWidth={outputWidth} outputHeight={outputHeight}>
            <PhotoCell
              x={borderPx}
              y={borderPx}
              width={outputWidth - borderPx * 2}
              height={outputHeight - borderPx * 2}
              photo={photo}
              transform={border.transform}
              onTransformChange={setBorderTransform}
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
        <div className="space-y-4 border-t border-polar-100 bg-white p-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Recorte</p>
            <AspectRatioPicker value={border.aspectRatioId} onChange={setBorderAspectRatio} />
            {border.aspectRatioId === 'manual' && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-slate-500">Proporción</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={border.manualRatioW}
                  onChange={(e) => setBorderManualRatio(Number(e.target.value), border.manualRatioH)}
                  className="w-16 rounded-lg border border-polar-200 px-2 py-1 text-center text-sm text-slate-700 focus:border-polar-500 focus:outline-none"
                />
                <span className="text-slate-400">:</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={border.manualRatioH}
                  onChange={(e) => setBorderManualRatio(border.manualRatioW, Number(e.target.value))}
                  className="w-16 rounded-lg border border-polar-200 px-2 py-1 text-center text-sm text-slate-700 focus:border-polar-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">ancho : alto</span>
              </div>
            )}
          </div>
          <BorderThicknessSlider
            label="Grosor del borde"
            value={border.borderThicknessPct}
            onChange={setBorderThickness}
          />
          <p className="text-xs text-slate-400">
            Arrastra la foto para reencuadrar y usa la rueda o el gesto de pellizco para hacer zoom.
          </p>
        </div>
      )}
    </div>
  )
}
