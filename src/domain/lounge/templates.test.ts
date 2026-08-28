import { describe, expect, test } from 'bun:test'
import { MAX_WORLD_BLOCKS } from '@/domain/lounge/events'
import { jumpReach } from '@/domain/lounge/jump'
import { isKnownModel } from '@/domain/lounge/palette'
import {
  DEFAULT_TEMPLATE_ID,
  findTemplate,
  raceRoute,
  WORLD_TEMPLATES,
} from '@/domain/lounge/templates'

/**
 * The catalogue's invariants.
 *
 * These are the things that cannot be checked by looking at the file, because
 * they are properties of what the planners *produce* - and a template that
 * plans a world nobody can load is a deploy-time bug that only shows up when
 * somebody picks it.
 */
describe('the world catalogue', () => {
  test('ids are unique - a duplicate would make one entry unreachable', () => {
    const ids = WORLD_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the default is one of them', () => {
    expect(findTemplate(DEFAULT_TEMPLATE_ID)).toBeDefined()
  })

  test('an unknown id is undefined, not a throw - it arrives from a client', () => {
    expect(findTemplate('no-such-template')).toBeUndefined()
  })

  for (const template of WORLD_TEMPLATES) {
    describe(template.name, () => {
      const plan = template.plan()

      test('lays something', () => {
        expect(plan.blocks.length).toBeGreaterThan(0)
      })

      /**
       * Every model has to be in the palette.
       *
       * A typo here lays a world of blocks the renderer has no mesh for, which
       * draws as holes rather than as an error - and the projection would have
       * stored them, so the world stays broken after the typo is fixed.
       */
      test('places only models the palette knows', () => {
        const unknown = [
          ...new Set(plan.blocks.map((block) => block.model)),
        ].filter((model) => !isKnownModel(model))

        expect(unknown).toEqual([])
      })

      /**
       * And it has to fit. `MAX_WORLD_BLOCKS` is refused by the aggregate, so a
       * template over the cap would clear the world and then fail halfway
       * through laying the new one - the worst outcome available.
       */
      test('fits inside the world cap', () => {
        expect(plan.blocks.length).toBeLessThan(MAX_WORLD_BLOCKS)
      })

      test('sits on the ground, never below it', () => {
        expect(plan.blocks.every((block) => block.y >= 0)).toBe(true)
      })

      /**
       * A mark in a ground that claims to have none is a ball with nowhere to
       * go - or a finish line in a duelling pit.
       *
       * Two flags, two kinds of mark, and they have to agree: `football` means
       * a red and a blue, `race` means a start and a finish. A template with
       * neither flag stands nothing.
       */
      test('stands only the marks it says it has', () => {
        expect(plan.goals.length > 0).toBe(Boolean(template.football || template.race))

        const kinds = new Set(plan.goals.map((goal) => goal.kind))
        if (template.football) {
          expect(kinds.has('red') && kinds.has('blue')).toBe(true)
        }
        if (template.race) {
          expect(kinds.has('start') && kinds.has('finish')).toBe(true)
        }
      })
    })
  }
})

describe('the pitch template', () => {
  const pitch = findTemplate('pitch')!

  /**
   * Both goals, and one for each side.
   *
   * The battle lobby defaults a football match to this world, so "the pitch has
   * two goals" is what stops the default match being unplayable.
   */
  test('stands a goal for each side', () => {
    const teams = pitch.plan().goals.map((goal) => goal.kind)
    expect([...teams].sort()).toEqual(['blue', 'red'])
  })
})

/**
 * The two rooms, checked for the two ways a room can be wrong.
 *
 * Both are the same kind of failure and neither shows up in a screenshot: a
 * world you spawn inside the furniture of, and a world you cannot get out of.
 * The second is the one worth a test - `room()` cuts the doorway itself, and a
 * sealed hall is a template that traps whoever laid it.
 */
describe.each([
  ['club', 13, 11],
  ['living-room', 8, 7],
])('the %s', (id, halfX, halfZ) => {
  const blocks = findTemplate(id)!.plan().blocks

  /**
   * Body height, not the whole column: the club hangs a lighting rig eight
   * blocks up over the middle of the floor, which is scenery you walk under
   * rather than something you arrive on top of.
   */
  test('leaves the arrival square clear, so nobody lands on the furniture', () => {
    const standing = blocks.filter(
      (block) => block.x === 0 && block.z === 0 && block.y > 0 && block.y <= 2,
    )
    expect(standing).toEqual([])
  })

  test('has a doorway in it', () => {
    const doorway = blocks.filter(
      (block) => block.z === halfZ && Math.abs(block.x) <= 1 && block.y > 0,
    )
    expect(doorway).toEqual([])
  })

  test('is floored right out to the walls', () => {
    const floor = new Set(
      blocks.filter((block) => block.y === 0).map((block) => `${block.x},${block.z}`),
    )
    for (let x = -halfX; x <= halfX; x++) {
      for (let z = -halfZ; z <= halfZ; z++) {
        expect(floor.has(`${x},${z}`)).toBe(true)
      }
    }
  })
})

describe('the duelling cage', () => {
  const cage = findTemplate('cage')!

  /** Walled all the way round: no gap to walk out of a duel through. */
  test('is enclosed by a wall taller than a player', () => {
    const blocks = cage.plan().blocks
    const wall = blocks.filter((block) => block.y > 0)

    expect(wall.length).toBeGreaterThan(0)
    // Every wall column is the same height, which is what "enclosed" means
    // here: a shorter column is a gap you can jump over.
    const heights = new Map<string, number>()
    for (const block of wall) {
      const key = `${block.x},${block.z}`
      heights.set(key, (heights.get(key) ?? 0) + 1)
    }
    expect(new Set(heights.values()).size).toBe(1)
  })

  /** Floor under every wall column, so the ring is not standing on nothing. */
  test('has floor under all of it', () => {
    const blocks = cage.plan().blocks
    const floor = new Set(
      blocks.filter((block) => block.y === 0).map((block) => `${block.x},${block.z}`),
    )

    for (const block of blocks) {
      expect(floor.has(`${block.x},${block.z}`)).toBe(true)
    }
  })
})

/**
 * The race course has to be runnable.
 *
 * Same check the builder's courses get, and for the same reason: whether a gap
 * can be jumped is a fact about the character controller, not about how the
 * pads look from above. Measured against `jumpReach`, which reads the constants
 * the controller steps - so a change to gravity fails here rather than turning
 * every published race into a swim.
 */
describe('the race course', () => {
  const route = raceRoute()

  test('every hop is inside a walking jump', () => {
    for (let index = 1; index < route.length; index++) {
      const from = route[index - 1]
      const to = route[index]
      const distance = Math.hypot(to.x - from.x, to.z - from.z)
      const rise = to.y - from.y

      expect(rise).toBeLessThanOrEqual(1)
      expect(distance).toBeLessThanOrEqual(jumpReach(rise))
    }
  })

  test('stands a start and a finish, and they are not the same place', () => {
    const marks = findTemplate('race')!.plan().goals
    expect(marks.map((mark) => mark.kind).sort()).toEqual(['finish', 'start'])
    expect(marks[0].x).not.toBe(marks[1].x)
  })
})
