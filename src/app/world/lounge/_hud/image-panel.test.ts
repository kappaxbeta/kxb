import { describe, expect, test } from 'bun:test'
import { nudged, resized, turned } from '@/app/world/lounge/_hud/image-panel'

/**
 * The three sums the picture controls do.
 *
 * Each is small in a way that is easy to get wrong in a direction nobody
 * notices at the time: a facing that leaves the four, a photograph that has
 * slowly gone square, a picture dropped under the floor where it cannot be
 * clicked on again to be brought back.
 */

describe('turning a picture', () => {
  test('right walks the four in order', () => {
    expect(turned(0, 'right')).toBe(1)
    expect(turned(1, 'right')).toBe(2)
    expect(turned(2, 'right')).toBe(3)
  })

  test('and wraps at the last one', () => {
    expect(turned(3, 'right')).toBe(0)
  })

  test('left walks them backwards', () => {
    expect(turned(3, 'left')).toBe(2)
    expect(turned(2, 'left')).toBe(1)
    expect(turned(1, 'left')).toBe(0)
  })

  /**
   * The reason left is `+3` rather than `-1`. JavaScript's `%` keeps the sign
   * of its left operand, so `(0 - 1) % 4` is **-1** — a facing that is not one
   * of the four, drawn according to whatever the renderer does with a number it
   * was promised would be 0..3.
   */
  test('and wrapping left off the start does not go negative', () => {
    expect(turned(0, 'left')).toBe(3)
    expect(turned(0, 'left')).toBeGreaterThanOrEqual(0)
  })

  test('four turns either way is where you started', () => {
    for (const direction of ['left', 'right'] as const) {
      let facing = 2
      for (let i = 0; i < 4; i++) facing = turned(facing, direction)
      expect(facing).toBe(2)
    }
  })

  test('every facing stays one of the four', () => {
    for (let facing = 0; facing < 4; facing++) {
      for (const direction of ['left', 'right'] as const) {
        const next = turned(facing, direction)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(4)
      }
    }
  })
})

describe('resizing a picture', () => {
  test('grows and shrinks both sides at once', () => {
    expect(resized({ width: 4, height: 3 }, 1)).toEqual({ width: 5, height: 4 })
    expect(resized({ width: 4, height: 3 }, -1)).toEqual({ width: 3, height: 2 })
  })

  /**
   * Together, so the picture keeps its shape. Stepping one side at a time is
   * how a photograph slowly becomes a square.
   */
  test('so the difference between the sides never changes', () => {
    let size = { width: 8, height: 2 }
    for (let i = 0; i < 5; i++) size = resized(size, 1)
    expect(size.width - size.height).toBe(6)
  })

  test('stops at one rather than going to nothing', () => {
    expect(resized({ width: 1, height: 1 }, -1)).toEqual({ width: 1, height: 1 })
    expect(resized({ width: 2, height: 1 }, -1)).toEqual({ width: 1, height: 1 })
  })

  test('and stops at the ceiling', () => {
    expect(resized({ width: 32, height: 32 }, 1)).toEqual({ width: 32, height: 32 })
  })

  /**
   * A side already at the limit holds while the other still moves, which is the
   * one case where the shape does change - and it is the aggregate's range
   * doing it rather than the button.
   */
  test('a picture pinned at the ceiling on one side still grows on the other', () => {
    expect(resized({ width: 32, height: 4 }, 1)).toEqual({ width: 32, height: 5 })
  })
})

describe('nudging a picture', () => {
  const at = { x: 5, y: 5, z: 5 }

  test('moves one cell on the axis it was given', () => {
    expect(nudged(at, { x: -1 })).toEqual({ x: 4, y: 5, z: 5 })
    expect(nudged(at, { z: 1 })).toEqual({ x: 5, y: 5, z: 6 })
    expect(nudged(at, { y: 1 })).toEqual({ x: 5, y: 6, z: 5 })
  })

  test('and leaves the other two alone', () => {
    expect(nudged(at, {})).toEqual(at)
  })

  /**
   * A picture below the floor is under the world, and cannot be clicked on
   * again to be brought back. The button stops rather than losing it.
   */
  test('will not go under the floor', () => {
    expect(nudged({ x: 0, y: 0, z: 0 }, { y: -1 })).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('but the floor is not a limit sideways', () => {
    expect(nudged({ x: 0, y: 0, z: 0 }, { x: -1 })).toEqual({ x: -1, y: 0, z: 0 })
    expect(nudged({ x: 0, y: 0, z: 0 }, { z: -1 })).toEqual({ x: 0, y: 0, z: -1 })
  })

  test('never edits the picture it was handed', () => {
    const before = { x: 5, y: 5, z: 5 }
    nudged(before, { x: 1, y: 1, z: 1 })
    expect(before).toEqual({ x: 5, y: 5, z: 5 })
  })
})
