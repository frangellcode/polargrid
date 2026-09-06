/** Timings that exist to make a fast operation and a slow one look like the
 *  same thing happening. */

/** How long the import card stays up even when there is nothing left to wait
 *  for.
 *
 *  A single small photo decodes in a few dozen milliseconds, so without this
 *  the card appears and disappears inside one or two frames — a flicker, which
 *  reads as a glitch rather than as a step. Importing one photo and importing
 *  five should look alike, just for different lengths of time. */
export const MIN_IMPORT_VISIBLE_MS = 450

/** Awaits whatever is left of MIN_IMPORT_VISIBLE_MS since `startedAt`
 *  (a performance.now() reading). A no-op once the work has taken longer. */
export async function holdImportCard(startedAt: number): Promise<void> {
  const remaining = MIN_IMPORT_VISIBLE_MS - (performance.now() - startedAt)
  if (remaining <= 0) return
  await new Promise((resolve) => setTimeout(resolve, remaining))
}
