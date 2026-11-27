import { SPECKS } from './units'

/**
 * What the market does when nobody is trading.
 *
 * ---------------------------------------------------------------------------
 * Why there has to be anything here at all
 * ---------------------------------------------------------------------------
 * A constant-product pool on its own only moves when somebody trades against
 * it. That is correct and it is also unplayable: the first person to open the
 * cartridge in a quiet space sees a flat line and a number that will not change
 * until a second person arrives. The fantasy being sold is a market that is
 * *doing something* whether or not you are watching it, so something has to
 * move it.
 *
 * ---------------------------------------------------------------------------
 * It moves the xoin side, and never the coin side
 * ---------------------------------------------------------------------------
 * This is the load-bearing rule of the whole feature and it is enforced here
 * rather than argued about downstream. Everything in this file changes how many
 * xoin exist; nothing in it changes how many coins are in the pool. A coin
 * enters the pool only because a player put it there.
 *
 * That is what keeps `docs/product/xoin.md`'s promise that the market cannot
 * mint: `pool.ts` can only ever pay out of coins that were paid in, so the
 * worst a runaway drift can do is make a xoin worthless. Let drift touch the
 * coin side - even to "seed liquidity" - and the pool becomes a faucet, which
 * `docs/product/economy.md` §6.2 spends a section explaining we cannot have.
 *
 * ---------------------------------------------------------------------------
 * Closed form, because a fold would grow forever
 * ---------------------------------------------------------------------------
 * Every function here answers for an epoch directly rather than by walking to
 * it. The obvious implementation - apply a tick, store the result, repeat - is
 * a market whose price depends on how often somebody happened to load the page,
 * and a market that costs more to read the older it gets. Both are answers to
 * the same question: two clients that opened the cartridge an hour apart must
 * agree on the price, without asking each other and without a server telling
 * them.
 */

/**
 * How long a tick of the world is.
 *
 * A minute. Short enough that a price visibly moves while somebody watches it,
 * long enough that a chart of a day is fourteen hundred points rather than a
 * hundred thousand - and, more importantly, that two clients whose clocks
 * disagree by a few seconds are almost always in the same epoch. They are
 * allowed to disagree: see `quoteAt` in `pool.ts`, where a trade carries the
 * price the player accepted and the authority re-prices it at its own epoch.
 */
export const EPOCH_MS = 60_000

/** Which epoch a wall-clock instant falls in. Epoch 0 is the market's birth. */
export function epochAt(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / EPOCH_MS))
}

/**
 * Specks mined in the market's first era, per epoch.
 *
 * A quarter of a xoin a minute, and the number only means anything read against
 * `OPENING_SPECKS` in `pool.ts`: four hundred xoin, so an untraded market
 * inflates by a little under four percent an hour. Fast for money and about
 * right for a toy - a player who bought and wandered off comes back to a
 * position that has moved, which is the point of holding one.
 *
 * Where the halvings take it is the half worth checking before changing this.
 * The first era adds roughly seven hundred xoin and every era after it adds
 * half of the one before, so the float converges at somewhere under two
 * thousand - a market that ends up about four times cheaper than it opened and
 * then stops. An emission that did not converge would be a price heading to
 * zero on a long enough view, which is a story with one ending.
 */
export const EMISSION = SPECKS / 4

/**
 * How many epochs before the reward halves.
 *
 * Two days of minutes. The halving is a straight lift from the thing being
 * parodied and it earns its place: it is the one supply rule a player is likely
 * to already know, and it gives a market that is wildly inflationary in its
 * first week and nearly fixed by its second month. A market that inflated at a
 * constant rate forever would have exactly one story in it.
 */
export const HALVING_EPOCHS = 2_880

/** After this many halvings the reward is zero for any sane `EMISSION`. */
const ERAS = 32

/**
 * Total specks mined by the end of epoch `e`, as a closed form.
 *
 * The sum of a step function: every whole era contributes its rate times its
 * length, and the era `e` falls in contributes the part of it that has passed.
 * Integer halving by shifting, so the reward reaches exactly zero rather than
 * approaching it through fractions nobody can hold.
 */
export function mined(e: number): number {
  if (e <= 0) return 0
  let total = 0
  for (let era = 0; era < ERAS; era += 1) {
    const rate = Math.floor(EMISSION / 2 ** era)
    if (rate <= 0) break
    const from = era * HALVING_EPOCHS
    if (e <= from) break
    const epochsInEra = Math.min(e - from, HALVING_EPOCHS)
    total += rate * epochsInEra
  }
  return total
}

/** 32-bit hash of a market's seed string, so every client starts the same. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A hashed value in [0, 1) for one (seed, epoch). Used for texture, not shape. */
function jitter(seed: number, e: number): number {
  let h = (seed ^ Math.imul(e + 1, 0x9e3779b9)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x21f0aaad) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 0x100000000
}

/**
 * Sentiment at an epoch, in [-1, 1].
 *
 * Three sines and a shake, and the balance between them is the whole character
 * of the thing.
 *
 * The first version put half the amplitude on a seven-minute cycle, and against
 * the ninety-minute window the chart is drawn in that is thirteen full swings
 * across the picture: it read as a sawtooth, which is noise wearing a market's
 * clothes. Nobody looks at a sawtooth and forms a view about it, and forming a
 * view is the entire activity on offer here.
 *
 * So the weight is on the slow component and the periods are pushed out - about
 * twenty minutes, an hour and a half, and most of a day. Across a ninety-minute
 * chart that is a trend, a couple of swings inside it, and some texture, which
 * is what a market looks like. The fast term is still there because a line with
 * only slow components is a line that appears not to be live.
 *
 * The hashed term is a twentieth of the amplitude and exists only to stop the
 * line looking drawn with a compass.
 *
 * Phases come from the seed, which is what makes two spaces' markets different
 * stories rather than the same one on different axes.
 */
export function sentiment(seed: number, e: number): number {
  const phase = (n: number) => jitter(seed, -n) * Math.PI * 2
  const wave =
    0.15 * Math.sin((e / 23) * 2 * Math.PI + phase(1)) +
    0.3 * Math.sin((e / 97) * 2 * Math.PI + phase(2)) +
    0.5 * Math.sin((e / 1_361) * 2 * Math.PI + phase(3)) +
    0.05 * (jitter(seed, e) * 2 - 1)
  return Math.max(-1, Math.min(1, wave))
}

/**
 * How far sentiment is allowed to swing the float.
 *
 * A quarter, so the mood alone can move a price by about two thirds peak to
 * trough. Enough to lose money on; not so much that a position taken on a
 * whim is decided entirely by when it was taken.
 */
export const VOLATILITY = 0.25

/**
 * The whole of the world's contribution to the float at an epoch: what has
 * been mined, and what the mood is doing to all of it.
 *
 * `floatAt` in `price.ts` is the only caller, and the split is deliberate - a
 * test can pin the emission schedule without reasoning about sines.
 */
export function moodMultiplier(seed: number, e: number): number {
  return 1 + VOLATILITY * sentiment(seed, e)
}
