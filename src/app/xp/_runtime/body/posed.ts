import { isRigged } from '@kxb/xp/packs'
import type { Blueprint, XpMaterial } from '@kxb/xp'
import { drawnModels, type EntityId, type EntityWorld } from '@kxb/xp/engine'

/**
 * Which entities are drawn with a skeleton, and which keep a buffer slot.
 *
 * ---------------------------------------------------------------------------
 * Why this is a function rather than two loops in a component
 * ---------------------------------------------------------------------------
 * It was two loops, and they disagreed. `measure` skipped **every** rigged model
 * when it sized the instanced groups, and the posed list stopped at the cap - so
 * the ninth character in a level was counted by neither and drawn by nothing. It
 * vanished, which is exactly what the comment above the cap said must not
 * happen: a T-posed body is wrong-looking and *there*, and there beats gone.
 *
 * Two readers of one question is how that happens, and the fix is one answer
 * both of them read. It is also the only part of this worth testing - where a
 * body ends up on screen needs a browser, and *which list it is in* is
 * arithmetic.
 *
 * ---------------------------------------------------------------------------
 * What a posed body costs
 * ---------------------------------------------------------------------------
 * One draw call and one `AnimationMixer` each, which is the opposite trade from
 * the instancing everything else uses - one call per model however many copies.
 * So this is for the handful of characters in a level rather than its
 * architecture, and past the cap the rest fall back to being instanced rather
 * than being dropped.
 */

/**
 * How many entities in one level may be drawn with a skeleton.
 *
 * One draw call and one `AnimationMixer` each, which is the opposite trade from
 * the instancing everything else uses - so this is for the handful of characters
 * in a level rather than for its architecture. Eight is a guess with a shape
 * rather than a measurement: more bodies than any level we ship has, and the
 * same order as the peers already in a room (`MAX_PLAYERS` is sixteen, and those
 * are skinned too).
 *
 * Here rather than beside the runtime that first needed it, because the *editor*
 * asks the same question - an author who places a character should be building
 * against the body they will play with, not against a T-pose that turns into one
 * when they press Play. Two caps would be two answers to "does this one get a
 * skeleton", and the disagreement would only show up as the stage and the game
 * looking different.
 */
export const MAX_POSED = 8

/** A body drawn with its bones. */
export interface PosedBody {
  id: EntityId
  model: string
  /** What it holds at rest, from `blueprint.pose`. */
  pose?: string
  scale: number
}

/**
 * Ordered by id, so the answer does not change because a `Set` iterated
 * differently.
 *
 * `world.alive` is insertion-ordered in practice and that is not a promise
 * anybody made. Without a sort, which eight of nine characters get a skeleton
 * would be decided by spawn order in a way nobody could predict or reproduce -
 * and it would change under a respawn. Lowest id first is arbitrary and
 * *stable*, which is the property that matters.
 */
export function posedBodies(
  live: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  max: number,
): PosedBody[] {
  const found: PosedBody[] = []

  for (const id of [...live.alive].sort((a, b) => a - b)) {
    // Before the work, not after the push: checked afterwards, a cap of nought
    // still posed one - the loop had already added it before asking.
    if (found.length >= max) break

    const name = live.blueprint.get(id)
    const blueprint = name ? blueprints[name] : undefined
    if (!blueprint || !isRigged(blueprint.model)) continue
    // A blueprint that draws nothing is not a body to draw with bones - see
    // `drawnModels`, which returns nothing for a node.
    if (drawnModels(blueprint).length === 0) continue

    found.push({
      id,
      model: blueprint.model,
      ...(blueprint.pose ? { pose: blueprint.pose } : {}),
      // The entity's own, from the world - a blueprint has none.
      scale: live.scale.get(id) ?? 1,
    })
  }

  return found
}

/**
 * One instanced group: a model, and the look everything in it is wearing.
 *
 * A pair rather than a model alone because an `InstancedMesh` has exactly one
 * material for every slot in it. Two crates, one of them glowing, cannot share
 * a buffer - so the group is the unit of *both*, and the key below is what
 * makes "the rainbow crates" a group React can mount and unmount on its own.
 */
export interface DrawGroup {
  model: string
  material: XpMaterial
}

/** The two halves as one string, so a `Map` and a React key can hold them. */
export function groupKey(group: DrawGroup): string {
  return group.material === 'own' ? group.model : `${group.model}\u0000${group.material}`
}

export function groupOf(key: string): DrawGroup {
  const cut = key.indexOf('\u0000')
  if (cut < 0) return { model: key, material: 'own' }
  return { model: key.slice(0, cut), material: key.slice(cut + 1) as XpMaterial }
}

/**
 * How many of each model the instanced buffers need room for.
 *
 * **A posed body's own model is skipped and its parts are not.** A rigged
 * blueprint can still carry `parts` - a hat, a pack - and those are props with
 * no bones, drawn the ordinary way and hung off the body by the composition
 * pass. Skipping the whole blueprint would take them with it.
 *
 * Everything else is counted, *including a rigged model past the cap*: that is
 * the fallback, and it only works if the slot is actually reserved.
 *
 * Hidden entities are counted too, deliberately. `hide` is a view - the player's
 * own body in first person - and a buffer sized without it is a buffer that
 * stays empty when the view changes back, so switching to third person would
 * draw nothing at all.
 */
export function instancedCounts(
  live: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  posed: readonly PosedBody[],
): Map<string, number> {
  const skinned = new Map(posed.map((body) => [body.id, body.model]))
  const counts = new Map<string, number>()

  for (const id of live.alive) {
    const name = live.blueprint.get(id)
    const blueprint = name ? blueprints[name] : undefined
    if (!blueprint) continue

    const drawnWithBones = skinned.get(id)
    /**
     * The whole entity's look, applied to every model it draws.
     *
     * A blueprint made of three models is one thing wearing one material, not
     * three things each deciding - which is the same call `shakeOf` makes one
     * layer up when it flinches an entity rather than its parts.
     */
    const material = live.material.get(id) ?? 'own'
    for (const model of drawnModels(blueprint)) {
      if (model === drawnWithBones) continue
      const key = groupKey({ model, material })
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return counts
}
