import { describe, expect, test } from 'bun:test'
import { ndcFor, planeHit } from '@/app/xp/_editor/stage/drop-point'

/**
 * Where a dropped model lands.
 *
 * The half of drag-and-drop that can be wrong without looking wrong, and the
 * half that cannot be watched: the Browser pane never gives the canvas a size,
 * so R3F never creates its root and the component that listens for a drop never
 * mounts. Everything below is therefore a function.
 */
describe('a pixel, as the camera sees it', () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 }

  test('the middle of the canvas is the middle of the view', () => {
    expect(ndcFor({ x: 500, y: 250 }, rect)).toEqual({ x: 0, y: 0 })
  })

  test('y is flipped, because a screen counts down and a camera counts up', () => {
    // The classic version of this bug is invisible from the code: everything
    // works, and dropping above the middle puts the piece below it.
    const above = ndcFor({ x: 500, y: 50 }, rect)!
    expect(above.y).toBe(1)
    const below = ndcFor({ x: 500, y: 450 }, rect)!
    expect(below.y).toBe(-1)
  })

  test('the corners are the corners', () => {
    expect(ndcFor({ x: 100, y: 50 }, rect)).toEqual({ x: -1, y: 1 })
    expect(ndcFor({ x: 900, y: 450 }, rect)).toEqual({ x: 1, y: -1 })
  })

  test('a canvas with no area has no answer, rather than one at NaN', () => {
    expect(ndcFor({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})

describe('where a ray meets the working plane', () => {
  test('straight down from above lands under the camera', () => {
    const at = planeHit({ x: 3, y: 20, z: -4 }, { x: 0, y: -1, z: 0 }, 0)
    expect(at).toEqual({ x: 3, y: 0, z: -4 })
  })

  test('at an angle it lands where the angle takes it', () => {
    // Down and forward in equal measure from ten up: ten along.
    const at = planeHit({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: -1 }, 0)!
    expect(at.z).toBeCloseTo(-10, 6)
    expect(at.y).toBe(0)
  })

  test('the working height is the height it lands at', () => {
    expect(planeHit({ x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, 4)!.y).toBe(4)
  })

  test('a ray along the horizon never meets it', () => {
    expect(planeHit({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 0)).toBeNull()
  })

  /**
   * A ray pointing away from the plane meets it *behind* the camera, which is a
   * place nobody can see and must not be able to build in - the arithmetic
   * happily returns a point, and only the sign of the distance says it is
   * nonsense.
   */
  test('looking up from above the plane does not build behind you', () => {
    expect(planeHit({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, 0)).toBeNull()
  })

  test('looking up from below it does meet it', () => {
    expect(planeHit({ x: 0, y: -5, z: 0 }, { x: 0, y: 1, z: 0 }, 0)!.y).toBe(0)
  })
})
