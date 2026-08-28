import { describe, expect, test } from 'bun:test'
import {
  blockPlacementSchema,
  blockPositionSchema,
  loungeEditSchema,
} from '@/domain/lounge/commands'
import {
  CHUNK_SIZE,
  chunkOf,
  DEFAULT_WORLD_SIZE,
  MAX_BLOCKS_LOADED,
  MAX_WORLD_BLOCKS,
  WORLD_HEIGHT,
  WORLD_RADIUS,
} from '@/domain/lounge/events'
import { planPitch } from '@/domain/lounge/pitch'

const model = 'dirt_with_grass'

/**
 * The build bound, from both sides.
 *
 * What matters here is not the number but the *asymmetry*: placing is bounded
 * and removing is not. Everything below is really one rule tested from several
 * angles - you cannot build out there any more, and anything already out there
 * stays reachable.
 */
describe('how far you may build', () => {
  test('the middle of the world is fine', () => {
    expect(blockPlacementSchema.safeParse({ x: 0, y: 0, z: 0, model }).success).toBe(true)
  })

  test('the last buildable cell on each axis is inside', () => {
    const corner = { x: WORLD_RADIUS - 1, y: 0, z: WORLD_RADIUS - 1, model }
    expect(blockPlacementSchema.safeParse(corner).success).toBe(true)

    const far = { x: -WORLD_RADIUS, y: 0, z: -WORLD_RADIUS, model }
    expect(blockPlacementSchema.safeParse(far).success).toBe(true)
  })

  test('one cell beyond it is not', () => {
    expect(
      blockPlacementSchema.safeParse({ x: WORLD_RADIUS, y: 0, z: 0, model }).success,
    ).toBe(false)
    expect(
      blockPlacementSchema.safeParse({ x: 0, y: 0, z: -WORLD_RADIUS - 1, model }).success,
    ).toBe(false)
  })

  test('the old wild-west coordinates are refused', () => {
    // What the bound was before, and the reason it changed.
    expect(
      blockPlacementSchema.safeParse({ x: 90_000, y: 0, z: 90_000, model }).success,
    ).toBe(false)
  })

  test('height is bounded as it always was', () => {
    expect(
      blockPlacementSchema.safeParse({ x: 0, y: WORLD_HEIGHT, z: 0, model }).success,
    ).toBe(false)
  })
})

describe('the grandfather clause', () => {
  test('a block outside the bound can still be removed', () => {
    // Built when the world was +/-100,000 wide. Bounding removal too would
    // strand it there permanently.
    const stranded = { x: 40_000, y: 3, z: -12_000 }
    expect(blockPositionSchema.safeParse(stranded).success).toBe(true)
  })

  test('but it cannot be built on top of', () => {
    const sameCell = { x: 40_000, y: 4, z: -12_000, model }
    expect(blockPlacementSchema.safeParse(sameCell).success).toBe(false)
  })

  test('an edit that only clears distant blocks is accepted whole', () => {
    const parsed = loungeEditSchema.safeParse({
      place: [],
      remove: [{ x: 40_000, y: 3, z: -12_000 }],
    })

    expect(parsed.success).toBe(true)
  })

  test('an edit that tries to place out there is rejected whole', () => {
    const parsed = loungeEditSchema.safeParse({
      place: [
        { x: 0, y: 0, z: 0, model },
        { x: 40_000, y: 0, z: 0, model },
      ],
      remove: [],
    })

    expect(parsed.success).toBe(false)
  })
})

/**
 * The bound was chosen to land on chunk edges. If someone retunes it, these are
 * the properties that made the number worth having rather than arbitrary.
 */
describe('the bound is a whole number of chunks', () => {
  test('the world is an exact multiple of the chunk size across', () => {
    expect((WORLD_RADIUS * 2) % CHUNK_SIZE).toBe(0)
  })

  test('the corners land on chunk boundaries, so no chunk is half-addressable', () => {
    const low = chunkOf(-WORLD_RADIUS, -WORLD_RADIUS)
    const high = chunkOf(WORLD_RADIUS - 1, WORLD_RADIUS - 1)

    // Lowest cell starts a chunk; highest cell ends one. Math.abs because the
    // remainder of a negative multiple is -0, which toBe distinguishes from 0.
    expect(Math.abs(-WORLD_RADIUS % CHUNK_SIZE)).toBe(0)
    expect(low.cx).toBe(-WORLD_RADIUS / CHUNK_SIZE)
    expect(high.cx).toBe(WORLD_RADIUS / CHUNK_SIZE - 1)
  })

  test('the whole world is 256 chunk streams', () => {
    const perSide = (WORLD_RADIUS * 2) / CHUNK_SIZE
    expect(perSide * perSide).toBe(256)
  })
})

describe('what the world ships with still fits inside it', () => {
  test('the generated floor is comfortably within the bound', () => {
    // Spans -25..24, so this is headroom rather than a near miss.
    expect(DEFAULT_WORLD_SIZE / 2).toBeLessThan(WORLD_RADIUS)
  })

  test('every block of the football pitch template is buildable', () => {
    // A template that laid a block outside the bound would be a button that
    // fails, which is worse than no button.
    const plan = planPitch()

    expect(plan.blocks.length).toBeGreaterThan(0)
    for (const block of plan.blocks) {
      expect(blockPlacementSchema.safeParse(block).success).toBe(true)
    }
  })

  test('the pitch template reports bounds inside the buildable world', () => {
    const { bounds } = planPitch()

    expect(bounds.minX).toBeGreaterThanOrEqual(-WORLD_RADIUS)
    expect(bounds.maxX).toBeLessThan(WORLD_RADIUS)
    expect(bounds.minZ).toBeGreaterThanOrEqual(-WORLD_RADIUS)
    expect(bounds.maxZ).toBeLessThan(WORLD_RADIUS)
  })
})

describe('how much one world may hold', () => {
  test('the budget sits below the point the read path starts truncating', () => {
    // The whole reason the budget exists: MAX_BLOCKS_LOADED cuts the world off
    // silently, so a world must not be able to reach it.
    expect(MAX_WORLD_BLOCKS).toBeLessThan(MAX_BLOCKS_LOADED)
  })

  test('there is room for far more than the default world', () => {
    const floor = DEFAULT_WORLD_SIZE * DEFAULT_WORLD_SIZE
    expect(MAX_WORLD_BLOCKS).toBeGreaterThan(floor * 10)
  })
})
