/**
 * The two numbers every place agrees on.
 *
 * The café earns and the house spends, which only means anything if they agree
 * on the balance. They cannot agree by each keeping their own count in their own
 * save - reload the house after a lunch rush and it would still be showing this
 * morning's takings.
 *
 * So the shared numbers live here and nowhere else. A place's own save may still
 * carry `coins`, but that is a fallback for a first load, not the truth:
 * whenever this key exists it wins. That tie-break is the whole design - adding
 * a fourth place is one import, and a corrupt place save costs you a room rather
 * than your money.
 *
 * Everything *else* about a place - which squares are floor, what is on them -
 * stays in that place's own save, because nothing else needs to read it.
 */

import type { DecoratablePlace } from './places'

/**
 * What you start with, before the café has served anybody.
 *
 * Matches the café's old opening float, because that is where money is earned
 * and a player who has never been home should not arrive with a second, secret
 * allowance.
 */
export const STARTING_COINS = 120

/**
 * How comfortable somewhere is, as a whole number.
 *
 * Written by the house and the garden, read by the café, which is what makes
 * decorating something other than a screensaver: a chef who slept somewhere
 * nice gets better tips. It is a *number* rather than the place's save because
 * the café has no business parsing a floor plan to find out.
 *
 * One key per place, and that is not fussiness. They shared a key first, and it
 * meant whichever you had most recently walked around published its score over
 * the other's - furnish the living room, wander into the garden, and the sofa
 * stopped counting. Two numbers that are added is the only arrangement where
 * both places can be improved independently.
 */
export const KEYS = {
  coins: 'world.coins.v1',
  'comfort:home': 'world.comfort.home.v1',
  'comfort:outdoor': 'world.comfort.outdoor.v1',
} as const

export type Shared = keyof typeof KEYS

/**
 * Clamp a stored number to the shape the rest of the game assumes.
 *
 * Here rather than beside the `localStorage` calls because it is the only part
 * of reading a saved number that is a *rule* - whole, never negative - as
 * opposed to a detail of where the bytes came from.
 */
export function normaliseShared(raw: string | null): number | null {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
}

/** The comfort slot a decoratable place writes to. */
export function comfortKey(place: DecoratablePlace): Shared {
  return `comfort:${place}`
}

/**
 * Reading and writing them is *not* here.
 *
 * It used to be: `readShared` and friends reached straight for
 * `window.localStorage`, which meant the module owning the rule about shared
 * numbers could only ever run in a browser - and that nothing in `src/domain/`
 * was, in fact, free of the DOM. The four functions now live in
 * `app/world/shared-save.ts`, which is the honest address for them: they are a
 * storage backend, not a rule.
 *
 * What stays here is what any backend would have to agree on anyway - the key
 * names, the starting balance, and `normaliseShared`. There is an ESLint rule
 * over `src/domain/**` that keeps it that way.
 */
