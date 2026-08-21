export type AppMode = 'home' | 'border' | 'collage'

export type CollageLayoutMode = 'grid' | 'free'

/** 'horizontal' = base template layout, 'vertical' = transposed (mirrored) layout. */
export type CollageOrientation = 'horizontal' | 'vertical'

/** Orientation applied to an orientable aspect-ratio preset (see AspectRatioPreset). */
export type Orientation = 'vertical' | 'horizontal'

/** Export resolution tier: 'native' never upscales past the source photo(s). */
export type ExportQuality = 'native' | 'high' | 'web'

export interface AspectRatioPreset {
  id: string
  label: string
  /** width / height, always given in its portrait (vertical) form. null means "Original" (keep source photo ratio) */
  ratio: number | null
  /** Has a meaningful landscape flip (1/ratio) — false for Original/1:1. */
  orientable?: boolean
}

/** How a photo fills its target rect: 'cover' crops to fill exactly (locked
 *  border, uniform on every side); 'contain' shows the whole photo, letting
 *  the border go asymmetric on the mismatched axis instead of cropping. */
export type PhotoFit = 'cover' | 'contain'

/** A loaded source photo, decoded once and reused across transforms */
export interface LoadedPhoto {
  id: string
  bitmap: ImageBitmap
  width: number
  height: number
  name: string
}

/** Pan/zoom transform of a photo inside its target cell/frame (cover-fit space) */
export interface PhotoTransform {
  /** offset from center, in fractions of the inner cell size (-0.5..0.5 clamped by cropMath) */
  offsetX: number
  offsetY: number
  /** zoom multiplier on top of the base cover-fit scale (>= 1) */
  zoom: number
}

export interface CellAssignment {
  cellId: string
  photoId: string | null
  transform: PhotoTransform
}

/** How a cell's photo gets clipped: plain rectangle or softly rounded corners. */
export type CellShape = 'rect' | 'rounded'

export interface GridTemplate {
  id: string
  label: string
  count: number
  /** cells positioned in a normalized 0..1 unit square, in column/row-span grid units */
  cols: number
  rows: number
  cells: { col: number; row: number; colSpan: number; rowSpan: number }[]
}

/** Freeform collage item: independent, draggable/resizable/rotatable photo */
export interface FreeItem {
  id: string
  photoId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  transform: PhotoTransform
}
