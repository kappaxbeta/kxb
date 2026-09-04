import { describe, expect, test } from 'bun:test'

import { firstInFront, inFront, SHOT_ARC, SWING_ARC } from '@/app/world/lounge/_sim/aim'

const me = { x: 0, y: 0, z: 0 }
/** Pointing down +Z, which is what a yaw of zero means in this scene. */
const ahead = { x: 0, z: 1 }

const at = (x: number, y: number, z: number) => ({ id: `${x},${y},${z}`, at: { x, y, z } })

describe('what is in front of you', () => {
  test('somebody straight ahead, within reach', () => {
    expect(inFront(me, ahead, 10, SHOT_ARC, [at(0, 0, 5)]).map((one) => one.id)).toEqual([
      '0,0,5',
    ])
  })

  test('and nobody behind you', () => {
    expect(inFront(me, ahead, 10, SWING_ARC, [at(0, 0, -5)])).toEqual([])
  })

  test('nor out past the reach', () => {
    expect(inFront(me, ahead, 4, SHOT_ARC, [at(0, 0, 5)])).toEqual([])
  })

  test('a bat catches what a bullet misses', () => {
    // Twenty-seven degrees off the nose: inside a boot's arc (0.64 rad, about
    // 37 degrees), well outside a barrel's (0.2, about 11).
    const beside = [at(1, 0, 2)]
    expect(inFront(me, ahead, 5, SWING_ARC, beside)).toHaveLength(1)
    expect(inFront(me, ahead, 5, SHOT_ARC, beside)).toHaveLength(0)
  })

  test('height counts against the reach, so a balcony is out of range', () => {
    expect(inFront(me, ahead, 4, SWING_ARC, [at(0, 4, 2)])).toEqual([])
    expect(inFront(me, ahead, 6, SWING_ARC, [at(0, 4, 2)])).toHaveLength(1)
  })

  test('somebody standing on top of you is hit by anything', () => {
    expect(inFront(me, ahead, 2, SHOT_ARC, [at(0, 0, 0)])).toHaveLength(1)
  })

  test('and the list comes back nearest first', () => {
    const hits = inFront(me, ahead, 20, SWING_ARC, [at(0, 0, 9), at(0, 0, 2), at(0, 0, 5)])
    expect(hits.map((one) => one.id)).toEqual(['0,0,2', '0,0,5', '0,0,9'])
  })
})

describe('what a bullet stops in', () => {
  test('the nearest one in the cone, and only that one', () => {
    expect(firstInFront(me, ahead, 20, [at(0, 0, 9), at(0, 0, 3)])?.id).toBe('0,0,3')
  })

  test('nothing, when the cone is empty', () => {
    expect(firstInFront(me, ahead, 20, [at(9, 0, 1)])).toBeUndefined()
  })

  test('a facing of nothing hits nothing rather than everything', () => {
    // A zero heading is a body that has not been drawn yet. Firing on that
    // frame must not be a shot that lands on whoever is closest.
    expect(inFront(me, { x: 0, z: 0 }, 10, SWING_ARC, [at(0, 0, 1)])).toEqual([])
  })
})
