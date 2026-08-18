import { create } from 'zustand'
import type {
  AppMode,
  CellAssignment,
  CollageLayoutMode,
  CollageOrientation,
  CollageTemplateStyle,
  ExportQuality,
  FreeItem,
  LoadedPhoto,
  Orientation,
  PhotoTransform,
} from '../types'
import { DEFAULT_ASPECT_RATIO_ID } from '../lib/aspectRatios'
import { DEFAULT_TRANSFORM, clampTransform } from '../lib/cropMath'
import { MAX_COLLAGE_PHOTOS } from '../lib/collageTemplates'
import { DEFAULT_EXPORT_QUALITY } from '../lib/exportQuality'
import { DEFAULT_WORKSPACE_BACKGROUND } from '../lib/workspaceBackgrounds'

export const DEFAULT_BORDER_PCT = 0.04
export const DEFAULT_GUTTER_PCT = 0.015

interface BorderState {
  photoId: string | null
  aspectRatioId: string
  ratioOrientation: Orientation
  manualRatioW: number
  manualRatioH: number
  borderThicknessPct: number
  transform: PhotoTransform
  exportQuality: ExportQuality
}

export const DEFAULT_MANUAL_RATIO_W = 4
export const DEFAULT_MANUAL_RATIO_H = 5

interface CollageState {
  layoutMode: CollageLayoutMode
  photoCount: number
  style: CollageTemplateStyle
  orientation: CollageOrientation
  assignments: CellAssignment[]
  outerBorderPct: number
  gutterPct: number
  aspectRatioId: string
  ratioOrientation: Orientation
  freeItems: FreeItem[]
  exportQuality: ExportQuality
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
  setBorderAspectRatio: (id: string) => void
  setBorderRatioOrientation: (orientation: Orientation) => void
  setBorderManualRatio: (w: number, h: number) => void
  setBorderThickness: (pct: number) => void
  setBorderTransform: (transform: PhotoTransform) => void
  setBorderExportQuality: (quality: ExportQuality) => void

  setCollageLayoutMode: (mode: CollageLayoutMode) => void
  setCollagePhotoCount: (count: number) => void
  setCollageStyle: (style: CollageTemplateStyle) => void
  setCollageOrientation: (orientation: CollageOrientation) => void
  addCollagePhotos: (photos: LoadedPhoto[]) => void
  removeCollagePhoto: (photoId: string) => void
  setCollageAspectRatio: (id: string) => void
  setCollageRatioOrientation: (orientation: Orientation) => void
  setOuterBorderPct: (pct: number) => void
  setGutterPct: (pct: number) => void
  setCollageExportQuality: (quality: ExportQuality) => void
  assignPhotoToCell: (cellId: string, photoId: string | null) => void
  setCellTransform: (cellId: string, transform: PhotoTransform) => void
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
    aspectRatioId: DEFAULT_ASPECT_RATIO_ID,
    ratioOrientation: 'vertical',
    manualRatioW: DEFAULT_MANUAL_RATIO_W,
    manualRatioH: DEFAULT_MANUAL_RATIO_H,
    borderThicknessPct: DEFAULT_BORDER_PCT,
    transform: { ...DEFAULT_TRANSFORM },
    exportQuality: DEFAULT_EXPORT_QUALITY,
  }
}

function createInitialCollageState(): CollageState {
  return {
    layoutMode: 'grid',
    photoCount: 4,
    style: 'normal',
    orientation: 'vertical',
    assignments: buildAssignmentsForCount(4),
    outerBorderPct: DEFAULT_BORDER_PCT,
    gutterPct: DEFAULT_GUTTER_PCT,
    aspectRatioId: '9-16',
    ratioOrientation: 'vertical',
    freeItems: [],
    exportQuality: DEFAULT_EXPORT_QUALITY,
  }
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  mode: 'home',
  photos: {},
  border: createInitialBorderState(),
  collage: createInitialCollageState(),
  workspaceBackground: DEFAULT_WORKSPACE_BACKGROUND,

  setMode: (mode) => set({ mode }),
  setWorkspaceBackground: (id) => set({ workspaceBackground: id }),

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
      border: { ...state.border, photoId, transform: { ...DEFAULT_TRANSFORM } },
    })),

  setBorderAspectRatio: (id) =>
    set((state) => ({ border: { ...state.border, aspectRatioId: id } })),

  setBorderRatioOrientation: (orientation) =>
    set((state) => ({ border: { ...state.border, ratioOrientation: orientation } })),

  setBorderManualRatio: (w, h) =>
    set((state) => ({
      border: {
        ...state.border,
        manualRatioW: Math.max(0.1, w),
        manualRatioH: Math.max(0.1, h),
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

  setCollageLayoutMode: (layoutMode) =>
    set((state) => ({ collage: { ...state.collage, layoutMode } })),

  setCollageStyle: (style) => set((state) => ({ collage: { ...state.collage, style } })),

  setCollageOrientation: (orientation) =>
    set((state) => ({ collage: { ...state.collage, orientation } })),

  setCollagePhotoCount: (count) =>
    set((state) => {
      const nextAssignments = buildAssignmentsForCount(count)
      const existingPhotoIds = state.collage.assignments.filter((a) => a.photoId).map((a) => a.photoId)
      nextAssignments.forEach((cell, i) => {
        if (existingPhotoIds[i]) cell.photoId = existingPhotoIds[i]
      })
      return {
        collage: { ...state.collage, photoCount: count, assignments: nextAssignments },
      }
    }),

  addCollagePhotos: (allNewPhotos) => {
    const state = get()
    const capacity =
      state.collage.layoutMode === 'free'
        ? MAX_COLLAGE_PHOTOS - state.collage.freeItems.length
        : MAX_COLLAGE_PHOTOS - state.collage.assignments.filter((a) => a.photoId).length
    const newPhotos = allNewPhotos.slice(0, Math.max(0, capacity))
    if (newPhotos.length === 0) return
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
      return
    }
    // grid mode: fill empty cells in order, growing the template if needed
    let assignments = state.collage.assignments
    let photoCount = state.collage.photoCount
    const filled = assignments.filter((a) => a.photoId).length
    const needed = filled + newPhotos.length
    if (needed > photoCount) {
      photoCount = Math.min(12, needed)
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
      collage: { ...s.collage, assignments, photoCount },
    }))
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
