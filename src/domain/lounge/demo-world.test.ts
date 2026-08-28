import { describe, expect, test } from 'bun:test'
import { DEMO_HOSTS, planDemoWorld } from '@/domain/lounge/demo-world'
import { MAX_WORLD_BLOCKS, WORLD_HEIGHT } from '@/domain/lounge/events'
import { isKnownModel } from '@/domain/lounge/palette'

/**
 * The demo world is built on the client and never validated by a command, so
 * the checks a command would have done have to happen here instead. That is the
 * trade the whole demo makes - no writes means no server-side guard - and these
 * are the guards, moved.
 */

describe('planDemoWorld', () => {
  test('every block is a model the palette can actually load', () => {
    const unknown = planDemoWorld()
      .map((block) => block.model)
      .filter((model) => !isKnownModel(model))

    expect([...new Set(unknown)]).toEqual([])
  })

  test('every cell is a whole number inside the world height', () => {
    for (const block of planDemoWorld()) {
      expect(Number.isInteger(block.x)).toBe(true)
      expect(Number.isInteger(block.y)).toBe(true)
      expect(Number.isInteger(block.z)).toBe(true)
      expect(block.y).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeLessThan(WORLD_HEIGHT)
    }
  })

  test('no two blocks claim the same cell', () => {
    const blocks = planDemoWorld()
    const cells = new Set(blocks.map((block) => `${block.x},${block.y},${block.z}`))

    expect(cells.size).toBe(blocks.length)
  })

  test('is nowhere near the cap a real world is held to', () => {
    expect(planDemoWorld().length).toBeLessThan(MAX_WORLD_BLOCKS / 4)
  })

  test('is the same world every time', () => {
    expect(planDemoWorld()).toEqual(planDemoWorld())
  })

  /**
   * The scene stands you on top of whatever column is at the origin. Anything
   * built there would mean arriving perched on a crate, or inside a tree.
   */
  test('leaves the arrival square bare above the floor', () => {
    const above = planDemoWorld().filter(
      (block) => block.x === 0 && block.z === 0 && block.y > 0,
    )

    expect(above).toEqual([])
  })

  test('the floor covers the arrival square', () => {
    const floor = planDemoWorld().find(
      (block) => block.x === 0 && block.z === 0 && block.y === 0,
    )

    expect(floor).toBeDefined()
  })
})

describe('DEMO_HOSTS', () => {
  test('two of them, on distinct cells', () => {
    expect(DEMO_HOSTS.length).toBe(2)
    expect(DEMO_HOSTS[0]?.id).not.toBe(DEMO_HOSTS[1]?.id)
  })

  /** A host standing inside the fountain kerb or a pillar is a body in a wall. */
  test('nobody is standing in anything', () => {
    const solid = new Set(
      planDemoWorld()
        .filter((block) => block.y > 0)
        .map((block) => `${block.x},${block.z}`),
    )

    for (const host of DEMO_HOSTS) {
      const cell = `${Math.round(host.x)},${Math.round(host.z)}`
      expect(solid.has(cell)).toBe(false)
    }
  })

  test('everybody is an avatar the pack ships', async () => {
    const { isKnownAvatar } = await import('@/domain/lounge/avatars')

    for (const host of DEMO_HOSTS) {
      expect(isKnownAvatar(host.avatar)).toBe(true)
    }
  })
})
