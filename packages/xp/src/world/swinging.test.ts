import { describe, expect, test } from 'bun:test'
import type { SolidTest } from './physics'
import type { PersonTarget, Target } from './shooting'
import { boxReach, swungAt } from './swinging'

/**
 * A swing, which is the one attack in this engine that nobody can watch.
 *
 * The Browser pane fires no frames, and a melee is a thing two moving people do
 * to each other - so "did that land" has to be a function returning a fact
 * about a box. Everything the runtime does with a swing is decided here.
 */

/** A world with cells filled at the given keys, and nothing else. */
const cells = (...filled: string[]): SolidTest => {
  const set = new Set(filled)
  return (x, y, z) => set.has(`${x},${y},${z}`)
}

/** A body-sized box standing on the floor at x/z. */
const person = (id: string, x: number, z: number, y = 0): PersonTarget => ({
  id,
  box: { minX: x - 0.35, maxX: x + 0.35, minY: y, maxY: y + 1.6, minZ: z - 0.35, maxZ: z + 0.35 },
})

const crate = (id: number, x: number, z: number): Target => ({
  id,
  box: { minX: x - 0.5, maxX: x + 0.5, minY: 0, maxY: 1, minZ: z - 0.5, maxZ: z + 0.5 },
})

/** An eye at head height, looking along +x, which is where everybody stands. */
const eye = { x: 0, y: 1.6, z: 0 }
const ahead = { x: 1, y: 0, z: 0 }

describe('what is within reach', () => {
  test('somebody standing in front of you is hit, and named', () => {
    const swung = swungAt(eye, ahead, { people: [person('them', 1.5, 0)] })
    expect(swung).not.toBeNull()
    expect(swung!.who).toBe('them')
    expect(swung!.id).toBeNull()
  })

  test('somebody a room away is not', () => {
    expect(swungAt(eye, ahead, { people: [person('them', 8, 0)] })).toBeNull()
  })

  test('the reach is to their body, not to the middle of it', () => {
    /**
     * The case the note at the top of ./swinging is about. Their centre is at
     * chest height and the eye is at head height, so a swing measured to the
     * centre is nearly a metre longer than the one the player took.
     */
    const swung = swungAt(eye, ahead, { reach: 1, people: [person('them', 1.2, 0)] })
    expect(swung?.who).toBe('them')
  })

  test('standing inside somebody is a hit at any reach', () => {
    const swung = swungAt(eye, ahead, { reach: 0.1, people: [person('them', 0, 0)] })
    expect(swung?.who).toBe('them')
  })
})

describe('what is in front', () => {
  test('behind you is a miss', () => {
    expect(swungAt(eye, ahead, { people: [person('them', -1.5, 0)] })).toBeNull()
  })

  test('off to the side but still in the front half is a hit', () => {
    // Sixty degrees off the way you are looking: the swing a player takes at
    // somebody who is circling them, and the one a ray would refuse.
    expect(swungAt(eye, ahead, { people: [person('them', 1, 1.6)] })?.who).toBe('them')
  })

  test('straight out to the side is not', () => {
    expect(swungAt(eye, ahead, { people: [person('them', 0, 1.5)] })).toBeNull()
  })

  test('looking at your own feet still lands on somebody standing on them', () => {
    // The vertical is dropped on purpose: there is nothing in this engine that
    // lets you be far enough above somebody to reach them and not be looking
    // down at them.
    expect(swungAt(eye, { x: 0.2, y: -1, z: 0 }, { people: [person('them', 1.2, 0)] })?.who).toBe(
      'them',
    )
  })

  test('a swing with no direction at all lands on nobody', () => {
    expect(swungAt(eye, { x: 0, y: -1, z: 0 }, { people: [person('them', 1, 0)] })).toBeNull()
  })
})

describe('what is in the way', () => {
  test('a wall between you is a miss', () => {
    const swung = swungAt(eye, ahead, {
      isSolid: cells('1,1,0'),
      people: [person('them', 1.8, 0)],
    })
    expect(swung).toBeNull()
  })

  test('a wall behind them is not', () => {
    const swung = swungAt(eye, ahead, {
      isSolid: cells('3,1,0'),
      people: [person('them', 1.5, 0)],
    })
    expect(swung?.who).toBe('them')
  })
})

describe('choosing between two', () => {
  test('the nearer of two people', () => {
    const swung = swungAt(eye, ahead, {
      people: [person('far', 2.2, 0), person('near', 1, 0)],
    })
    expect(swung?.who).toBe('near')
  })

  test('an entity beats a person standing behind it', () => {
    const swung = swungAt(eye, ahead, {
      targets: [crate(7, 1, 0)],
      people: [person('them', 2, 0)],
    })
    expect(swung?.id).toBe(7)
    expect(swung?.who).toBeUndefined()
  })

  test('and what you are holding is never what you hit', () => {
    const swung = swungAt(eye, ahead, {
      targets: [crate(7, 0.4, 0)],
      people: [person('them', 1.5, 0)],
      ignore: new Set([7]),
    })
    expect(swung?.who).toBe('them')
  })
})

describe('the distance to a box', () => {
  test('is zero from inside it', () => {
    expect(boxReach({ x: 0, y: 0.5, z: 0 }, crate(1, 0, 0).box)).toBe(0)
  })

  test('is measured on every axis at once', () => {
    // A crate a metre away on x and a metre up: the corner is the nearest point
    // of it, and Pythagoras is the answer rather than either axis alone.
    expect(boxReach({ x: -1.5, y: 3, z: 0 }, crate(1, 0, 0).box)).toBeCloseTo(Math.hypot(1, 2), 5)
  })
})
