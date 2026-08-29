import { create } from 'zustand'
import type {
  AppMode,
  CellAssignment,
  CellShape,
  CollageLayoutMode,
  CollageOrientation,
  ExportQuality,
  FreeItem,
  LoadedPhoto,
  Orientation,
  PhotoTransform,
} from '../types'
import { DEFAULT_ASPECT_RATIO_ID } from '../lib/aspectRatios'
import { DEFAULT_TRANSFORM, clampTransform } from '../lib/cropMath'
import { GRID_TEMPLATES, MAX_COLLAGE_PHOTOS, MIN_COLLAGE_PHOTOS, getTemplatesForCount } from '../lib/collageTemplates'
import { DEFAULT_EXPORT_QUALITY } from '../lib/exportQuality'
import { DEFAULT_WORKSPACE_BACKGROUND } from '../lib/workspaceBackgrounds'
import { DEFAULT_BORDER_COLOR } from '../lib/borderColors'

export const DEFAULT_BORDER_PCT = 0.04
export const DEFAULT_GUTTER_PCT = 0.015

const WORKSPACE_BACKGROUND_STORAGE_KEY = 'polargrid:workspace-background'

/** Reads the user's last-picked workspace background from the device (localStorage) —
 *  wrapped in try/catch since storage access can throw (private browsing, disabled storage). */
function readStoredWorkspaceBackground(): string {
  try {
    return localStorage.getItem(WORKSPACE_BACKGROUND_STORAGE_KEY) ?? DEFAULT_WORKSPACE_BACKGROUND
  } catch {
    return DEFAULT_WORKSPACE_BACKGROUND
  }
}

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
  /** 0..1 film-grain amount, 0 = off. */
  grainIntensity: number
  /** BORDER_COLORS id — the border's own fill color, not the workspace backdrop. */
  borderColor: string
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
  /** 0..1 film-grain amount applied to every photo at once, 0 = off. */
  grainIntensity: number
  /** BORDER_COLORS id — the outer border/gutter fill color, not the workspace backdrop. */
  borderColor: string
}

interface EditorStoreState {
  mode: AppMode
  photos: Record<string, LoadedPhoto>
  border: BorderState
  collage: CollageState
  workspaceBackground: string

  setMode: (mode: AppMode) => void
  setWorkspaceBackground: (id: string) => void
  addPhotos: (photos: LoadedPhoto[]) => void
  reset: () => void
  resetBorder: () => void
  resetCollage: () => void

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
  setBorderGrain: (intensity: number) => void
  setBorderColor: (id: string) => void

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
  setCollageGrain: (intensity: number) => void
  setCollageBorderColor: (id: string) => void
  assignPhotoToCell: (cellId: string, photoId: string | null) => void
  setCellTransform: (cellId: string, transform: PhotoTransform) => void
  /** Swaps photoId + transform between two grid cells (long-press-drag reorder) —
   *  cellId itself denotes grid POSITION, not photo identity, so this is the one
   *  atomic update that moves a photo (with its own crop) to a new spot while
   *  the photo that was there goes the other way, in a single state transition. */
  swapCellAssignments: (cellIdA: string, cellIdB: string) => void
  updateFreeItem: (id: string, patch: Partial<FreeItem>) => void
  removeFreeItem: (id: string) => void
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
    grainIntensity: 0,
    borderColor: DEFAULT_BORDER_COLOR,
  }
}

function createInitialCollageState(): CollageState {
  return {
    layoutMode: 'grid',
    photoCount: 4,
    templateId: 'grid-4-normal',
    shape: 'rect',
    orientation: 'vertical',
    assignments: buildAssignmentsForCount(4),
    outerBorderPct: DEFAULT_BORDER_PCT,
    gutterPct: DEFAULT_GUTTER_PCT,
    aspectRatioId: '9-16',
    ratioOrientation: 'vertical',
    freeItems: [],
    exportQuality: DEFAULT_EXPORT_QUALITY,
    grainIntensity: 0,
    borderColor: DEFAULT_BORDER_COLOR,
  }
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  mode: 'home',
  photos: {},
  border: createInitialBorderState(),
  collage: createInitialCollageState(),
  workspaceBackground: readStoredWorkspaceBackground(),

  setMode: (mode) => set({ mode }),
  setWorkspaceBackground: (id) => {
    try {
      localStorage.setItem(WORKSPACE_BACKGROUND_STORAGE_KEY, id)
    } catch {
      // storage unavailable (private browsing, disabled) — keep the in-memory pick
    }
    set({ workspaceBackground: id })
  },

  addPhotos: (newPhotos) =>
    set((state) => ({
      photos: {
        ...state.photos,
        ...Object.fromEntries(newPhotos.map((p) => [p.id, p])),
      },
    })),

  reset: () =>
    set({
      mode: 'home',
      photos: {},
      border: createInitialBorderState(),
      collage: createInitialCollageState(),
    }),

  resetBorder: () => set({ border: createInitialBorderState() }),
  resetCollage: () => set({ collage: createInitialCollageState() }),

  setBorderPhoto: (photoId) =>
    set((state) => ({
      border: { ...state.border, photoId, batchPhotoIds: [], transform: { ...DEFAULT_TRANSFORM } },
    })),

  setBorderPhotos: (photoIds) =>
    set((state) => ({
      border: {
        ...state.border,
        photoId: photoIds[0] ?? null,
        batchPhotoIds: photoIds,
        transform: { ...DEFAULT_TRANSFORM },
      },
    })),

  setBorderAspectRatio: (id) =>
    set((state) => ({ border: { ...state.border, aspectRatioId: id } })),

  setBorderRatioOrientation: (orientation) =>
    set((state) => ({ border: { ...state.border, ratioOrientation: orientation } })),

  setBorderLocked: (locked) =>
    set((state) => ({
      border: { ...state.border, locked, transform: { ...DEFAULT_TRANSFORM } },
    })),

  setBorderThickness: (pct) =>
    set((state) => ({ border: { ...state.border, borderThicknessPct: pct } })),

  setBorderTransform: (transform) =>
    set((state) => ({
      border: { ...state.border, transform: clampTransform(transform) },
    })),

  setBorderExportQuality: (quality) =>
    set((state) => ({ border: { ...state.border, exportQuality: quality } })),

  setBorderGrain: (intensity) =>
    set((state) => ({ border: { ...state.border, grainIntensity: intensity } })),

  setBorderColor: (id) =>
    set((state) => ({ border: { ...state.border, borderColor: id } })),

  setCollageLayoutMode: (layoutMode) =>
    set((state) => ({ collage: { ...state.collage, layoutMode } })),

  // Selecting a template only ever happens among templates matching the
  // current photo count (the picker filters by it), so this normally just
  // swaps the layout. Resizing assignments here too keeps it safe if that
  // ever isn't the case.
  setCollageTemplateId: (templateId) =>
    set((state) => {
      const count = GRID_TEMPLATES.find((t) => t.id === templateId)?.count ?? state.collage.photoCount
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

  setCollageOrientation: (orientation) =>
    set((state) => ({ collage: { ...state.collage, orientation } })),

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
      const startIndex = state.collage.freeItems.length
      const items: FreeItem[] = newPhotos.map((p, i) => ({
        id: `free-${p.id}`,
        photoId: p.id,
        x: 0.05 + ((startIndex + i) % 4) * 0.02,
        y: 0.05 + ((startIndex + i) % 4) * 0.02,
        width: 0.4,
        height: 0.4,
        rotation: 0,
        transform: { ...DEFAULT_TRANSFORM },
      }))
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
      templateId = getTemplatesForCount(photoCount)[0].id
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
    set((state) => ({
      collage: {
        ...state.collage,
        assignments: state.collage.assignments.map((a) =>
          a.photoId === photoId ? { ...a, photoId: null, transform: { ...DEFAULT_TRANSFORM } } : a,
        ),
        freeItems: state.collage.freeItems.filter((f) => f.photoId !== photoId),
      },
    })),

  setCollageAspectRatio: (id) =>
    set((state) => ({ collage: { ...state.collage, aspectRatioId: id } })),

  setCollageRatioOrientation: (orientation) =>
    set((state) => ({ collage: { ...state.collage, ratioOrientation: orientation } })),

  setOuterBorderPct: (pct) => set((state) => ({ collage: { ...state.collage, outerBorderPct: pct } })),

  setGutterPct: (pct) => set((state) => ({ collage: { ...state.collage, gutterPct: pct } })),

  setCollageExportQuality: (quality) =>
    set((state) => ({ collage: { ...state.collage, exportQuality: quality } })),

  setCollageGrain: (intensity) =>
    set((state) => ({ collage: { ...state.collage, grainIntensity: intensity } })),

  setCollageBorderColor: (id) =>
    set((state) => ({ collage: { ...state.collage, borderColor: id } })),

  assignPhotoToCell: (cellId, photoId) =>
    set((state) => ({
      collage: {
        ...state.collage,
        assignments: state.collage.assignments.map((a) =>
          a.cellId === cellId ? { ...a, photoId, transform: { ...DEFAULT_TRANSFORM } } : a,
        ),
      },
    })),

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

  removeFreeItem: (id) =>
    set((state) => ({
      collage: { ...state.collage, freeItems: state.collage.freeItems.filter((f) => f.id !== id) },
    })),
}))
