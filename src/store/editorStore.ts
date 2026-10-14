import { create } from 'zustand'
import type {
  AppMode,
  CellAssignment,
  CellShape,
  CollageBackdrop,
  CollageLayoutMode,
  CollageOrientation,
  FreeFrame,
  ExportQuality,
  FreeItem,
  LoadedPhoto,
  Orientation,
  PhotoTransform,
} from '../types'
import { DEFAULT_ASPECT_RATIO_ID } from '../lib/aspectRatios'
import { DEFAULT_TRANSFORM, clampTransform } from '../lib/cropMath'
import type { GridSizes } from '../lib/gridLayout'
import { GRID_TEMPLATES, MAX_COLLAGE_PHOTOS, MIN_COLLAGE_PHOTOS, getTemplatesForCount } from '../lib/collageTemplates'
import {
  CAROUSEL_POST_RATIO,
  DEFAULT_CAROUSEL_POSTS,
  carouselFamily,
  carouselTemplateFor,
  findCarouselTemplate,
} from '../lib/carouselTemplates'
import { DEFAULT_EXPORT_QUALITY } from '../lib/exportQuality'
import { DEFAULT_WORKSPACE_BACKGROUND } from '../lib/workspaceBackgrounds'
import { DEFAULT_BORDER_COLOR } from '../lib/borderColors'
import { hasAdjustments, type PhotoAdjustments } from '../lib/adjustments'
import { DEFAULT_CAPTION, type BorderCaption } from '../lib/caption'

export const DEFAULT_BORDER_PCT = 0.04
/** A collage starts with a 2% outer border and the same 2% between photos —
 *  the gutter is linked to the border by default (see CollageEditor). */
export const DEFAULT_COLLAGE_BORDER_PCT = 0.02
export const DEFAULT_GUTTER_PCT = DEFAULT_COLLAGE_BORDER_PCT


interface BorderState {
  photoId: string | null
  /** Empty in single-photo mode. Non-empty means White Border's batch
   *  upload was used — holds every photo in the batch, always starting
   *  with `photoId` (the one shown on the canvas; the rest export with
   *  the same shared settings without ever being previewed). */
  batchPhotoIds: string[]
  aspectRatioId: string
  ratioOrientation: Orientation
  borderThicknessPct: number
  /** true (default) = border is uniform on every side and the photo is cropped
   *  to fill it. false = the photo is shown in full (never cropped to fit the
   *  ratio); the border goes asymmetric on whichever axis doesn't match. */
  locked: boolean
  transform: PhotoTransform
  exportQuality: ExportQuality
  /** BORDER_COLORS id or a custom "#rrggbb" — the border's own fill color, not the workspace backdrop. */
  borderColor: string
  /** Edit sliders per photo id — unlike everything above, these belong to
   *  one photo, not to the whole batch. Missing = untouched. */
  adjustments: Record<string, PhotoAdjustments>
  /** Batch only: an Edit change lands on every photo of the batch at once. */
  syncAdjustments: boolean
  /** Pro: export each photo centred on a 9:16 canvas of the workspace
   *  background's colour, for Stories/Reels. Not shown on screen. */
  exportWithBackground: boolean
  /** A line of text in the bottom border, polaroid style. */
  caption: BorderCaption
}

interface CollageState {
  layoutMode: CollageLayoutMode
  photoCount: number
  templateId: string
  /** Cell clip shape, chosen independently of the layout. */
  shape: CellShape
  orientation: CollageOrientation
  assignments: CellAssignment[]
  outerBorderPct: number
  gutterPct: number
  aspectRatioId: string
  ratioOrientation: Orientation
  freeItems: FreeItem[]
  exportQuality: ExportQuality
  /** Where the person dragged the grid lines to; null = even split. */
  gridSizes: GridSizes | null
  /** BORDER_COLORS id or a custom "#rrggbb" — the outer border/gutter fill color, not the workspace backdrop. */
  borderColor: string
  /** Edit sliders per photo id, so they follow a photo wherever it's moved. */
  adjustments: Record<string, PhotoAdjustments>
  /** Carousel: how many 4:5 posts the canvas spans (0 = a plain collage). */
  posts: number
  /** Free mode's frame around every photo. */
  frame: FreeFrame
  /** A photo behind everything instead of the background colour. */
  backdrop: CollageBackdrop | null
}

interface EditorStoreState {
  mode: AppMode
  photos: Record<string, LoadedPhoto>
  border: BorderState
  collage: CollageState
  workspaceBackground: string
  /** True while the before/after button is held: every photo is drawn as it
   *  came, without its Edit or Retro. Never part of an export. */
  showOriginal: boolean

  setMode: (mode: AppMode) => void
  setWorkspaceBackground: (id: string) => void
  setShowOriginal: (show: boolean) => void
  addPhotos: (photos: LoadedPhoto[]) => void
  /** Swaps in a new version of a loaded photo under the same id (the healing
   *  brush's result), so every editor holding it picks up the change. */
  replacePhoto: (photo: LoadedPhoto) => void
  reset: () => void
  resetBorder: () => void
  /** A fresh collage — a carousel of the same post count by default, as
   *  "create another" wants; 0 for a plain collage. */
  resetCollage: (posts?: number) => void
  /** Opens a fresh carousel in the collage state (Home's Carousel button). */
  startCarousel: () => void
  setCarouselPosts: (posts: number) => void
  setCollageFrame: (frame: FreeFrame) => void
  setCollageBackdrop: (backdrop: CollageBackdrop | null) => void
  /** Spreads the free photos evenly across the carousel's posts again. */
  spreadFreeItems: () => void

  setBorderPhoto: (photoId: string) => void
  /** Batch upload: `photoIds[0]` becomes `photoId` (shown/adjusted), the
   *  full array becomes `batchPhotoIds`. */
  setBorderPhotos: (photoIds: string[]) => void
  setBorderAspectRatio: (id: string) => void
  setBorderRatioOrientation: (orientation: Orientation) => void
  setBorderLocked: (locked: boolean) => void
  setBorderThickness: (pct: number) => void
  setBorderTransform: (transform: PhotoTransform) => void
  setBorderExportQuality: (quality: ExportQuality) => void
  setBorderColor: (id: string) => void
  /** Lands on every batch photo instead while syncAdjustments is on. */
  setBorderAdjustments: (photoId: string, adjustments: PhotoAdjustments) => void
  /** Turning sync on copies `fromPhotoId`'s edit to the whole batch. */
  setBorderSyncAdjustments: (sync: boolean, fromPhotoId: string) => void
  setBorderExportWithBackground: (on: boolean) => void
  setBorderCaption: (caption: Partial<BorderCaption>) => void

  setCollageLayoutMode: (mode: CollageLayoutMode) => void
  setCollageTemplateId: (templateId: string) => void
  setCollageShape: (shape: CellShape) => void
  setCollageOrientation: (orientation: CollageOrientation) => void
  /** Returns false (and leaves state untouched) if starting a fresh collage
   *  with fewer than MIN_COLLAGE_PHOTOS photos — otherwise true. */
  addCollagePhotos: (photos: LoadedPhoto[]) => boolean
  removeCollagePhoto: (photoId: string) => void
  setCollageAspectRatio: (id: string) => void
  setCollageRatioOrientation: (orientation: Orientation) => void
  setOuterBorderPct: (pct: number) => void
  setGutterPct: (pct: number) => void
  setCollageExportQuality: (quality: ExportQuality) => void
  setCollageGridSizes: (sizes: GridSizes | null) => void
  setCollageBorderColor: (id: string) => void
  setCollageAdjustments: (photoId: string, adjustments: PhotoAdjustments) => void
  assignPhotoToCell: (cellId: string, photoId: string | null) => void
  /** Empties ONE grid cell, leaving the template's shape alone so the gap it
   *  frees can be filled again by tapping it. */
  clearCell: (cellId: string) => void
  setCellTransform: (cellId: string, transform: PhotoTransform) => void
  /** Swaps photoId + transform between two grid cells (long-press-drag reorder) —
   *  cellId itself denotes grid POSITION, not photo identity, so this is the one
   *  atomic update that moves a photo (with its own crop) to a new spot while
   *  the photo that was there goes the other way, in a single state transition. */
  swapCellAssignments: (cellIdA: string, cellIdB: string) => void
  updateFreeItem: (id: string, patch: Partial<FreeItem>) => void
  /** Moves one free item to the end of the list, i.e. on top of the others —
   *  the only way to change what covers what, since they are drawn in order. */
  bringFreeItemToFront: (id: string) => void
  removeFreeItem: (id: string) => void
}

/**
 * Drops every photo neither editor still points at, closing its preview bitmap.
 *
 * `photos` is shared by both editors and used to only ever grow: resetting an
 * editor ("create another", or exporting and starting over) replaced its own
 * state but left every photo ever loaded in here, each holding a decoded
 * ImageBitmap of up to 1600px on its long edge — several MB apiece that the GC
 * cannot reclaim on its own, since an ImageBitmap's pixels live outside the JS
 * heap until it is explicitly closed. A few rounds of five-photo batches was
 * enough to walk a phone into its per-tab memory limit and have the app killed
 * and reloaded mid-session.
 */
function prunePhotos(
  photos: Record<string, LoadedPhoto>,
  border: BorderState,
  collage: CollageState,
): Record<string, LoadedPhoto> {
  const keep = new Set<string>()
  if (border.photoId) keep.add(border.photoId)
  border.batchPhotoIds.forEach((id) => keep.add(id))
  collage.assignments.forEach((a) => a.photoId && keep.add(a.photoId))
  collage.freeItems.forEach((f) => keep.add(f.photoId))
  if (collage.backdrop) keep.add(collage.backdrop.photoId)

  const next: Record<string, LoadedPhoto> = {}
  let dropped = false
  for (const [id, photo] of Object.entries(photos)) {
    if (keep.has(id)) {
      next[id] = photo
      continue
    }
    // Throws if it was somehow closed already; a double close is harmless and
    // must not take a state update down with it.
    try {
      photo.previewBitmap.close()
      photo.retouch?.basePreview.close()
    } catch {
      // already released
    }
    dropped = true
  }
  // Same object back when nothing changed, so subscribers don't re-render for a
  // prune that freed nothing.
  return dropped ? next : photos
}

/** How a photo dropped into the free canvas is placed, as fractions of the
 *  canvas WIDTH (both axes — see FreeItemsLayer for why width is the basis for
 *  both). */
const FREE_ITEM_WIDTH = 0.45
const FREE_ITEM_MARGIN = 0.07
const FREE_ITEM_CASCADE = 0.07

/** Lays photos out on the free canvas as a cascade, each at its own aspect. */
function buildFreeItems(photos: LoadedPhoto[], startIndex: number): FreeItem[] {
  return photos.map((p, i) => {
    const slot = startIndex + i
    return {
      id: `free-${p.id}`,
      photoId: p.id,
      // Cascaded 7% of the canvas per photo (it was 2%, which stacked them
      // almost exactly on top of each other — the second photo hid the first,
      // and nine landed as one pile in the corner), wrapping every fourth so a
      // full set stays on the canvas.
      x: FREE_ITEM_MARGIN + (slot % 4) * FREE_ITEM_CASCADE,
      y: FREE_ITEM_MARGIN + (slot % 4) * FREE_ITEM_CASCADE + Math.floor(slot / 4) * FREE_ITEM_CASCADE,
      width: FREE_ITEM_WIDTH,
      // Its OWN shape. Both sides are fractions of the canvas WIDTH (see
      // FreeItemsLayer), so a photo arrives uncropped instead of being squeezed
      // into whatever rectangle 0.4 x 0.4 of the current canvas happened to be.
      height: FREE_ITEM_WIDTH * (p.height / p.width),
      rotation: 0,
      transform: { ...DEFAULT_TRANSFORM },
    }
  })
}

/**
 * A carousel's photos spread across its posts like prints on a table: one
 * after another along the strip, alternately a little higher and lower, each
 * turned a few degrees. Fractions of the canvas WIDTH, like buildFreeItems.
 */
function buildCarouselFreeItems(photos: LoadedPhoto[], startIndex: number, total: number, posts: number): FreeItem[] {
  const ratio = posts * CAROUSEL_POST_RATIO
  const span = 1 / Math.max(1, total)
  return photos.map((p, i) => {
    const slot = startIndex + i
    // About two-thirds of a post wide, a little narrower when crowded, and
    // never taller than three-quarters of the strip — a tall photo shrinks.
    const aspect = p.height / p.width
    const width = Math.min(0.68 / posts, span * 0.95, (0.75 / ratio) / aspect)
    const height = width * aspect
    const cx = span * (slot + 0.5)
    const cy = (slot % 2 === 0 ? 0.46 : 0.54) * (1 / ratio)
    return {
      id: `free-${p.id}`,
      photoId: p.id,
      x: cx - width / 2,
      // y is a fraction of the canvas HEIGHT in the store.
      y: (cy - height / 2) * ratio,
      width,
      height,
      rotation: slot % 3 === 0 ? -4 : slot % 3 === 1 ? 3 : -2,
      transform: { ...DEFAULT_TRANSFORM },
    }
  })
}

/** The layout for `count` photos: a carousel's own — keeping the design of
 *  `templateId` — or a collage's first. */
function firstTemplateFor(posts: number, count: number, templateId = '') {
  return posts ? carouselTemplateFor(posts, count, carouselFamily(templateId)) : getTemplatesForCount(count)[0]
}

/** Grid state (cell count, template, assignments) for a run of photos. */
function buildGridFor(photoIds: string[], posts = 0, templateId = '') {
  const photoCount = Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, photoIds.length))
  const assignments = buildAssignmentsForCount(photoCount)
  assignments.forEach((cell, i) => {
    if (photoIds[i]) cell.photoId = photoIds[i]
  })
  return { photoCount, templateId: firstTemplateFor(posts, photoCount, templateId).id, assignments }
}

function buildAssignmentsForCount(count: number): CellAssignment[] {
  return Array.from({ length: count }, (_, i) => ({
    cellId: `cell-${i}`,
    photoId: null,
    transform: { ...DEFAULT_TRANSFORM },
  }))
}

function createInitialBorderState(): BorderState {
  return {
    photoId: null,
    batchPhotoIds: [],
    aspectRatioId: DEFAULT_ASPECT_RATIO_ID,
    ratioOrientation: 'vertical',
    borderThicknessPct: DEFAULT_BORDER_PCT,
    locked: true,
    transform: { ...DEFAULT_TRANSFORM },
    exportQuality: DEFAULT_EXPORT_QUALITY,
    borderColor: DEFAULT_BORDER_COLOR,
    adjustments: {},
    syncAdjustments: false,
    exportWithBackground: false,
    caption: { ...DEFAULT_CAPTION },
  }
}

function createInitialCollageState(posts = 0): CollageState {
  if (posts) {
    const template = carouselTemplateFor(posts, posts + 1)
    return {
      ...createInitialCollageState(),
      photoCount: template.count,
      templateId: template.id,
      orientation: 'horizontal',
      ratioOrientation: 'horizontal',
      assignments: buildAssignmentsForCount(template.count),
      posts,
      frame: 'polaroid',
    }
  }
  return {
    layoutMode: 'grid',
    photoCount: 4,
    templateId: 'grid-4-normal',
    shape: 'rect',
    orientation: 'vertical',
    assignments: buildAssignmentsForCount(4),
    outerBorderPct: DEFAULT_COLLAGE_BORDER_PCT,
    gutterPct: DEFAULT_GUTTER_PCT,
    aspectRatioId: '9-16',
    ratioOrientation: 'vertical',
    freeItems: [],
    exportQuality: DEFAULT_EXPORT_QUALITY,
    gridSizes: null,
    borderColor: DEFAULT_BORDER_COLOR,
    adjustments: {},
    posts: 0,
    frame: 'none',
    backdrop: null,
  }
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  mode: 'home',
  photos: {},
  border: createInitialBorderState(),
  collage: createInitialCollageState(),
  // In-memory only, on purpose — every other editor adjustment (border
  // color, grain, export quality, ...) already resets to its default via
  // resetBorder/resetCollage, and this used to be the one exception,
  // surviving both a reset AND a full reload via localStorage. Kept as a
  // plain default now so the workspace always starts clean.
  workspaceBackground: DEFAULT_WORKSPACE_BACKGROUND,
  showOriginal: false,

  setMode: (mode) => set({ mode }),
  setWorkspaceBackground: (id) => set({ workspaceBackground: id }),
  setShowOriginal: (show) => set({ showOriginal: show }),

  replacePhoto: (photo) =>
    set((state) => (state.photos[photo.id] ? { photos: { ...state.photos, [photo.id]: photo } } : {})),

  addPhotos: (newPhotos) =>
    set((state) => ({
      photos: {
        ...state.photos,
        ...Object.fromEntries(newPhotos.map((p) => [p.id, p])),
      },
    })),

  reset: () =>
    set((state) => {
      const border = createInitialBorderState()
      const collage = createInitialCollageState()
      return {
        mode: 'home',
        photos: prunePhotos(state.photos, border, collage),
        border,
        collage,
      }
    }),

  resetBorder: () =>
    set((state) => {
      const border = createInitialBorderState()
      return {
        border,
        photos: prunePhotos(state.photos, border, state.collage),
        workspaceBackground: DEFAULT_WORKSPACE_BACKGROUND,
      }
    }),

  resetCollage: (posts) =>
    set((state) => {
      const collage = createInitialCollageState(posts ?? state.collage.posts)
      return {
        collage,
        photos: prunePhotos(state.photos, state.border, collage),
        workspaceBackground: DEFAULT_WORKSPACE_BACKGROUND,
      }
    }),

  // "Change photo" orphans whatever was loaded before, so both setters prune
  // as they swap — otherwise every photo you ever previewed stays resident.
  setBorderPhoto: (photoId) =>
    set((state) => {
      const border = { ...state.border, photoId, batchPhotoIds: [], transform: { ...DEFAULT_TRANSFORM }, adjustments: {} }
      return { border, photos: prunePhotos(state.photos, border, state.collage) }
    }),

  setBorderPhotos: (photoIds) =>
    set((state) => {
      const border = {
        ...state.border,
        photoId: photoIds[0] ?? null,
        batchPhotoIds: photoIds,
        transform: { ...DEFAULT_TRANSFORM },
        adjustments: {},
      }
      return { border, photos: prunePhotos(state.photos, border, state.collage) }
    }),

  setBorderAspectRatio: (id) =>
    set((state) => ({ border: { ...state.border, aspectRatioId: id } })),

  setBorderRatioOrientation: (orientation) =>
    set((state) => ({ border: { ...state.border, ratioOrientation: orientation } })),

  setBorderLocked: (locked) =>
    set((state) => ({
      // A fresh crop for the new mode, but the photo stays turned and
      // flipped the way it was — that's orientation, not framing.
      border: {
        ...state.border,
        locked,
        transform: clampTransform({
          ...DEFAULT_TRANSFORM,
          turns: state.border.transform.turns,
          flipH: state.border.transform.flipH,
          flipV: state.border.transform.flipV,
        }),
      },
    })),

  setBorderThickness: (pct) =>
    set((state) => ({ border: { ...state.border, borderThicknessPct: pct } })),

  setBorderTransform: (transform) =>
    set((state) => ({
      border: { ...state.border, transform: clampTransform(transform) },
    })),

  setBorderExportQuality: (quality) =>
    set((state) => ({ border: { ...state.border, exportQuality: quality } })),

  setBorderColor: (id) =>
    set((state) => ({ border: { ...state.border, borderColor: id } })),

  setBorderAdjustments: (photoId, adjustments) =>
    set((state) => {
      const { border } = state
      const targets = border.syncAdjustments && border.batchPhotoIds.length > 1 ? border.batchPhotoIds : [photoId]
      const next = { ...border.adjustments }
      targets.forEach((id) => (next[id] = adjustments))
      return { border: { ...border, adjustments: next } }
    }),

  setBorderExportWithBackground: (on) =>
    set((state) => ({ border: { ...state.border, exportWithBackground: on } })),

  setBorderCaption: (caption) =>
    set((state) => ({ border: { ...state.border, caption: { ...state.border.caption, ...caption } } })),

  setBorderSyncAdjustments: (sync, fromPhotoId) =>
    set((state) => {
      const { border } = state
      if (!sync) return { border: { ...border, syncAdjustments: false } }
      // From the photo on screen — unless it's untouched, in which case the
      // edit already made on another photo is the one meant to spread, not
      // a blank that would wipe it.
      const from =
        (hasAdjustments(border.adjustments[fromPhotoId]) ? border.adjustments[fromPhotoId] : null) ??
        border.batchPhotoIds.map((id) => border.adjustments[id]).find(hasAdjustments)
      const next: Record<string, PhotoAdjustments> = {}
      if (from) border.batchPhotoIds.forEach((id) => (next[id] = from))
      return { border: { ...border, syncAdjustments: true, adjustments: next } }
    }),

  /**
   * Switching Template <-> Free carries the photos across when the side you're
   * moving to is empty.
   *
   * The two layouts keep their own arrangement — a grid of cells on one side,
   * loose frames on the other — and that stays true: whatever you've already
   * arranged over there is left exactly as it was. But arriving at an empty
   * canvas and being asked to pick the same photos again, when they are
   * already decoded and sitting in memory, was pure friction (and it left both
   * copies resident afterwards).
   */
  startCarousel: () =>
    set((state) => {
      const collage = createInitialCollageState(DEFAULT_CAROUSEL_POSTS)
      return { collage, photos: prunePhotos(state.photos, state.border, collage) }
    }),

  setCarouselPosts: (posts) =>
    set((state) => {
      const collage = state.collage
      if (!collage.posts || posts === collage.posts) return {}
      const photoIds = collage.assignments.flatMap((a) => (a.photoId ? [a.photoId] : []))
      // The same design, laid out again for the new strip.
      const template = carouselTemplateFor(posts, Math.max(photoIds.length, collage.photoCount), carouselFamily(collage.templateId))
      const assignments = buildAssignmentsForCount(template.count)
      collage.assignments
        .filter((a) => a.photoId)
        .forEach((a, i) => {
          if (assignments[i]) assignments[i] = { ...assignments[i], photoId: a.photoId, transform: a.transform }
        })
      // Free photos keep their place on the strip: their fractions of its
      // width shrink or grow with it, so they're redistributed instead.
      const free = collage.freeItems.map((f) => state.photos[f.photoId]).filter((p): p is LoadedPhoto => !!p)
      return {
        collage: {
          ...collage,
          posts,
          templateId: template.id,
          photoCount: template.count,
          assignments,
          gridSizes: null,
          freeItems: free.length ? buildCarouselFreeItems(free, 0, free.length, posts) : collage.freeItems,
        },
      }
    }),

  setCollageFrame: (frame) => set((state) => ({ collage: { ...state.collage, frame } })),

  setCollageBackdrop: (backdrop) =>
    set((state) => {
      const collage = { ...state.collage, backdrop }
      return { collage, photos: prunePhotos(state.photos, state.border, collage) }
    }),

  spreadFreeItems: () =>
    set((state) => {
      const collage = state.collage
      const free = collage.freeItems.map((f) => state.photos[f.photoId]).filter((p): p is LoadedPhoto => !!p)
      if (!free.length) return {}
      const spread = collage.posts ? buildCarouselFreeItems(free, 0, free.length, collage.posts) : buildFreeItems(free, 0)
      return { collage: { ...collage, freeItems: spread } }
    }),

  setCollageLayoutMode: (layoutMode) =>
    set((state) => {
      const collage = state.collage
      if (layoutMode === collage.layoutMode) return {}

      if (layoutMode === 'free' && collage.freeItems.length === 0) {
        const carried = collage.assignments
          .map((a) => (a.photoId ? state.photos[a.photoId] : null))
          .filter((p): p is LoadedPhoto => !!p)
        if (carried.length > 0) {
          const freeItems = collage.posts ? buildCarouselFreeItems(carried, 0, carried.length, collage.posts) : buildFreeItems(carried, 0)
          return { collage: { ...collage, layoutMode, freeItems } }
        }
      }

      if (layoutMode === 'grid' && !collage.assignments.some((a) => a.photoId)) {
        const carried = collage.freeItems.map((f) => f.photoId).filter((id) => !!state.photos[id])
        if (carried.length > 0) {
          return { collage: { ...collage, layoutMode, ...buildGridFor(carried, collage.posts, collage.templateId) } }
        }
      }

      return { collage: { ...collage, layoutMode } }
    }),

  // Selecting a template only ever happens among templates matching the
  // current photo count (the picker filters by it), so this normally just
  // swaps the layout. Resizing assignments here too keeps it safe if that
  // ever isn't the case.
  setCollageTemplateId: (templateId) =>
    set((state) => {
      const count = (GRID_TEMPLATES.find((t) => t.id === templateId) ?? findCarouselTemplate(templateId))?.count ?? state.collage.photoCount
      if (count === state.collage.photoCount) {
        return { collage: { ...state.collage, templateId } }
      }
      const nextAssignments = buildAssignmentsForCount(count)
      const existingPhotoIds = state.collage.assignments.filter((a) => a.photoId).map((a) => a.photoId)
      nextAssignments.forEach((cell, i) => {
        if (existingPhotoIds[i]) cell.photoId = existingPhotoIds[i]
      })
      return {
        collage: { ...state.collage, templateId, photoCount: count, assignments: nextAssignments },
      }
    }),

  setCollageShape: (shape) => set((state) => ({ collage: { ...state.collage, shape } })),

  // The two orientations move together, in both directions.
  //
  // They used to be independent: `orientation` transposed the TEMPLATE and
  // `ratioOrientation` (over in Aspect) flipped the CANVAS. So tapping
  // Horizontal under Template re-tiled a 2x3 into a 3x2 and left it inside a
  // 9:16 portrait canvas — six absurdly tall slivers, and the control read as
  // broken. Nobody wants a horizontal grid in a vertical frame; one intent,
  // one state, surfaced in both places.
  setCollageOrientation: (orientation) =>
    set((state) => ({ collage: { ...state.collage, orientation, ratioOrientation: orientation } })),

  addCollagePhotos: (allNewPhotos) => {
    const state = get()
    const capacity =
      state.collage.layoutMode === 'free'
        ? MAX_COLLAGE_PHOTOS - state.collage.freeItems.length
        : MAX_COLLAGE_PHOTOS - state.collage.assignments.filter((a) => a.photoId).length
    const newPhotos = allNewPhotos.slice(0, Math.max(0, capacity))
    if (newPhotos.length === 0) return false
    const startingFresh =
      state.collage.layoutMode === 'free'
        ? state.collage.freeItems.length === 0
        : state.collage.assignments.every((a) => !a.photoId)
    // A collage needs at least two photos — don't let a single dropped photo
    // silently start one (it used to, with the second cell just left empty).
    if (startingFresh && newPhotos.length < MIN_COLLAGE_PHOTOS) return false
    const photoRecord = Object.fromEntries(newPhotos.map((p) => [p.id, p]))
    if (state.collage.layoutMode === 'free') {
      const { posts, freeItems } = state.collage
      // A carousel spreads everything again, the new photos included, so they
      // land across the posts instead of piled at one end.
      if (posts) {
        const all = [...freeItems.map((f) => state.photos[f.photoId]).filter((p): p is LoadedPhoto => !!p), ...newPhotos]
        const spread = buildCarouselFreeItems(all, 0, all.length, posts)
        const kept = new Map(freeItems.map((f) => [f.photoId, f]))
        set((s) => ({
          photos: { ...s.photos, ...photoRecord },
          collage: { ...s.collage, freeItems: spread.map((f) => kept.get(f.photoId) ?? f) },
        }))
        return true
      }
      const items = buildFreeItems(newPhotos, state.collage.freeItems.length)
      set((s) => ({
        photos: { ...s.photos, ...photoRecord },
        collage: { ...s.collage, freeItems: [...s.collage.freeItems, ...items] },
      }))
      return true
    }
    // grid mode: fill empty cells in order, growing the template if needed
    let assignments = state.collage.assignments
    let photoCount = state.collage.photoCount
    let templateId = state.collage.templateId
    const filled = assignments.filter((a) => a.photoId).length
    const needed = filled + newPhotos.length
    // Starting a fresh collage: match the template to exactly how many photos
    // are being placed, instead of keeping the arbitrary default cell count
    // (which left empty cells and offered a grid style for more photos than
    // the user actually added).
    const shouldResize = filled === 0 ? needed !== photoCount : needed > photoCount
    if (shouldResize) {
      photoCount =
        filled === 0
          ? Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, needed))
          : Math.min(MAX_COLLAGE_PHOTOS, needed)
      templateId = firstTemplateFor(state.collage.posts, photoCount, state.collage.templateId).id
      const nextAssignments = buildAssignmentsForCount(photoCount)
      // preserve existing photoId order into new template's cells
      const existingPhotoIds = assignments.filter((a) => a.photoId).map((a) => a.photoId)
      nextAssignments.forEach((cell, i) => {
        if (existingPhotoIds[i]) cell.photoId = existingPhotoIds[i]
      })
      assignments = nextAssignments
    }
    let photoIdx = 0
    assignments = assignments.map((cell) => {
      if (!cell.photoId && photoIdx < newPhotos.length) {
        const p = newPhotos[photoIdx]
        photoIdx += 1
        return { ...cell, photoId: p.id, transform: { ...DEFAULT_TRANSFORM } }
      }
      return cell
    })
    set((s) => ({
      photos: { ...s.photos, ...photoRecord },
      collage: { ...s.collage, assignments, photoCount, templateId },
    }))
    return true
  },

  removeCollagePhoto: (photoId) =>
    set((state) => {
      const collage = {
        ...state.collage,
        assignments: state.collage.assignments.map((a) =>
          a.photoId === photoId ? { ...a, photoId: null, transform: { ...DEFAULT_TRANSFORM } } : a,
        ),
        freeItems: state.collage.freeItems.filter((f) => f.photoId !== photoId),
      }
      // Taking a photo out of the collage is the one moment it's certain to be
      // unwanted — its bitmap goes with it.
      return { collage, photos: prunePhotos(state.photos, state.border, collage) }
    }),

  setCollageAspectRatio: (id) =>
    set((state) => ({ collage: { ...state.collage, aspectRatioId: id } })),

  setCollageRatioOrientation: (orientation) =>
    set((state) => ({ collage: { ...state.collage, ratioOrientation: orientation, orientation } })),

  setOuterBorderPct: (pct) => set((state) => ({ collage: { ...state.collage, outerBorderPct: pct } })),

  setGutterPct: (pct) => set((state) => ({ collage: { ...state.collage, gutterPct: pct } })),

  setCollageExportQuality: (quality) =>
    set((state) => ({ collage: { ...state.collage, exportQuality: quality } })),

  setCollageGridSizes: (sizes) =>
    set((state) => ({ collage: { ...state.collage, gridSizes: sizes } })),

  setCollageBorderColor: (id) =>
    set((state) => ({ collage: { ...state.collage, borderColor: id } })),

  setCollageAdjustments: (photoId, adjustments) =>
    set((state) => ({
      collage: { ...state.collage, adjustments: { ...state.collage.adjustments, [photoId]: adjustments } },
    })),

  assignPhotoToCell: (cellId, photoId) =>
    set((state) => ({
      collage: {
        ...state.collage,
        assignments: state.collage.assignments.map((a) =>
          a.cellId === cellId ? { ...a, photoId, transform: { ...DEFAULT_TRANSFORM } } : a,
        ),
      },
    })),

  clearCell: (cellId) =>
    set((state) => {
      // Removing a photo retiles the collage for the photos that are left —
      // nine become a real eight-photo layout — instead of leaving a hole to
      // fill. Anyone who wanted a different photo there has Replace. Only
      // below the two-photo minimum does the cell stay, empty, since a collage
      // of one isn't one.
      const remaining = state.collage.assignments.filter((a) => a.photoId && a.cellId !== cellId)
      const collage =
        remaining.length >= MIN_COLLAGE_PHOTOS
          ? {
              ...state.collage,
              ...buildGridFor(remaining.map((a) => a.photoId as string), state.collage.posts, state.collage.templateId),
            }
          : {
              ...state.collage,
              assignments: state.collage.assignments.map((a) =>
                a.cellId === cellId ? { ...a, photoId: null, transform: { ...DEFAULT_TRANSFORM } } : a,
              ),
            }
      // Emptying a cell is the one moment a photo is certain to be unwanted —
      // its bitmap goes with it, unless the other editor still points at it.
      return { collage, photos: prunePhotos(state.photos, state.border, collage) }
    }),

  setCellTransform: (cellId, transform) =>
    set((state) => ({
      collage: {
        ...state.collage,
        assignments: state.collage.assignments.map((a) =>
          a.cellId === cellId ? { ...a, transform } : a,
        ),
      },
    })),

  swapCellAssignments: (cellIdA, cellIdB) =>
    set((state) => {
      const a = state.collage.assignments.find((x) => x.cellId === cellIdA)
      const b = state.collage.assignments.find((x) => x.cellId === cellIdB)
      if (!a || !b) return state
      return {
        collage: {
          ...state.collage,
          assignments: state.collage.assignments.map((x) => {
            if (x.cellId === cellIdA) return { ...x, photoId: b.photoId, transform: b.transform }
            if (x.cellId === cellIdB) return { ...x, photoId: a.photoId, transform: a.transform }
            return x
          }),
        },
      }
    }),

  updateFreeItem: (id, patch) =>
    set((state) => ({
      collage: {
        ...state.collage,
        freeItems: state.collage.freeItems.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    })),

  bringFreeItemToFront: (id) =>
    set((state) => {
      const item = state.collage.freeItems.find((f) => f.id === id)
      if (!item || state.collage.freeItems.at(-1)?.id === id) return {}
      return {
        collage: {
          ...state.collage,
          freeItems: [...state.collage.freeItems.filter((f) => f.id !== id), item],
        },
      }
    }),

  removeFreeItem: (id) =>
    set((state) => {
      const collage = { ...state.collage, freeItems: state.collage.freeItems.filter((f) => f.id !== id) }
      return { collage, photos: prunePhotos(state.photos, state.border, collage) }
    }),
}))
