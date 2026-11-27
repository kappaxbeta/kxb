import type { PeepSpec } from '@/domain/studio/scene'
import type { Actor } from '@/domain/studio/shot'
import { lookLabel } from '@/domain/studio/scene'

/**
 * Copying a body, in either studio.
 *
 * Arranging one peep is most of the work of arranging a peep: the animal, the
 * size, the lean, the glow, the bubble heights, and - in the motion studio -
 * a list of moves and a keyed performance on top of them. A second one that
 * differs by a metre and a line of dialogue was previously "add a peep, then
 * set thirteen controls back to what the first one says", which is a job
 * nobody does twice without getting one of them wrong.
 *
 * Its own file rather than a method on each document because it is one idea
 * with two spellings. A still's peep and a shot's actor are different types -
 * one is an instant, the other is a performance - but "the same body, beside
 * itself" means exactly the same thing to both, and the two rules it obeys
 * (clone deeply, then nudge) are the whole of what a caller needs to know.
 *
 * ---------------------------------------------------------------------------
 * Why the clone is deep
 * ---------------------------------------------------------------------------
 * Both documents are edited immutably - the panels hand back a new document
 * rather than mutating one - but a spread is only one level deep, and an actor
 * carries an array of actions, a map of key tracks, a glow and possibly a whole
 * keyed pose. A shallow copy shares all of those, so moving the copy's second
 * action would move the original's, and the two would stay welded together
 * until somebody replaced the array wholesale. That is a bug that looks like
 * the editor being haunted, so it is prevented here rather than diagnosed
 * later.
 */

/**
 * How far the copy stands from the body it came from, in blocks.
 *
 * Enough to read as two animals rather than one drawn twice, and small enough
 * that the copy is still in shot - the point is that you see it appear where
 * you were looking, then move it where you meant.
 */
export const COPY_NUDGE = 0.9

/** The same peep, deeply copied and stood next to itself. */
export function copyPeep(peep: PeepSpec): PeepSpec {
  const copy = structuredClone(peep)
  return { ...copy, x: copy.x + COPY_NUDGE }
}

/**
 * The same actor, deeply copied, stood next to itself and given a name of its
 * own.
 *
 * The name matters here in a way it does not for a still: the timeline is a
 * column of rows labelled by name, and two identical labels is a timeline where
 * you cannot tell whose moves you are dragging. `taken` is the rest of the
 * cast, so a third copy is "Penguin copy 3" rather than a second "Penguin
 * copy".
 *
 * Note the actor keeps its *start* pose and its actions rather than the place
 * it happens to be standing at the playhead. A shot's positions are relative -
 * each move leaves the body where it finished - so copying "where they are
 * now" would produce an actor that walks the same path from a different origin
 * the moment you scrub. Home plus the same directions is the copy somebody
 * means.
 */
export function copyActor(actor: Actor, taken: string[] = []): Actor {
  const copy = structuredClone(actor)
  return {
    ...copy,
    x: copy.x + COPY_NUDGE,
    name: freeName(actor.name || lookLabel(actor.avatar), taken),
  }
}

/**
 * The list with `item` put directly after position `index`.
 *
 * Directly after rather than appended, so a copy is the next row down instead
 * of the last row of twenty-four. Here rather than at the two call sites
 * because "beside itself" is what this whole file means, and `toSpliced` -
 * which is what this is - is newer than the browsers the studio still opens
 * in.
 */
export function insertAfter<T>(list: T[], index: number, item: T): T[] {
  return [...list.slice(0, index + 1), item, ...list.slice(index + 1)]
}

/**
 * "Penguin copy", or "Penguin copy 2" when that is spoken for.
 *
 * Counts up rather than appending "copy" again, so duplicating a duplicate does
 * not read as "Penguin copy copy copy" after an afternoon.
 */
function freeName(base: string, taken: string[]): string {
  const used = new Set(taken)
  const first = `${base} copy`
  if (!used.has(first)) return first

  for (let n = 2; n < 100; n += 1) {
    const next = `${first} ${n}`
    if (!used.has(next)) return next
  }
  return first
}
