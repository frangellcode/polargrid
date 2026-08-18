/**
 * CSS viewport-height units (vh, dvh, -webkit-fill-available) have all
 * proven unreliable across the fragmented iOS/iPadOS Safari landscape —
 * full-screen iPhone Safari, an installed standalone PWA, and a resized
 * windowed iPad Safari (Stage Manager/Split View) each compute them
 * differently, sometimes sizing the page to its content instead of the
 * actual visible viewport.
 *
 * window.visualViewport.height (falling back to window.innerHeight where
 * unsupported) is used instead: it's the same coordinate space iOS uses
 * to report touch/tap positions, whereas window.innerHeight reflects the
 * layout viewport, which can drift from what's actually on screen while
 * Safari's chrome is transitioning. Sizing the page off the *layout*
 * viewport while touches are dispatched in *visual* viewport coordinates
 * is a known source of a tap landing a few px off from what was drawn —
 * matching "only registers if I tap slightly below the button".
 */
export function initAppHeightVar() {
  const vv = window.visualViewport
  const set = () => {
    const height = vv?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--app-height', `${height}px`)
  }
  set()
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', set)
  vv?.addEventListener('resize', set)
  vv?.addEventListener('scroll', set)
}
