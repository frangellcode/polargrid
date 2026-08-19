import type { AspectRatioPreset } from '../types'

// Every sizeable ratio is listed once, in its portrait (vertical) form — a
// separate landscape entry (e.g. "4:3" next to "3:4") was redundant since
// it's just the same shape flipped. The orientation toggle in
// AspectRatioPicker covers the landscape form for any `orientable` preset,
// defaulting to vertical since the app is built vertical-first.
export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1-1', label: '1:1', ratio: 1 },
  { id: '4-5', label: '4:5', ratio: 4 / 5, orientable: true },
  { id: '5-6', label: '5:6', ratio: 5 / 6, orientable: true },
  { id: '3-4', label: '3:4', ratio: 3 / 4, orientable: true },
  { id: '9-16', label: '9:16', ratio: 9 / 16, orientable: true },
]

export const DEFAULT_ASPECT_RATIO_ID = 'original'

/** Collage canvases have no single "original" photo ratio, so only numeric presets apply. */
export const COLLAGE_ASPECT_RATIOS: AspectRatioPreset[] = ASPECT_RATIOS.filter((r) => r.ratio != null)
