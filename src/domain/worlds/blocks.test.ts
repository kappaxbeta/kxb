import { describe, expect, test } from 'bun:test'
import { WORLD_HEIGHT } from '@/domain/lounge/events'
import { type BuilderWorld, DEFAULT_WORLD, type Placement } from '@/domain/builder/world'
import { countBlockable, isBlockModel, toBlocks, toBlockModel } from '@/domain/worlds/blocks'

const at = (model: string, x: number, y: number, z: number): Placement => ({
  model,
  x,
  y,
  z,
  rotation: 0,
  scale: 1,
})

/** A world with nothing generated under it, so each test says what is in it. */
function world(placements: Placement[], ground: BuilderWorld['ground'] = null): BuilderWorld {
  return { ...DEFAULT_WORLD, ground, placements }
}

describe('which models cross over', () => {
  test('a palette block does', () => {
    expect(isBlockModel('bb10/stone')).toBe(true)
    expect(toBlockModel('bb10/stone')).toBe('stone')
  })

  test('furniture does not', () => {
    expect(isBlockModel('park/fountain')).toBe(false)
    expect(toBlockModel('park/fountain')).toBeNull()
  })

  // The builder's catalogue and the lounge's palette are different lists over
  // the same pack, and this is the gap between them: a bb10 model the lounge
  // never adopted is still not a block.
  test('a bb10 model outside the palette does not', () => {
    expect(isBlockModel('bb10/not_a_real_block')).toBe(false)
  })

  test('an id that is not pack/name does not', () => {
    expect(isBlockModel('stone')).toBe(false)
  })
})

describe('crossing over', () => {
  test('keeps blocks and counts what it left behind', () => {
    const result = toBlocks(world([at('bb10/stone', 0, 0, 0), at('park/fountain', 1, 0, 0)]))

    expect(result.blocks).toEqual([{ x: 0, y: 0, z: 0, model: 'stone' }])
    expect(result.props).toBe(1)
  })

  // A world copied into a space without its floor is a set of walls standing in
  // the void. The floor is generated from four numbers, not stored, so it has
  // to be expanded here.
  test('brings the generated ground with it', () => {
    const result = toBlocks(
      world([], { cols: 2, rows: 2, model: 'bb10/dirt_with_grass', rounded: false }),
    )

    expect(result.blocks).toHaveLength(4)
    expect(result.blocks.every((block) => block.model === 'dirt_with_grass')).toBe(true)
    // Ground is at builder level -1, so the lift puts it on the floor.
    expect(result.blocks.every((block) => block.y === 0)).toBe(true)
    expect(result.lift).toBe(1)
  })

  test('raises a world with a basement rather than chopping it off', () => {
    const result = toBlocks(world([at('bb10/stone', 0, -4, 0), at('bb10/stone', 0, 2, 0)]))

    expect(result.lift).toBe(4)
    expect(result.blocks.map((block) => block.y).sort((a, b) => a - b)).toEqual([0, 6])
    expect(result.clipped).toBe(0)
  })

  // The lift is measured over what survives: a bench in the basement should not
  // leave the walls floating a cell in the air.
  test('ignores furniture when working out the lift', () => {
    const result = toBlocks(world([at('park/fountain', 0, -6, 0), at('bb10/stone', 0, 0, 0)]))

    expect(result.lift).toBe(0)
    expect(result.blocks[0].y).toBe(0)
  })

  test('drops what the lift pushes through the ceiling', () => {
    const result = toBlocks(
      world([at('bb10/stone', 0, -8, 0), at('bb10/stone', 0, WORLD_HEIGHT - 4, 0)]),
    )

    expect(result.clipped).toBe(1)
    expect(result.blocks).toHaveLength(1)
  })

  // Two placements can share a cell once the floor and a dug-out placement are
  // lifted onto each other, and a chunk stream holds one block per cell.
  test('one cell holds one block', () => {
    const result = toBlocks(
      world([at('bb10/lava', 0, 0, 0)], {
        cols: 1,
        rows: 1,
        model: 'bb10/dirt_with_grass',
        rounded: false,
      }),
    )

    // The floor sits at -1 and the placement at 0, so nothing collides - but
    // both arrive, which is the thing worth pinning.
    expect(result.blocks).toHaveLength(2)
    expect(result.blocks.map((block) => block.y).sort()).toEqual([0, 1])
  })

  test('counting agrees with converting', () => {
    const document = world([at('bb10/stone', 0, 0, 0), at('cafe/chair_A', 1, 0, 0)], {
      cols: 3,
      rows: 3,
      model: 'bb10/sand_A',
      rounded: false,
    })

    expect(countBlockable(document)).toBe(toBlocks(document).blocks.length)
  })
})
