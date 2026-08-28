import { describe, expect, test } from 'bun:test'
import { nextWatch, watchable, watchFrom, WATCH_BACK, WATCH_UP } from '@/app/xp/_runtime/match/spectate'
import type { Standing } from '@/app/xp/_runtime/match/standings'

/**
 * A camera with somewhere to go, checked without one.
 *
 * The maths is two lines and is not the risk. The risk is every frame where the
 * person being watched has just left, just been eliminated, or is the only one
 * there - none of which throws, and all of which end with a camera pointed at
 * nothing.
 */

const standing = (id: string, over: Partial<Standing> = {}): Standing => ({
  id,
  name: id,
  kills: 0,
  mine: false,
  here: true,
  out: false,
  ...over,
})

describe('who is worth watching', () => {
  test('everybody else who is still playing', () => {
    expect(
      watchable([standing('ana'), standing('bo', { mine: true }), standing('cass')]),
    ).toEqual(['ana', 'cass'])
  })

  test('not yourself, not the eliminated, not the departed', () => {
    expect(
      watchable([
        standing('me', { mine: true }),
        standing('out', { out: true }),
        standing('gone', { here: false }),
        standing('ana'),
      ]),
    ).toEqual(['ana'])
  })

  /**
   * By id rather than in the board's order, which sorts by kills: otherwise
   * somebody scoring reshuffles the list under the keys that cycle it, and
   * pressing right twice lands somewhere unrelated.
   */
  test('a stable order that a scoreboard cannot reshuffle', () => {
    const before = watchable([standing('ana', { kills: 0 }), standing('bo', { kills: 9 })])
    const after = watchable([standing('bo', { kills: 99 }), standing('ana', { kills: 0 })])
    expect(before).toEqual(after)
  })

  test('a room with nobody left in it is empty rather than undefined', () => {
    expect(watchable([standing('me', { mine: true })])).toEqual([])
  })
})

describe('cycling', () => {
  const ids = ['ana', 'bo', 'cass']

  test('forwards and backwards, wrapping both ways', () => {
    expect(nextWatch('ana', ids, 1)).toBe('bo')
    expect(nextWatch('cass', ids, 1)).toBe('ana')
    expect(nextWatch('ana', ids, -1)).toBe('cass')
  })

  test('starting from nobody lands on the first', () => {
    expect(nextWatch(null, ids, 1)).toBe('ana')
  })

  /**
   * The common case rather than the edge one: it is what happens the instant
   * the person you were watching is eliminated.
   */
  test('somebody who has gone from the list lands on the first', () => {
    expect(nextWatch('zed', ids, 1)).toBe('ana')
  })

  test('nobody to watch is null rather than a crash', () => {
    expect(nextWatch('ana', [], 1)).toBeNull()
    expect(nextWatch(null, [], -1)).toBeNull()
  })
})

describe('where the camera goes', () => {
  /**
   * The document's convention is `forward = (sin θ, 0, cos θ)` — the mark's,
   * which ./camera documents at length because getting it backwards is what
   * opened `ladder-run` on a black screen. Behind is minus *both* components,
   * and this test is here because the first version of `watchFrom` had the sign
   * right on x and wrong on z, which puts the camera in front of somebody's
   * face at exactly the right distance.
   */
  test('facing north, the camera is south of them', () => {
    const { eye, look } = watchFrom({ x: 0, y: 0, z: 0, facing: 0 })
    expect(eye.x).toBeCloseTo(0, 5)
    expect(eye.z).toBeCloseTo(-WATCH_BACK, 5)
    expect(eye.y).toBeCloseTo(WATCH_UP, 5)
    expect(look).toEqual({ x: 0, y: 1.5, z: 0 })
  })

  test('facing east, the camera is west of them', () => {
    const { eye } = watchFrom({ x: 0, y: 0, z: 0, facing: 90 })
    expect(eye.x).toBeCloseTo(-WATCH_BACK, 5)
    expect(eye.z).toBeCloseTo(0, 5)
  })

  test('it is always exactly that far back, whichever way they turn', () => {
    for (const facing of [0, 37, 90, 180, 270, 359]) {
      const { eye } = watchFrom({ x: 5, y: 2, z: -3, facing })
      expect(Math.hypot(eye.x - 5, eye.z + 3)).toBeCloseTo(WATCH_BACK, 5)
    }
  })

  test('and it looks at their head rather than their feet', () => {
    const { eye, look } = watchFrom({ x: 0, y: 10, z: 0, facing: 0 })
    expect(look.y).toBeGreaterThan(10)
    expect(eye.y).toBeGreaterThan(look.y)
  })
})
