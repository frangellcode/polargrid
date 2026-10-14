import type { ExportQuality } from '../types'
import type { PhotoAdjustments } from './adjustments'
import { DEFAULT_BORDER_COLOR, getBorderColor } from './borderColors'
import { useProStore } from '../store/proStore'

/**
 * The last line between a free copy and the Pro features: every export reads
 * what it may use from here, at the moment it renders, instead of trusting
 * that the controls on screen were locked.
 *
 * The controls ARE locked without Pro, and this changes nothing for anyone
 * using them as intended. It's for everything else — a refund landing while
 * an edit is already on the canvas, Pro state that was set before the
 * StoreKit check finished, a future control that forgets its lock — so that
 * whatever is on screen, a free export can only ever carry free features.
 */
/** An edit with its Pro parts taken out. */
function freeOnly<T extends PhotoAdjustments>(a: T): T {
  return { ...a, grain: 0, toneCurves: null, retro: null }
}

export function proExportGuard() {
  const isPro = useProStore.getState().isPro
  return {
    isPro,
    /** Maximum is Pro; a free export falls back to High. */
    quality: (quality: ExportQuality): ExportQuality => (isPro || quality !== 'native' ? quality : 'high'),
    /** White is the free border colour; anything else is Pro. */
    borderHex: (hex: string): string => (isPro ? hex : getBorderColor(DEFAULT_BORDER_COLOR).hex),
    /** Edit's light, colour, colour mix, vignette and sharpness are free;
     *  its curves and grain, and Retro, are Pro. */
    adjustments: <T extends PhotoAdjustments | null | undefined>(a: T): T | null => (isPro || !a ? a : freeOnly(a)),
    adjustmentsMap: (map: Record<string, PhotoAdjustments>): Record<string, PhotoAdjustments> =>
      isPro ? map : Object.fromEntries(Object.entries(map).map(([id, a]) => [id, freeOnly(a)])),
    /** The polaroid caption is Pro. */
    caption: <T>(caption: T | null): T | null => (isPro ? caption : null),
    /** The 9:16 background is Pro. */
    story: <T>(background: T | null): T | null => (isPro ? background : null),
    /** Batches past `freeLimit` photos are Pro. */
    batch: <T>(photos: T[], freeLimit: number): T[] => (isPro ? photos : photos.slice(0, freeLimit)),
  }
}
