import { describe, expect, test } from 'bun:test'
import { randomAt, randomBits, seedFrom } from './random'

describe('the shared stream', () => {
  test('the same three numbers give the same value, always', () => {
    expect(randomAt(1234, 7, 0)).toBe(randomAt(1234, 7, 0))
    expect(randomBits(1234, 7, 0)).toBe(randomBits(1234, 7, 0))
  })

  test('a different seed, tick or index is a different value', () => {
    const base = randomBits(1234, 7, 0)
    expect(randomBits(1235, 7, 0)).not.toBe(base)
    expect(randomBits(1234, 8, 0)).not.toBe(base)
    expect(randomBits(1234, 7, 1)).not.toBe(base)
  })

  test('everything lands in [0, 1)', () => {
    for (let tick = 0; tick < 200; tick++) {
      for (let index = 0; index < 5; index++) {
        const value = randomAt(9876, tick, index)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    }
  })

  /**
   * Not a quality claim - it is a *flatness* claim, and the reason to make it
   * is that the obvious cheap hash is fine on the low bits and badly clumped on
   * the high ones, which is exactly the half a dice roll reads.
   */
  test('a die is not loaded', () => {
    const faces = [0, 0, 0, 0, 0, 0]
    for (let tick = 0; tick < 6000; tick++) faces[Math.floor(randomAt(42, tick, 0) * 6)]++
    for (const count of faces) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1150)
    }
  })

  test('consecutive ticks do not walk in a line', () => {
    let rises = 0
    for (let tick = 0; tick < 1000; tick++) {
      if (randomAt(3, tick + 1, 0) > randomAt(3, tick, 0)) rises++
    }
    expect(rises).toBeGreaterThan(400)
    expect(rises).toBeLessThan(600)
  })

  /**
   * The join-mid-match property, stated as a test because it is the whole
   * argument for addressing the stream rather than advancing it: a client that
   * arrives at tick 4000 computes tick 4000's values without having computed
   * any of the 3999 before it.
   */
  test('a late arrival needs no history', () => {
    const late = randomAt(77, 4000, 2)
    let value = 0
    for (let tick = 0; tick <= 4000; tick++) value = randomAt(77, tick, 2)
    expect(value).toBe(late)
  })

  describe('seedFrom', () => {
    test('the same text gives the same seed', () => {
      expect(seedFrom('dice.xp')).toBe(seedFrom('dice.xp'))
    })

    test('a different text gives a different seed', () => {
      expect(seedFrom('dice.xp')).not.toBe(seedFrom('dice.xq'))
      expect(seedFrom('')).not.toBe(seedFrom('a'))
    })

    test('it is a 32-bit unsigned integer', () => {
      for (const text of ['', 'a', 'a rather longer document name.xp']) {
        const seed = seedFrom(text)
        expect(Number.isInteger(seed)).toBe(true)
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThanOrEqual(0xffffffff)
      }
    })
  })
})
