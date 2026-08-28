/**
 * Where in the track this browser should be, and whether to do anything about
 * it.
 *
 * Pure arithmetic, deliberately separated from the widget it drives. The
 * player is an iframe reached over postMessage and cannot be exercised in bun's
 * test runner - so if the maths lived next to it, the one part of this feature
 * that is actually easy to get wrong would be the one part with no tests. See
 * widget.ts for the side effects.
 *
 * ---------------------------------------------------------------------------
 * What "in sync" can mean here
 * ---------------------------------------------------------------------------
 * Not sample accuracy. Six browsers driving an embedded third-party player over
 * postMessage cannot be frame-locked, and pretending otherwise would produce a
 * correction loop that never settles. What is achievable is that everybody is
 * within about half a second, which for music in a room reads as "the same
 * track" - the thing people actually notice is not a small offset, it is one
 * person being in the chorus while everybody else is in the second verse.
 *
 * So the design is: seek precisely once on arrival, then leave it alone unless
 * it has gone properly wrong. Every seek is an audible stutter, so a loop that
 * corrects a 200ms error makes the track worse in order to fix something no
 * listener could have heard.
 */

/** How far out of step a listener may be before it is worth a stutter to fix. */
export const DRIFT_TOLERANCE_MS = 1_500

/**
 * How often to check, once playing.
 *
 * Ten seconds, and it is a `setInterval` rather than anything frame-driven.
 * Two independent reasons, and both are the sort that produce a bug report
 * about the radio rather than about a timer: `requestAnimationFrame` does not
 * tick in a backgrounded tab, which is exactly when a player drifts most, and
 * it does not tick in the in-app browser pane at all.
 */
export const DRIFT_CHECK_MS = 10_000

export interface Playhead {
  /** ISO timestamp from the database - the anchor the room shares. */
  startedAt: string
  /** Where in the track `startedAt` refers to. */
  positionMs: number
}

/**
 * The point in the track the room is at, right now.
 *
 * `now` is injected rather than read here, which is what makes this testable at
 * all - and it is passed the *browser's* clock, which is the one thing in this
 * file that is allowed to be wrong. It is only ever used to measure an interval
 * against `startedAt`, so a device whose clock is skewed by a constant amount
 * gets a playhead skewed by that same constant. That is a real limitation and
 * the honest one to state: this synchronises listeners whose clocks are roughly
 * right with each other. A machine set to yesterday will not be rescued by any
 * amount of correction.
 *
 * Clamped at zero. An anchor in the future - a clock behind the server's, most
 * likely - would otherwise ask the player to seek to a negative offset, which
 * it refuses, leaving the radio stuck at a point it can never reach.
 */
export function playheadAt(playhead: Playhead, now: number): number {
  const anchor = Date.parse(playhead.startedAt)
  if (!Number.isFinite(anchor)) return Math.max(0, playhead.positionMs)

  return Math.max(0, playhead.positionMs + (now - anchor))
}

/**
 * Should this listener be dragged back into line?
 *
 * Asymmetric on purpose, which is the one judgement call in the file. Being
 * *behind* the room is the ordinary case - a tab that was throttled, a player
 * that buffered - and it is corrected at the tolerance. Being *ahead* is not
 * something playback does on its own; it means something reset or the anchor
 * moved, so there is no reason to be more forgiving about it.
 *
 * The comparison is against the position the *player* reports, not against the
 * last position we asked for. Those diverge precisely when it matters: a seek
 * that landed short, or a track that was still buffering when we placed it.
 */
export function shouldReseek(
  actualMs: number,
  targetMs: number,
  tolerance = DRIFT_TOLERANCE_MS,
): boolean {
  return Math.abs(actualMs - targetMs) > tolerance
}

/**
 * Has the track run out?
 *
 * Worth asking because nothing tells us otherwise. The room's anchor keeps
 * advancing after a three-minute song has finished, so a listener arriving at
 * minute five would be asked to seek past the end - which the player either
 * refuses or answers by silently restarting, and a radio that quietly loops for
 * latecomers while everybody else hears silence is the most confusing possible
 * failure.
 *
 * `durationMs` is 0 until the widget has loaded metadata, and that is treated
 * as "not known yet" rather than "zero length": before the duration arrives,
 * nothing has ended.
 */
export function hasFinished(targetMs: number, durationMs: number): boolean {
  return durationMs > 0 && targetMs >= durationMs
}
