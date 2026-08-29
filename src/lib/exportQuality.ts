import type { ExportQuality } from '../types'

// "Maximum" still means the photos' own native resolution for the vast
// majority of exports (a single 48MP photo's long edge is ~8000px, well
// under this) — this is a safety backstop, not a real quality tier. Collage
// combines several full-res photos into ONE canvas, and with no ceiling at
// all that canvas can quietly exceed what iOS Safari's canvas will actually
// render (WebKit has real, lower-than-desktop limits on canvas area) —
// canvas.toBlob then resolves null and the export just silently does
// nothing, with no error surfaced. Capping here means "Maximum" always
// finishes; it's still far above what any screen or print job needs.
const MAX_SAFE_LONG_EDGE = 6000

export const EXPORT_QUALITY_PRESETS: { id: ExportQuality; label: string; hint: string; maxLongEdge?: number }[] = [
  { id: 'native', label: 'Maximum', hint: 'Native resolution of your photos', maxLongEdge: MAX_SAFE_LONG_EDGE },
  { id: 'high', label: 'High', hint: 'Photos up to 2048 px, lighter file', maxLongEdge: 2048 },
  { id: 'web', label: 'Web', hint: 'Photos up to 1080 px, ideal for sharing', maxLongEdge: 1080 },
]

export const DEFAULT_EXPORT_QUALITY: ExportQuality = 'native'

export function getMaxLongEdge(quality: ExportQuality): number | undefined {
  return EXPORT_QUALITY_PRESETS.find((p) => p.id === quality)?.maxLongEdge
}

/** Scales width/height down to fit within maxLongEdge (if set), preserving aspect ratio. */
export function capLongEdge(width: number, height: number, maxLongEdge?: number) {
  if (!maxLongEdge) return { width, height }
  const long = Math.max(width, height)
  if (long <= maxLongEdge) return { width, height }
  const scale = maxLongEdge / long
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
