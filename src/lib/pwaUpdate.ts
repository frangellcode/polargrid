import { registerSW } from 'virtual:pwa-register'
import { useUpdateStore } from '../store/updateStore'

/**
 * Call once on startup. Requires `registerType: 'prompt'` in vite.config.ts —
 * with 'autoUpdate' the underlying workbox-window auto-reloads the page the
 * instant a new worker activates, which both wipes the pending-update badge
 * before it can ever be seen and cuts off App.tsx's fake update animation
 * mid-flight. 'prompt' leaves a new worker waiting until `applyUpdate` below
 * is called.
 *
 * The periodic + visibilitychange/online `registration.update()` checks
 * exist because the default check only runs on a cold page load — an
 * installed PWA opened from the Home Screen can go a long time without one
 * (people usually switch back to an already-open PWA instead of relaunching
 * it), so without extra checks it can stay stuck on a stale cached build
 * for hours.
 */
export function initServiceWorkerUpdates() {
  const updateServiceWorker = registerSW({
    immediate: true,
    onRegistered(registration) {
      if (!registration) return
      setInterval(() => registration.update(), 60 * 60 * 1000)

      // Backstops for a session that never goes a full hour without leaving
      // the foreground: check right away whenever the person actually comes
      // back to the app (switching back from another app/tab, not just the
      // OS un-suspending it in the background), and whenever the device
      // regains a network connection after being offline.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
      window.addEventListener('online', () => registration.update())
    },
    // Fired once a new worker has finished installing and is waiting —
    // lights up the "1" badge. This is the one reliable signal for
    // "prompt" mode; nothing needs to inspect the registration by hand.
    onNeedRefresh() {
      useUpdateStore.getState().setUpdateAvailable(true)
    },
    // Called once the newly-activated worker takes control, right after
    // `applyUpdate` below sends it the skip-waiting message. Left a no-op
    // on purpose — App.tsx's fake update animation is the only "restart"
    // the person sees; a real reload here would cut it short. The fresh
    // bundle takes over silently and is what's served the next time the
    // app actually relaunches.
    onNeedReload() {},
  })

  useUpdateStore.getState().setApplyUpdate(() => {
    updateServiceWorker()
  })
}
