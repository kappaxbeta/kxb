import { describe, expect, test } from 'bun:test'
import { WORLD_HEIGHT } from '@/domain/lounge/events'
import { isKnownModel } from '@/domain/lounge/palette'
import {
  PITCH_LENGTH,
  PITCH_WIDTH,
  planPitch,
  WALL_HEIGHT,
} from '@/domain/lounge/pitch'

/**
 * What is true of the plan on its own.
 *
 * The assertions about goal *geometry* - that a ball down the centre line
 * scores, that the mouths line up - live in
 * `app/world/lounge/football.test.ts`, because they need `football.ts` and the
 * domain may not import the app. This file is the half that needs only the
 * planner.
 */
const plan = planPitch()

describe('the blocks', () => {
  test('every model is one the palette allows', () => {
    // The action validates this too, but a template that cannot be written is a
    // template nobody discovers is broken until they click the button.
    for (const model of new Set(plan.blocks.map((block) => block.model))) {
      expect(isKnownModel(model)).toBe(true)
    }
  })

  test('every block is inside the world', () => {
    for (const block of plan.blocks) {
      expect(Number.isInteger(block.x)).toBe(true)
      expect(Number.isInteger(block.y)).toBe(true)
      expect(Number.isInteger(block.z)).toBe(true)
      expect(block.y).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeLessThan(WORLD_HEIGHT)
    }
  })

  test('the ground is unbroken, so nothing falls out of the world', () => {
    const ground = new Set(
      plan.blocks.filter((b) => b.y === 0).map((b) => `${b.x},${b.z}`),
    )
    const { minX, maxX, minZ, maxZ } = plan.bounds

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        expect(ground.has(`${x},${z}`)).toBe(true)
      }
    }
  })

  test('the wall rings the whole pitch at full height', () => {
    const solid = new Set(plan.blocks.map((b) => `${b.x},${b.y},${b.z}`))
    const { minX, maxX, minZ, maxZ } = plan.bounds

    for (let y = 1; y <= WALL_HEIGHT; y++) {
      for (let x = minX; x <= maxX; x++) {
        expect(solid.has(`${x},${y},${minZ}`)).toBe(true)
        expect(solid.has(`${x},${y},${maxZ}`)).toBe(true)
      }
      for (let z = minZ; z <= maxZ; z++) {
        expect(solid.has(`${minX},${y},${z}`)).toBe(true)
        expect(solid.has(`${maxX},${y},${z}`)).toBe(true)
      }
    }
  })

  test('the playing surface is clear of anything to trip over', () => {
    // Everything above the grass is wall, and the wall is outside the pitch.
    const hx = (PITCH_WIDTH - 1) / 2
    const hz = (PITCH_LENGTH - 1) / 2

    for (const block of plan.blocks) {
      if (block.y === 0) continue
      const insidePitch =
        block.x >= -hx && block.x <= hx && block.z >= -hz && block.z <= hz
      expect(insidePitch).toBe(false)
    }
  })
})

describe('the goals', () => {
  test('they stand on the grass rather than sunk into it', () => {
    for (const goal of plan.goals) {
      expect(goal.y).toBe(1)
    }
  })

  test('they are inside the wall, not buried in it', () => {
    const { minZ, maxZ } = plan.bounds
    for (const goal of plan.goals) {
      expect(goal.z).toBeGreaterThan(minZ)
      expect(goal.z).toBeLessThan(maxZ)
    }
  })
})
