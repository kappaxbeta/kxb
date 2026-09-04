/**
 * What you hit when you swing or fire what is in your hand.
 *
 * ---------------------------------------------------------------------------
 * Why this is a cone and not a ray
 * ---------------------------------------------------------------------------
 * A ray is what a gun is, and it is the wrong model for this room. Two facts
 * make it wrong, and neither is going away: bodies are drawn from *interpolated*
 * packets, so where somebody appears to be is up to a packet stale on every
 * screen including the shooter's; and a lounge is played on phones, where the
 * aim is a thumb on a stick rather than a mouse. A pixel-exact ray in those
 * conditions is a weapon that misses for reasons nobody can see.
 *
 * So the test is the one `kickConnects` already makes for a boot: something in
 * front of you, within reach, inside an arc. The arc is narrow for a gun and
 * wide for a bat, which is the whole of the difference between them here.
 *
 * ---------------------------------------------------------------------------
 * The shooter decides, and it is one target
 * ---------------------------------------------------------------------------
 * The attacker judging their own hit is the rule this room already runs on -
 * `dashConnects` is the whole of whether a charge landed, and `_sim/combat.ts`
 * says why: the victim owns their health, the attacker owns their swing, and
 * nobody writes to anybody else's bar.
 *
 * A shot picks the *nearest* thing in the cone rather than everything in it,
 * because a bullet stops in whoever it hits. A swing takes everything, because
 * a bat does not. That is the only place the two verbs differ once the geometry
 * is done, and it is a flag rather than two functions.
 */

/** A point, and who it belongs to. */
export interface Target {
  id: string
  at: { x: number; y: number; z: number }
}

/**
 * How wide the arc is, in radians either side of where you are pointing.
 *
 * A gun is a fifth of a radian - about 11°, which is a person-sized target at
 * ten metres and is forgiving enough to survive a stale packet. A swing is
 * `KICK_ARC` (0.64), which is the arc a boot already has, because a bat and a
 * boot are the same gesture with a longer reach.
 */
export const SHOT_ARC = 0.2
export const SWING_ARC = 0.64

/**
 * How much of the reach is *behind* the muzzle, in cells.
 *
 * Somebody standing on top of you is hit by a swing and not by a shot: a bullet
 * that leaves a barrel already past them cannot come back. A small negative
 * allowance keeps a point-blank swing honest without letting a shot hit
 * somebody who is level with the shooter's shoulder.
 */
const BEHIND = 0.4

/**
 * Everything in front of `from`, inside the arc, within reach.
 *
 * Sorted nearest first, so a caller that wants only what a bullet would stop in
 * takes the head of the list and one that wants a whole swing takes all of it.
 *
 * Height is measured but not gated: a target three cells above you is out of
 * reach by distance, and anything closer than that is somebody on a step. A
 * separate vertical arc would be a second number to tune and a second way for a
 * hit to be refused for a reason nobody can see on screen.
 */
export function inFront(
  from: { x: number; y: number; z: number },
  /** Which way you are pointing. Need not be a unit vector. */
  facing: { x: number; z: number },
  reach: number,
  arc: number,
  targets: readonly Target[],
): { id: string; distance: number }[] {
  const length = Math.hypot(facing.x, facing.z)
  if (length === 0) return []
  const fx = facing.x / length
  const fz = facing.z / length

  const hits: { id: string; distance: number }[] = []

  for (const target of targets) {
    const dx = target.at.x - from.x
    const dy = target.at.y - from.y
    const dz = target.at.z - from.z

    const distance = Math.hypot(dx, dy, dz)
    if (distance > reach) continue

    const flat = Math.hypot(dx, dz)
    // Standing exactly where you are: hit by anything with a reach, because
    // there is no direction to be wrong about.
    if (flat === 0) {
      hits.push({ id: target.id, distance })
      continue
    }

    // How far along your facing they are, and how far off it.
    const along = (dx * fx + dz * fz) / 1
    if (along < -BEHIND) continue

    const off = Math.abs(Math.atan2(dx * fz - dz * fx, along))
    if (off > arc) continue

    hits.push({ id: target.id, distance })
  }

  return hits.sort((a, b) => a.distance - b.distance)
}

/** The first thing a bullet would stop in, or nothing. */
export function firstInFront(
  from: { x: number; y: number; z: number },
  facing: { x: number; z: number },
  reach: number,
  targets: readonly Target[],
): { id: string; distance: number } | undefined {
  return inFront(from, facing, reach, SHOT_ARC, targets)[0]
}
