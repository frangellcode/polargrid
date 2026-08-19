export interface WorkspaceBackgroundOption {
  id: string
  label: string
  /** Hex color, or null for the default checkered (transparent) pattern. */
  hex: string | null
}

/** Muted, low-saturation tones — deliberately restrained rather than bright/loud.
 *  Colors first, default (onyx) leading the list; the "no color" checkered
 *  pattern goes last since it's the fallback/escape-hatch option, not a color. */
export const WORKSPACE_BACKGROUNDS: WorkspaceBackgroundOption[] = [
  { id: 'onyx', label: 'Ónix', hex: '#1c1c1e' },
  { id: 'graphite', label: 'Grafito', hex: '#6e6a65' },
  { id: 'forest', label: 'Bosque', hex: '#2f3a2e' },
  { id: 'wine', label: 'Vino', hex: '#5c2a2e' },
  { id: 'navy', label: 'Noche', hex: '#232b3a' },
  { id: 'sand', label: 'Arena', hex: '#c9bfae' },
  { id: 'checkered', label: 'Cuadros', hex: null },
]

export const DEFAULT_WORKSPACE_BACKGROUND = 'onyx'

export function getWorkspaceBackground(id: string): WorkspaceBackgroundOption {
  return WORKSPACE_BACKGROUNDS.find((bg) => bg.id === id) ?? WORKSPACE_BACKGROUNDS[0]
}
