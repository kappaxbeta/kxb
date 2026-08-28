/**
 * What a press would do, before you press it.
 *
 * ---------------------------------------------------------------------------
 * The gap this fills
 * ---------------------------------------------------------------------------
 * A `pressed` rule with a `within` is aimed by *standing somewhere*, and until
 * now nothing on screen said what you were standing near enough to. In a level
 * where the answer is "the one door in front of you" that is fine. In a level
 * made of forty identical fields with sixteen pieces on them it is not: the
 * board game's cursor is a ring, the ring is the selection, and a selection you
 * cannot see is a guess.
 *
 * And the board game asks a second question the same shape - *where would it
 * go* - which is answerable for exactly the same reason: the rule that would
 * fire is a rule in the document, `advance` computes its destination from
 * numbers that are all already here, and running that arithmetic without
 * running the verb is a preview.
 *
 * ---------------------------------------------------------------------------
 * The one rule this file has to keep
 * ---------------------------------------------------------------------------
 * **It must pick the trigger `fire` would pick.** A highlight on one piece and
 * a press that moves another is worse than no highlight at all - it is a lie
 * the player will trust twice and then stop trusting the game. So the tests are
 * not re-implemented here: the key, the reach and the condition are `fire`'s own
 * `within` and `holds`, called in `fire`'s own order, and the loop below is the
 * loop in `fire` with `applyVerbs` swapped for arithmetic.
 *
 * The one thing it adds is *nearest*. `fire` offers a press to every entity and
 * lets each decide, because two things in reach both reacting is a legitimate
 * level; a cursor cannot draw two answers, so it draws the closest. That is a
 * difference and it is the reason `within` on the board game's pieces is 0.9
 * rather than 2 - at 0.9 there is never more than one.
 */

import { worldTransform } from './entities'
import type { EntityId, EntityWorld } from './entities'
import type { Blueprint } from '../document/blueprints'
import type { Mark } from '../document/format'
import { markByName } from '../document/capabilities'
import { carries, fire, holds, within, type TriggerClock } from '../rules/triggers'
import type { Effect } from '../rules/verbs'

export interface Aim {
  /** The entity the press would reach. */
  id: EntityId
  /**
   * Where that entity is, so a caller can draw on it without the world.
   *
   * Carried rather than looked up again by whoever draws it: the position comes
   * from `worldTransform`, which is what makes a thing parented to something
   * else land where it is *drawn* rather than where its own numbers say, and a
   * second lookup somewhere else is a second chance to forget that.
   */
  at: { x: number; y: number; z: number }
  /**
   * The mark it would end up on, when the rule that would fire moves it there.
   *
   * Null for a press that does something else entirely - opening a door, saying
   * a line - and null for a move that cannot be made, which is the same answer
   * `advance` gives and for the same reason: the end of a track is a wall, so a
   * roll that would go past it moves nothing. A cursor drawing a destination
   * there would be promising a move the press will refuse.
   */
  to: Mark | null
}

/**
 * The entity a press with this key would reach, and where it would send it.
 *
 * `presser` is whoever is pressing - the player's own entity - because that is
 * what `within` measures from and what a `when` about `other` asks about.
 */
export function aimOf(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  key: string,
  presser: EntityId,
  marks: readonly Mark[],
  data?: ReadonlyMap<string, number>,
): Aim | null {
  let best: Aim | null = null
  let nearest = Infinity

  for (const id of world.alive) {
    if (id === presser) continue
    const name = world.blueprint.get(id)
    const blueprint = name ? blueprints[name] : undefined
    if (!blueprint?.triggers?.length) continue

    for (const trigger of blueprint.triggers) {
      if (trigger.on !== 'pressed' || trigger.key !== key) continue
      /**
       * A rule with no `within` is not aimed at anything.
       *
       * It fires wherever you are standing - the board game's own roll is one,
       * reaching the whole table - so there is no "the thing you are pointing
       * at" for it to be. Highlighting the die from across the board because
       * `R` would reach it is not information, it is the whole level lit up.
       */
      if (trigger.within === undefined) continue
      if (!within(world, blueprints, id, presser, trigger.within)) continue
      /**
       * And whose it is, which this file forgot the day `by` arrived.
       *
       * Caught by the test beside it rather than by review, which is the whole
       * argument for that test asserting the *pair*: `aimOf` said a piece was
       * about to move and `fire` refused it, because a preview that
       * re-implements the dispatch drifts the first time the dispatch grows a
       * question. Somebody else's piece would have lit up under your cursor and
       * then done nothing.
       */
      if (trigger.by !== undefined && !carries(world, presser, trigger.by)) continue
      if (!holds(world, id, trigger.when, presser, data)) continue

      // Squared, like `within`'s own test: this only ever ranks, so the root
      // would be arithmetic for a number nothing reads.
      const here = worldTransform(world, id, blueprints)
      const there = worldTransform(world, presser, blueprints)
      const distance =
        (here.x - there.x) ** 2 + (here.y - there.y) ** 2 + (here.z - there.z) ** 2
      if (distance >= nearest) continue
      nearest = distance
      best = { id, at: here, to: destination(world, id, trigger.do, marks, data) }
      break
    }
  }

  return best
}

/**
 * Where a rule's `advance` would put the thing it is about.
 *
 * Only `advance`, and only `target: 'self'`. A `teleport` has a destination too
 * and it is a *static* one - the author already knows where it goes, and it is
 * usually somewhere else entirely, so drawing it would be an arrow pointing off
 * the board. `advance` is the verb whose answer nobody can work out by looking,
 * which is why it is the one worth drawing.
 *
 * The arithmetic is `advance`'s own, deliberately duplicated rather than
 * shared: the verb *moves* the piece and this must not, so the shared thing
 * would be a flag on a verb saying "do not do the thing you are for". Two lines
 * of `at + steps`, with the same two guards, is the cheaper honesty. If they
 * drift, the preview shows a field the press does not use — which the test
 * beside this asserts against the real document.
 */
function destination(
  world: EntityWorld,
  id: EntityId,
  verbs: Blueprint['triggers'][number]['do'],
  marks: readonly Mark[],
  data?: ReadonlyMap<string, number>,
): Mark | null {
  for (const verb of verbs) {
    if (verb.op !== 'advance' || verb.target !== 'self') continue
    const steps = data?.get(verb.by) ?? 0
    if (!Number.isFinite(steps) || steps <= 0) return null
    const at = world.props.get(id)?.[verb.along] ?? 0
    return markByName(marks, `${verb.along}-${at + Math.floor(steps)}`)
  }
  return null
}

/**
 * A press, sent to the thing you are pointing at rather than to everything.
 *
 * ---------------------------------------------------------------------------
 * Why the dispatch needed a second door
 * ---------------------------------------------------------------------------
 * `fire` is per-entity and knows nothing about the others, so a `pressed`
 * trigger with a `within` fires on **every** entity in reach. That is right for
 * a rule that lights three lamps and wrong for a rule that picks something up:
 * standing among four pieces, one press ran the same correct rule four times.
 *
 * The document can stop the *effect* - a level flag the first one to act raises
 * - and it cannot choose *which*, because the choice is between entities and a
 * trigger only ever sees its own. So whichever the engine happened to ask first
 * won, while `aimOf` lit up the nearest. Two answers to "what am I about to
 * touch", drawn and performed by different code.
 *
 * This is the one answer. It is exactly `aimOf`'s, which is the point: the thing
 * under your cursor is the thing that moves.
 *
 * **Only `within` triggers are narrowed**, which `fire` does rather than this -
 * a rule with no reach is not aimed at anything, so the board game's own roll
 * still reaches the whole table and, more to the point, a *put down* still fires
 * for the piece in your hand wherever that hand happens to be. Narrowing whole
 * entities instead was a bug that cost an afternoon: the held piece was not the
 * aimed one, so the press that should have put it down reached nothing at all.
 */
export function pressOn(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  key: string,
  presser: EntityId,
  clock: TriggerClock,
  marks: readonly Mark[] = [],
): Effect[] {
  const aim = aimOf(world, blueprints, key, presser, marks, clock.data)
  const effects: Effect[] = []
  for (const id of [...world.alive]) {
    effects.push(
      ...fire(world, blueprints, id, 'pressed', presser, {
        ...clock,
        key,
        aimed: aim ? aim.id : null,
      }),
    )
  }
  return effects
}
