import { Capacitor } from '@capacitor/core'

/** True inside the App Store build (the Capacitor shell in ios/), false on the
 *  web and in the installed PWA. The two ship the same bundle; this is the one
 *  switch for what has to differ — no service worker, no self-update button, no
 *  PayPal link, native saving. */
export const isNativeApp = Capacitor.isNativePlatform()
