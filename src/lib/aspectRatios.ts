import type { AspectRatioPreset } from '../types'

export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1-1', label: '1:1', ratio: 1 },
  { id: '4-5', label: '4:5', ratio: 4 / 5 },
  { id: '5-6', label: '5:6', ratio: 5 / 6 },
  { id: '4-3', label: '4:3', ratio: 4 / 3 },
  { id: '3-4', label: '3:4', ratio: 3 / 4 },
  { id: '16-9', label: '16:9', ratio: 16 / 9 },
  { id: '9-16', label: '9:16', ratio: 9 / 16 },
  { id: 'manual', label: 'Manual', ratio: null, manual: true },
]

export const DEFAULT_ASPECT_RATIO_ID = 'original'

/** Collage canvases have no single "original" photo ratio, so only numeric presets apply. */
export const COLLAGE_ASPECT_RATIOS: AspectRatioPreset[] = ASPECT_RATIOS.filter((r) => r.ratio != null)
