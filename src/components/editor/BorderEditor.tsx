import { useEffect, useMemo, useState } from 'react'
import type { ExportQuality } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedColor, useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { computeOutputPixelSize } from '../../lib/cropMath'
import { exportBorderPhoto, exportBorderPhotosBatch, resolveRatio, saveExportedFiles } from '../../lib/exportImage'
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
// Reuses the app's own view-exit/view-enter pair (index.css) — the same
// crossfade+scale already used for full-screen navigation — instead of a
// bespoke opacity-only fade, so every photo swap (first upload, batch
// upload, "create another") reads as one consistent, on-brand motion. Must
// match .view-exit's animation-duration exactly, since the timeout below is
// what actually triggers the content swap.
const EXIT_MS = 200
const MAX_BORDER_BATCH_PHOTOS = 10

export function BorderEditor() {
  const tr = useTranslation()
  const TOOLS: BottomBarTool[] = [
    { id: 'workspace', label: tr.tools.workspace, icon: <IconDrop /> },
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
  // Drives the content area's crossfade for every photo swap (first upload,
  // batch upload, "create another"): 'exiting' plays view-exit on the
  // always-mounted wrapper, then the timeout below applies the actual state
  // change and flips to 'entering', which mounts a freshly-keyed child with
  // view-enter. onAnimationEnd drops back to 'idle' — same pattern App.tsx
  // uses for its own view transitions, and for the same reason: `animation:
  // ... both` pins a transform (and its compositing layer) forever unless
  // the class is removed once the animation finishes, and a permanently
  // composited layer is what breaks iOS taps/drags — this content area sits
  // right on top of PhotoCell's own drag gesture.
  const [swapPhase, setSwapPhase] = useState<'idle' | 'exiting' | 'entering'>('idle')
  const [swapKey, setSwapKey] = useState(0)
  // Starts on 'aspecto' so the panel opens with Aspect already selected the
  // moment a photo lands — the bottom bar itself is gated on `photo` below,
  // so this has no effect until then.
  const [activeTool, setActiveTool] = useState<string | null>('aspecto')
  const [batchTooMany, setBatchTooMany] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  // Rendered files iOS refused to share because the Export tap had already
  // expired (see saveExportedFiles). Held here so the retry button below can
  // hand these exact files to the share sheet from a fresh tap — no re-render.
  const [pendingSave, setPendingSave] = useState<File[] | null>(null)

  useEffect(() => {
    if (!exportError) return
    const t = setTimeout(() => setExportError(null), 4000)
    return () => clearTimeout(t)
  }, [exportError])

  const swapContent = (apply: () => void) => {
    setSwapPhase('exiting')
    setTimeout(() => {
      apply()
      setSwapKey((k) => k + 1)
      setSwapPhase('entering')
    }, EXIT_MS)
  }

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
  // The border's thickness is a proportion of the canvas's SHORT side, and
  // `Math.min(outputWidth, outputHeight)` is the wrong way to get that during
  // a transition: min() of two crossing tweens peaks at the moment the canvas
  // passes through square, so flipping 9:16 -> 16:9 (identical short side at
  // both ends, 506px) made the white border swell to ~139% mid-flip and
  // deflate again — the frame visibly breathing. Tweening the short side
  // itself instead goes 506 -> 506, i.e. a flip now holds the border
  // perfectly steady, and any real short-side change eases monotonically.
  // Still safe: min() of two linear ramps is concave, so it's always >= this
  // straight interpolation between the endpoints — the border can never grow
  // past the canvas mid-animation. Note this is the ratio's tween only; the
  // thickness slider feeds borderThicknessPct straight through below, so it
  // still tracks 1:1 with no added lag.
  const shortSide = useAnimatedNumber(Math.min(targetWidth, targetHeight))
  // Animates the cover<->contain blend itself (not just a CSS transition on the
  // toggle) so the photo's crop eases smoothly instead of snapping when Locked/
  // Unlocked is switched.
  const fitMix = useAnimatedNumber(border.locked ? 0 : 1)

  const borderPx = border.borderThicknessPct * shortSide
  const borderColorHex = getBorderColor(border.borderColor).hex
  // Only the live preview eases between colors — the export just paints the
  // final picked color once, no animation needed for a static file.
  const animatedBorderColorHex = useAnimatedColor(borderColorHex)

  const handleUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    setBatchTooMany(false)
    swapContent(() => {
      addPhotos(loaded)
      setBorderPhoto(loaded[0].id)
    })
  }

  // Same decode path as the single-photo upload (and the same one Collage
  // already uses for up to MAX_COLLAGE_PHOTOS photos at once) — just cap
  // and hand every id to setBorderPhotos instead of one to setBorderPhoto.
  const handleBatchUpload = async (files: FileList) => {
    const loaded = await loadFiles(files)
    if (loaded.length === 0) return
    const capped = loaded.slice(0, MAX_BORDER_BATCH_PHOTOS)
    setBatchTooMany(loaded.length > MAX_BORDER_BATCH_PHOTOS)
    swapContent(() => {
      addPhotos(capped)
      setBorderPhotos(capped.map((p) => p.id))
    })
  }

  const handleExport = async (quality: ExportQuality) => {
    if (!photo) return
    setBorderExportQuality(quality)
    setExporting(true)
    setExportProgress(null)
    setPendingSave(null)
    try {
      const outcome = isBatch
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

      {pendingSave && (
        <button
          type="button"
          onClick={async () => {
            // Runs straight off this tap — no rendering in between — so the
            // activation is still live when the share sheet is asked for.
            const result = await saveExportedFiles(pendingSave)
            if (result === 'saved') {
              setPendingSave(null)
              setShowSuccessToast(true)
            } else if (result === 'dismissed') {
              setPendingSave(null)
            }
          }}
          className="fade-in font-label mx-4 mt-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2.5 text-center text-[11px] font-semibold leading-snug text-white transition duration-200 active:scale-[0.98]"
        >
          {tr.borderEditor.saveNow(pendingSave.length)}
          <span className="mt-0.5 block text-[10px] font-normal text-white/60">
            {tr.borderEditor.readyToSave(pendingSave.length)}
          </span>
        </button>
      )}

      {exportError && (
        <p className="fade-in font-label mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-300">
          {exportError}
        </p>
      )}

      <div className={`min-h-0 flex-1 p-4 ${swapPhase === 'exiting' ? 'view-exit' : ''}`}>
        <div
          key={swapKey}
          className={`h-full ${swapPhase === 'entering' ? 'view-enter' : ''}`}
          onAnimationEnd={() => setSwapPhase((p) => (p === 'entering' ? 'idle' : p))}
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
      </div>

      {photo && (
        <div
          key={swapKey}
          className={swapPhase === 'exiting' ? 'view-exit' : swapPhase === 'entering' ? 'view-enter' : ''}
        >
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
          swapContent(() => resetBorder())
        }}
        onGoHome={() => {
          setShowSuccessToast(false)
          setMode('home')
        }}
      />
    </div>
  )
}
