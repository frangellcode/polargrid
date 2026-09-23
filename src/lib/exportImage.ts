import type { CellAssignment, CellShape, ExportQuality, FreeItem, GridTemplate, LoadedPhoto, Orientation, PhotoFit, PhotoTransform } from '../types'
import { computeNativeCanvasSize, computeNativeCanvasSizeContain, computeOutputPixelSize, getImageDrawRect } from './cropMath'
import { ASPECT_RATIOS } from './aspectRatios'
import { capLongEdge, getMaxLongEdge } from './exportQuality'
import { traceShapePath } from './shapeClip'
import { drawGrainOverlay, seededRandom } from './grain'
import { isNativeApp } from './native'
import { readPhoto } from './photoSource'
import { composeBands, resetNativeExports, shareFilesNatively, writeBand, writeExport } from './nativeSave'
import type { ExportedImage } from './nativeSave'

export type { ExportedImage } from './nativeSave'

const JPEG_QUALITY = 1.0

/** Presets store their ratio in portrait form — flip to landscape (1/ratio) for orientable presets. */
export function resolveRatio(aspectRatioId: string, fallbackRatio: number, orientation: Orientation = 'vertical'): number {
  const preset = ASPECT_RATIOS.find((r) => r.id === aspectRatioId)
  if (!preset || preset.ratio == null) return fallbackRatio
  return preset.orientable && orientation === 'horizontal' ? 1 / preset.ratio : preset.ratio
}

/** Decodes the ONE photo actually being drawn right now, at full resolution,
 *  straight from its original file — never held any longer than this single
 *  draw call. Exporting a batch/collage this way means at most one full
 *  camera-resolution bitmap exists at a time, no matter how many photos are
 *  in it; holding all of them decoded at once (as every photo's LoadedPhoto
 *  used to) is what was exceeding iOS's per-tab memory budget and getting
 *  the whole app killed and silently reloaded on a phone with less RAM than
 *  an iPad. */
async function drawPhotoInRect(
  ctx: CanvasRenderingContext2D,
  photo: LoadedPhoto,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  transform: PhotoTransform,
  rotationDeg = 0,
  fit: PhotoFit = 'cover',
  shape: CellShape = 'rect',
  grainIntensity = 0,
  /** Same seed on every band of one export, so the grain lines up across them. */
  grainSeed?: number,
) {
  if (rectW <= 0 || rectH <= 0) return
  const bitmap = await createImageBitmap(await readPhoto(photo.file), { imageOrientation: 'from-image' })
  try {
    ctx.save()
    ctx.translate(rectX + rectW / 2, rectY + rectH / 2)
    if (rotationDeg) ctx.rotate((rotationDeg * Math.PI) / 180)
    ctx.translate(-rectW / 2, -rectH / 2)
    traceShapePath(ctx, shape, rectW, rectH)
    ctx.clip()
    const draw = getImageDrawRect(rectW, rectH, photo.width, photo.height, transform, fit)
    ctx.drawImage(bitmap, draw.x, draw.y, draw.width, draw.height)
    // Grain is drawn over the photo's own rect, intersected with the cell's own
    // bounds — NOT the raw draw size. In 'contain' fit the photo can letterbox
    // inside the cell smaller than it, which is why this isn't just rectW/rectH
    // (grain over the full cell would speckle noise onto that empty gap). But
    // in 'cover' fit (the common case) `draw` routinely OVERSHOOTS the cell —
    // any time the photo's aspect ratio doesn't match the crop, or the person
    // zoomed in — and the shape clip above trims that overflow at render time
    // anyway, so sizing the grain canvas itself to the full uncropped draw size
    // was pure waste at best. At worst, for a native-resolution export with a
    // zoomed-in mismatched-aspect photo, `draw` can balloon to many times the
    // cell size, and grain.ts allocates a same-proportioned noise canvas from
    // whatever size it's given — large enough to blow past a canvas's real
    // pixel-area limit and throw, silently failing the whole export.
    const grainX = Math.max(0, draw.x)
    const grainY = Math.max(0, draw.y)
    const grainW = Math.max(0, Math.min(rectW, draw.x + draw.width) - grainX)
    const grainH = Math.max(0, Math.min(rectH, draw.y + draw.height) - grainY)
    ctx.save()
    ctx.translate(grainX, grainY)
    drawGrainOverlay(ctx, grainW, grainH, grainIntensity, grainSeed === undefined ? Math.random : seededRandom(grainSeed))
    ctx.restore()
    ctx.restore()
  } finally {
    bitmap.close()
  }
}

/** What happened to an export.
 *  - `saved`: the file(s) reached the share sheet / download.
 *  - `dismissed`: the person backed out of the share sheet — not an error.
 *  - `needs-gesture`: the files are rendered and ready, but the browser refused
 *    to open the share sheet because the tap that started the export had already
 *    expired. The caller must hand them back to saveExportedFiles() from a fresh
 *    tap (see saveExportedFiles below for why this can't be papered over here). */
export type SaveResult = 'saved' | 'dismissed' | 'needs-gesture'

/** Saves or shares the rendered file(s). A batch is always passed as a SINGLE
 *  array to ONE navigator.share() call (not one call per file): calling share()
 *  again per file would fire without a fresh user gesture on the 2nd+ call and get
 *  silently rejected, and would mean N separate share-sheet prompts instead of one
 *  native "Save 10 Images" action.
 *
 *  Every caller reaches this from a deliberate tap on the export modal's own
 *  Save button, so the activation is always fresh — `needs-gesture` is the
 *  safety net for the cases where WebKit rejects it anyway (a tap it decided
 *  had expired), not the normal course of events it used to be. */
/** Whether saving should go through the share sheet rather than a download.
 *
 *  On a phone or tablet the sheet is the right answer: an installed iOS PWA
 *  can't download through an <a download> anchor at all (Safari opens its own
 *  full-screen blob viewer instead — the "black screen"), and on Android the
 *  sheet hands a whole batch to Photos or Files in one action.
 *
 *  On a desktop it is the WRONG answer, and this check exists because it was
 *  being used there: Chrome on Windows and Safari on macOS both implement
 *  navigator.share, so the export opened the OS share dialog — which offers
 *  Mail and AirDrop and nearby devices, but no way to simply save the file to
 *  the machine you're sitting at. A desktop download is not broken and needs no
 *  workaround, so it doesn't get one.
 *
 *  Pointer type, not the user agent string: what actually matters is whether
 *  this is a touch device, and `hover: none` + `pointer: coarse` is the honest
 *  question to ask. */
function prefersShareSheet(): boolean {
  return window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
}

export async function saveExportedFiles(images: ExportedImage[]): Promise<SaveResult> {
  if (images.length === 0) return 'dismissed'

  if (isNativeApp) return shareFilesNatively(images)

  // Only the native build ever produces anything but a File.
  const files = images.filter((image): image is File => image instanceof File)

  // Where the sheet is the right path it is the ONLY path — never fall back to
  // the anchor there. In an iOS PWA each anchor click replaces the previous
  // one, so a batch would put only its LAST photo into the blob viewer.
  if (prefersShareSheet() && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files })
      return 'saved'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'dismissed'
      // Anything else (NotAllowedError from a stale activation, most often)
      // means the sheet never opened. Ask for a fresh tap rather than dumping
      // the batch into the blob viewer one file at a time.
      return 'needs-gesture'
    }
  }

  // Desktop (and any touch device without file sharing): one <a download>
  // click per file. Browsers may prompt to allow "this site is downloading
  // multiple files" starting on the 2nd — a browser-level protection, not
  // something to route around here.
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking synchronously can pull the blob out from under a download the
    // browser hasn't started reading yet; one turn of the event loop is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return 'saved'
}

/** Encodes the canvas and then RELEASES it. WebKit caps the total canvas
 *  backing store a tab may hold and doesn't reclaim it promptly when a canvas
 *  merely falls out of scope — during a ten-photo batch that ceiling is hit
 *  partway through, and past it Safari hands back canvases that silently draw
 *  nothing. That's what turned one photo of a batch entirely black, and what
 *  blanked the live preview mid-export. Zeroing the dimensions frees the
 *  backing store immediately rather than whenever GC gets around to it. */
async function canvasToFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('Could not generate the image')
    return new File([blob], filename, { type: 'image/jpeg' })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** How long the batch waits for a frame that may never come before carrying on
 *  anyway. Long enough that a visible tab always paints first (a frame is
 *  ~16ms), short enough that a hidden one doesn't crawl. */
const YIELD_FALLBACK_MS = 200

/** Hands the main thread back for a frame. Without this the batch loop is one
 *  unbroken run of synchronous canvas work: Safari never gets a turn to retire
 *  the buffers just released above, and the app shell can't repaint the
 *  progress counter either.
 *
 *  The timer is not belt-and-braces: a hidden tab gets NO animation frames at
 *  all, so waiting on rAF alone stops the batch dead the moment the phone
 *  locks or the person switches apps — it then sits at "2/5" until they come
 *  back, which is indistinguishable from a hang. Whichever of the two arrives
 *  first wins, so a visible tab still yields a real frame and an invisible one
 *  keeps working through its (throttled, but live) timers. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    requestAnimationFrame(() => setTimeout(finish, 0))
    setTimeout(finish, YIELD_FALLBACK_MS)
  })
}

/** The rows of the final image one paint call is drawing. On the web it's
 *  always the whole image; in the native build it's one band of it. */
interface Band {
  top: number
  bottom: number
}

/** Whether something drawn at (y, h) — rotated about its centre by
 *  `rotationDeg`, with width `w` — can reach into `band`. Painting skips what
 *  can't, so a band only pays to decode the photos that actually cross it. */
function reachesBand(band: Band, y: number, w: number, h: number, rotationDeg = 0): boolean {
  if (!rotationDeg) return y < band.bottom && y + h > band.top
  const reach = Math.hypot(w, h) / 2
  const centerY = y + h / 2
  return centerY - reach < band.bottom && centerY + reach > band.top
}

/** Pixels per band in the native build: a canvas WebKit holds comfortably,
 *  alongside the one full-resolution photo decoded to draw into it. */
const NATIVE_BAND_AREA = 16_000_000

function createExportCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

/** Reports how far one export has got, 0..1. */
type Progress = (fraction: number) => void

/** Draws the part of the export that falls in `band`, calling `report` with
 *  how much of that drawing is done (0..1) as it goes. */
type Paint = (ctx: CanvasRenderingContext2D, band: Band, report: Progress) => Promise<void>

/** Turns the steps of one render into a single 0..1 figure. Each step counts
 *  the same; drawing, the one step made of many smaller ones (a collage's
 *  photos), also reports its progress within itself. */
function progressMeter(steps: number, onProgress?: Progress) {
  let done = 0
  return {
    partial: (fraction: number) => onProgress?.((done + Math.max(0, Math.min(1, fraction))) / steps),
    step: () => {
      done += 1
      onProgress?.(done / steps)
    },
  }
}

/** Renders a width x height export by calling `paint` with a context in the
 *  final image's own coordinates.
 *
 *  On the web that's one canvas, capped (see exportQuality.ts) to what WebKit
 *  will render. The native build isn't bound by that cap: it paints the image
 *  in horizontal bands — the context is translated so `paint` never knows —
 *  and has iOS join the bands into one JPEG on disk. The full image never
 *  exists in the webview's memory, which is what makes a full-resolution
 *  nine-photo collage possible at all. An image that fits in one band (a
 *  bordered photo, practically always) skips the joining: its one band IS the
 *  finished JPEG.
 *
 *  Resolves as soon as the drawing is done, with `result` still encoding and
 *  saving. In the native build a batch starts drawing the next photo in that
 *  time, so the two overlap instead of queueing. */
async function startRender(
  width: number,
  height: number,
  filename: string,
  paint: Paint,
  onProgress?: Progress,
): Promise<{ result: Promise<ExportedImage> }> {
  if (!isNativeApp) {
    const meter = progressMeter(2, onProgress)
    const { canvas, ctx } = createExportCanvas(width, height)
    await paint(ctx, { top: 0, bottom: height }, meter.partial)
    meter.step()
    return { result: canvasToFile(canvas, filename).finally(meter.step) }
  }

  const bandHeight = Math.max(1, Math.min(height, Math.floor(NATIVE_BAND_AREA / width)))
  const bandCount = Math.ceil(height / bandHeight)
  if (bandCount === 1) {
    const meter = progressMeter(2, onProgress)
    const { canvas, ctx } = createExportCanvas(width, height)
    await paint(ctx, { top: 0, bottom: height }, meter.partial)
    meter.step()
    const result = canvasToFile(canvas, filename).then((file) => writeExport(file, filename))
    return { result: result.finally(meter.step) }
  }

  // Drawing, then encoding + saving, for every band, then the join.
  const meter = progressMeter(bandCount * 2 + 1, onProgress)
  const bands: Promise<string>[] = []
  for (let top = 0; top < height; top += bandHeight) {
    const bottom = Math.min(height, top + bandHeight)
    const { canvas, ctx } = createExportCanvas(width, bottom - top)
    ctx.translate(0, -top)
    await paint(ctx, { top, bottom }, meter.partial)
    meter.step()
    // The band before this one had until now to finish encoding; waiting for
    // it here keeps at most two band canvases alive at once.
    if (bands.length > 0) await bands[bands.length - 1]
    const index = bands.length
    bands.push(
      canvasToFile(canvas, filename)
        .then((file) => writeBand(file, filename, index))
        .finally(meter.step),
    )
    await yieldToBrowser()
  }
  const result = Promise.all(bands).then((paths) => composeBands(width, height, paths, filename, JPEG_QUALITY))
  return { result: result.finally(meter.step) }
}

async function startBorderImage(
  photo: LoadedPhoto,
  ratio: number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality,
  locked: boolean,
  grainIntensity: number,
  borderColorHex: string,
  filename: string,
  onProgress?: Progress,
): Promise<{ result: Promise<ExportedImage> }> {
  const sizeFn = locked ? computeNativeCanvasSize : computeNativeCanvasSizeContain
  // Cap the PHOTO's own resolution to the quality tier first, then build the
  // bordered canvas around that. Capping the final (photo + border) canvas
  // instead — as this used to — meant a thicker border ate into the same
  // pixel budget as the photo, so "High"/"Web" got visibly softer just from
  // adding a border. This way the border only ever adds pixels on top.
  const { width: effPhotoW, height: effPhotoH } = capLongEdge(photo.width, photo.height, getMaxLongEdge(quality))
  const { width, height } = sizeFn(effPhotoW, effPhotoH, ratio, borderThicknessPct, transform.zoom)
  const borderPx = borderThicknessPct * Math.min(width, height)
  const grainSeed = Math.floor(Math.random() * 2 ** 32)
  return startRender(
    width,
    height,
    filename,
    async (ctx, _band, report) => {
      ctx.fillStyle = borderColorHex
      ctx.fillRect(0, 0, width, height)
      await drawPhotoInRect(
        ctx,
        photo,
        borderPx,
        borderPx,
        width - borderPx * 2,
        height - borderPx * 2,
        transform,
        0,
        locked ? 'cover' : 'contain',
        'rect',
        grainIntensity,
        grainSeed,
      )
      report(1)
    },
    onProgress,
  )
}

/** Same shared adjustment (ratio/border/transform/etc.) rendered against every
 *  photo in `photos`, returned as files — WITHOUT saving them. This is the only
 *  border export path, for one photo as much as for fifteen.
 *
 *  Nothing here can reach the share sheet off the tap that started it: a
 *  native-resolution render routinely outlives WebKit's activation window, and
 *  a single photo on a slow phone outlives it just as surely as a batch does.
 *  Rather than try, fail, and recover — which made a fast run and a slow run
 *  two visibly different flows — every export renders here and the caller asks
 *  for one deliberate tap to hand the result to saveExportedFiles(). */
export async function renderBorderPhotoFiles(
  photos: LoadedPhoto[],
  /**
   * The output ratio for ONE photo, asked per photo rather than fixed for the
   * whole batch.
   *
   * "Original" is the whole reason: it means "keep this photo's own shape",
   * and a batch resolved it once — against whichever photo happened to be
   * first — and then forced that shape on the rest. Pick a horizontal photo
   * first and every vertical one in the batch came out horizontal, cropped to
   * a shape it never had. A numeric preset (1:1, 4:5, ...) ignores the photo
   * it's handed and returns the same number every time, so those still come
   * out uniform, which is what picking an exact ratio asks for.
   */
  ratioFor: (photo: LoadedPhoto) => number,
  borderThicknessPct: number,
  transform: PhotoTransform,
  quality: ExportQuality,
  locked: boolean,
  grainIntensity: number,
  borderColorHex: string,
  /** `done` photos are finished; `fraction` is the whole batch, 0..1. */
  onProgress?: (done: number, total: number, fraction: number) => void,
): Promise<ExportedImage[]> {
  if (isNativeApp) await resetNativeExports()
  const stamp = Date.now()
  const images: ExportedImage[] = []
  const fractions = photos.map(() => 0)
  const report = () => onProgress?.(images.length, photos.length, fractions.reduce((a, b) => a + b, 0) / photos.length)
  // The native build overlaps one photo's encoding with the next one's
  // drawing (see startRender). The web build doesn't: two export canvases
  // alive at once is exactly what runs WebKit past its canvas budget there.
  let pending: Promise<ExportedImage> | null = null
  for (let i = 0; i < photos.length; i++) {
    const { result } = await startBorderImage(
      photos[i],
      ratioFor(photos[i]),
      borderThicknessPct,
      transform,
      quality,
      locked,
      grainIntensity,
      borderColorHex,
      `polargrid-border-${stamp}-${i + 1}.jpg`,
      (fraction) => {
        fractions[i] = fraction
        report()
      },
    )
    if (pending) images.push(await pending)
    pending = result
    if (!isNativeApp) {
      images.push(await pending)
      pending = null
    }
    report()
    await yieldToBrowser()
  }
  if (pending) images.push(await pending)
  report()
  return images
}

/**
 * Reference long-edge used to measure grid geometry proportionally, independent
 * of final pixel size (cell/gutter/border sizes all scale linearly with it).
 */
const REF_LONG_EDGE = 10000

/**
 * How far a single photo may be enlarged inside its own cell before it starts
 * holding the canvas back.
 *
 * Canvas size is a MINIMUM across every cell — the size at which no photo has
 * to be enlarged — so without this one weak photo drags the whole export down
 * with it. Three camera photos and one 1080px save in a 2x2 exported the entire
 * collage at ~2200px instead of the 6000px the camera photos could carry: the
 * good photos were thrown away to keep the small one pixel-exact.
 *
 * At 2x that photo is slightly soft where it already had the least detail to
 * lose, and everything else in the frame gains its full resolution.
 *
 * It is a ceiling on enlargement, not a target: the canvas never grows past
 * the size at which the SHARPEST photo sits at its own native resolution.
 * Growing it further only enlarges every photo, which adds pixels and no
 * detail — and once the native build lifted the 6000 px cap there was
 * nothing left to hide that.
 */
const MAX_CELL_UPSCALE = 2

/** The collage's long edge at which every photo is drawn as sharp as it can
 *  be without any of them being enlarged past MAX_CELL_UPSCALE. `fits` holds,
 *  per photo, the canvas scale (against REF_LONG_EDGE) at which that photo
 *  sits exactly at its native resolution. */
function nativeCollageLongEdge(fits: number[]): number {
  if (fits.length === 0) return 2000
  const scale = Math.min(Math.max(...fits), Math.min(...fits) * MAX_CELL_UPSCALE)
  return Number.isFinite(scale) && scale > 0 ? REF_LONG_EDGE * scale : 2000
}

export async function renderCollageGrid(
  onProgress: Progress | undefined,
  template: GridTemplate,
  assignments: CellAssignment[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  outerBorderPct: number,
  gutterPct: number,
  quality: ExportQuality = 'native',
  shape: CellShape = 'rect',
  grainIntensity = 0,
  borderColorHex = '#ffffff',
) {
  const refSize = computeOutputPixelSize(ratio, REF_LONG_EDGE)
  const refShortSide = Math.min(refSize.width, refSize.height)
  const refOuterBorderPx = outerBorderPct * refShortSide
  const refGutterPx = gutterPct * refShortSide
  const refContentW = refSize.width - refOuterBorderPx * 2
  const refContentH = refSize.height - refOuterBorderPx * 2
  const refCellW = (refContentW - refGutterPx * (template.cols - 1)) / template.cols
  const refCellH = (refContentH - refGutterPx * (template.rows - 1)) / template.rows

  const fits: number[] = []
  template.cells.forEach((cell, i) => {
    const assignment = assignments[i]
    const photo = assignment?.photoId ? photos[assignment.photoId] : null
    if (!photo) return
    const w = refCellW * cell.colSpan + refGutterPx * (cell.colSpan - 1)
    const h = refCellH * cell.rowSpan + refGutterPx * (cell.rowSpan - 1)
    const zoom = Math.max(1, assignment.transform.zoom)
    fits.push(Math.min(photo.width / w, photo.height / h) / zoom)
  })

  const native = computeOutputPixelSize(ratio, nativeCollageLongEdge(fits))
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))

  const shortSide = Math.min(width, height)
  const outerBorderPx = outerBorderPct * shortSide
  const gutterPx = gutterPct * shortSide

  const contentX = outerBorderPx
  const contentY = outerBorderPx
  const contentW = width - outerBorderPx * 2
  const contentH = height - outerBorderPx * 2

  const cellW = (contentW - gutterPx * (template.cols - 1)) / template.cols
  const cellH = (contentH - gutterPx * (template.rows - 1)) / template.rows

  if (isNativeApp) await resetNativeExports()
  const grainSeed = Math.floor(Math.random() * 2 ** 32)
  const cells = template.cells.flatMap((cell, i) => {
    const assignment = assignments[i]
    const photo = assignment?.photoId ? photos[assignment.photoId] : null
    if (!photo) return []
    return [{
      i,
      photo,
      transform: assignment.transform,
      x: contentX + cell.col * (cellW + gutterPx),
      y: contentY + cell.row * (cellH + gutterPx),
      w: cellW * cell.colSpan + gutterPx * (cell.colSpan - 1),
      h: cellH * cell.rowSpan + gutterPx * (cell.rowSpan - 1),
    }]
  })
  const { result } = await startRender(
    width,
    height,
    `polargrid-collage-${Date.now()}.jpg`,
    async (ctx, band, report) => {
      ctx.fillStyle = borderColorHex
      ctx.fillRect(0, 0, width, height)
      const inBand = cells.filter((c) => reachesBand(band, c.y, c.w, c.h))
      // Sequential (not the equivalent forEach) so each cell's full-resolution
      // decode is closed before the next one is opened — see drawPhotoInRect.
      for (let k = 0; k < inBand.length; k++) {
        const c = inBand[k]
        await drawPhotoInRect(ctx, c.photo, c.x, c.y, c.w, c.h, c.transform, 0, 'cover', shape, grainIntensity, grainSeed + c.i)
        report((k + 1) / inBand.length)
      }
    },
    onProgress,
  )
  return result
}

export async function renderCollageFree(
  onProgress: Progress | undefined,
  freeItems: FreeItem[],
  photos: Record<string, LoadedPhoto>,
  ratio: number,
  quality: ExportQuality = 'native',
  grainIntensity = 0,
  borderColorHex = '#ffffff',
) {
  const refSize = computeOutputPixelSize(ratio, REF_LONG_EDGE)

  const fits: number[] = []
  freeItems.forEach((item) => {
    const photo = photos[item.photoId]
    if (!photo) return
    // Both sides against the canvas WIDTH, matching the preview's own geometry
    // (see FreeItemsLayer.geom) — measuring the height against the canvas
    // height here would export every photo a different shape from the one on
    // screen the moment the canvas wasn't square.
    const w = item.width * refSize.width
    const h = item.height * refSize.width
    const zoom = Math.max(1, item.transform.zoom)
    fits.push(Math.min(photo.width / w, photo.height / h) / zoom)
  })

  const native = computeOutputPixelSize(ratio, nativeCollageLongEdge(fits))
  const { width, height } = capLongEdge(native.width, native.height, getMaxLongEdge(quality))

  if (isNativeApp) await resetNativeExports()
  const grainSeed = Math.floor(Math.random() * 2 ** 32)
  const items = freeItems.flatMap((item, i) => {
    const photo = photos[item.photoId]
    if (!photo) return []
    return [{ i, item, photo, x: item.x * width, y: item.y * height, w: item.width * width, h: item.height * width }]
  })
  const { result } = await startRender(
    width,
    height,
    `polargrid-collage-${Date.now()}.jpg`,
    async (ctx, band, report) => {
      ctx.fillStyle = borderColorHex
      ctx.fillRect(0, 0, width, height)
      // In list order even within a band: later items are drawn on top.
      const inBand = items.filter((c) => reachesBand(band, c.y, c.w, c.h, c.item.rotation))
      for (let k = 0; k < inBand.length; k++) {
        const { i, item, photo, x, y, w, h } = inBand[k]
        await drawPhotoInRect(ctx, photo, x, y, w, h, item.transform, item.rotation, 'cover', 'rect', grainIntensity, grainSeed + i)
        report((k + 1) / inBand.length)
      }
    },
    onProgress,
  )
  return result
}
