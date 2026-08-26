export interface WorkspaceBackgroundOption {
  id: string
  label: string
  /** Hex color, or null for the default checkered (transparent) pattern. */
  hex: string | null
}

/** Soft, neutral tones for the editor's own backdrop — kept deliberately
 *  lighter/quieter than BORDER_COLORS' moodier palette so the two pickers
 *  don't just duplicate each other. Blanco leads (the "plain/no fuss"
 *  option), Sin fondo (transparent checkered) trails as the escape hatch;
 *  the actual default selection is Ónix, independent of list order. */
export const WORKSPACE_BACKGROUNDS: WorkspaceBackgroundOption[] = [
  { id: 'white', label: 'Blanco', hex: '#ffffff' },
  { id: 'onyx', label: 'Ónix', hex: '#1c1c1e' },
  { id: 'pearl', label: 'Perla', hex: '#c9c6c0' },
  { id: 'beige', label: 'Beige', hex: '#d8cbb8' },
  { id: 'mist', label: 'Bruma', hex: '#a7b2bd' },
  { id: 'terracotta', label: 'Terracota', hex: '#c9a08c' },
  { id: 'checkered', label: 'Sin fondo', hex: null },
]

export const DEFAULT_WORKSPACE_BACKGROUND = 'onyx'

export function getWorkspaceBackground(id: string): WorkspaceBackgroundOption {
  return WORKSPACE_BACKGROUNDS.find((bg) => bg.id === id) ?? WORKSPACE_BACKGROUNDS[0]
}
