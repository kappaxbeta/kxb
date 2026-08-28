import { type Action, newAction, ordered } from '@/domain/studio/action'
import { at } from '@/domain/studio/keys'
import type { Actor } from '@/domain/studio/shot'

/**
 * Putting an actor somewhere, at the moment you are looking at.
 *
 * The props panel edits `actor.x`/`z`/`rotation`, which are where the animal
 * *starts* - and that was the whole trouble. Scrub to four seconds, drag the
 * pad, and the peep moves; scrub back and they have moved at the start too,
 * because the only thing that changed was the pose everything else is measured
 * from. The performance shifts under you and the frame you were composing is
 * gone. People read that as the editor being broken, and they were not far off:
 * a control that reports the position at the playhead should change the
 * position at the playhead.
 *
 * So: at the top of the shot, the start pose is the right thing to edit and
 * nothing here changes. Anywhere else, the edit becomes a move (or a turn) that
 * *lands* on the playhead - the actor is where you put them at the instant you
 * put them there, and everything before it is the walk that got them there.
 *
 * Arriving rather than departing is the whole trick, and it is the opposite of
 * what `newAction` does. A move that starts at the playhead leaves the actor
 * standing where they were in the frame you are looking at and moves them in
 * the frames after it, which is exactly not what dragging something in a viewer
 * means anywhere else. Arriving means what you see is what you set.
 */

/** How long a placed walk takes, when there is room for the whole of it. */
export const PLACE_WALK = 1.5

/** How long a placed turn takes. Matches `newAction`'s turn. */
export const PLACE_TURN = 0.6

/**
 * Close enough to be the same instant.
 *
 * A hundredth of a second, which is what `at` rounds to - so an action this
 * function placed is always recognised as its own on the next drag, and the
 * pad does not leave a trail of one-frame walks behind it while you scrub for
 * the right spot.
 */
const SAME_MOMENT = 0.02

/** Is the playhead effectively at the top of the shot? */
export function atStart(time: number): boolean {
  return time <= SAME_MOMENT
}

/**
 * Move this actor to a spot, as of `time`.
 *
 * Returns a whole new actor, so the caller's `set({...})` shape is unchanged.
 * The spot is partial: the pad sends x and z, the number fields send one at a
 * time, and an axis that is not named keeps whatever the actor is doing on it.
 */
export function placeActor(
  actor: Actor,
  time: number,
  spot: { x?: number; z?: number },
  /** Where the actor already is at `time`, so an unnamed axis is preserved. */
  here: { x: number; z: number },
): Actor {
  if (atStart(time)) {
    return { ...actor, ...(spot.x === undefined ? {} : { x: spot.x }), ...(spot.z === undefined ? {} : { z: spot.z }) }
  }

  const x = spot.x ?? here.x
  const z = spot.z ?? here.z

  const landing = at(time)
  const existing = actor.actions.findIndex(
    (action) => action.kind === 'move' && Math.abs(action.t + action.duration - landing) < SAME_MOMENT,
  )

  if (existing !== -1) {
    /**
     * Adjusted rather than added.
     *
     * Without this, every pointermove of a drag would append another walk -
     * sixty of them a second, all landing on the same instant, and the shot
     * would be unusable inside one gesture. Recognising our own is what makes
     * the pad a *control* rather than a stamp.
     */
    return {
      ...actor,
      actions: actor.actions.map((action, index) =>
        index === existing && action.kind === 'move' ? { ...action, x, z } : action,
      ),
    }
  }

  /**
   * A fresh walk, ending here.
   *
   * Shortened when the playhead is near the top rather than allowed to start
   * before zero - a move at a negative time is a move the sampler will never
   * reach, so it would look like the drag did nothing.
   */
  const duration = Math.max(SAME_MOMENT, Math.min(PLACE_WALK, landing))
  const walk: Action = { kind: 'move', t: at(landing - duration), duration: at(duration), x, z }

  return { ...actor, actions: ordered([...actor.actions, walk]) }
}

/** The same, for which way they are facing. */
export function turnActor(actor: Actor, time: number, rotation: number): Actor {
  if (atStart(time)) return { ...actor, rotation }

  const landing = at(time)
  const existing = actor.actions.findIndex(
    (action) => action.kind === 'turn' && Math.abs(action.t + action.duration - landing) < SAME_MOMENT,
  )

  if (existing !== -1) {
    return {
      ...actor,
      actions: actor.actions.map((action, index) =>
        index === existing && action.kind === 'turn' ? { ...action, rotation } : action,
      ),
    }
  }

  const duration = Math.max(SAME_MOMENT, Math.min(PLACE_TURN, landing))
  const turn = { ...newAction('turn', at(landing - duration), { x: 0, z: 0, rotation }), duration: at(duration) }

  return { ...actor, actions: ordered([...actor.actions, turn]) }
}
