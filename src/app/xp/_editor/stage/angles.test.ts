import { describe, expect, test } from 'bun:test'
import { eulerOf, turnedBy } from '@/app/xp/_editor/stage/angles'

/**
 * The gizmo's two halves, which have to be exact inverses.
 *
 * They were not. The proxy was set with `(0, yaw, 0)` and read back as
 * `rotation.y`, so `pitch` and `roll` were invisible to the handle in both
 * directions: a tilted crate straightened up the moment it was selected, and
 * the x and z rings were controls that did nothing with no way to tell.
 *
 * Two conventions agree right up until two angles are non-zero at once, which
 * is the case nobody tries until a ramp leans the wrong way - so it is worth
 * pinning rather than reading twice and believing it.
 */

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('a placement’s angles, in and out', () => {
  test('a document that never tilted anything is yaw and two zeroes', () => {
    expect(eulerOf({ rotation: 0 })).toEqual({ x: 0, y: 0, z: 0 })
    const euler = eulerOf({ rotation: 90 })
    close(euler.y, Math.PI / 2)
    expect(euler.x).toBe(0)
    expect(euler.z).toBe(0)
  })

  test('and a tilted one carries all three', () => {
    const euler = eulerOf({ rotation: 90, pitch: -20, roll: 45 })
    close(euler.y, Math.PI / 2)
    close(euler.x, (-20 * Math.PI) / 180)
    close(euler.z, (45 * Math.PI) / 180)
  })

  /**
   * The property the bug broke: setting the proxy and reading it straight back,
   * with nothing dragged, must be the angles you started with.
   */
  test('setting and reading back changes nothing', () => {
    for (const angles of [
      { rotation: 0 },
      { rotation: 90 },
      { rotation: 90, pitch: -20, roll: 45 },
      { rotation: -135, pitch: 12.5, roll: -7.25 },
    ]) {
      const back = turnedBy(angles, angles, eulerOf(angles))
      close(back.rotation, angles.rotation)
      close(back.pitch, angles.pitch ?? 0)
      close(back.roll, angles.roll ?? 0)
    }
  })

  test('a turn on one ring moves one angle and leaves the others alone', () => {
    // The whole point of three rings. Before this, two of them moved nothing.
    const was = { rotation: 30, pitch: 0, roll: 0 }
    const euler = eulerOf(was)

    const pitched = turnedBy(was, was, { ...euler, x: (15 * Math.PI) / 180 })
    close(pitched.pitch, 15)
    close(pitched.rotation, 30)
    close(pitched.roll, 0)

    const rolled = turnedBy(was, was, { ...euler, z: (-15 * Math.PI) / 180 })
    close(rolled.roll, -15)
    close(rolled.rotation, 30)
    close(rolled.pitch, 0)
  })

  /**
   * A child is dragged in world space and its numbers stay relative to whatever
   * it hangs off, so what is reported is how far the handle *moved*. For
   * anything without a parent the two are the same and the subtraction cancels -
   * which is most placements, and is why this stayed invisible for so long.
   */
  test('what is reported is the change, not where the handle ended up', () => {
    const base = { rotation: 10, pitch: 0, roll: 0 }
    const was = { rotation: 100, pitch: 0, roll: 0 }
    const turned = turnedBy(base, was, eulerOf({ rotation: 130 }))
    // The handle moved thirty degrees, so the document's ten becomes forty -
    // not a hundred and thirty.
    close(turned.rotation, 40)
  })

  test('absent pitch and roll read as zero rather than as absent', () => {
    // An Euler has three numbers whatever a document left out, and a `NaN` in
    // one of them is a piece that stops being drawn with nothing said.
    const turned = turnedBy({ rotation: 0 }, { rotation: 0 }, { x: 0, y: 0, z: 0 })
    expect(Number.isFinite(turned.pitch)).toBe(true)
    expect(Number.isFinite(turned.roll)).toBe(true)
  })
})
