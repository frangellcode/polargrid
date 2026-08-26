export interface BorderColorOption {
  id: string
  label: string
  hex: string
}

/** Muted, minimalist palette for the border itself — same restrained-tone
 *  philosophy as WORKSPACE_BACKGROUNDS, but every option is a real fill
 *  color (the border is always painted, unlike the workspace backdrop's
 *  checkered "no color" escape hatch). White stays first/default since
 *  that's the classic polaroid-style border everyone expects. */
export const BORDER_COLORS: BorderColorOption[] = [
  { id: 'white', label: 'Blanco', hex: '#ffffff' },
  { id: 'black', label: 'Negro', hex: '#1c1c1e' },
  { id: 'cream', label: 'Crema', hex: '#f2ead9' },
  { id: 'gray', label: 'Gris', hex: '#9c9891' },
  { id: 'sand', label: 'Arena', hex: '#c9bfae' },
  { id: 'sage', label: 'Salvia', hex: '#a8ad9c' },
]

export const DEFAULT_BORDER_COLOR = 'white'

export function getBorderColor(id: string): BorderColorOption {
  return BORDER_COLORS.find((c) => c.id === id) ?? BORDER_COLORS[0]
}
