/** Timings that exist to make a fast operation and a slow one look like the
 *  same thing happening. */

/** Floor for a MULTI-photo import. Several photos take real time anyway, and
 *  the card's own counter (3/5) is already carrying the sense of progress, so
 *  this only has to stop a very fast run flickering. */
export const MIN_IMPORT_VISIBLE_MS = 450

/** Floor for a ONE-photo import.
 *
 *  Deliberately much longer than the work it covers. A single photo decodes in
 *  a few dozen milliseconds and has no counter to watch, so at the shorter
 *  floor the card was gone before it registered as anything — the photo simply
 *  appeared, and the step read as a flicker rather than as the app doing
 *  something. Held for a beat and a half it reads as the load it actually is,
 *  and matches the weight of the multi-photo import next to it. The photo then
 *  enters with its usual crossfade, unchanged. */
export const MIN_SINGLE_IMPORT_VISIBLE_MS = 1500

/** Awaits whatever is left of the floor for `count` photos since `startedAt`
 *  (a performance.now() reading). A no-op once the work has taken longer. */
export async function holdImportCard(startedAt: number, count: number): Promise<void> {
  const floor = count <= 1 ? MIN_SINGLE_IMPORT_VISIBLE_MS : MIN_IMPORT_VISIBLE_MS
  const remaining = floor - (performance.now() - startedAt)
  if (remaining <= 0) return
  await new Promise((resolve) => setTimeout(resolve, remaining))
}
