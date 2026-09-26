export interface BorderColorOption {
  id: string
  label: string
  hex: string
}

/** The border's own fill color — reuses the app's original moodier/richer
 *  workspace-backdrop palette (moved here since it read better on a border
 *  than as an editor backdrop), with white kept first/default for the
 *  classic polaroid look everyone expects. */
export const BORDER_COLORS: BorderColorOption[] = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'onyx', label: 'Onyx', hex: '#1c1c1e' },
  { id: 'forest', label: 'Forest', hex: '#2f3a2e' },
  { id: 'wine', label: 'Wine', hex: '#5c2a2e' },
  { id: 'navy', label: 'Night', hex: '#232b3a' },
  { id: 'sand', label: 'Sand', hex: '#c9bfae' },
]

export const DEFAULT_BORDER_COLOR = 'white'

/** A border colour is either a BORDER_COLORS id or, when picked freely, the
 *  colour itself as "#rrggbb". */
export function isCustomBorderColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function getBorderColor(id: string): BorderColorOption {
  if (isCustomBorderColor(id)) return { id, label: 'Custom', hex: id }
  return BORDER_COLORS.find((c) => c.id === id) ?? BORDER_COLORS[0]
}
