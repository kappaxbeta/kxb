import { describe, expect, test } from 'bun:test'

import { moveThingSchema, toGrid } from '@/domain/thingiverse/thing-commands'

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
