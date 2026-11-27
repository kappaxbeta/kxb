import { describe, expect, test } from 'bun:test'

import type { Note } from '@/domain/ink/note'
import { extrude, trianglesIn } from './extrude'

const note = (points: [number, number][], hue = 300): Note => ({
  height: 500,
  strokes: [{ hue, points: points.map(([x, y]) => ({ x, y })), gaps: points.map(() => 16) }],
})

const zOf = (positions: Float32Array) => Array.from(positions).filter((_, i) => i % 3 === 2)

describe('extrude', () => {
  test('a stroke of two points is one quad', () => {
    const [wall] = extrude(note([[0, 0], [1000, 500]]), { depth: 1, scatter: 0 })
    expect(wall.positions).toHaveLength(6 * 3)
    expect(wall.uvs).toHaveLength(6 * 2)
  })

  test('the page is centred on the origin, y up', () => {
    const [wall] = extrude(note([[0, 0], [1000, 500]]), { depth: 1, scatter: 0 })
    const [x0, y0] = [wall.positions[0], wall.positions[1]]
    const [x1, y1] = [wall.positions[3], wall.positions[4]]
    // Top left of the page, then bottom right of it.
    expect(x0).toBeCloseTo(-1, 5)
    expect(y0).toBeCloseTo(0.5, 5)
    expect(x1).toBeCloseTo(1, 5)
    expect(y1).toBeCloseTo(-0.5, 5)
  })

  test('the front face is on the page and the wall runs back by the depth', () => {
    const [wall] = extrude(note([[0, 0], [500, 250]]), { depth: 0.75, scatter: 0 })
    const zs = zOf(wall.positions)
    expect(Math.max(...zs)).toBeCloseTo(0, 5)
    expect(Math.min(...zs)).toBeCloseTo(-0.75, 5)
  })

  test('no depth is a flat drawing', () => {
    const [wall] = extrude(note([[0, 0], [500, 250]]), { depth: 0, scatter: 0 })
    expect(zOf(wall.positions).every((z) => z === 0)).toBe(true)
  })

  test('scatter steps strokes back, and the same way every time', () => {
    const two: Note = {
      height: 500,
      strokes: [
        { hue: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], gaps: [0, 16] },
        { hue: 2, points: [{ x: 0, y: 100 }, { x: 100, y: 100 }], gaps: [0, 16] },
      ],
    }
    const once = extrude(two, { depth: 0.2, scatter: 1 })
    const again = extrude(two, { depth: 0.2, scatter: 1 })
    expect(Array.from(once[1].positions)).toEqual(Array.from(again[1].positions))
    // Something moved: the two strokes no longer start on the same plane.
    expect(Math.max(...zOf(once[0].positions))).not.toBeCloseTo(
      Math.max(...zOf(once[1].positions)),
      5,
    )
  })

  test('every stroke keeps its colour', () => {
    const drawn = extrude(note([[0, 0], [10, 10]], 188), { depth: 1, scatter: 0 })
    expect(drawn[0].hue).toBe(188)
  })

  test('a stroke of one point builds nothing', () => {
    const lonely: Note = { height: 500, strokes: [{ hue: 1, points: [{ x: 0, y: 0 }], gaps: [0] }] }
    expect(extrude(lonely, { depth: 1, scatter: 0 })).toHaveLength(0)
  })

  test('the triangle count is two a segment', () => {
    expect(trianglesIn(note([[0, 0], [10, 10], [20, 20]]))).toBe(4)
  })
})
