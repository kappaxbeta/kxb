import { describe, expect, test } from 'bun:test'

import { PIECE_ORIGIN, pieceTransform } from '@/domain/thingiverse/placement'
import { drawingOf } from '@/domain/thingiverse/models'

/** A model from a pack whose authored unit is not a cell. See `drawingOf`. */
const CONVERTED = 'bedroom/soccer_ball'
/** A model from the XP catalogue, where one authored unit is one metre. */
const XP = 'xp:proto/block'

describe('where a piece goes', () => {
  test('the pack conversion and the blueprint size multiply', () => {
    const pack = drawingOf(CONVERTED)?.scale ?? 1
    expect(pieceTransform(CONVERTED, PIECE_ORIGIN, 0, 2).scale).toBeCloseTo(pack * 2)
  })

  test('a quarter turn is a right angle', () => {
    expect(pieceTransform(CONVERTED, PIECE_ORIGIN, 1, 1).rotation[1]).toBeCloseTo(Math.PI / 2)
    expect(pieceTransform(CONVERTED, PIECE_ORIGIN, 4, 1).rotation[1]).toBeCloseTo(Math.PI * 2)
  })

  test('the offset is carried through untouched, and only height is lifted', () => {
    const placed = pieceTransform(CONVERTED, { x: 0.5, y: 1, z: -2 }, 0, 1)
    expect(placed.position[0]).toBe(0.5)
    expect(placed.position[2]).toBe(-2)
    expect(placed.position[1]).toBeGreaterThanOrEqual(1)
  })

  test('a lift scales with the piece, or a half-size thing hovers', () => {
    const lift = drawingOf(CONVERTED)?.lift ?? 0
    const half = pieceTransform(CONVERTED, PIECE_ORIGIN, 0, 0.5)
    expect(half.position[1]).toBeCloseTo(lift * 0.5)
  })

  test('an unknown model is drawn at its own size rather than not at all', () => {
    const placed = pieceTransform('nosuchpack/nosuchmodel', PIECE_ORIGIN, 0, 3)
    expect(placed.scale).toBe(3)
    expect(placed.position).toEqual([0, 0, 0])
  })

  test('an XP model keeps one authored unit as one metre', () => {
    expect(pieceTransform(XP, PIECE_ORIGIN, 0, 1).scale).toBeCloseTo(1)
  })
})
