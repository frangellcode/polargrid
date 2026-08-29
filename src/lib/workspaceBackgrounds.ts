export interface WorkspaceBackgroundOption {
  id: string
  label: string
  /** Hex color, or null for the default checkered (transparent) pattern. */
  hex: string | null
}

/** Soft, neutral tones for the editor's own backdrop — kept deliberately
 *  lighter/quieter than BORDER_COLORS' moodier palette so the two pickers
 *  don't just duplicate each other. No background (transparent checkered)
 *  leads since it's also the actual default selection
 *  (DEFAULT_WORKSPACE_BACKGROUND below), Onyx follows right after as the
 *  other most-reached-for option, and White — easy to reach for by habit but
 *  the one most likely to wash out against a white border — trails last. */
export const WORKSPACE_BACKGROUNDS: WorkspaceBackgroundOption[] = [
  { id: 'checkered', label: 'No background', hex: null },
  { id: 'onyx', label: 'Onyx', hex: '#1c1c1e' },
  { id: 'pearl', label: 'Pearl', hex: '#c9c6c0' },
  { id: 'beige', label: 'Beige', hex: '#d8cbb8' },
  { id: 'mist', label: 'Mist', hex: '#a7b2bd' },
  { id: 'terracotta', label: 'Terracotta', hex: '#c9a08c' },
  { id: 'white', label: 'White', hex: '#ffffff' },
]

export const DEFAULT_WORKSPACE_BACKGROUND = 'checkered'

export function getWorkspaceBackground(id: string): WorkspaceBackgroundOption {
  return WORKSPACE_BACKGROUNDS.find((bg) => bg.id === id) ?? WORKSPACE_BACKGROUNDS[0]
}
