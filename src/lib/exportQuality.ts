import type { ExportQuality } from '../types'

export const EXPORT_QUALITY_PRESETS: { id: ExportQuality; label: string; hint: string; maxLongEdge?: number }[] = [
  { id: 'native', label: 'Máxima', hint: 'Resolución nativa de tus fotos', maxLongEdge: undefined },
  { id: 'high', label: 'Alta', hint: 'Hasta 2048 px, archivo más liviano', maxLongEdge: 2048 },
  { id: 'web', label: 'Web', hint: 'Hasta 1080 px, ideal para compartir', maxLongEdge: 1080 },
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
