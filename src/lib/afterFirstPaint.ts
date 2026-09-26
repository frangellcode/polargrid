/**
 * Runs `callback` once the browser has painted at least one frame — for
 * flipping a freshly mounted overlay to its visible state.
 *
 * A single requestAnimationFrame is not enough, and WebKit shows it: a tap
 * makes React commit and run its effects synchronously, the rAF callback then
 * lands before that frame is painted, and the element goes straight from
 * "mounted" to "visible" without the browser ever drawing its hidden state —
 * so there is nothing to transition from and the overlay pops in. The second
 * frame guarantees the hidden state was on screen first.
 *
 * Returns a cancel function for the effect cleanup.
 */
export function afterFirstPaint(callback: () => void): () => void {
  let second = 0
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback)
  })
  return () => {
    cancelAnimationFrame(first)
    cancelAnimationFrame(second)
  }
}
