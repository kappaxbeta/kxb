import { describe, expect, test } from 'bun:test'
import { armedWith, castRay, chaseDistance, personBox, targetsOf, type Target } from './shooting'
import { emptyWorld, PLAYER_ID, WEAPON_NAME } from './entities'
import type { SolidTest } from './physics'

/**
 * A shot, and a camera that does not sit in a wall.
 *
 * Both are the same question and this is the file that answers it, which is the
 * whole reason it can be tested at all: neither can be *watched* - the Browser
 * pane never fires a frame - so "did that bullet hit the target or the wall in
 * front of it" has to be a function returning a number.
 */

/** A world with cells filled at the given keys, and nothing else. */
const cells = (...filled: string[]): SolidTest => {
  const set = new Set(filled)
  return (x, y, z) => set.has(`${x},${y},${z}`)
}

const boxAt = (id: number, x: number, y: number, z: number, half = 0.5): Target => ({
  id,
  box: {
    minX: x - half,
    minY: y - half,
    minZ: z - half,
    maxX: x + half,
    maxY: y + half,
    maxZ: z + half,
  },
})

describe('casting against the grid', () => {
  test('a wall four cells along is four cells along', () => {
    const hit = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, {
      isSolid: cells('4,0,0'),
    })
    expect(hit).not.toBeNull()
    expect(hit!.id).toBeNull()
    expect(hit!.distance).toBeCloseTo(3.5, 5)
    expect(hit!.point.x).toBeCloseTo(4, 5)
  })

  /**
   * The case a sampling implementation gets wrong. A diagonal ray crosses cells
   * the samples fall either side of, and which ones it misses depends on how
   * fine the sampling is - so the bug is a shot that goes through a corner
   * sometimes.
   */
  test('a diagonal does not slip between cells', () => {
    const hit = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 1 }, {
      isSolid: cells('3,0,3'),
      range: 20,
    })
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeLessThan(4)
  })

  test('nothing in the way is null, not a hit at the range', () => {
    expect(castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { isSolid: cells() })).toBeNull()
  })

  test('past the range does not count', () => {
    const isSolid = cells('40,0,0')
    expect(castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { isSolid, range: 10 })).toBeNull()
    expect(castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { isSolid, range: 60 })).not.toBeNull()
  })

  /**
   * A camera pulling back out of a doorway starts inside a filled cell. A walk
   * that only tested the cells it *entered* would report nothing in the way and
   * put the camera through the wall.
   */
  test('starting inside something is a hit at zero', () => {
    const hit = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, {
      isSolid: cells('0,0,0'),
    })
    expect(hit!.distance).toBe(0)
  })

  test('a direction of nothing is not a ray', () => {
    expect(castRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { isSolid: cells('1,0,0') })).toBeNull()
  })

  test('the direction need not be normalised', () => {
    const hit = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 17, y: 0, z: 0 }, {
      isSolid: cells('4,0,0'),
    })
    // Distances are world units whatever the caller passed in.
    expect(hit!.distance).toBeCloseTo(3.5, 5)
  })
})

describe('casting against entities', () => {
  test('the nearer of two is the one hit', () => {
    const hit = castRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, {
      targets: [boxAt(2, 0, 0, 9), boxAt(1, 0, 0, 4)],
      range: 40,
    })
    expect(hit!.id).toBe(1)
  })

  /**
   * The ordering that makes a shooter a shooter: a target against a wall is
   * hittable, one behind it is not. Both are the same two objects with the
   * distances swapped.
   */
  test('a wall in front of a target stops the shot', () => {
    const targets = [boxAt(1, 0, 0.5, 6)]
    const open = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: 1 }, { targets, range: 40 })
    expect(open!.id).toBe(1)

    const blocked = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: 1 }, {
      targets,
      isSolid: cells('0,0,3'),
      range: 40,
    })
    expect(blocked!.id).toBeNull()
  })

  test('a target behind the wall is missed and the wall is reported', () => {
    const hit = castRay({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: 1 }, {
      targets: [boxAt(1, 0, 0.5, 9)],
      isSolid: cells('0,0,3'),
      range: 40,
    })
    expect(hit!.id).toBeNull()
    expect(hit!.distance).toBeCloseTo(2.5, 5)
  })

  test('what the shooter is holding cannot be shot', () => {
    const targets = [boxAt(9_000_001, 0, 0, 1), boxAt(3, 0, 0, 8)]
    const hit = castRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, {
      targets,
      range: 40,
      ignore: new Set([9_000_001]),
    })
    expect(hit!.id).toBe(3)
  })

  test('a box beside the ray is not hit', () => {
    expect(
      castRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { targets: [boxAt(1, 4, 0, 6)], range: 40 }),
    ).toBeNull()
  })

  test('only the entities with a box are worth aiming at', () => {
    const world = emptyWorld()
    world.alive.add(1)
    world.alive.add(2)
    world.box.set(1, { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 })
    expect(targetsOf(world).map((target) => target.id)).toEqual([1])
  })
})

describe('the ground', () => {
  /**
   * `world.ground` is a rule in the controller rather than cells in the grid, so
   * a ray that knew only about cells would pass through the floor of an
   * otherwise empty level and report nothing - which is a camera under the
   * world.
   */
  test('a floor with nothing rasterised into it still stops a ray', () => {
    const hit = castRay({ x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 }, { ground: 0 })
    expect(hit!.distance).toBeCloseTo(4, 5)
    expect(hit!.point.y).toBe(0)
  })

  test('a ray going up never meets it', () => {
    expect(castRay({ x: 0, y: 4, z: 0 }, { x: 0, y: 1, z: 0 }, { ground: 0 })).toBeNull()
  })
})

describe('the chase camera', () => {
  test('nothing behind you means the whole arm', () => {
    expect(chaseDistance({ x: 0.5, y: 1.7, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4, {
      isSolid: cells(),
    })).toBe(4)
  })

  test('a wall behind you shortens it, and leaves a gap', () => {
    const distance = chaseDistance({ x: 0.5, y: 1.7, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4, {
      isSolid: cells('0,1,-2'),
      clearance: 0.3,
    })
    // The cell runs -2..-1, so its near face is 1.5 away; less the clearance.
    expect(distance).toBeCloseTo(1.2, 5)
  })

  test('a wall you are already inside pulls all the way in rather than in front', () => {
    expect(
      chaseDistance({ x: 0.5, y: 1.7, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4, {
        isSolid: cells('0,1,0'),
      }),
    ).toBe(0)
  })
})

/**
 * The other players, as things a bullet can meet.
 *
 * Peers are not entities in this client's world - they are interpolated samples
 * from a quarter of a second ago - so before this they could not be shot at all,
 * which is what `docs/xp/backlog.md` §0.3 means by "one client's damage has to
 * reach another's". A hit here is a *claim*; whether it counts is the arbiter's.
 */
describe('shooting at somebody', () => {
  /** Feet on the floor, which is what a sample on the wire carries. */
  const standing = (id: string, x: number, z: number) => ({
    id,
    box: personBox({ x, y: 0, z }),
  })

  test('a body in front of you is hit, and named', () => {
    const hit = castRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, {
      people: [standing('ana', 0, -5)],
    })
    expect(hit?.who).toBe('ana')
    // Not an entity, and the field that would say so is empty rather than
    // holding a number that means nothing on any other machine.
    expect(hit?.id).toBeNull()
    expect(hit?.distance).toBeCloseTo(4.7, 5)
  })

  test('a body behind a wall is not', () => {
    const hit = castRay({ x: 0.5, y: 1.7, z: 0.5 }, { x: 0, y: 0, z: -1 }, {
      isSolid: cells('0,1,-2'),
      people: [standing('ana', 0.5, -5)],
    })
    expect(hit?.who).toBeUndefined()
    expect(hit?.id).toBeNull()
  })

  test('a body in front of a wall is', () => {
    const hit = castRay({ x: 0.5, y: 1.7, z: 0.5 }, { x: 0, y: 0, z: -1 }, {
      isSolid: cells('0,1,-8'),
      people: [standing('ana', 0.5, -5)],
    })
    expect(hit?.who).toBe('ana')
  })

  /**
   * The nearer of the two wins whichever list it came from. Written because the
   * people are tested last, and a version that took the first list to report a
   * hit would shoot through a crate to reach somebody standing behind it.
   */
  test('a crate in the way beats the person behind it', () => {
    const hit = castRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, {
      targets: [boxAt(7, 0, 1.7, -2)],
      people: [standing('ana', 0, -5)],
    })
    expect(hit?.id).toBe(7)
    expect(hit?.who).toBeUndefined()
  })

  test('and the person in front of the crate beats the crate', () => {
    const hit = castRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, {
      targets: [boxAt(7, 0, 1.7, -8)],
      people: [standing('ana', 0, -5)],
    })
    expect(hit?.who).toBe('ana')
  })

  /**
   * A sample is a pair of feet, so the body stands *on* it. The wrong way up
   * buries every hitbox a body-height in the floor, and the only symptom is
   * that shooting people quietly does not work. See ./presence for the same
   * conversion got wrong in the other direction.
   */
  test('the box stands on the sample rather than hanging from it', () => {
    const box = personBox({ x: 0, y: 0, z: 0 })
    expect(box.minY).toBeCloseTo(0, 5)
    expect(box.maxY).toBeCloseTo(1.7, 5)

    // A body standing on a ledge is up there with it, not sunk into it.
    expect(personBox({ x: 0, y: 3, z: 0 }).minY).toBeCloseTo(3, 5)

    // Knee height, which is inside a standing body and above nothing else.
    const knees = castRay({ x: 0, y: 0.4, z: 0 }, { x: 0, y: 0, z: -1 }, {
      people: [standing('ana', 0, -5)],
    })
    expect(knees?.who).toBe('ana')

    const overhead = castRay({ x: 0, y: 2.4, z: 0 }, { x: 0, y: 0, z: -1 }, {
      people: [standing('ana', 0, -5)],
    })
    expect(overhead).toBeNull()
  })

  test('nobody in the room is a miss, not a throw', () => {
    expect(castRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, { people: [] })).toBeNull()
  })

  test('out of range is out of range', () => {
    const hit = castRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, {
      people: [standing('ana', 0, -50)],
      range: 10,
    })
    expect(hit).toBeNull()
  })
})

describe('what a body is armed with', () => {
  /**
   * The half of "guns lie around and you pick one up" that lives in this
   * package. `carry` has always worked; until `armedWith` the thing in your
   * hand did nothing, because a shot could only ever come out of the socket the
   * host filled at load.
   */
  const holding = (child: number, props?: Record<string, number>, name?: string) => {
    const world = emptyWorld()
    world.alive.add(PLAYER_ID)
    world.alive.add(child)
    world.parent.set(child, { id: PLAYER_ID, socket: 'hand' })
    if (props) world.props.set(child, props)
    if (name) world.name.set(child, name)
    return world
  }

  test('a picked-up gun is a gun', () => {
    expect(armedWith(holding(9, { damage: 25, range: 40 }), PLAYER_ID)).toBe(9)
  })

  test('a flag is not', () => {
    expect(armedWith(holding(9, {}), PLAYER_ID)).toBeNull()
  })

  test('and neither is a hand with nothing in it', () => {
    const world = emptyWorld()
    world.alive.add(PLAYER_ID)
    expect(armedWith(world, PLAYER_ID)).toBeNull()
  })

  test('the worn weapon wins over anything picked up', () => {
    // The worn one is what the host draws and what the arbiter was told about
    // at join, so a pickup that quietly replaced it would put the model, the
    // damage and the crosshair out of step.
    const world = holding(9, { damage: 25 })
    world.alive.add(2)
    world.parent.set(2, { id: PLAYER_ID, socket: 'hand' })
    world.props.set(2, { damage: 10 })
    world.name.set(2, WEAPON_NAME)
    expect(armedWith(world, PLAYER_ID)).toBe(2)
  })

  test('a gun that has been put away is not one', () => {
    // `disarm` is `deactivate` and leaves the parent link alone, so aliveness
    // is the question rather than whether anything is hanging there.
    const world = holding(9, { damage: 25 })
    world.alive.delete(9)
    expect(armedWith(world, PLAYER_ID)).toBeNull()
  })

  test('somebody else holding one is not us holding one', () => {
    const world = holding(9, { damage: 25 })
    world.parent.set(9, { id: 77, socket: 'hand' })
    expect(armedWith(world, PLAYER_ID)).toBeNull()
  })
})
