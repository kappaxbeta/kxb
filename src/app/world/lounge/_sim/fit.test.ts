import { describe, expect, test } from 'bun:test'
import { fits, fitsBeside } from '@/app/world/lounge/_sim/fit'
import { blockKey } from '@/domain/lounge/events'

/** A wall down x=5, and one crate standing at (2,1,2). */
const world = new Set([blockKey(5, 1, 0), blockKey(5, 1, 1), blockKey(5, 2, 0)])
const things = new Set([blockKey(2, 1, 2)])

describe('does it fit', () => {
  test('empty air does', () => {
    expect(fits([blockKey(0, 1, 0), blockKey(0, 1, 1)], [world, things])).toBe(true)
  })

  test('a wall does not', () => {
    expect(fits([blockKey(4, 1, 0), blockKey(5, 1, 0)], [world, things])).toBe(false)
  })

  test('nor does something already standing there', () => {
    // The two sets are asked separately on purpose: a thing may be blocked by
    // the world, by another thing, or by both, and all three are "no".
    expect(fits([blockKey(2, 1, 2)], [world, things])).toBe(false)
  })

  test('a thing that fills nothing fits anywhere', () => {
    expect(fits([], [world, things])).toBe(true)
  })
})

describe('putting something back where it was', () => {
  test('a thing is not in its own way', () => {
    // Picking a crate up and putting it down again must not report the crate
    // as blocking itself, or nothing could ever be nudged one cell.
    const its = new Set([blockKey(2, 1, 2)])
    expect(fitsBeside([blockKey(2, 1, 2)], [world, things], its)).toBe(true)
  })

  test('but it is still in everything else s way', () => {
    const its = new Set([blockKey(2, 1, 2)])
    expect(fitsBeside([blockKey(5, 1, 0)], [world, things], its)).toBe(false)
  })

  test('and half of it moving into a wall is still a no', () => {
    const its = new Set([blockKey(2, 1, 2)])
    expect(
      fitsBeside([blockKey(2, 1, 2), blockKey(5, 1, 1)], [world, things], its),
    ).toBe(false)
  })
})
