import { describe, expect, test } from 'bun:test'
import {
  bareModel,
  drawingOf,
  isXpModel,
  knownModel,
  MODEL_PACKS,
  modelUrlFor,
  searchModels,
  thumbnailFor,
} from '@/domain/thingiverse/models'

describe('two registries, one shelf', () => {
  test('the level half is namespaced, because the pack ids collide', () => {
    // Both catalogues name a pack `proto` and both name one `restaurant`, and
    // they are not the same files. An id ends up in an immutable log and then
    // in a fetch, so one that resolves two ways is the bug you cannot fix.
    expect(modelUrlFor('proto/Barrel_A')).not.toBe(modelUrlFor('xp:proto/Barrel_A'))
    expect(isXpModel('xp:proto/Barrel_A')).toBe(true)
    expect(bareModel('xp:proto/Barrel_A')).toBe('proto/Barrel_A')
  })

  test('an id neither registry knows resolves to nothing at all', () => {
    expect(knownModel('nope/nothing')).toBe(false)
    expect(knownModel('xp:nope/nothing')).toBe(false)
    expect(modelUrlFor('nope/nothing')).toBe('')
  })

  test('both halves are searched, and the world s models come first', () => {
    const hits = searchModels('chest')
    expect(hits.length).toBeGreaterThan(1)
    expect(isXpModel(hits[0].id)).toBe(false)
  })

  test('every pack offers a thumbnail path under its own registry', () => {
    for (const pack of MODEL_PACKS.slice(0, 6)) {
      expect(pack.size).toBeGreaterThan(0)
    }
    expect(thumbnailFor('xp:adventurers/Knight')).toBe('/xp/thumbs/adventurers/Knight.webp')
  })
})

describe('one authored unit is one metre', () => {
  test('a level model is drawn at its measured size', () => {
    // The reported bug: the boardgame pack declares `scale: 0.05`, so a D20
    // measuring 0.965 units came out 4.8cm across. That number is a level's
    // idea of a prop on a board, not a unit conversion.
    expect(drawingOf('xp:boardgame/D20_blue')?.scale).toBe(1)
    expect(drawingOf('xp:medieval-tiles/tile')?.scale).toBe(1)
  })

  test('the construction kits keep their conversion, because it is one', () => {
    // bb10 draws a cube two units on a side and the Tiny Treats sets draw a
    // tile two units square. Throwing that away would double every crate and
    // put a summoned block beside a built one at twice its size.
    expect(drawingOf('bb10/crate')?.scale).toBe(0.5)
    expect(drawingOf('park/bench')?.scale).toBe(0.5)
    expect(drawingOf('proto/Barrel_A')?.scale).toBe(1)
  })

  test('a model drawn around its own centre is lifted onto the floor', () => {
    // 1,875 of the level models hang off a socket rather than stand on zero.
    expect(drawingOf('xp:proto/Barrel_A')?.lift).toBeGreaterThan(0)
    expect(drawingOf('xp:adventurers/Knight')?.lift).toBe(0)
  })

  test('an unknown id is drawn at 1 rather than refusing to draw', () => {
    expect(drawingOf('nope/nothing')).toBeNull()
  })
})
