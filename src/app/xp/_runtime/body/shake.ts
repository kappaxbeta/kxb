import type { EntityWorld } from '@kxb/xp/engine'

/**
 * The wobble a thing does when something takes health off it.
 *
 * Asked for as *"also shake when hit"*, on a level whose whole content is a
 * dummy you walk up to and hit. It is the other half of the feedback ./hurt
 * added: a bar tells you the number went down, and a bar is something you have
 * to *read*. A thing that flinches is something you feel, and it is the
 * difference between hitting a target and pressing a key near one.
 *
 * ---------------------------------------------------------------------------
 * Driven by the health, not by the hit
 * ---------------------------------------------------------------------------
 * The tempting shape is to shake from the place damage is dealt - the shot in
 * `simulation.tsx` knows exactly what it hit. It is wrong for the same reason
 * the bars are computed by walking the world rather than by watching shots:
 * damage arrives from **three** places, and only one of them is a shot. A rule
 * can take health off, and a peer's picture can bring somebody else's hit over
 * the wire (`@kxb/xp/sharing`). A shake wired to the shot would be a dummy that
 * flinches on the screen of whoever swung and stands perfectly still on every
 * other screen in the room - which is the exact bug the bars were written to
 * fix, reintroduced one layer up.
 *
 * So this watches the number instead. Anything whose `hp` is lower than it was
 * last frame was hit by *something*, and that is all a flinch needs to know.
 *
 * ---------------------------------------------------------------------------
 * The pure half, like ./hurt and ./vitals
 * ---------------------------------------------------------------------------
 * The Browser pane never fires `requestAnimationFrame`, so a shake cannot be
 * watched here - the only way to know a thing wobbles the right amount for the
 * right length of time is to ask a function. Which is why the decay curve is a
 * function of one number and not a `useFrame` full of trigonometry.
 */

/**
 * How long the wobble lasts, in seconds.
 *
 * A quarter of a second, which is about a fifth of the flinch a *person* plays
 * (`FLINCH` in ./simulation) and deliberately shorter: a body has an animation
 * to sell and a crate has one impulse. Long enough to see at thirty frames a
 * second, short enough that hitting something four times a second reads as four
 * hits rather than as a thing that is permanently vibrating.
 */
export const SHAKE_SECONDS = 0.25

/**
 * How far it moves at the moment of the hit, in metres.
 *
 * Small on purpose. This is a flinch, not a knockback: the thing has not
 * *moved*, and anything big enough to read as displacement would put the model
 * somewhere its collider is not - you would hit air where you can see a dummy,
 * which is worse than no feedback at all.
 */
export const SHAKE_REACH = 0.07

/** And how far it twists, in degrees, at the same moment. */
export const SHAKE_TURN = 7

/** How many times it crosses back over its own mark per second. */
const SHAKE_RATE = 14

/**
 * Everything whose health has fallen since the last look.
 *
 * `seen` is the caller's, mutated in place and kept between frames - the same
 * arrangement `Overlaps` has in the engine, and for the same reason: "did this
 * change" is a fact about two frames, and a function handed only one of them
 * can answer "is it hurt" but never "was it just hit".
 *
 * A thing this has never seen before is **recorded and not reported**. A dummy
 * spawning at ten health has not just lost ten, and the alternative - treating
 * an absent previous value as full - would make every entity in the level
 * flinch on the first frame of the game.
 *
 * Ids that are no longer alive are dropped, which is what keeps the map the
 * size of the level rather than the size of the session. A thing that comes
 * back from a `deactivate` is therefore a first sighting again, which is right:
 * it returns at whatever health its `returned` rule gave it, and that is not a
 * hit either.
 */
export function struckIn(world: EntityWorld, seen: Map<number, number>): number[] {
  const struck: number[] = []

  for (const id of world.alive) {
    const hp = world.props.get(id)?.hp
    if (hp === undefined || !Number.isFinite(hp)) {
      seen.delete(id)
      continue
    }
    const before = seen.get(id)
    seen.set(id, hp)
    if (before !== undefined && hp < before) struck.push(id)
  }

  for (const id of seen.keys()) {
    if (!world.alive.has(id)) seen.delete(id)
  }

  return struck
}

/**
 * How far off its mark a thing hit `left` seconds ago should be drawn.
 *
 * A decaying wobble: it crosses its own position several times and each cross
 * is smaller than the last, so it settles rather than stops. The fade is
 * squared, which front-loads the whole thing - the first cross is nearly the
 * full reach and the last is almost nothing, which is what an impact looks like
 * and what a linear fade does not.
 *
 * The phase is offset by the entity's id, so two things hit on the same frame
 * do not move in lockstep. Free, and the alternative - a row of crates swaying
 * together - reads as wind rather than as damage.
 *
 * The turn goes with it because a thing that only slides looks like it is on
 * ice. Yaw rather than a pitch or a roll, deliberately: those two would tip a
 * level entity off the fast path in ./live, and the point of a quarter-second
 * flinch is not to make the frame it happens on the expensive one.
 */
export function shakeOf(left: number, id: number): { x: number; z: number; turn: number } {
  if (left <= 0 || left > SHAKE_SECONDS) return { x: 0, z: 0, turn: 0 }

  const fade = (left / SHAKE_SECONDS) ** 2
  const phase = (SHAKE_SECONDS - left) * SHAKE_RATE * Math.PI * 2 + id
  return {
    x: Math.sin(phase) * SHAKE_REACH * fade,
    // A different multiple rather than a cosine of the same one: a matched pair
    // draws a circle, and a thing that orbits its own position is a thing
    // spinning rather than a thing recoiling.
    z: Math.sin(phase * 0.7) * SHAKE_REACH * fade,
    turn: Math.sin(phase * 1.3) * SHAKE_TURN * fade,
  }
}
