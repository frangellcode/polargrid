import { registerSW } from 'virtual:pwa-register'
import { useUpdateStore } from '../store/updateStore'

/**
 * Call once on startup. `autoUpdate` already forces skipWaiting/clientsClaim
 * once a new service worker is found, but the default check only runs on a
 * cold page load — an installed PWA opened from the Home Screen almost
 * never does one, so without polling it can stay stuck on a stale cached
 * build indefinitely. This is also why taps on real hardware (running the
 * stale install) can behave differently than a fresh desktop tab.
 */
export function initServiceWorkerUpdates() {
  registerSW({
    immediate: true,
    onRegistered(registration) {
      if (!registration) return
      setInterval(() => registration.update(), 60 * 60 * 1000)
      watchForPendingUpdate(registration)
    },
  })
}

/**
 * Flags `updateStore` the moment a new service worker has finished installing
 * behind the one currently controlling the page — that's what lights up the
 * red "1" badge on HomeScreen's "Actualizar app" button. A worker reaching
 * "installed" only counts as a real update (not the page's first-ever SW
 * install) when something is already controlling this page.
 */
function watchForPendingUpdate(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    useUpdateStore.getState().setUpdateAvailable(true)
    return
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        useUpdateStore.getState().setUpdateAvailable(true)
      }
    })
  })
}

/**
 * Wipes everything this origin owns — Cache Storage (the workbox precache),
 * the service worker itself, localStorage/sessionStorage, and cookies —
 * without reloading. Deliberately no reload: this runs underneath App.tsx's
 * fake "updating" animation, which is the only update feedback the person
 * sees, so a real navigation here would cut that animation short and replay
 * the boot splash on top of it. The device just fetches the latest deploy
 * from scratch the next time the app actually restarts.
 */
export async function clearAppCache() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
  } catch {
    // no service worker support / nothing registered
  }

  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  } catch {
    // Cache Storage unavailable
  }

  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // storage unavailable (private mode, etc.)
  }

  try {
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`)
    })
  } catch {
    // no cookies to clear
  }
}
