import { useMemo, useState } from 'react'
import type { ExportQuality } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedColor, useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { computeOutputPixelSize } from '../../lib/cropMath'
import { exportBorderPhoto, exportBorderPhotosBatch, resolveRatio } from '../../lib/exportImage'
import { Toolbar } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { CanvasStage } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { ExportSuccessToast } from './ExportSuccessToast'
import { WorkspaceBackgroundPicker } from './WorkspaceBackgroundPicker'
import { BorderColorPicker } from './BorderColorPicker'
import { getBorderColor } from '../../lib/borderColors'
import { IconCrop, IconDrop, IconFrame, IconGrain, IconSwatch } from './icons'

const PREVIEW_LONG_EDGE = 900
// Slightly gentler than CLOSE_MS (used for the toast's own open/close
// animation, unrelated to this) — the photo->Dropzone cross-fade felt like
// a snap at 300ms, so it eases a bit longer here. Keep the setTimeout below
// and both `duration-[…]` classes in step with this, or the reset will fire
// mid-fade and cut the animation short.
const CONTENT_FADE_MS = 450
const MAX_BORDER_BATCH_PHOTOS = 10

export function BorderEditor() {
  const tr = useTranslation()
  const TOOLS: BottomBarTool[] = [
    { id: 'workspace', label: tr.borderEditor.toolWorkspace, icon: <IconDrop /> },
    { id: 'aspecto', label: tr.borderEditor.toolAspect, icon: <IconCrop /> },
    { id: 'bordes', label: tr.borderEditor.toolBorder, icon: <IconFrame /> },
    { id: 'color', label: tr.borderEditor.toolColor, icon: <IconSwatch /> },
    { id: 'grain', label: tr.borderEditor.toolGrain, icon: <IconGrain /> },
  ]
  const {
    photos,
    border,
    setMode,
    addPhotos,
    setBorderPhoto,
    setBorderPhotos,
    setBorderAspectRatio,
    setBorderRatioOrientation,
    setBorderLocked,
    setBorderThickness,
    setBorderTransform,
    setBorderExportQuality,
    setBorderGrain,
    setBorderColor,
    resetBorder,
    workspaceBackground,
    setWorkspaceBackground,
  } = useEditorStore()
  const { loadFiles } = useImageBitmap()
  const [exporting, setExporting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  // True for the CONTENT_FADE_MS window between tapping "Create another" and the photo
  // actually being cleared — fades the current photo/bottom bar out instead
  // of them just vanishing the instant resetBorder() fires.
  const [resetting, setResetting] = useState(false)
  // Starts on 'aspecto' so the panel opens with Aspect already selected the
  // moment a photo lands — the bottom bar itself is gated on `photo` below,
  // so this has no effect until then.
  const [activeTool, setActiveTool] = useState<string | null>('aspecto')
  const [batchTooMany, setBatchTooMany] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)

  const photo = border.photoId ? photos[border.photoId] : null
  const isBatch = border.batchPhotoIds.length > 1

  const ratio = useMemo(() => {
    const fallback = photo ? photo.width / photo.height : 1
    return resolveRatio(border.aspectRatioId, fallback, border.ratioOrientation)
  }, [border.aspectRatioId, border.ratioOrientation, photo])

  const { width: targetWidth, height: targetHeight } = useMemo(
    () => computeOutputPixelSize(ratio, PREVIEW_LONG_EDGE),
    [ratio],
  )
  // The ONLY animated size in this screen — CanvasStage's frame AND the
  // PhotoCell's rect both derive from this single tween (borderPx below is
  // just a proportion of it), so they can never desync from each other.
  // Two tried-and-reverted alternatives, for the record:
  // - PhotoCell's own animateLayout tween, fed from these same animated
  //   values: double-animates (chases a target that's itself still moving
  //   every frame), so the photo visibly detached from the frame on ratio
  //   changes.
  // - animateLayout fed from the RAW (unanimated) targetWidth/targetHeight
  //   instead: fixes ratio changes in isolation, but empirically still let
  //   the photo drift out of sync with this frame during an orientation
  //   flip, and made the border-thickness slider feel laggy — every 'input'
  //   event during a drag restarts PhotoCell's own tween before the last one
  //   finishes, so it's perpetually chasing the live slider value instead of
  //   tracking it. A slider should track 1:1 with zero added lag anyway.
  const outputWidth = useAnimatedNumber(targetWidth)
  const outputHeight = useAnimatedNumber(targetHeight)
  // Animates the cover<->contain blend itself (not just a CSS transition on the
  // toggle) so the photo's crop eases smoothly instead of snapping when Locked/
  // Unlocked is switched.
  const fitMix = useAnimatedNumber(border.locked ? 0 : 1)

  const borderPx = border.borderThicknessPct * Math.min(outputWidth, outputHeight)
  const borderColorHex = getBorderColor(border.borderColor).hex
  // Only the live preview eases between colors — the export just paints the
  // final picked color once, no animation needed for a static file.
  const animatedBorderColorHex = useAnimatedColor(borderColorHex)

  const handleUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    setBatchTooMany(false)
    addPhotos(loaded)
    setBorderPhoto(loaded[0].id)
  }

  // Same decode path as the single-photo upload (and the same one Collage
  // already uses for up to MAX_COLLAGE_PHOTOS photos at once) — just cap
  // and hand every id to setBorderPhotos instead of one to setBorderPhoto.
  const handleBatchUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    const capped = loaded.slice(0, MAX_BORDER_BATCH_PHOTOS)
    setBatchTooMany(loaded.length > MAX_BORDER_BATCH_PHOTOS)
    addPhotos(capped)
    setBorderPhotos(capped.map((p) => p.id))
  }

  const handleExport = async (quality: ExportQuality) => {
    if (!photo) return
    setBorderExportQuality(quality)
    setExporting(true)
    setExportProgress(null)
    try {
      const saved = isBatch
        ? await exportBorderPhotosBatch(
            border.batchPhotoIds.map((id) => photos[id]).filter((p) => !!p),
            ratio,
            border.borderThicknessPct,
            border.transform,
            quality,
            border.locked,
            border.grainIntensity,
            borderColorHex,
            (done, total) => setExportProgress({ done, total }),
          )
        : await exportBorderPhoto(
            photo,
            ratio,
            border.borderThicknessPct,
            border.transform,
            quality,
            border.locked,
            border.grainIntensity,
            borderColorHex,
          )
      if (saved) setShowSuccessToast(true)
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <Toolbar
        title={tr.borderEditor.title}
        onBack={() => setMode('home')}
        onUpload={isBatch ? handleBatchUpload : handleUpload}
        onExport={handleExport}
        exportQuality={border.exportQuality}
        exporting={exporting}
        exportingLabel={exportProgress ? tr.borderEditor.exportingBatch(exportProgress.done, exportProgress.total) : undefined}
        canExport={!!photo}
        uploadLabel={photo ? tr.borderEditor.changePhoto : tr.borderEditor.uploadPhoto}
        multiple={isBatch}
      />

      {isBatch && (
        <p className="font-label mx-4 mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-[11px] leading-snug text-white/70">
          {tr.borderEditor.batchCount(border.batchPhotoIds.length)}
        </p>
      )}

      <div
        className={`min-h-0 flex-1 p-4 transition-opacity duration-[450ms] ${resetting ? 'opacity-0' : 'opacity-100'}`}
      >
        {photo ? (
          <CanvasStage outputWidth={outputWidth} outputHeight={outputHeight} background={animatedBorderColorHex}>
            <PhotoCell
              x={borderPx}
              y={borderPx}
              width={outputWidth - borderPx * 2}
              height={outputHeight - borderPx * 2}
              photo={photo}
              transform={border.transform}
              onTransformChange={setBorderTransform}
              fit={fitMix}
              grain={border.grainIntensity}
            />
          </CanvasStage>
        ) : (
          <div className="flex h-full w-full flex-col gap-3 sm:flex-row">
            <Dropzone
              label={tr.borderEditor.dropLabel}
              hint={tr.borderEditor.dropHint}
              onFiles={handleUpload}
              multiple={false}
            />
            <Dropzone
              label={tr.borderEditor.dropBatchLabel}
              hint={tr.borderEditor.dropBatchHint(MAX_BORDER_BATCH_PHOTOS)}
              error={batchTooMany ? tr.borderEditor.batchTooMany(MAX_BORDER_BATCH_PHOTOS) : null}
              onFiles={handleBatchUpload}
              multiple
            />
          </div>
        )}
      </div>

      {photo && (
        <div className={`transition-opacity duration-[450ms] ${resetting ? 'opacity-0' : 'opacity-100'}`}>
        <EditorBottomBar tools={TOOLS} activeId={activeTool} onSelect={setActiveTool}>
          {activeTool === 'aspecto' && (
            <div>
              <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.borderEditor.cropHeading}</p>
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
                      {isLocked ? tr.borderEditor.locked : tr.borderEditor.unlocked}
                    </button>
                  ))}
                </div>
                {!border.locked && (
                  <p className="fade-in font-label max-w-[220px] text-center text-[11px] text-white/40">
                    {tr.borderEditor.unlockedHint}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTool === 'bordes' && (
            <BorderThicknessSlider
              label={tr.borderEditor.borderThickness}
              value={border.borderThicknessPct}
              onChange={setBorderThickness}
            />
          )}

          {activeTool === 'workspace' && (
            <WorkspaceBackgroundPicker value={workspaceBackground} onChange={setWorkspaceBackground} />
          )}

          {activeTool === 'color' && (
            <BorderColorPicker value={border.borderColor} onChange={setBorderColor} />
          )}

          {activeTool === 'grain' && (
            <BorderThicknessSlider
              label={tr.borderEditor.grain}
              value={border.grainIntensity}
              onChange={setBorderGrain}
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
            resetBorder()
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
          setMode('home')
        }}
      />
    </div>
  )
}
