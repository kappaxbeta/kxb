/**
 * How much a xoin is, as an integer.
 *
 * ---------------------------------------------------------------------------
 * Integers, all the way down
 * ---------------------------------------------------------------------------
 * Every quantity in this package is a whole number of the smallest unit, and
 * nothing here holds a fraction. That is not fussiness: the pool below is a
 * constant-product market maker, and the one property it exists to guarantee -
 * that it can never pay out more coins than it holds - is a statement about
 * exact arithmetic. Float it and the guarantee becomes "almost never", which
 * for money is the same as "no".
 *
 * A coin is already an integer everywhere else in the product (see
 * `docs/product/economy.md`), so the coin side needs nothing. The xoin side
 * does, because a market whose smallest tradeable amount is one whole xoin is a
 * market where the price can only ever be a whole number of coins - and a
 * price that cannot move by less than a coin is not a price, it is a shelf tag.
 */

/** Specks in one xoin. Three decimals of display, and no more. */
export const SPECKS = 1_000

/**
 * The name of the small unit, for the one place in the UI that says it out
 * loud. Exported rather than typed into a component so the game and the
 * settings card cannot disagree about it.
 */
export const SPECK_LABEL = 'specks'

/** Whole xoin as specks. For fixtures and opening balances, never for a trade. */
export function xoin(whole: number): number {
  return Math.round(whole * SPECKS)
}

/**
 * Specks as a display string, always three decimals.
 *
 * Fixed rather than trimmed, because this number sits in a column next to
 * other ones and a market whose figures jump about by a character width as
 * they change is a market that is hard to read at a glance - which is the only
 * way anybody reads a ticker.
 */
export function formatXoin(specks: number): string {
  const sign = specks < 0 ? '-' : ''
  const abs = Math.abs(specks)
  return `${sign}${Math.floor(abs / SPECKS)}.${String(abs % SPECKS).padStart(3, '0')}`
}
