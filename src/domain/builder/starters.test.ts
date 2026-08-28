import { describe, expect, test } from 'bun:test'
import { isBuildable } from '@/domain/builder/catalogue'
import { isBlockModel } from '@/domain/worlds/blocks'
import { jumpReach } from '@/domain/lounge/jump'
import { findStarter, STARTERS, starterRoutes } from '@/domain/builder/starters'
import { cellKey, inBounds, MAX_PLACEMENTS, parseWorld } from '@/domain/builder/world'

describe('starters', () => {
  test('each one has a distinct id', () => {
    expect(new Set(STARTERS.map((starter) => starter.id)).size).toBe(STARTERS.length)
  })

  // The failure this catches is the one that would otherwise reach a customer:
  // a model renamed in a pack leaves a starter fetching a glTF that is not
  // there, and the renderer suspends the whole world's boundary forever.
  test('every model is one we ship', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      for (const placement of world.placements) {
        expect(isBuildable(placement.model)).toBe(true)
      }
      if (world.ground) expect(isBuildable(world.ground.model)).toBe(true)
    }
  })

  /*
   * What the card shows is what a space gets.
   *
   * A space's copy of a world keeps only the block palette (domain/worlds/
   * blocks.ts), and the first starters were furnished from the park and the
   * restaurant packs - so the office arrived as four walls and the square as
   * paving round a pool. Every starter is built from blocks now, furniture
   * included, and this is what keeps a park bench from creeping back in.
   */
  test('every model survives the copy into a space', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      for (const placement of world.placements) {
        expect(isBlockModel(placement.model)).toBe(true)
      }
      if (world.ground) expect(isBlockModel(world.ground.model)).toBe(true)
    }
  })

  /*
   * A painted floor is floor, not kerb.
   *
   * The generated slab sits at y=-1, so a world that wants lines or paths on
   * it has no slab at all and lays its own floor - otherwise the paint is a
   * block standing on the grass, which is what the first pitch's touchlines
   * were. Checked the cheap way: a starter with a generated slab places
   * nothing in the slab's own layer, because that would be two blocks in one
   * cell, drawn on top of each other.
   */
  test('nothing is placed inside a generated slab', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      if (!world.ground) continue
      for (const placement of world.placements) {
        expect(placement.y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  // A pitch a space cannot kick off on the moment it lands is a green
  // rectangle; the goals travel as marks.
  test('the grounds with goals on them carry both goals', () => {
    for (const id of ['pitch', 'school']) {
      const kinds = findStarter(id)!.build().marks.map((mark) => mark.kind).sort()
      expect(kinds).toEqual(['blue', 'red'])
    }
  })

  test('every placement is inside the lattice and under the cap', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      expect(world.placements.length).toBeLessThanOrEqual(MAX_PLACEMENTS)
      for (const placement of world.placements) {
        expect(inBounds(placement)).toBe(true)
      }
    }
  })

  test('one cell holds one placement', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      const cells = new Set(world.placements.map(cellKey))
      expect(cells.size).toBe(world.placements.length)
    }
  })

  // A starter is loaded into the same editor a file is, so it has to survive
  // the same parser - and survive it *unchanged*, or what you get is not what
  // the generator drew.
  test('survives a round trip through the parser', () => {
    for (const starter of STARTERS) {
      const world = starter.build()
      expect(parseWorld(JSON.parse(JSON.stringify(world)))).toEqual(world)
    }
  })

  test('an unknown id is not a starter', () => {
    expect(findStarter('nope')).toBeUndefined()
  })
})

/**
 * The courses have to be runnable, which is not something you can see by
 * looking at them.
 *
 * This is the test that would have caught the tower's first version: pads an
 * eighth of a turn apart at radius eight are 6.1 cells from each other, a
 * walking jump that lands a block higher covers 3.4, and the result was a
 * yellow pad you could stand and look at and never reach.
 *
 * Measured against `jumpReach`, which reads the same constants the controller
 * steps - so a change to gravity or the walk pace fails here rather than
 * quietly making a published course impossible.
 */
describe('the courses can be run', () => {
  const routes = starterRoutes()

  for (const [id, route] of Object.entries(routes)) {
    describe(id, () => {
      test('every hop is inside a walking jump', () => {
        for (let index = 1; index < route.length; index += 1) {
          const from = route[index - 1]
          const to = route[index]
          const distance = Math.hypot(to.x - from.x, to.z - from.z)
          const rise = to.y - from.y

          // Pads are two cells across, so a jump may start from the near edge
          // and land on the near edge - but nothing here leans on that, which
          // is the margin that keeps the course fair on a bad landing.
          expect(rise).toBeLessThanOrEqual(1)
          expect(distance).toBeLessThanOrEqual(jumpReach(rise))
        }
      })

      test('goes somewhere', () => {
        expect(route.length).toBeGreaterThan(8)
      })
    })
  }
})
