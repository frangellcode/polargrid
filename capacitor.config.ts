import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.frangellcode.polargrid',
  appName: 'PolarGrid',
  webDir: 'dist',
  // Same ink as every screen (bg-ink-900) so the webview never flashes white
  // behind the boot splash while the bundle loads.
  backgroundColor: '#141e30',
  ios: {
    // Each screen already pads itself with env(safe-area-inset-*), exactly as
    // the installed PWA does — letting iOS inset the webview too would double it.
    contentInset: 'never',
    // Nothing in the app scrolls the page itself; without this the whole UI
    // rubber-bands like a web page, the tell-tale sign of a wrapped website.
    scrollEnabled: false,
    backgroundColor: '#141e30',
  },
}

export default config
