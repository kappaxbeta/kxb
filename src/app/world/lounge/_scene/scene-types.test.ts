import { describe, expect, test } from 'bun:test'
import { blockKey, WORLD_HEIGHT } from '@/domain/lounge/events'
import type { BlockView } from '@/domain/lounge/queries'
import {
  type BlockMap,
  inWorld,
  toBlockMap,
  withBlock,
  withoutBlock,
} from '@/app/world/lounge/_scene/scene-types'

/**
 * The first tests this module has had.
 *
 * `withBlock` and `withoutBlock` came out of `lounge-scene.tsx`, where they were
 * inline `setBlocks` updaters — and the thing worth pinning about them is not
 * what they add or remove. It is **what they do when nothing changed**, which is
 * load-bearing in two directions at once and stated nowhere a test could reach.
 */

const at = (x: number, y: number, z: number) => ({ x, y, z })

const world = (...blocks: { x: number; y: number; z: number; model: string }[]): BlockMap =>
  new Map(blocks.map((b) => [blockKey(b.x, b.y, b.z), b]))

describe('what counts as inside the world', () => {
  test('the floor is in and so is the last layer under the ceiling', () => {
    expect(inWorld(at(0, 0, 0))).toBe(true)
    expect(inWorld(at(0, WORLD_HEIGHT - 1, 0))).toBe(true)
  })

  test('under the floor and at the ceiling are both out', () => {
    expect(inWorld(at(0, -1, 0))).toBe(false)
    expect(inWorld(at(0, WORLD_HEIGHT, 0))).toBe(false)
  })

  /**
   * A cell outside the world is not an edit that declined - it is a cell that
   * does not exist, and the caller must not go on to queue a write for it. That
   * is why this is a separate answer rather than `withBlock` handing the map
   * back unchanged.
   */
  test('is a different question from whether an edit changed anything', () => {
    const before = world()
    expect(inWorld(at(0, -1, 0))).toBe(false)
    // The map would happily take it; only the caller's guard stops that.
    expect(withBlock(before, at(0, -1, 0), 'dirt')).not.toBe(before)
  })
})

describe('laying a block', () => {
  test('puts it where it was asked for', () => {
    const after = withBlock(world(), at(1, 2, 3), 'dirt')
    expect(after.get(blockKey(1, 2, 3))).toEqual({ x: 1, y: 2, z: 3, model: 'dirt' })
  })

  test('replaces whatever was there', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    const after = withBlock(before, at(1, 2, 3), 'stone')
    expect(after.get(blockKey(1, 2, 3))?.model).toBe('stone')
    expect(after.size).toBe(1)
  })

  /**
   * The rule the scene reads twice: React skips the re-render, and the caller
   * uses the same fact to decide whether to make a noise. Swinging at a cell
   * that already holds the block you are placing is silent, because nothing
   * happened.
   */
  test('laying the same block again is not a change at all', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    expect(withBlock(before, at(1, 2, 3), 'dirt')).toBe(before)
  })

  test('but a different block in the same cell is', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    expect(withBlock(before, at(1, 2, 3), 'stone')).not.toBe(before)
  })

  /** A map edited in place is the same object, and the scene keeps drawing it. */
  test('never edits the world it was handed', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    withBlock(before, at(4, 5, 6), 'stone')
    expect(before.size).toBe(1)
    expect(before.has(blockKey(4, 5, 6))).toBe(false)
  })

  test('a neighbouring cell is a different cell', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    const after = withBlock(before, at(1, 3, 3), 'dirt')
    expect(after.size).toBe(2)
  })
})

describe('breaking a block', () => {
  test('takes it away', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    expect(withoutBlock(before, at(1, 2, 3)).size).toBe(0)
  })

  /** Swinging at air is silent, for the same reason and by the same means. */
  test('breaking an empty cell is not a change at all', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    expect(withoutBlock(before, at(9, 9, 9))).toBe(before)
  })

  test('an empty world has nothing to break', () => {
    const before = world()
    expect(withoutBlock(before, at(0, 0, 0))).toBe(before)
  })

  test('never edits the world it was handed', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' })
    withoutBlock(before, at(1, 2, 3))
    expect(before.size).toBe(1)
  })

  test('leaves the neighbours alone', () => {
    const before = world({ ...at(1, 2, 3), model: 'dirt' }, { ...at(1, 3, 3), model: 'stone' })
    const after = withoutBlock(before, at(1, 2, 3))
    expect(after.size).toBe(1)
    expect(after.get(blockKey(1, 3, 3))?.model).toBe('stone')
  })
})

describe('reading a world in from the log', () => {
  test('keys every block by where it is', () => {
    const rows = [
      { x: 0, y: 0, z: 0, model: 'dirt' },
      { x: 1, y: 0, z: 0, model: 'stone' },
    ] as BlockView[]
    const map = toBlockMap(rows)
    expect(map.size).toBe(2)
    expect(map.get(blockKey(1, 0, 0))?.model).toBe('stone')
  })

  /** Later writes win, which is what replaying a log in order means. */
  test('two blocks in one cell leave the last one standing', () => {
    const rows = [
      { x: 0, y: 0, z: 0, model: 'dirt' },
      { x: 0, y: 0, z: 0, model: 'stone' },
    ] as BlockView[]
    const map = toBlockMap(rows)
    expect(map.size).toBe(1)
    expect(map.get(blockKey(0, 0, 0))?.model).toBe('stone')
  })

  test('an empty world reads as an empty map', () => {
    expect(toBlockMap([]).size).toBe(0)
  })
})
