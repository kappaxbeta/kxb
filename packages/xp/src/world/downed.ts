/**
 * Being stunned, being dead, and getting back up — as one decision instead of
 * three interleaved branches.
 *
 * Lifted out of the host's frame callback, where it was ninety lines of `if`
 * against six refs and three React setters. Nothing about it needs a world: it
 * is a small state machine over two clocks and two flags, and every rule in it
 * is the kind that fails *quietly* — you are not told the stun outlived the
 * body, you just cannot walk.
 *
 * ---------------------------------------------------------------------------
 * The orderings, which are the whole content
 * ---------------------------------------------------------------------------
 * **A stun is checked before death.** Dying is the stronger claim on the same
 * freeze, so if this frame is also the frame somebody died, the death branch
 * sets the flag again a few lines later and nothing flickers. The other order
 * stands a corpse up for one frame.
 *
 * **A stun dies with the body.** Whatever was still owed of it is cleared on
 * revival, because standing up at the spawn and finding you cannot move is a
 * punishment for having been killed *while* stunned, which is nobody's rule.
 *
 * **A stun running out unfreezes only if nothing else is holding you down.** A
 * spectator is frozen for good and a body waiting to respawn is frozen until it
 * does; a stun expiring is not news to either.
 *
 * **The instant path must unfreeze too.** A level with `respawn: 0` would
 * otherwise put you back at the start rooted to the spot — there is no wait to
 * hide it behind.
 *
 * ---------------------------------------------------------------------------
 * Why the caller still owns the effects
 * ---------------------------------------------------------------------------
 * `revive` and `announce` come back as flags rather than being done here. Both
 * reach outside — `revivePlayer` writes the entity world, and the announcement
 * is a line on a ticker — and a function that did either would need a world and
 * a React setter to be called at all, which is precisely what stopped this from
 * having a test for as long as it did.
 *
 * `frozen` and `downFor` are `undefined` when this frame has no opinion, which
 * is different from `false` and from `null`. Somebody walking around unstunned
 * is not asking for the freeze to be turned off sixty times a second.
 */

export interface Downed {
  /** Simulated time the stun ends, or null for no stun. */
  stunned: number | null
  /** Seconds left before the body comes back, or null when it is not waiting. */
  dying: number | null
  /** Whether the controller should be held still. `undefined` leaves it. */
  frozen?: boolean
  /** Whole seconds to show on the way back, null for none, `undefined` to leave. */
  downFor?: number | null
  /** Put the body back at its arrival spot with what it started with. */
  revive: boolean
  /** Say so on the ticker. */
  announce: boolean
}

export function stepDowned({
  stunned,
  dying,
  dead,
  out,
  elapsed,
  delta,
  respawn,
}: {
  stunned: number | null
  dying: number | null
  /** Whether the body is out of health right now. */
  dead: boolean
  /** Whether the player is a spectator or eliminated - frozen either way. */
  out: boolean
  /** Seconds of simulated time so far. */
  elapsed: number
  /** This frame's step, in seconds. */
  delta: number
  /**
   * How long the document says to wait before coming back.
   *
   * Zero for every level written before the field existed, which is the old
   * instant path - and the right default rather than a lazy one. On a course,
   * being at the start again *is* the cost, and a second of grey overlay is a
   * second added to every mistake somebody already knows they made.
   */
  respawn: number
}): Downed {
  let nextStunned = stunned
  let nextDying = dying
  let frozen: boolean | undefined
  let downFor: number | null | undefined
  let revive = false
  let announce = false

  if (nextStunned !== null && elapsed >= nextStunned) {
    nextStunned = null
    if (nextDying === null && !out) frozen = false
  }

  if (nextDying !== null) {
    nextDying -= delta
    downFor = nextDying > 0 ? Math.ceil(nextDying) : null

    if (nextDying <= 0) {
      nextDying = null
      frozen = false
      nextStunned = null
      revive = true
    }
  } else if (dead && !out) {
    announce = true

    if (respawn > 0) {
      // Held down rather than revived, and the body is left dead on purpose:
      // reviving is what puts the health back, so doing it now would be standing
      // up instantly and then waiting, which is the wrong order to watch.
      nextDying = respawn
      frozen = true
      downFor = Math.ceil(respawn)
    } else {
      nextStunned = null
      frozen = false
      revive = true
    }
  }

  return { stunned: nextStunned, dying: nextDying, frozen, downFor, revive, announce }
}
