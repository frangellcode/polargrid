import { registerSW } from 'virtual:pwa-register'

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
    },
  })
}

/**
 * "Actualizar" button: wipes everything this origin owns — Cache Storage
 * (the workbox precache), the service worker itself, localStorage/
 * sessionStorage, and cookies — then reloads, so the next load fetches the
 * latest deploy from scratch instead of anything cached on the device.
 */
export async function forceAppUpdate() {
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

  window.location.reload()
}
