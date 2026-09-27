import { create } from 'zustand'
import { isNativeApp } from '../lib/native'
import { Pro } from '../lib/pro'
import type { ProProduct } from '../lib/pro'

/** What Pro unlocks, in the order the paywall lists it. */
export const PRO_FEATURES = ['quality', 'colors', 'grain', 'sharpness'] as const
export type ProFeature = (typeof PRO_FEATURES)[number]

interface ProStoreState {
  /** The web build has no store and keeps everything unlocked. The App Store
   *  build starts locked and asks StoreKit on launch. */
  isPro: boolean
  paywallOpen: boolean
  /** The example the paywall opens on — whichever locked thing was tapped. */
  paywallFeature: ProFeature
  openPaywall: (feature?: ProFeature) => void
  closePaywall: () => void
  /** Called once from main.tsx on native. */
  init: () => void
  setPro: (isPro: boolean) => void
  loadProduct: () => Promise<ProProduct>
}

export const useProStore = create<ProStoreState>((set) => ({
  isPro: !isNativeApp,
  paywallOpen: false,
  paywallFeature: 'quality',
  openPaywall: (feature = 'quality') => set({ paywallOpen: true, paywallFeature: feature }),
  closePaywall: () => set({ paywallOpen: false }),
  setPro: (isPro) => set({ isPro }),
  init: () => {
    if (!isNativeApp) return
    Pro.getStatus()
      .then(({ isPro }) => set({ isPro }))
      .catch(() => {})
    // A purchase finished outside the paywall (Ask to Buy approved later) or a
    // refund: the locks follow without a relaunch.
    Pro.addListener('statusChange', ({ isPro }) => set({ isPro })).catch(() => {})
  },
  loadProduct: () => Pro.getProduct(),
}))

/** Hook for anything that should look locked without Pro. */
export const useIsPro = () => useProStore((s) => s.isPro)
