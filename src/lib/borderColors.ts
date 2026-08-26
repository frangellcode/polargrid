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
  { id: 'white', label: 'Blanco', hex: '#ffffff' },
  { id: 'onyx', label: 'Ónix', hex: '#1c1c1e' },
  { id: 'graphite', label: 'Grafito', hex: '#6e6a65' },
  { id: 'forest', label: 'Bosque', hex: '#2f3a2e' },
  { id: 'wine', label: 'Vino', hex: '#5c2a2e' },
  { id: 'navy', label: 'Noche', hex: '#232b3a' },
  { id: 'sand', label: 'Arena', hex: '#c9bfae' },
]

export const DEFAULT_BORDER_COLOR = 'white'

export function getBorderColor(id: string): BorderColorOption {
  return BORDER_COLORS.find((c) => c.id === id) ?? BORDER_COLORS[0]
}
