import { describe, expect, test } from 'bun:test'

import { moveThingSchema, toGrid, toPlace } from '@/domain/thingiverse/thing-commands'

describe('putting a measured position on the grid', () => {
  test('a rolled-to number becomes one the log accepts', () => {
    for (const measured of [1.2493, -3.04999, 0.049, 12.0000001, -0.06]) {
      const snapped = toGrid(measured)
      expect(Math.abs(snapped / 0.1 - Math.round(snapped / 0.1))).toBeLessThan(1e-6)
      expect(Math.abs(snapped - measured)).toBeLessThanOrEqual(0.05 + 1e-9)
    }
  })

  test('a number already on it is left alone', () => {
    expect(toGrid(2.5)).toBeCloseTo(2.5)
    expect(toGrid(0)).toBe(0)
    expect(toGrid(-4)).toBeCloseTo(-4)
  })

  test('and the command accepts what it returns', () => {
    const parsed = moveThingSchema.safeParse({
      id: '3f6f1d6c-2b1e-4a1e-9c4a-0f2b7c9d1e55',
      x: toGrid(1.2493),
      y: toGrid(0.9871),
      z: toGrid(-3.04999),
    })
    expect(parsed.success).toBe(true)
  })
})

describe('putting a measured position inside the world', () => {
  const id = '3f6f1d6c-2b1e-4a1e-9c4a-0f2b7c9d1e55'

  /**
   * The one that reached a room. A ball drawn bigger than the sim's own radius
   * comes to rest below the floor as far as the arithmetic is concerned, and
   * `level` answered "Too small: expected number to be >=0" - over a lounge, at
   * somebody who had kicked it.
   */
  test('a ball that settles under the floor is written down on it', () => {
    const at = toPlace({ x: 1.2493, y: -0.4, z: -3.04999 })

    expect(at.y).toBe(0)
    expect(moveThingSchema.safeParse({ id, ...at }).success).toBe(true)
  })

  test('and a position outside the world comes back to its edge', () => {
    const far = toPlace({ x: -900, y: 9000, z: 900 })

    expect(moveThingSchema.safeParse({ id, ...far }).success).toBe(true)
  })

  test('what is already inside it is only rounded', () => {
    expect(toPlace({ x: 1.2493, y: 0.9871, z: -3.04999 })).toEqual({
      x: toGrid(1.2493),
      y: toGrid(0.9871),
      z: toGrid(-3.04999),
    })
  })

  /**
   * The property that makes this safe in front of every measured write: the
   * bounds are whole cells, so clamping cannot knock a value off the grid the
   * schema insists on.
   */
  test('a clamped position is still on the grid', () => {
    for (const measured of [-1e6, 1e6, -0.04, 0.04]) {
      const at = toPlace({ x: measured, y: measured, z: measured })
      for (const value of [at.x, at.y, at.z]) {
        expect(Math.abs(value / 0.1 - Math.round(value / 0.1))).toBeLessThan(1e-6)
      }
    }
  })
})
