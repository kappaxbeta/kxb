import { describe, expect, test } from 'bun:test'
import type { Cell } from '@/domain/builder/draw'
import {
  at,
  cellKey,
  columnTop,
  DEFAULT_WORLD,
  deserialiseWorld,
  erase,
  GRID_REACH,
  inBounds,
  MAX_LEVEL,
  MAX_PLACEMENTS,
  MIN_LEVEL,
  parseWorld,
  place,
  type Placement,
  serialiseWorld,
} from '@/domain/builder/world'

const cell = (x: number, y: number, z: number): Cell => ({ x, y, z })
const spec = { model: 'bb10/stone', rotation: 0, scale: 1 }

describe('placing', () => {
  test('lays a cell down', () => {
    const world = place([], [cell(1, 0, 2)], spec)
    expect(world).toHaveLength(1)
    expect(world[0]).toEqual({ model: 'bb10/stone', x: 1, y: 0, z: 2, rotation: 0, scale: 1 })
  })

  // Painting over a wall to change its material is the common gesture, and if
  // it layered rather than replaced then every correction would double the
  // scene with the old model still visible inside the new one.
  test('one cell holds one model', () => {
    const first = place([], [cell(0, 0, 0)], spec)
    const second = place(first, [cell(0, 0, 0)], { ...spec, model: 'bb10/lava' })
    expect(second).toHaveLength(1)
    expect(second[0].model).toBe('bb10/lava')
  })

  test('does not mutate what it was given', () => {
    const before: Placement[] = []
    place(before, [cell(0, 0, 0)], spec)
    expect(before).toHaveLength(0)
  })

  test('drops cells outside the lattice', () => {
    const world = place(
      [],
      [cell(0, 0, 0), cell(GRID_REACH + 1, 0, 0), cell(0, MAX_LEVEL + 1, 0), cell(0, MIN_LEVEL - 1, 0)],
      spec,
    )
    expect(world).toHaveLength(1)
  })

  test('the ceiling trims the oldest work, not the newest', () => {
    const full: Placement[] = Array.from({ length: MAX_PLACEMENTS }, (_, index) => ({
      model: 'bb10/dirt',
      x: index % 161 - 80,
      y: Math.floor(index / 161) % 40,
      z: Math.floor(index / (161 * 40)),
      rotation: 0,
      scale: 1,
    }))

    const after = place(full, [cell(0, MAX_LEVEL, 0)], { ...spec, model: 'bb10/gift' })
    expect(after).toHaveLength(MAX_PLACEMENTS)
    expect(after.at(-1)?.model).toBe('bb10/gift')
  })
})

describe('erasing', () => {
  test('takes out exactly the cells named', () => {
    const world = place([], [cell(0, 0, 0), cell(1, 0, 0), cell(2, 0, 0)], spec)
    expect(erase(world, [cell(1, 0, 0)])).toHaveLength(2)
  })

  test('an empty cell is not an error', () => {
    expect(erase([], [cell(4, 4, 4)])).toEqual([])
  })
})

describe('reading the world', () => {
  const world = place([], [cell(0, 0, 0), cell(0, 1, 0), cell(0, 5, 0), cell(3, 2, 3)], spec)

  test('finds what is in a cell', () => {
    expect(at(world, cell(0, 1, 0))?.model).toBe('bb10/stone')
    expect(at(world, cell(9, 9, 9))).toBeUndefined()
  })

  test('a column reports its highest block', () => {
    expect(columnTop(world, 0, 0)).toBe(5)
    expect(columnTop(world, 3, 3)).toBe(2)
  })

  test('an empty column is null, not zero', () => {
    // Zero would be a lie - it is a real level somebody may have dug below.
    expect(columnTop(world, 9, 9)).toBeNull()
  })

  test('a column at a negative level reports it', () => {
    const dug = place([], [cell(0, -3, 0)], spec)
    expect(columnTop(dug, 0, 0)).toBe(-3)
  })

  test('cell keys are unique per cell', () => {
    expect(cellKey(cell(1, 2, 3))).toBe('1,2,3')
    expect(cellKey(cell(-1, 2, 3))).not.toBe(cellKey(cell(1, 2, 3)))
    // The one that a naive concatenation gets wrong.
    expect(cellKey(cell(1, 22, 3))).not.toBe(cellKey(cell(12, 2, 3)))
  })

  test('bounds cover all three axes', () => {
    expect(inBounds(cell(0, 0, 0))).toBe(true)
    expect(inBounds(cell(GRID_REACH, MAX_LEVEL, -GRID_REACH))).toBe(true)
    expect(inBounds(cell(0, MIN_LEVEL - 1, 0))).toBe(false)
    expect(inBounds(cell(0, 0, -GRID_REACH - 1))).toBe(false)
  })
})

describe('parsing a file', () => {
  test('nonsense gives the default world', () => {
    expect(parseWorld(null).name).toBe(DEFAULT_WORLD.name)
    expect(parseWorld('not a world').placements).toEqual([])
    expect(deserialiseWorld('{{{').name).toBe(DEFAULT_WORLD.name)
  })

  test('a round trip is lossless', () => {
    const world = { ...DEFAULT_WORLD, name: 'ad', placements: place([], [cell(2, 3, 4)], spec) }
    expect(deserialiseWorld(serialiseWorld(world))).toEqual(world)
  })

  // The check that matters: a model id ends up in a fetch, so a file claiming
  // one we do not ship has to lose that placement rather than hang the boundary.
  test('drops placements naming a model we do not ship', () => {
    const parsed = parseWorld({
      placements: [
        { model: 'bb10/stone', x: 0, y: 0, z: 0 },
        { model: 'bb10/../../etc/passwd', x: 1, y: 0, z: 0 },
        { model: 'nope/nothing', x: 2, y: 0, z: 0 },
        { model: 42, x: 3, y: 0, z: 0 },
      ],
    })
    expect(parsed.placements).toHaveLength(1)
    expect(parsed.placements[0].model).toBe('bb10/stone')
  })

  test('a ground of an unknown model falls back rather than vanishing', () => {
    expect(parseWorld({ ground: { model: 'nope/nothing' } }).ground?.model).toBe(
      'bb10/dirt_with_grass',
    )
  })

  test('no ground at all is a real answer', () => {
    expect(parseWorld({ ground: null }).ground).toBeNull()
  })

  test('coordinates are clamped into the lattice, not dropped', () => {
    const [only] = parseWorld({
      placements: [{ model: 'bb10/stone', x: 9999, y: -9999, z: 0.4 }],
    }).placements
    expect(only.x).toBe(GRID_REACH)
    expect(only.y).toBe(MIN_LEVEL)
    expect(only.z).toBe(0)
  })

  test('two placements in one cell collapse to the last', () => {
    const parsed = parseWorld({
      placements: [
        { model: 'bb10/stone', x: 0, y: 0, z: 0 },
        { model: 'bb10/lava', x: 0, y: 0, z: 0 },
      ],
    })
    expect(parsed.placements).toHaveLength(1)
    expect(parsed.placements[0].model).toBe('bb10/lava')
  })

  test('a background is hex or nothing', () => {
    expect(parseWorld({ background: '#0a0a0f' }).background).toBe('#0a0a0f')
    expect(parseWorld({ background: 'red' }).background).toBeNull()
    expect(parseWorld({ background: '#fff' }).background).toBe('#fff')
  })

  test('a blank name falls back rather than making an untitled file', () => {
    expect(parseWorld({ name: '   ' }).name).toBe(DEFAULT_WORLD.name)
    expect(parseWorld({ name: '  ad one  ' }).name).toBe('ad one')
  })

  test('a huge file is truncated rather than loaded', () => {
    const many = Array.from({ length: MAX_PLACEMENTS + 500 }, (_, index) => ({
      model: 'bb10/dirt',
      x: index % 161 - 80,
      y: Math.floor(index / 161),
      z: 0,
    }))
    expect(parseWorld({ placements: many }).placements.length).toBeLessThanOrEqual(MAX_PLACEMENTS)
  })
})
