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
export function proExportGuard() {
  const isPro = useProStore.getState().isPro
  return {
    isPro,
    /** Maximum is Pro; a free export falls back to High. */
    quality: (quality: ExportQuality): ExportQuality => (isPro || quality !== 'native' ? quality : 'high'),
    /** White is the free border colour; anything else is Pro. */
    borderHex: (hex: string): string => (isPro ? hex : getBorderColor(DEFAULT_BORDER_COLOR).hex),
    /** Edit and Retro are Pro. */
    adjustments: <T extends PhotoAdjustments | null | undefined>(a: T): T | null => (isPro ? a : null),
    adjustmentsMap: (map: Record<string, PhotoAdjustments>): Record<string, PhotoAdjustments> => (isPro ? map : {}),
    /** The 9:16 background is Pro. */
    storyHex: (hex: string | null): string | null => (isPro ? hex : null),
    /** Batches past `freeLimit` photos are Pro. */
    batch: <T>(photos: T[], freeLimit: number): T[] => (isPro ? photos : photos.slice(0, freeLimit)),
  }
}
