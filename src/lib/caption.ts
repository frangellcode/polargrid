/**
 * White border's caption: a line of text in the bottom border, polaroid
 * style — never over the photo. While there is text, the bottom border grows
 * to hold it; the frame keeps its shape and the photo gives up the room.
 */

export type CaptionFont = 'hand' | 'type' | 'clean'
export type CaptionAlign = 'left' | 'center' | 'right'

export interface BorderCaption {
  text: string
  font: CaptionFont
  /** Letter size as a share of the frame's short side. */
  size: number
  align: CaptionAlign
}

export const CAPTION_MAX_LENGTH = 40
export const CAPTION_SIZE_MIN = 0.03
export const CAPTION_SIZE_MAX = 0.08

export const DEFAULT_CAPTION: BorderCaption = { text: '', font: 'hand', size: 0.05, align: 'center' }

/** Bundled with the app (main.tsx), so they draw offline, on screen and in the export alike. */
export const CAPTION_FONTS: Record<CaptionFont, { family: string; weight: number }> = {
  hand: { family: 'Caveat', weight: 500 },
  type: { family: 'Special Elite', weight: 400 },
  clean: { family: 'Jost', weight: 400 },
}

export function captionFont(c: BorderCaption, px: number): string {
  const f = CAPTION_FONTS[c.font]
  return `${f.weight} ${px}px "${f.family}"`
}

export function hasCaption(c: BorderCaption | null | undefined): c is BorderCaption {
  return !!c && c.text.trim().length > 0
}

/** The bottom border's height with the caption in it, as a share of the
 *  short side — never thinner than the border itself. */
export function captionBandPct(c: BorderCaption | null | undefined, borderPct: number): number {
  if (!hasCaption(c)) return borderPct
  return Math.max(borderPct, borderPct * 0.4 + c.size * 2.6)
}

/** Dark ink on a light border, light ink on a dark one. */
export function captionInk(borderHex: string): string {
  const n = parseInt(borderHex.replace('#', '').slice(0, 6), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#2b2b30' : '#f4f2ee'
}

/** Where the text's anchor sits across a `width`-wide frame, for `align`. */
export function captionX(c: BorderCaption, width: number, sidePad: number): number {
  return c.align === 'left' ? sidePad : c.align === 'right' ? width - sidePad : width / 2
}

/** Waits for the caption's font, so a canvas never draws it in a fallback. */
export async function loadCaptionFont(c: BorderCaption | null | undefined): Promise<void> {
  if (!hasCaption(c) || typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.load(captionFont(c, 48), c.text)
  } catch {
    // drawn in the fallback font instead
  }
}
