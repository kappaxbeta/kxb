import { describe, expect, test } from 'bun:test'

import { createField, hueRgb, POOL, stepField } from './sparks'

const TIP = [0, 1, 0] as const

const brightest = (colors: Float32Array) => Math.max(...colors)

describe('the spark field', () => {
  test('starts dark, because every spark starts finished', () => {
    const field = createField()
    stepField(field, 0, [], 188, 0)
    expect(brightest(field.colors)).toBe(0)
  })

  test('lights up only where a finger is raised', () => {
    const field = createField()
    stepField(field, 0.1, [], 188, 0)
    expect(brightest(field.colors)).toBe(0)

    stepField(field, 0.1, [TIP], 188, 0)
    expect(brightest(field.colors)).toBeGreaterThan(0)
  })

  test('never spends more than the pool, however long it runs', () => {
    const field = createField()
    for (let frame = 0; frame < 400; frame++) stepField(field, 1 / 60, [TIP], 188, frame / 60)
    expect(field.positions.length).toBe(POOL * 3)
    expect(field.next).toBeLessThan(POOL)
  })

  test('a spark goes out on its own', () => {
    const field = createField()
    stepField(field, 0.1, [TIP], 188, 0)
    for (let frame = 0; frame < 200; frame++) stepField(field, 1 / 60, [], 188, frame / 60)
    expect(brightest(field.colors)).toBe(0)
  })

  test('sparks rise away from the fingertip', () => {
    const field = createField()
    stepField(field, 0.1, [TIP], 188, 0)
    const first = field.positions[1]
    for (let frame = 0; frame < 10; frame++) stepField(field, 1 / 60, [], 188, 0)
    expect(field.positions[1]).toBeGreaterThan(first)
  })
})

describe('hueRgb', () => {
  test('walks the whole wheel without leaving the unit cube', () => {
    for (let hue = -720; hue <= 720; hue += 7) {
      const rgb = hueRgb(hue)
      expect(Math.min(...rgb)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...rgb)).toBeCloseTo(1, 5)
    }
  })

  test('the pen s three colours are the ones it draws', () => {
    // Cyan, magenta, violet - see `_ink/palette.ts`.
    expect(hueRgb(188)[2]).toBeGreaterThan(0.9)
    expect(hueRgb(300)[0]).toBeGreaterThan(0.9)
    expect(hueRgb(268)[2]).toBeGreaterThan(0.9)
  })
})
