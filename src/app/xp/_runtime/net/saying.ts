import { PLAYER_ID, type Effect, type Said } from '@kxb/xp/engine'

/**
 * Everything the level was told this frame, gathered from its four sources.
 *
 * Lifted out of the frame callback in ./simulation, which is 1,745 lines long
 * and where this was 65 of them. The move is not about length: this is the one
 * piece of that callback that is a *decision* rather than a step of the
 * simulation - four inputs, two lists out, no world touched - and a decision
 * that cannot be called from a test is a decision nobody can check.
 *
 * ---------------------------------------------------------------------------
 * The four sources, and why they are all here rather than where they arrive
 * ---------------------------------------------------------------------------
 *  1. **Peers**, queued by the socket handler. That handler runs outside the
 *     frame, and writing into the entity world from there would be the second
 *     writer ./simulation keeps refusing.
 *  2. **The unstick button**, as something the level can hear. `from` is the
 *     player so a rule can ask who asked, and a level with no `emitted` rule
 *     for it is unaffected - which is every level with one thing in it and
 *     nothing to strand.
 *  3. **The rail's ball button**, which moves nothing on its own. A separate
 *     event from `unstuck` because they are separate requests: one is about you
 *     and one is about the thing everybody is waiting for. What either of them
 *     *does* is the document's business, so the engine never learns what a ball
 *     is.
 *  4. **This frame's `emit` effects**, from rules and from scripts alike.
 *
 * Both buttons are **counters** compared against what was last told, for the
 * reason `samePlace` in ./spawn exists: pressing one twice from the same place
 * has to do the thing twice, and any value describing *what* was asked for
 * would equal itself and fire once.
 *
 * ---------------------------------------------------------------------------
 * Two lists, because only the roots go on the wire
 * ---------------------------------------------------------------------------
 * `saying` is fed back into `stepEmitted` locally. `outgoing` is what the room
 * is told, and it is deliberately smaller: **a script's emit is left out.**
 *
 * A script runs on every client from the same inputs and reaches the same
 * conclusions, so its emit has already happened on every machine and sending it
 * would fire every listener twice. A rule has not - `stepTriggers` is handed
 * one prober, the local player, so a rule caused by a body fired here and
 * nowhere else, which is the hole this closes.
 *
 * Nor is the resulting *chain* sent. A peer receiving `gate-open` runs its own
 * `emitted` rules and produces the same chain from it; sending the chain too
 * would fire every link twice. Only the roots, which is exactly what this
 * returns - the chain is what the caller's `stepEmitted` produces afterwards.
 *
 * Pure, and returning the new counter values rather than writing them: the refs
 * that hold them belong to the component, and a function that reaches into them
 * is one a test has to build refs to call.
 */
export interface SayingSources {
  /** What peers said, drained by the caller once this has read it. */
  fromPeers: readonly Said[]
  /** How many times the player has pressed unstick, and what was last told. */
  revives: number
  toldUnstick: number
  /** How many times the rail has asked for the ball back, and what was last told. */
  ballBackAt: number | undefined
  toldBallBack: number
  /** This frame's effects so far, which is where an `emit` arrives. */
  effects: readonly Effect[]
}

export interface Saying {
  /** Everything heard, to be fed back through `stepEmitted` locally. */
  saying: Said[]
  /** The subset the room is told: rule emits only, roots only. */
  outgoing: Said[]
  /** The counters as they now stand, for the caller to store back. */
  toldUnstick: number
  toldBallBack: number
}

export function collectSaying({
  fromPeers,
  revives,
  toldUnstick,
  ballBackAt,
  toldBallBack,
  effects,
}: SayingSources): Saying {
  const saying: Said[] = [...fromPeers]
  const outgoing: Said[] = []

  if (toldUnstick !== revives) {
    toldUnstick = revives
    if (revives > 0) saying.push({ event: 'unstuck', from: PLAYER_ID })
  }

  const wantBall = ballBackAt ?? 0
  if (toldBallBack !== wantBall) {
    toldBallBack = wantBall
    if (wantBall > 0) saying.push({ event: 'ball back', from: PLAYER_ID })
  }

  for (const effect of effects) {
    if (effect.kind !== 'emit') continue
    saying.push({ event: effect.event, from: effect.from })
    if (!effect.script) outgoing.push({ event: effect.event, from: effect.from })
  }

  return { saying, outgoing, toldUnstick, toldBallBack }
}
