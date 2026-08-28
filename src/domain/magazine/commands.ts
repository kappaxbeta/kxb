import { z } from 'zod'

/**
 * What can be asked of a magazine.
 *
 * `xpRef` is validated as a shape here and resolved as a *thing* in the action -
 * the decider cannot do I/O, so "is this a real XP this space may see" is not a
 * question it can answer. What it can answer is "is this already in", which is
 * the invariant the aggregate exists for.
 */

export const xpRefSchema = z
  .string()
  .trim()
  .min(1, 'Pick an XP')
  .max(200, 'That reference is too long')

export const takeInSchema = z.object({
  xpRef: xpRefSchema,
  name: z.string().trim().min(1, 'That XP has no name').max(120),
})

export type TakeInXp = {
  type: 'TakeInXp'
  xpRef: string
  name: string
}

export type PutBackXp = {
  type: 'PutBackXp'
  xpRef: string
}

/**
 * Swap a shelf entry for a newer version of the same level.
 *
 * One command rather than a put-back and a take-in from the surface, because
 * the two together are one intent and must not half-happen. A client that sent
 * both would leave a shelf with the level missing altogether if the second call
 * lost the race - and the shelf is shared, so that is somebody else's Friday
 * game disappearing rather than the presser's own mistake.
 *
 * The old reference is named rather than looked up, for the reason `PutBackXp`
 * names one: the decider cannot do I/O, and "which version were they looking
 * at" is a fact about the screen that pressed the button. If the shelf moved
 * underneath them the aggregate refuses, which is the answer that lets them
 * look again.
 */
export type RestockXp = {
  type: 'RestockXp'
  /** What the shelf holds now. */
  from: string
  /** The version to hold instead. */
  to: string
  /** The level's own name, at the version being taken in. */
  name: string
}

/** Follow new versions without asking, or stop. */
export type SetShelfFollow = {
  type: 'SetShelfFollow'
  on: boolean
}

export type MagazineCommand = TakeInXp | PutBackXp | RestockXp | SetShelfFollow
