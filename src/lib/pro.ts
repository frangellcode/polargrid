import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/** Must match the non-consumable in-app purchase in App Store Connect and
 *  ios/App/App/PolarGrid.storekit character for character. */
export const PRO_PRODUCT_ID = 'com.frangellcode.polargrid.pro'

export interface ProProduct {
  id: string
  displayName: string
  /** Already localized and in the person's own currency, straight from the
   *  App Store — never format a price here. */
  displayPrice: string
}

export type ProPurchaseStatus = 'purchased' | 'pending' | 'cancelled'

interface ProPlugin {
  getStatus(): Promise<{ isPro: boolean }>
  getProduct(): Promise<ProProduct>
  purchase(): Promise<{ status: ProPurchaseStatus }>
  restore(): Promise<{ isPro: boolean }>
  addListener(event: 'statusChange', listener: (data: { isPro: boolean }) => void): Promise<PluginListenerHandle>
}

/** ios/App/App/ProPlugin.swift. Native-only: the web build never calls it. */
export const Pro = registerPlugin<ProPlugin>('Pro')
