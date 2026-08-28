import { describe, expect, test } from 'bun:test'
import { carryHeld } from '@/app/xp/_runtime/net/carried'

/**
 * Where a carried thing is drawn while somebody else is carrying it.
 *
 * Thirteen lines in the frame callback, and three of them were decisions
 * somebody had to make twice. None could be checked without two browsers and a
 * flag; all three are the kind whose failure looks like a rendering glitch.
 */

const put = () => {
  const at = new Map<number, { x: number; y: number; z: number }>()
  const facing = new Map<number, number>()
  return {
    at,
    facing,
    place: (id: number, p: { x: number; y: number; z: number }, f: number) => {
      at.set(id, p)
      facing.set(id, f)
    },
  }
}

const sample = (x: number, y: number, z: number, facing = 0) => () => ({ x, y, z, facing })

describe('a thing in somebody’s hands', () => {
  test('is put where they are', () => {
    const out = put()
    carryHeld({
      held: new Map([[7, 'them']]),
      alive: new Set([7]),
      sampleOf: sample(3, 0, 4),
      place: out.place,
      lift: 1.1,
    })
    expect(out.at.get(7)).toEqual({ x: 3, y: 1.1, z: 4 })
  })

  /**
   * The buffer holds *feet* — that is what the wire carries — and a flag at
   * ankle height reads as one lying on the floor, which is the thing this
   * feature exists to stop showing.
   */
  test('lifted from their feet to roughly a hand', () => {
    const out = put()
    carryHeld({
      held: new Map([[7, 'them']]),
      alive: new Set([7]),
      sampleOf: sample(0, 10, 0),
      place: out.place,
      lift: 1.1,
    })
    expect(out.at.get(7)?.y).toBeCloseTo(11.1, 10)
  })

  test('and turned the way they are facing', () => {
    const out = put()
    carryHeld({
      held: new Map([[7, 'them']]),
      alive: new Set([7]),
      sampleOf: sample(0, 0, 0, 2.5),
      place: out.place,
      lift: 1,
    })
    expect(out.facing.get(7)).toBe(2.5)
  })

  test('several things at once, each with its own holder', () => {
    const out = put()
    carryHeld({
      held: new Map([[1, 'a'], [2, 'b']]),
      alive: new Set([1, 2]),
      sampleOf: (peer) => (peer === 'a' ? { x: 1, y: 0, z: 0, facing: 0 } : { x: 9, y: 0, z: 0, facing: 0 }),
      place: out.place,
      lift: 0,
    })
    expect(out.at.get(1)?.x).toBe(1)
    expect(out.at.get(2)?.x).toBe(9)
  })
})

/**
 * They have left, or nothing has arrived yet. Leaving it where it is beats
 * teleporting it to the origin — which is somewhere a player can walk to and
 * find the flag they were looking for.
 */
describe('a holder nobody has heard from', () => {
  test('leaves the thing exactly where it was', () => {
    const out = put()
    carryHeld({
      held: new Map([[7, 'gone']]),
      alive: new Set([7]),
      sampleOf: () => null,
      place: out.place,
      lift: 1.1,
    })
    expect(out.at.has(7)).toBe(false)
  })

  test('and does not stop the others being placed', () => {
    const out = put()
    carryHeld({
      held: new Map([[1, 'gone'], [2, 'here']]),
      alive: new Set([1, 2]),
      sampleOf: (peer) => (peer === 'here' ? { x: 5, y: 0, z: 0, facing: 0 } : null),
      place: out.place,
      lift: 0,
    })
    expect(out.at.has(1)).toBe(false)
    expect(out.at.get(2)?.x).toBe(5)
  })
})

describe('a thing that is no longer in the world', () => {
  test('is skipped, however alive its holder is', () => {
    const out = put()
    carryHeld({
      held: new Map([[7, 'them']]),
      alive: new Set<number>(),
      sampleOf: sample(1, 1, 1),
      place: out.place,
      lift: 1,
    })
    expect(out.at.size).toBe(0)
  })

  test('and its holder is never even asked about', () => {
    let asked = 0
    carryHeld({
      held: new Map([[7, 'them']]),
      alive: new Set<number>(),
      sampleOf: () => { asked++; return null },
      place: () => {},
      lift: 1,
    })
    expect(asked).toBe(0)
  })
})

describe('nobody carrying anything', () => {
  test('places nothing', () => {
    const out = put()
    carryHeld({ held: new Map(), alive: new Set([1]), sampleOf: sample(0, 0, 0), place: out.place, lift: 1 })
    expect(out.at.size).toBe(0)
  })
})
