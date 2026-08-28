import { useRef } from 'react'

/**
 * What the body is doing instead of walking, and which of those wins.
 *
 * Four refs that already knew they belonged together — their comments in
 * `../simulation` cross-referenced each other before this file existed: *"a
 * countdown rather than a flag, like the recoil above"*, *"a latch rather than
 * a countdown, unlike every other ref around it"*. They were declared forty
 * lines apart with unrelated refs between them.
 *
 * ---------------------------------------------------------------------------
 * Three countdowns and a latch
 * ---------------------------------------------------------------------------
 * A **countdown** because each clip has a length, and the body has to go back
 * to what it was doing when it ends. Holding a flag until something cleared it
 * would leave somebody standing rigid between shots.
 *
 * Dancing is the **latch**, and it is the one stance the player chooses rather
 * than one that happens to them — so it ends when they walk out of it, not on a
 * timer. See `../simulation`'s stride check.
 *
 * ---------------------------------------------------------------------------
 * The flinch is driven by the health, not by whoever took it
 * ---------------------------------------------------------------------------
 * Damage arrives from a hazard trigger, a verb, a script, the arbiter's readback
 * and a fall, and any one of those forgetting to announce itself would be a body
 * that takes a hit silently. `Hit_A` had been in the pack since bodies could be
 * animated and had never once played, so taking twenty-five health off somebody
 * looked exactly like missing them — from both ends. Watching the number catches
 * every source, including the ones added next.
 */
export interface Stance {
  /** Seconds left of a flinch. */
  hurt: React.RefObject<number>
  /** Seconds left of the kick after a shot. */
  recoil: React.RefObject<number>
  /** Seconds left of the swing an `attack` press started. */
  swing: React.RefObject<number>
  /** Whether this player is dancing, which is the one stance they choose. */
  dancing: React.RefObject<boolean>
}

export function useStance(): Stance {
  return {
    hurt: useRef(0),
    recoil: useRef(0),
    swing: useRef(0),
    dancing: useRef(false),
  }
}

/**
 * A frame's worth off each countdown.
 *
 * One call, because it was the same three lines written out in three places in
 * the frame - beside the press that starts a swing, beside the shot that starts
 * a recoil, and beside the health check that starts a flinch. Three copies of
 * `Math.max(0, x - delta)` is three chances for one of them to be forgotten
 * when a fourth clip is added, and the symptom would be a body stuck mid-swing.
 *
 * The latch is not touched: dancing ends by walking, not by waiting.
 */
export function tickStance(stance: Stance, delta: number): void {
  for (const clock of [stance.hurt, stance.recoil, stance.swing]) {
    if (clock.current > 0) clock.current = Math.max(0, clock.current - delta)
  }
}

/** What the body plays, in the order that decides it. */
export type Motion = 'dead' | 'hit' | 'shoot' | 'attack' | 'dance' | null

/**
 * Which stance wins when several are running at once.
 *
 * **Dead beats hurt beats shooting.** A body that fires and is hit in the same
 * frame plays the hit: the shot is a thing you did and the hit is a thing that
 * happened to you, and the second is the one the person holding the mouse
 * cannot otherwise see.
 *
 * Taking numbers rather than the refs so this is a question about four values
 * and can be asked without any. The caller reads `.current` at the moment the
 * frame asks — a render-time read of a frame-time value is how the two come to
 * disagree, which is what React's compiler refuses and is right to.
 */
export function motionOf({
  down,
  hurt,
  recoil,
  swing,
  dancing,
}: {
  /** Whether the player is down. Null when they are not. */
  down: number | null
  hurt: number
  recoil: number
  swing: number
  dancing: boolean
}): Motion {
  if (down !== null) return 'dead'
  if (hurt > 0) return 'hit'
  if (recoil > 0) return 'shoot'
  if (swing > 0) return 'attack'
  if (dancing) return 'dance'
  return null
}
