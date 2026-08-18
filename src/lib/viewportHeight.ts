/**
 * CSS viewport-height units (vh, dvh, -webkit-fill-available) have all
 * proven unreliable across the fragmented iOS/iPadOS Safari landscape —
 * full-screen iPhone Safari, an installed standalone PWA, and a resized
 * windowed iPad Safari (Stage Manager/Split View) each compute them
 * differently, sometimes sizing the page to its content instead of the
 * actual visible viewport. window.innerHeight is what all of these agree
 * on, so mirror it into a CSS custom property and let index.css use
 * --app-height instead of trusting any vh-family unit.
 */
export function initAppHeightVar() {
  const set = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }
  set()
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', set)
  window.visualViewport?.addEventListener('resize', set)
}
