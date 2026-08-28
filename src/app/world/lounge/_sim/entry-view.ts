/**
 * The camera's way in to a world.
 *
 * A world used to open at eye level on the spawn square, which shows you a wall
 * and a patch of floor. Everything the room actually is - the shape somebody
 * built, how far it runs, where the goals stand - is out of frame until you
 * think to look up and walk. That is a poor first second for the one feature
 * the whole product is selling.
 *
 * So the camera opens above and behind the spawn, looking down at it, and drops
 * to eye level when you click in. It is also a view you can ask for again with
 * O, which is the only other way to get up there - releasing pointer lock is
 * not one, because chatting is not leaving. Nothing about walking, building or
 * fighting is played from up here, which is why none of this touches
 * `playerRef`. The eye is on the spawn square the whole time - see the rig in
 * lounge-scene.tsx, which derives the camera from the player and never the other
 * way round.
 *
 * Pure functions over plain numbers, like physics.ts and spawn.ts beside it, and
 * for the same reason: this scene cannot be driven in a headless browser - it is
 * behind auth and it needs a frame loop - so the arithmetic is worth having
 * somewhere a test can reach it.
 */

/** How far above the player's eye the overview camera sits, in blocks. */
export const OVERVIEW_RAISE = 20

/**
 * How far back along the player's heading the overview sits, in blocks.
 *
 * Shorter than the raise, so the look-down is steeper than 45 degrees. A shallow
 * angle shows the horizon and hides the floor plan, which is the view being
 * replaced; a vertical one is a map rather than a place, and loses every wall
 * somebody built. Between the two you read both the footprint and the height.
 */
export const OVERVIEW_BACK = 15

/**
 * Seconds the descent from the overview to eye level takes.
 *
 * Long enough to read as a move rather than a cut, short enough that a player
 * who clicked in because they want to play is not made to watch it. The look
 * controls are handed the camera at the end of it, so this is also the longest
 * anybody's mouse is ignored - which is the real ceiling on it.
 */
export const ENTRY_SECONDS = 0.9

/**
 * Where the camera watches from before anybody has clicked in.
 *
 * Up and back along the heading, which is what puts the spawn square in the
 * lower half of the frame and the world beyond it in the upper. `forward` is the
 * horizontal heading only - a pitch component here would tilt the whole framing
 * with wherever the camera happened to be pointing when the scene mounted.
 */
export function overviewPosition(
  player: { x: number; y: number; z: number },
  forward: { x: number; z: number },
): { x: number; y: number; z: number } {
  // Normalised here rather than trusted, so a caller handing over a raw
  // getWorldDirection - which carries pitch, and is therefore short in the
  // horizontal plane - does not pull the camera in closer as it looks down.
  const length = Math.hypot(forward.x, forward.z)
  const unit =
    length > 1e-6 ? { x: forward.x / length, z: forward.z / length } : { x: 0, z: 1 }

  return {
    x: player.x - unit.x * OVERVIEW_BACK,
    y: player.y + OVERVIEW_RAISE,
    z: player.z - unit.z * OVERVIEW_BACK,
  }
}

/**
 * How far into the descent the next frame is, given this one's delta.
 *
 * Clamped at 1 rather than allowed to run past it, because the caller uses "is
 * it 1 yet" as the signal to hand the camera back to the look controls.
 */
export function advanceEntry(progress: number, delta: number): number {
  if (delta <= 0) return progress
  return Math.min(1, progress + delta / ENTRY_SECONDS)
}

/**
 * The descent's shape: fast at the start, settling at the end.
 *
 * Cubic ease-out, matching `--ease-out-soft` in globals.css - the app's default
 * for anything the viewer is watching arrive. An linear drop reads as a lift
 * being lowered; this reads as a camera coming to rest.
 */
export function entryEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  return 1 - (1 - t) ** 3
}
