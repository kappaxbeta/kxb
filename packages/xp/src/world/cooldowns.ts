/**
 * The wait between one press of a key and the next.
 *
 * ---------------------------------------------------------------------------
 * Why a cooldown is a fact about a key rather than about a verb
 * ---------------------------------------------------------------------------
 * Asked for on a dash - *"a dash has a cooldown phase from 3 seconds"* - and
 * then for the same thing on any binding, which is the version worth building:
 * `dash` is one of a dozen verbs and the reason it wanted a wait has nothing to
 * do with shoving. A key you can lean on is a key that stops being a decision,
 * and that is as true of a kick as of a dash.
 *
 * So the number lives on the binding (`PlayerKey.cooldown`, ./format) and the
 * refusal lives on the *press*. Nothing here narrows what a document may do: a
 * rule that dashes a crate down a slope every second, a script that kicks a ball
 * about on a timer, an author's own `emit` - all untouched, because none of them
 * is a person leaning on a button.
 *
 * ---------------------------------------------------------------------------
 * How this composes with the two gates that came first
 * ---------------------------------------------------------------------------
 * Three things can refuse one press, and they are asked in this order:
 *
 * 1. `allowedIn` - what the *phase* leaves live. A kick off that says
 *    `"allow": ["dash"]` has taken the kick key away entirely.
 * 2. `allowedFor` - and what this player's *role* leaves of that. A role can
 *    only ever narrow, never hand a key back.
 * 3. `coolingLeft` - and whether the key that survived both is still warm.
 *
 * The order is the readable one and it is not arbitrary. A key the phase has
 * taken away is not cooling down - it is *not there*, so its button is gone and
 * a ring counting down on nothing would be describing a wait nobody is waiting
 * for. Cooling is the last word on a key that otherwise would have worked.
 *
 * **The wait is not paused by a phase, and that is deliberate.** Press the dash
 * a moment before the whistle and the three seconds run through the break, so
 * the key is ready when play restarts. The alternative - a wait that only ticks
 * while the key is live - would mean a level's phases could silently lengthen
 * every cooldown in it, which is a rule nobody wrote and nobody could see.
 *
 * Everything here is pure and takes the time as an argument: see the note at the
 * top of `@kxb/xp/engine`. The host must count in the *simulated* seconds a rule
 * sees rather than off a wall clock, or a tab that spent a minute in the
 * background comes back with a button that says ready and a gate that refuses.
 */

import type { PlayerKey } from '../document/format'

/**
 * How much of a key's wait is left: seconds, never negative, never more than the
 * wait itself.
 *
 * One function rather than a boolean beside a number, because the two questions
 * asked of it must never disagree. The host refuses a press while this is above
 * zero and the button draws a ring the size of what it returns, so a button that
 * reads ready and does nothing is not a state this can produce.
 *
 * Clamped at both ends. Below, because a deadline long past is not a wait owed
 * backwards - and a gate written as `left !== 0` would otherwise refuse the key
 * for the rest of the session. Above, because `readyAt` and `now` come off the
 * same clock, so a wait longer than the whole cooldown can only mean the two
 * have drifted - in which case a full ring is the honest way to be wrong.
 */
export function coolingLeft(readyAt: number, now: number, cooldown: number): number {
  return Math.max(0, Math.min(cooldown, readyAt - now))
}

/**
 * The same answer as a fraction, which is what a ring is drawn from.
 *
 * Here rather than in the runtime because it is the one piece of arithmetic the
 * gate and the display share, and a second copy of it in a component is how a
 * button comes to empty half a second before the key comes back. Zero for a key
 * with no wait on it, so a caller can ask about every binding and draw nothing
 * for most of them.
 */
export function coolingFraction(readyAt: number, now: number, cooldown: number): number {
  if (!(cooldown > 0)) return 0
  return coolingLeft(readyAt, now, cooldown) / cooldown
}

/**
 * Which of a document's keys have a wait, by the name they emit.
 *
 * Keyed by `does` rather than by key code, because that is the name everything
 * downstream of a keystroke uses: the rules hear a name, the phone's buttons are
 * named, and a headset has no key codes at all. See ./actions in the runtime,
 * where the code is turned into the name exactly once.
 *
 * Bindings with no cooldown are left out rather than entered as zero, so an
 * empty map is the honest answer for every level written before the field
 * existed - and a host can skip the whole mechanism by asking `size`.
 *
 * **First binding wins**, matching `pressBuffer`: the format refuses a document
 * that binds one key twice, so a duplicate can only arrive from a caller that
 * skipped the parser, and the panel that lists them lists them in order.
 */
export function cooldownsOf(keys: readonly PlayerKey[] | undefined): Map<string, number> {
  const waits = new Map<string, number>()
  for (const bound of keys ?? []) {
    const does = bound.does?.trim()
    if (!does || bound.cooldown === undefined || !(bound.cooldown > 0)) continue
    if (!waits.has(does)) waits.set(does, bound.cooldown)
  }
  return waits
}

/**
 * Which of this frame's presses are through their wait, and when each is next
 * ready.
 *
 * ---------------------------------------------------------------------------
 * A press dropped here, rather than a verb refused in the engine
 * ---------------------------------------------------------------------------
 * The wait belongs to *this player pressing a key*. A cooldown inside the verb
 * would be the engine deciding how often a document may dash anything - a rule
 * shoving a crate down a slope every second, a script dashing a fish across a
 * pond - and none of that was asked for. A verb stays something a level may
 * spend freely; the **key** is what has a wait on it.
 *
 * Dropped rather than queued, for the same reason a press the phase does not
 * allow is dropped: one held back and fired three seconds later is a dash
 * arriving at a moment the player has stopped expecting, which is worse than
 * one that plainly did not happen.
 *
 * And **the whole press is dropped, not only the verb that cooled** - a level
 * that emits a line or spends a bar on the same press meant that as part of the
 * move, so half of it firing would be a level saying something it did not do.
 *
 * The key is armed on the press that *got through* rather than on whatever came
 * of it: a key is what somebody spent, and whether the level chose to do
 * anything with it is the level's business.
 *
 * Returns the arm times rather than writing them, so the caller's map stays the
 * caller's. `waits` empty means every press passes and nothing is armed, which
 * is nearly every document.
 */
export function throughCooling({
  pressed,
  waits,
  readyAt,
  now,
}: {
  /** The keys pressed this frame, by their `does` name. */
  pressed: readonly string[]
  /** Seconds of wait per key. See `cooldownsOf`. */
  waits: ReadonlyMap<string, number>
  /** When each key next becomes usable, in the same clock as `now`. */
  readyAt: ReadonlyMap<string, number>
  /** Seconds of simulated time so far. */
  now: number
}): {
  /** The presses that may go on to fire. */
  asked: readonly string[]
  /** Keys to re-arm, and the time each is ready again. Empty when none cooled. */
  armed: ReadonlyMap<string, number>
} {
  if (waits.size === 0) return { asked: pressed, armed: new Map() }

  const asked = pressed.filter(
    (one) => coolingLeft(readyAt.get(one) ?? 0, now, waits.get(one) ?? 0) <= 0,
  )

  const armed = new Map<string, number>()
  for (const one of asked) {
    const wait = waits.get(one)
    if (wait !== undefined) armed.set(one, now + wait)
  }

  return { asked, armed }
}
