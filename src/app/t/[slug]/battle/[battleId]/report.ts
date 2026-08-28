/**
 * Telling the server something happened in the match, and what to do when that
 * does not arrive.
 *
 * Written out twice in `battle-room.tsx` - once for a goal, once for a knockout
 * - as the same loop with the same two branches, and the comments beside both
 * say the same thing: *this is the case that used to lose a goal permanently*,
 * *this is the case that left the match unfinishable*. A rule with two bug
 * histories and no test is worth one function.
 *
 * ---------------------------------------------------------------------------
 * A refusal and a silence are opposites
 * ---------------------------------------------------------------------------
 * **A decided answer is final.** `ok: false` means the server looked and said
 * no - not in this battle, not live, already counted. Trying again says the
 * same thing more slowly, and the answer is a sentence a player needs to read.
 *
 * **A rejection is worth another go.** The action never landed: the network
 * went, or the write threw on the far side. Nothing was decided, and the caller
 * has usually already shown the thing happening - the ball has been reset and
 * the kickoff broadcast by the time this returns - so giving up quietly leaves
 * the room having watched a goal that never reached the score.
 *
 * Getting those two the wrong way round is the whole failure mode. Retrying a
 * refusal is merely slow; *not* retrying a silence loses the event.
 *
 * ---------------------------------------------------------------------------
 * Why the caller keeps the id
 * ---------------------------------------------------------------------------
 * Retrying is only safe because the caller mints one id and reuses it for every
 * attempt - the decider counts an id at most once, so the same report arriving
 * twice is a no-op rather than a second goal. That belongs at the call site,
 * outside the loop, and this function must never be handed something that mints
 * one per attempt.
 */

export type Reported<E> =
  /** The server took it. */
  | { at: 'done' }
  /** The server looked and said no. The message is for the player. */
  | { at: 'refused'; error: E }
  /** Nobody ever answered, and the attempts are used up. */
  | { at: 'lost' }

/**
 * Generic over what the action calls a refusal, so the caller's own error type
 * survives the trip - a `refusal()` lookup wants the string the action named,
 * not `string | undefined`.
 */
export async function report<E>(
  run: () => Promise<{ ok: true } | { ok: false; error: E }>,
  {
    attempts,
    backoff,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: {
    attempts: number
    /** How long to wait before attempt `n + 1`, given the attempt that failed. */
    backoff: (attempt: number) => number
    /** Injected so a test does not wait out the delays. */
    sleep?: (ms: number) => Promise<void>
  },
): Promise<Reported<E>> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await run()
      return result.ok ? { at: 'done' } : { at: 'refused', error: result.error }
    } catch {
      // Nothing was decided. Wait, unless that was the last go.
      if (attempt === attempts) break
      await sleep(backoff(attempt))
    }
  }

  return { at: 'lost' }
}
