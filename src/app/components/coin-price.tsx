import { CoinMark } from '@/app/components/coin-mark'

/**
 * A price, with a coin on it.
 *
 * ---------------------------------------------------------------------------
 * One coin, everywhere something costs something
 * ---------------------------------------------------------------------------
 * It started inside the things rail, on the summon button, and every other
 * surface that charged coins wrote its own number in its own way - "300", "50
 * coins", a bare integer beside a label. That is fine on any one screen and
 * wrong across a product: a reader has to work out, each time, whether a number
 * is coins or seconds or a count of something.
 *
 * So the coin is the unit marker and it lives in one file. Anywhere a control
 * spends coins, this goes on it.
 *
 * ---------------------------------------------------------------------------
 * Nothing at zero
 * ---------------------------------------------------------------------------
 * A `0` on every free control is noise that makes the one control with a real
 * price harder to spot, and "free" is what no price means. The caller does not
 * have to remember: passing zero draws nothing.
 *
 * The coin itself is `CoinMark`, not drawn here. It used to be a circle with a
 * dot in it, inline in this file, which was fine until a balance wanted the
 * same coin without wanting a price - see the note there. This file still owns
 * everything about a *price*: the zero rule, the grouping, and the face.
 *
 * ---------------------------------------------------------------------------
 * The number is in the pixel face
 * ---------------------------------------------------------------------------
 * See `.coin-price` in globals.css for why. The short version: this is the one
 * number on a control that is a promise rather than a label, and it was set in
 * whatever the button around it happened to be. The face is also fixed-pitch,
 * which is what makes a column of prices line up on its digits.
 */
export function CoinPrice({
  coins,
  /**
   * Bigger, for a control where the price is the whole point rather than a
   * detail on a button - a shop row, a confirm step.
   */
  size = 'small',
}: {
  coins: number
  size?: 'small' | 'medium'
}) {
  if (coins <= 0) return null

  const px = size === 'medium' ? 12 : 8

  return (
    <span
      className={`coin-price ml-1 inline-flex items-center gap-0.5 align-middle ${
        size === 'medium' ? 'text-sm' : ''
      }`}
    >
      <CoinMark size={px} />
      {/*
        Grouped, and grouped in one fixed locale rather than the reader's.

        Vehicles cost 50,000 on free, and `50000` in a table cell is a number
        nobody reads - it is a length. `toLocaleString()` with no argument would
        be right per reader and wrong here: this renders on the server and again
        in the browser, the two do not agree about the machine's locale, and the
        mismatch is a hydration error on a control somebody is about to press.
      */}
      {coins.toLocaleString('en-US')}
    </span>
  )
}
