import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExportQuality } from '../../types'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { useImageBitmap } from '../../hooks/useImageBitmap'
import { useAnimatedColor, useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { computeOutputPixelSize } from '../../lib/cropMath'
import { MAX_PHOTO_MB, screenPhotoFiles } from '../../lib/photoInput'
import { holdImportCard } from '../../lib/uiTiming'
import { renderBorderPhotoFiles, resolveRatio, saveExportedFiles, yieldToBrowser } from '../../lib/exportImage'
import { Toolbar } from './Toolbar'
import { AspectRatioPicker } from './AspectRatioPicker'
import { BorderThicknessSlider } from './BorderThicknessSlider'
import { CanvasStage, type CanvasStageHandle } from './CanvasStage'
import { PhotoCell } from './PhotoCell'
import { Dropzone } from './Dropzone'
import { EditorBottomBar, type BottomBarTool } from './EditorBottomBar'
import { ExportFlowModal, type ExportFlowPhase } from './ExportFlowModal'
import { ImportProgressModal } from './ImportProgressModal'
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
// Kept below the ten the UI used to allow: even with every export canvas now
// released as soon as it's encoded (see canvasToFile), ten native-resolution
// renders in one run sat close enough to WebKit's per-tab canvas ceiling that
// a photo could come back black. Five leaves real headroom.
const MAX_BORDER_BATCH_PHOTOS = 5

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
  // Why the last selection was (partly) refused: too many, an unsupported
  // format, or a file over the size ceiling. One slot, since a person fixes one
  // reason at a time and stacking three banners over the canvas helps nobody.
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Non-null for exactly as long as a selection is being decoded — see
  // ImportProgressModal for why that window needs something on screen.
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)

  // Screens a raw selection and reports whatever was dropped. Returns null when
  // there's nothing usable left, so callers can just bail.
  const screen = (files: FileList): File[] | null => {
    const { accepted, rejectedType, rejectedSize } = screenPhotoFiles(files)
    setUploadError(
      rejectedType > 0 ? tr.toolbar.unsupportedFormat : rejectedSize > 0 ? tr.toolbar.tooHeavy(MAX_PHOTO_MB) : null,
    )
    return accepted.length > 0 ? accepted : null
  }

  // Decodes behind the progress card, and accounts for whatever the decoder
  // itself refused (a truncated file, a HEIC this browser has no decoder
  // for). Those used to vanish without a word: the batch simply came back
  // shorter than the selection.
  const decode = async (images: File[]) => {
    const startedAt = performance.now()
    setImporting({ done: 0, total: images.length })
    try {
      const loaded = await loadFiles(images, (done, total) => setImporting({ done, total }))
      if (loaded.length < images.length) setUploadError(tr.toolbar.someFailed(images.length - loaded.length))
      return loaded
    } finally {
      // One photo lands almost instantly; without this the card flickers in
      // and out rather than reading as the same step a five-photo import
      // shows.
      await holdImportCard(startedAt, images.length)
      setImporting(null)
    }
  }
  // The export's own modal, from render progress through to the confirmation.
  // Held here (rather than derived from `exporting`) because the modal outlives
  // the render — it stays up, holding the files, until the person actually
  // saves or dismisses it.
  const [exportFlow, setExportFlow] = useState<{
    phase: ExportFlowPhase
    done: number
    total: number
    files: File[]
  } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  // The live preview is taken down for the whole render and rebuilt from
  // scratch afterwards (the epoch below is the Stage's key).
  //
  // WebKit caps the total canvas backing store one tab may hold, and a
  // native-resolution batch spends the entire render sitting against that
  // ceiling. The preview's own canvas is just another claim on it, and the
  // one WebKit picks to blank: the photo behind the export modal turned into
  // a flat grey rectangle mid-batch and STAYED that way afterwards, because a
  // canvas WebKit has dropped doesn't come back on its own — Konva happily
  // redraws into a surface that no longer paints anything. Unmounting hands
  // that memory to the export while it needs it most, and remounting builds a
  // brand-new canvas that draws normally again. (canvasToFile already zeroes
  // each EXPORT canvas as it goes; this is the same problem from the
  // preview's side.)
  const [previewSuspended, setPreviewSuspended] = useState(false)
  // The still shown in the preview's place while it is suspended, captured off
  // the live canvas the instant before it comes down — so the export screen
  // looks exactly as it did rather than opening a hole where the photo was.
  const [frozenPreview, setFrozenPreview] = useState<string | null>(null)
  const stageRef = useRef<CanvasStageHandle>(null)

  useEffect(() => {
    if (!uploadError) return
    const t = setTimeout(() => setUploadError(null), 4000)
    return () => clearTimeout(t)
  }, [uploadError])

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
    const images = screen(files)
    if (!images) return
    const loaded = await decode(images)
    if (loaded.length === 0) return
    swapContent(() => {
      addPhotos(loaded)
      setBorderPhoto(loaded[0].id)
    })
  }

  // Same decode path as the single-photo upload (and the same one Collage
  // already uses for up to MAX_COLLAGE_PHOTOS photos at once) — just cap
  // and hand every id to setBorderPhotos instead of one to setBorderPhoto.
  //
  // iOS's photo picker has no notion of a maximum an <input type="file"> could
  // ask for, so someone can always hand back six. An over-sized selection is
  // rejected WHOLE rather than trimmed to the first five: silently keeping
  // five of six and dropping the sixth reads as the app losing a photo, and
  // there's no way for the person to tell which one went. Nothing is decoded
  // until the count is known to be good, so an over-sized pick costs no memory
  // at all.
  const handleBatchUpload = async (files: FileList) => {
    const images = screen(files)
    if (!images) return
    if (images.length > MAX_BORDER_BATCH_PHOTOS) {
      setUploadError(tr.borderEditor.batchTooMany(MAX_BORDER_BATCH_PHOTOS))
      return
    }
    const loaded = await decode(images)
    if (loaded.length === 0) return
    swapContent(() => {
      addPhotos(loaded)
      setBorderPhotos(loaded.map((p) => p.id))
    })
  }

  // ONE export path, whether there's one photo or five. Nothing here attempts
  // to share off the Export tap: a native-resolution render routinely outlasts
  // WebKit's activation window, and it does so for a single photo on a slow
  // phone just as surely as for a batch. A single photo used to try anyway and
  // fall back to asking for a tap only when that failed — so the same action
  // was a one-tap flow on a fast run and a two-tap flow on a slow one, and
  // neither looked like the batch. Everything renders behind the modal and
  // ends on the same deliberate Save tap.
  const renderExport = async (quality: ExportQuality) => {
    const exportPhotos = exportPhotoList()
    setExportFlow({ phase: 'rendering', done: 0, total: exportPhotos.length, files: [] })
    const files = await renderBorderPhotoFiles(
      exportPhotos,
      // Resolved against each photo's OWN dimensions: with "Original" that
      // keeps every photo its own shape (the live preview can only ever show
      // the first one, so a batch of mixed orientations was quietly being
      // flattened to whatever the first photo was), and with a numeric preset
      // the fallback is ignored and they all come out identical anyway.
      (p) => resolveRatio(border.aspectRatioId, p.width / p.height, border.ratioOrientation),
      border.borderThicknessPct,
      border.transform,
      quality,
      border.locked,
      border.grainIntensity,
      borderColorHex,
      (done, total) => setExportFlow((s) => (s ? { ...s, done, total } : s)),
    )
    setExportFlow({ phase: 'ready', done: files.length, total: files.length, files })
  }

  const handleSave = async () => {
    if (!exportFlow) return
    // iOS spends a few seconds writing several photos to the library, and the
    // share promise doesn't settle until it's done — without this the card sat
    // on "Save 5 photos" the whole time, looking like the tap hadn't landed.
    setExportFlow((s) => (s ? { ...s, phase: 'saving' } : s))
    const result = await saveExportedFiles(exportFlow.files)
    // Anything but a save leaves the files in hand and the card back on its
    // button — backing out of the share sheet shouldn't throw the render away.
    setExportFlow((s) => (s ? { ...s, phase: result === 'saved' ? 'saved' : 'ready' } : s))
  }

  /** Every photo this export covers: the whole batch, or the single one. */
  const exportPhotoList = () =>
    isBatch ? border.batchPhotoIds.map((id) => photos[id]).filter((p) => !!p) : photo ? [photo] : []

  const handleExport = async (quality: ExportQuality) => {
    if (!photo) return
    setBorderExportQuality(quality)
    setExporting(true)
    // The modal goes up BEFORE the preview comes down, so the two swap in the
    // same frame — set the other way round, the export screen was blank, with
    // nothing to say why, for as long as the render took.
    setExportFlow({ phase: 'rendering', done: 0, total: exportPhotoList().length, files: [] })
    setFrozenPreview(stageRef.current?.snapshot() ?? null)
    setPreviewSuspended(true)
    // One frame with the preview already swapped for its still before the
    // first decode starts — without it React's re-render is queued behind the
    // whole synchronous render loop, so the canvas would still be up for
    // exactly the window it needed to be out of. yieldToBrowser, not a bare
    // requestAnimationFrame: a backgrounded tab gets no frames at all, and
    // waiting on one there stalled the export before it had rendered a single
    // photo.
    await yieldToBrowser()
    try {
      await renderExport(quality)
    } catch {
      // Nothing upstream ever surfaced a failed export — it just quietly
      // reset the button, with no way to tell a real error apart from a
      // dismissed share sheet. Whatever the cause (a canvas too large for
      // this device to render, an out-of-memory decode, ...), the person
      // needs SOME signal instead of silence.
      setExportError(tr.toolbar.exportFailed)
      // A batch that threw mid-render has no files to offer — take its modal
      // down so the error banner isn't hidden behind a stalled progress card.
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

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <Toolbar
        title={tr.borderEditor.title}
        onBack={() => setMode('home')}
        onUpload={isBatch ? handleBatchUpload : handleUpload}
        onExport={handleExport}
        exportQuality={border.exportQuality}
        exporting={exporting}
        canExport={!!photo}
        uploadLabel={photo ? tr.borderEditor.changePhoto : tr.borderEditor.uploadPhoto}
        multiple={isBatch}
      />

      {isBatch && (
        // mt-2 here is matched by the pt-2 the canvas area takes on while this
        // banner is up (see below), so the two gaps stay equal — the banner
        // reads as its own row rather than as something stuck to the toolbar —
        // while both are tight enough to hand the extra height to the photo.
        <p className="font-label mx-4 mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-[11px] leading-snug text-white/70">
          {tr.borderEditor.batchCount(border.batchPhotoIds.length)}
        </p>
      )}

      {/* Neither the picker's limits nor its accept list are enforceable, so
          this is the only place a refused selection gets accounted for —
          without it, picking six (or a RAW file) just looks like the app
          ignoring you. */}
      {uploadError && (
        <p className="fade-in font-label mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-300">
          {uploadError}
        </p>
      )}

      {exportError && (
        <p className="fade-in font-label mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-300">
          {exportError}
        </p>
      )}

      {/* Tighter above the canvas whenever the batch banner is up: that row
          costs height the photo would otherwise have, and its own margin is
          matched to this so the banner stays centred between the two rules. */}
      <div
        className={`min-h-0 flex-1 px-4 pb-4 ${isBatch ? 'pt-2' : 'pt-4'} ${
          swapPhase === 'exiting' ? 'view-exit' : ''
        }`}
      >
        <div
          key={swapKey}
          className={`h-full ${swapPhase === 'entering' ? 'view-enter' : ''}`}
          onAnimationEnd={() => setSwapPhase((p) => (p === 'entering' ? 'idle' : p))}
        >
          {photo ? (
            <CanvasStage
              ref={stageRef}
              frozenSrc={previewSuspended ? frozenPreview : null}
              outputWidth={outputWidth}
              outputHeight={outputHeight}
              background={animatedBorderColorHex}
            >
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
                hint={tr.borderEditor.dropHint(MAX_PHOTO_MB)}
                onFiles={handleUpload}
                multiple={false}
              />
              <Dropzone
                label={tr.borderEditor.dropBatchLabel}
                hint={tr.borderEditor.dropBatchHint(MAX_BORDER_BATCH_PHOTOS, MAX_PHOTO_MB)}
                error={uploadError}
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

      <ImportProgressModal open={!!importing} done={importing?.done ?? 0} total={importing?.total ?? 0} />

      <ExportFlowModal
        open={!!exportFlow}
        phase={exportFlow?.phase ?? 'rendering'}
        done={exportFlow?.done ?? 0}
        total={exportFlow?.total ?? 0}
        onSave={handleSave}
        onClose={() => setExportFlow(null)}
        onCreateAnother={() => {
          setExportFlow(null)
          swapContent(() => resetBorder())
        }}
        onGoHome={() => {
          setExportFlow(null)
          setMode('home')
        }}
      />
    </div>
  )
}
