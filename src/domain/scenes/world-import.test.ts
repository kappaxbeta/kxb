import { describe, expect, test } from 'bun:test'
import { type BuilderWorld, parseWorld } from '@/domain/builder/world'
import {
  blocksFromWorld,
  framingFor,
  SCENE_BLOCK_CAP,
  SET_BLOCK_CAP,
} from '@/domain/scenes/world-import'
import { parseScene } from '@/domain/studio/scene'

/**
 * Pulling somebody's world in as a set.
 *
 * Two things have to hold and neither is obvious by looking at the picture. A
 * world's floor has to land *on* the studio's floor rather than half a block
 * into it - the two documents name a block's height differently - and a world
 * larger than the studio's cap has to arrive as a coherent middle rather than
 * as whichever corner happened to be built first.
 */

/**
 * A world of `count` blocks in a square patch, centred on `at`.
 *
 * A square rather than a line, because the builder's lattice only reaches
 * `GRID_REACH` cells from the origin and a line of two hundred runs off the end
 * of it - which silently clamps into a heap of blocks on top of each other and
 * makes every count in these tests a lie.
 *
 * `ground: null` matters for the same kind of reason: a builder world's ground
 * generates a floor of its own, and a fixture that let one through would be
 * testing the floor rather than the placements it means to say something about.
 */
function world(count: number, at = { x: 0, z: 0 }): BuilderWorld {
  const side = Math.ceil(Math.sqrt(count))
  return parseWorld({
    ...parseWorld({}),
    ground: null,
    placements: Array.from({ length: count }, (_, i) => ({
      model: 'bb10/dirt_with_grass',
      x: at.x + (i % side) - Math.floor(side / 2),
      y: 0,
      z: at.z + Math.floor(i / side) - Math.floor(side / 2),
    })),
  })
}

describe('a world, as a set', () => {
  test('lands on the floor rather than sunk into it', () => {
    // A lounge cell at y fills y..y+1; a scene names a block by its top face.
    // Off by one here and every imported floor is half a block underground.
    const [block] = blocksFromWorld(world(1)).blocks
    expect(block.top).toBe(1)
    expect(block.model).toBe('dirt_with_grass')
  })

  test('keeps where things were, not just how many', () => {
    const { blocks } = blocksFromWorld(world(4, { x: 20, z: -12 }))
    // A 2x2 patch about (20, -12), wherever exactly the layout puts it.
    expect(blocks).toHaveLength(4)
    for (const block of blocks) {
      expect(Math.abs(block.x - 20)).toBeLessThanOrEqual(2)
      expect(Math.abs(block.z + 12)).toBeLessThanOrEqual(2)
    }
  })

  test('says nothing was dropped when it all fits', () => {
    expect(blocksFromWorld(world(10)).dropped).toBe(0)
  })

  test('caps a world larger than a scene can draw', () => {
    const imported = blocksFromWorld(world(SCENE_BLOCK_CAP + 40))
    expect(imported.blocks).toHaveLength(SCENE_BLOCK_CAP)
    expect(imported.dropped).toBe(40)
  })

  test('keeps the middle of a world too big to fit, not a corner of it', () => {
    // A 40x40 patch, of which twenty blocks may survive. `toBlocks` orders by
    // the order things were built, so taking the first twenty would give the
    // top-left corner - which is not where a shot gets framed.
    const imported = blocksFromWorld(world(1600), 20)
    for (const block of imported.blocks) {
      // Everything kept is within a few cells of the middle rather than out at
      // the twenty-cell edge.
      expect(Math.hypot(block.x, block.z)).toBeLessThan(6)
    }
  })

  test('produces blocks the scene parser accepts unchanged', () => {
    // The cap here and the cap in `parseScene` have to agree, or an import
    // silently loses blocks again on its way into the document.
    const imported = blocksFromWorld(world(SCENE_BLOCK_CAP + 5))
    const scene = parseScene({ blocks: imported.blocks })
    expect(scene.blocks).toHaveLength(imported.blocks.length)
  })

  test('brings a whole world when it is standing in as the set', () => {
    // The reason `SetSpec` exists. Under the old inlining import this world
    // arrived as its middle 120 blocks - a patch of somebody's floor - because
    // the blocks went into the document and the document goes into the URL. A
    // set is a reference, so the only cap left is the one about the wire.
    const imported = blocksFromWorld(world(SCENE_BLOCK_CAP * 8), SET_BLOCK_CAP)
    expect(imported.blocks.length).toBe(SCENE_BLOCK_CAP * 8)
    expect(imported.dropped).toBe(0)
  })

  test('drops furniture rather than pretending it is a block', () => {
    const mixed = parseWorld({
      ...parseWorld({}),
      ground: null,
      placements: [
        { model: 'bb10/dirt_with_grass', x: 0, y: 0, z: 0 },
        // A real builder model from another pack, so it is furniture: the
        // builder offers 1308 models and the lounge accepts 58 of them.
        { model: 'tiny/bench', x: 1, y: 0, z: 0 },
      ],
    })
    const imported = blocksFromWorld(mixed)
    expect(imported.blocks).toHaveLength(1)
  })
})

describe('framing what was imported', () => {
  test('puts the camera outside the set, looking at its middle', () => {
    const { blocks } = blocksFromWorld(world(20))
    const framing = framingFor(blocks)
    const [x, , z] = framing.position

    // Outside on both axes, and above the floor.
    expect(x).toBeGreaterThan(framing.target[0])
    expect(z).toBeGreaterThan(framing.target[2])
    expect(framing.position[1]).toBeGreaterThan(0)
  })

  test('aims at the middle of the blocks, wherever they were built', () => {
    const { blocks } = blocksFromWorld(world(9, { x: 40, z: -25 }))
    const framing = framingFor(blocks)
    expect(framing.target[0]).toBeCloseTo(40, 0)
    expect(framing.target[2]).toBeCloseTo(-25, 0)
  })

  test('backs off further for a bigger set', () => {
    const near = framingFor(blocksFromWorld(world(6)).blocks)
    const far = framingFor(blocksFromWorld(world(60)).blocks)
    expect(far.position[1]).toBeGreaterThan(near.position[1])
  })

  test('has an answer for a set with nothing in it', () => {
    const framing = framingFor([])
    for (const axis of framing.position) expect(Number.isFinite(axis)).toBe(true)
  })
})
