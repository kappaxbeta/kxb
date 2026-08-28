import type { Blueprint, EntityWorld } from '@kxb/xp/engine'

/**
 * Which things in the level are hurt, and how badly.
 *
 * Reported because hitting something gave **no feedback at all**: a crate with
 * `hp` took damage, its number went down, and the only visible event was the
 * moment it broke. From the outside, "I am hitting this" and "I am hitting a
 * wall" looked the same — and on every other machine in the room they looked
 * the same as an untouched box, because damage did not cross the wire either
 * (`sharing.ts` carries it now).
 *
 * The pure half, for the reason `vitals.ts` is: which bars exist is a decision
 * with edge cases — the ceiling, the switch, a thing that is already gone — and
 * a component with a frame loop in it is not somewhere they can be tested.
 *
 * ---------------------------------------------------------------------------
 * The blueprint's own `hp` is the ceiling
 * ---------------------------------------------------------------------------
 * `spawnEntities` copies a blueprint's props onto each entity, so a thing at
 * full health is a thing whose number still equals its blueprint's. That means
 * no maximum to store beside the current value and no second field to keep in
 * step — and it is the same rule `sharing.ts` uses to decide what is worth
 * sending, deliberately: two answers to "is this hurt" would eventually
 * disagree, and the disagreement would be a bar over something nobody had
 * touched.
 */

/** One bar, over one thing. */
export interface Hurt {
  id: number
  /** What is left, 0 to 1. Never above 1: healing past full draws a full bar. */
  left: number
}

/**
 * Everything alive, hurt, and willing to say so.
 *
 * Only things **below** full: a level of untouched crates draws nothing, which
 * is what makes this feedback rather than decoration. A bar over everything
 * would be a level that looks like a health inspection.
 *
 * `bar: false` on the blueprint is how a document opts out — a lock whose damage
 * is meant to be secret, or a thing hit so often the bar is noise. It is asked
 * *here* rather than in the drawing, so the answer is the same in a test.
 */
export function hurtIn(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
): Hurt[] {
  const hurt: Hurt[] = []

  for (const id of world.alive) {
    const hp = world.props.get(id)?.hp
    if (hp === undefined || !Number.isFinite(hp)) continue

    const blueprint = blueprints[world.blueprint.get(id) ?? '']
    if (!blueprint || blueprint.bar === false) continue

    const full = blueprint.props?.hp
    if (full === undefined || !Number.isFinite(full) || full <= 0) continue
    if (hp >= full) continue

    /**
     * Clamped at the bottom, not at the top.
     *
     * A thing on zero is drawn empty for the frame before its `damaged` rule
     * despawns it, which is the frame that reads as "that did it". Below zero
     * would be a bar drawn inside out; above full cannot arrive here, because
     * this only runs for things under it.
     */
    hurt.push({ id, left: Math.max(0, hp / full) })
  }

  return hurt.sort((a, b) => a.id - b.id)
}
