import { describe, expect, test } from 'bun:test'

import {
  EMISSION,
  EPOCH_MS,
  HALVING_EPOCHS,
  VOLATILITY,
  epochAt,
  mined,
  moodMultiplier,
  seedOf,
  sentiment,
} from './drift'

/**
 * The schedule, and the two things about it that have to be true.
 *
 * It has to be *closed form* - two clients that opened the cartridge an hour
 * apart agree without asking each other - and it has to leave the coin side of
 * the market alone. The second is not testable here because nothing in this
 * file can reach a coin; it is testable in `price.test.ts`, and it is stated
 * here so the next person to add a function knows what the file is for.
 */

describe('the mining schedule', () => {
  test('the closed form agrees with counting it out epoch by epoch', () => {
    /*
     * The whole reason `mined` is a sum over eras rather than a loop over
     * epochs is cost, and the risk of that trade is an off-by-one at a halving
     * boundary that nobody would ever see. So: count it out the slow, obviously
     * correct way, across two halvings, and demand they match everywhere.
     */
    let running = 0
    for (let e = 1; e <= HALVING_EPOCHS * 2 + 5; e += 1) {
      const era = Math.floor((e - 1) / HALVING_EPOCHS)
      running += Math.floor(EMISSION / 2 ** era)
      expect(mined(e)).toBe(running)
    }
  })

  test('nothing is mined before the market exists', () => {
    expect(mined(0)).toBe(0)
    expect(mined(-10)).toBe(0)
  })

  test('the reward halves, and eventually reaches nothing', () => {
    const firstEra = mined(HALVING_EPOCHS)
    const secondEra = mined(HALVING_EPOCHS * 2) - firstEra
    expect(secondEra).toBe(Math.floor(firstEra / 2))

    // Far enough out that integer halving has bottomed out: no new supply.
    const far = HALVING_EPOCHS * 60
    expect(mined(far + 1_000)).toBe(mined(far))
  })

  test('supply only ever goes up', () => {
    let last = 0
    for (let e = 0; e < 10_000; e += 37) {
      expect(mined(e)).toBeGreaterThanOrEqual(last)
      last = mined(e)
    }
  })
})

describe('sentiment', () => {
  test('the same seed and epoch is the same mood, every time and everywhere', () => {
    const seed = seedOf('a-space')
    for (const e of [0, 1, 17, 999, 123_456]) {
      expect(sentiment(seed, e)).toBe(sentiment(seed, e))
    }
  })

  test('two spaces get two different stories', () => {
    const one = seedOf('one')
    const other = seedOf('other')
    expect(one).not.toBe(other)

    const differ = [0, 1, 2, 3, 4, 5, 6, 7].filter((e) => sentiment(one, e) !== sentiment(other, e))
    expect(differ.length).toBeGreaterThan(6)
  })

  test('it stays inside its bounds, so the float cannot be turned negative', () => {
    const seed = seedOf('bounds')
    for (let e = 0; e < 5_000; e += 1) {
      const mood = moodMultiplier(seed, e)
      expect(sentiment(seed, e)).toBeGreaterThanOrEqual(-1)
      expect(sentiment(seed, e)).toBeLessThanOrEqual(1)
      expect(mood).toBeGreaterThanOrEqual(1 - VOLATILITY)
      expect(mood).toBeLessThanOrEqual(1 + VOLATILITY)
    }
  })

  test('it actually moves - a flat line would pass every bound above', () => {
    const seed = seedOf('moves')
    const values = Array.from({ length: 200 }, (_, e) => sentiment(seed, e))
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5)
  })
})

describe('epochs', () => {
  test('a minute is a tick, and nothing before the birth counts', () => {
    const born = 1_700_000_000_000
    expect(epochAt(born, born)).toBe(0)
    expect(epochAt(born, born + EPOCH_MS - 1)).toBe(0)
    expect(epochAt(born, born + EPOCH_MS)).toBe(1)
    expect(epochAt(born, born - EPOCH_MS * 10)).toBe(0)
  })
})
