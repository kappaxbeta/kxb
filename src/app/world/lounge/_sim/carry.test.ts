import { describe, expect, test } from 'bun:test'
import { dropTo, spotFor, stepBy } from '@/app/world/lounge/_sim/carry'
import { blockKey } from '@/domain/lounge/events'

/**
 * A floor at y=0 everywhere, and a two-high wall along x=5.
 *
 * Built as the same keyed set the world is, rather than as a predicate: what
 * `dropTo` is handed in the scene is the block map itself, and a test that fed
 * it something else would be testing a function nothing calls.
 */
const solid = {
  has: (key: string) => {
    const [x, y] = key.split(',').map(Number)
    return y === 0 || (x === 5 && y <= 2)
  },
}

describe('dropping it onto what is underneath', () => {
  test('lands on the floor when there is nothing else', () => {
    expect(dropTo(solid, 0, 0, 10)).toBe(1)
  })

  test('lands on top of what it is pointed at, not beside it', () => {
    // The crosshair offers the cell against the *face* of a wall, which is what
    // a block wants and would hang a bench in mid-air.
    expect(dropTo(solid, 5, 0, 8)).toBe(3)
  })

  test('walks down from where you pointed, so a table top wins over the floor', () => {
    // Pointing below the wall's top finds the first solid going down, which is
    // the surface somebody was pointing at.
    expect(dropTo(solid, 5, 0, 1)).toBe(2)
  })

  test('a column with nothing in it at all puts it on the ground plane', () => {
    expect(dropTo({ has: () => false }, 3, 3, 20)).toBe(0)
  })
})

describe('a thumb push, in whole cells', () => {
  test('facing north, forward is north', () => {
    expect(stepBy(0, 0, 1)).toEqual({ dx: 0, dz: 1 })
    expect(stepBy(0, 1, 0)).toEqual({ dx: 1, dz: 0 })
  })

  test('turn a quarter and forward turns with you', () => {
    expect(stepBy(Math.PI / 2, 0, 1)).toEqual({ dx: 1, dz: 0 })
    expect(stepBy(Math.PI, 0, 1)).toEqual({ dx: 0, dz: -1 })
  })

  test('a heading between two axes snaps to the nearer one', () => {
    // Not a diagonal: the thing lives on a lattice, and a bench that drifts off
    // it is a bench that cannot be lined up with what it stands against.
    expect(stepBy(0.4, 0, 1)).toEqual({ dx: 0, dz: 1 })
    expect(stepBy(1.2, 0, 1)).toEqual({ dx: 1, dz: 0 })
  })

  test('a diagonal push is two axes at once, still on the lattice', () => {
    expect(stepBy(0, 1, 1)).toEqual({ dx: 1, dz: 1 })
  })

  test('a heading past a full turn is the same as one inside it', () => {
    expect(stepBy(Math.PI * 2, 0, 1)).toEqual(stepBy(0, 0, 1))
    expect(stepBy(-Math.PI / 2, 0, 1)).toEqual({ dx: -1, dz: 0 })
  })
})

describe('somewhere to stand it', () => {
  const floor = { has: (key: string) => key.split(',')[1] === '0' }
  const nothing = () => true

  test('straight in front of you, when that is free', () => {
    const at = spotFor({ x: 0.5, y: 1, z: 0.5 }, { x: 0, z: 1 }, 3, floor, nothing)
    expect(at).toEqual({ x: 0, y: 1, z: 3 })
  })

  test('beside it, when it is not', () => {
    // The gap next to a wall rather than giving up at the wall: the ring walks
    // outward from where somebody was looking.
    const taken = new Set(['0,1,3'])
    const at = spotFor({ x: 0.5, y: 1, z: 0.5 }, { x: 0, z: 1 }, 3, floor, (x, y, z) =>
      !taken.has(`${x},${y},${z}`),
    )
    expect(at).not.toBeNull()
    expect(at).not.toEqual({ x: 0, y: 1, z: 3 })
    expect(Math.abs((at?.z ?? 0) - 3) + Math.abs(at?.x ?? 0)).toBeLessThanOrEqual(2)
  })

  test('nowhere is an answer, not a guess', () => {
    // A cupboard with a person in it has no room for a wardrobe, and saying so
    // beats putting one inside the person.
    expect(spotFor({ x: 0, y: 1, z: 0 }, { x: 0, z: 1 }, 3, floor, () => false)).toBeNull()
  })

  test('it stands on what is under it, not at eye height', () => {
    const at = spotFor({ x: 0.5, y: 8, z: 0.5 }, { x: 1, z: 0 }, 2, floor, nothing)
    expect(at?.y).toBe(1)
  })
})

/**
 * Off the lattice, which is where things live now.
 *
 * A thing is nudged by tenths and a ball is written down wherever it stopped,
 * so the coordinate handed to `dropTo` is rarely a whole number any more. The
 * key it builds is a string, so a fraction matches nothing and the column
 * reads as empty - which drew the thing a full cell under the floor.
 */
describe('a fractional position still finds the floor', () => {
  const solid = new Set([blockKey(-3, 0, 0), blockKey(4, 0, 2), blockKey(0, 0, 0)])

  test('a thing nudged half a cell rests on the block it is over', () => {
    // Drawn at 4.5+0.5 = cell 4, which is where the block is.
    expect(dropTo(solid, 4, 2, 3)).toBe(1)
    expect(dropTo(solid, 4.4, 2.2, 3)).toBe(1)
  })

  test('negative fractions land in the cell the thing is drawn in', () => {
    // -2.4 draws at -1.9, which is cell -2 - and there is no block there.
    expect(dropTo(solid, -2.4, 0, 3)).toBe(0)
    // -3.4 draws at -2.9, cell -3, which is solid.
    expect(dropTo(solid, -3.4, 0.2, 3)).toBe(1)
  })

  test('a fractional starting height still walks whole cells down', () => {
    // 1.5 used to step 1.5, 0.5 - two keys no block could ever match.
    expect(dropTo(solid, 0, 0, 1.5)).toBe(1)
  })

  test('whole coordinates are what they always were', () => {
    expect(dropTo(solid, 0, 0, 3)).toBe(1)
    expect(dropTo(solid, 9, 9, 3)).toBe(0)
  })
})
