/** Rotation snapping for the free layout — the "magnet" that catches a photo
 *  the moment its edges line up with the canvas's. */

/** Snapping happens at every quarter turn: upright, on its side either way, or
 *  upside down. All four leave the photo's edges parallel to the canvas's,
 *  which is the only thing the eye is trying to judge. */
const SNAP_STEP_DEG = 90

/**
 * How close is close enough.
 *
 * Wide enough that a finger arriving at "straight" is caught rather than
 * landing a degree or two off (which is exactly the amount that looks like a
 * mistake), narrow enough that a deliberate small tilt is still possible — at
 * 5° you can hold 6° or 7° and it stays where you put it.
 */
const SNAP_TOLERANCE_DEG = 5

export interface SnappedRotation {
  /** The angle to apply — the snapped one when close enough, otherwise the
   *  angle as given. */
  rotation: number
  /** True when the magnet took hold, so callers can show the guide. */
  snapped: boolean
}

/**
 * Pulls a rotation to the nearest quarter turn when it is within tolerance.
 *
 * Deliberately absolute rather than incremental: the correction is measured
 * against the angle handed in, so pushing past the tolerance releases it
 * immediately instead of having to give back the degrees the snap swallowed.
 * The result keeps the caller's winding (720° stays 720°, not 0°), so a
 * gesture that has been round a few times doesn't jump.
 */
export function snapRotation(deg: number): SnappedRotation {
  const normalized = ((deg % 360) + 360) % 360
  const nearest = Math.round(normalized / SNAP_STEP_DEG) * SNAP_STEP_DEG
  // 360 and 0 are the same corner; measure the distance the short way round.
  const distance = Math.min(Math.abs(normalized - nearest), 360 - Math.abs(normalized - nearest))
  if (distance > SNAP_TOLERANCE_DEG) return { rotation: deg, snapped: false }
  const correction = nearest - normalized
  // Take the short way there too, so a photo at 358° snaps forward to 360
  // rather than backwards through a third of a turn.
  const shortest = correction > 180 ? correction - 360 : correction < -180 ? correction + 360 : correction
  return { rotation: deg + shortest, snapped: true }
}
