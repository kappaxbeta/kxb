import { EPOCH_MS } from '../market/drift'

/**
 * The sandbox's own two decisions.
 *
 * ---------------------------------------------------------------------------
 * A demo market is not born the moment you open it
 * ---------------------------------------------------------------------------
 * That was the first version and it draws a flat line: every epoch in the
 * chart's window clamps to zero, nothing has been mined, and the price sits
 * exactly on the opening ratio until the player has watched it for an hour.
 * The first thing anybody sees of this feature would be a market that appears
 * to be broken.
 *
 * So a demo opens onto a market with a past. Six hours of one: long enough that
 * the mining has visibly moved the price off its opening ratio and that the
 * mood has had time to make a shape, short enough that it is still in the part
 * of the emission curve where things move.
 *
 * Relative to now rather than a fixed date, deliberately. A constant birthday
 * would mean the demo aged - fine this month, and a year from now a flat line
 * at the far end of the halvings, which is the same bug arriving slowly.
 */
export const DEMO_AGE_EPOCHS = 360

export function demoBirth(now: number): number {
  return now - DEMO_AGE_EPOCHS * EPOCH_MS
}
