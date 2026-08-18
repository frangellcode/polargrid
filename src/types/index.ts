export type AppMode = 'home' | 'border' | 'collage'

export type CollageLayoutMode = 'grid' | 'free'

/** 'horizontal' = base template layout, 'vertical' = transposed (mirrored) layout. */
export type CollageOrientation = 'horizontal' | 'vertical'

/** Export resolution tier: 'native' never upscales past the source photo(s). */
export type ExportQuality = 'native' | 'high' | 'web'

export interface AspectRatioPreset {
  id: string
  label: string
  /** width / height. null means "Original" (keep source photo ratio) */
  ratio: number | null
  /** manual = free-form border padding, no forced crop ratio */
  manual?: boolean
}

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

export type CollageTemplateStyle = 'normal' | 'creative'

export interface GridTemplate {
  id: string
  label: string
  count: number
  /** 'normal' = clean uniform grid, 'creative' = asymmetric PS Express-style mix */
  style: CollageTemplateStyle
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
