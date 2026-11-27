/**
 * How much trouble a peer's link is in, as one number from 0 to 1.
 *
 * `peer-motion` already measures everything this needs - it has to, to decide
 * how far in the past to draw somebody - and this is only a reading of those
 * estimates for something that wants to *show* the trouble rather than hide
 * it. The lounge's glitch shader is the first such thing: a room can choose to
 * draw a peer on a bad connection as a body tearing and shifting hue, which
 * tells everybody looking at them why they are stuttering across the floor.
 *
 * Two things count as trouble, and the reading is whichever is worse:
 *
 *   * **Jitter.** Packets are arriving, but not when they should. Measured
 *     against the peer's own cadence rather than a constant, for the reason
 *     `peer-motion` gives at length: a 20Hz sender and an 8Hz sender have
 *     different ideas of "late". A floor in milliseconds sits under the
 *     cadence-relative one so a fast sender is not judged on twenty
 *     milliseconds of spread that nobody would ever see.
 *
 *   * **Silence.** Nothing has arrived for longer than a still body can
 *     explain. A peer standing still sends a keepalive every `KEEPALIVE_MS`,
 *     so the first two and a bit seconds of quiet are ordinary and read as
 *     nothing; past that the reading climbs, reaching one at the point
 *     `peer-motion` gives up on the history and re-baselines.
 *
 * Pure, so it can be tested against a hand-built buffer.
 */

import { KEEPALIVE_MS } from '@/app/world/_presence/presence-core'
import type { MotionBuffer } from '@/app/world/_presence/peer-motion'

/**
 * Below this much spread, in ms, a link is fine whatever its cadence.
 *
 * The spread is a mean absolute deviation, so it cannot climb much past the
 * cadence itself - gaps between nothing and twice the interval is as bad as
 * an alternating link gets - which is why "full" below is near one cadence
 * rather than several.
 */
const JITTER_FLOOR_MS = 60
/** Spread this large, in ms, is full trouble on any cadence. */
const JITTER_CEILING_MS = 150

/**
 * Quiet longer than this starts to look like a stall rather than a still body.
 *
 * A quarter over the keepalive, which is the headroom one late keepalive needs
 * before it counts against anyone.
 */
const SILENCE_FROM_MS = KEEPALIVE_MS * 1.25
/** Quiet this long is a link that has, for now, gone. */
const SILENCE_FULL_MS = KEEPALIVE_MS * 2.5

export function linkTrouble(buffer: MotionBuffer, now: number): number {
  if (buffer.lastArrival === null) return 0

  const jitterFrom = Math.max(buffer.cadence * 0.4, JITTER_FLOOR_MS)
  const jitterFull = Math.max(buffer.cadence * 1.2, JITTER_CEILING_MS)
  const jitter = ramp(buffer.jitter, jitterFrom, jitterFull)

  const silence = ramp(now - buffer.lastArrival, SILENCE_FROM_MS, SILENCE_FULL_MS)

  return Math.max(jitter, silence)
}

/** Zero at or below `from`, one at or above `to`, straight between. */
function ramp(value: number, from: number, to: number): number {
  if (value <= from) return 0
  if (value >= to) return 1
  return (value - from) / (to - from)
}
