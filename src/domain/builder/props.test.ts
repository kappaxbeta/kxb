import { describe, expect, test } from 'bun:test'
import { isBuildable } from '@/domain/builder/catalogue'
import {
  isPlaceable,
  PLACEABLE_PACKS,
  placementDrawing,
  placementLabel,
  placementUrl,
  searchPlaceable,
} from '@/domain/builder/props'
import { isBlockModel } from '@/domain/worlds/blocks'

/**
 * The widening, and the two things it must not have widened: the block crossing
 * and the escape check. Both are the kind of rule that is only ever discovered
 * to be broken by something already written to a log.
 */
describe('what a world may now hold', () => {
  test('a level model is placeable and a world model still is', () => {
    expect(isPlaceable('xp:adventurers/Knight')).toBe(true)
    expect(isPlaceable('park/fountain')).toBe(true)
  })

  test('an id neither registry knows is refused', () => {
    expect(isPlaceable('xp:nope/thing')).toBe(false)
    expect(isPlaceable('nope/thing')).toBe(false)
    expect(isPlaceable('lava')).toBe(false)
  })

  // The id ends up in a fetch. The namespace must not be a way around the check
  // the un-namespaced half already makes.
  test('a namespaced name cannot escape its pack directory', () => {
    expect(isPlaceable('xp:adventurers/../../secret')).toBe(false)
    expect(placementUrl('xp:adventurers/../../secret')).toBe('')
    expect(placementUrl('bb10/../../secret')).toBe('')
  })

  test('a placeable model resolves to a file and an unplaceable one to nothing', () => {
    expect(placementUrl('xp:adventurers/Knight')).toBe('/xp/packs/adventurers/Knight.glb')
    expect(placementUrl('xp:nope/thing')).toBe('')
  })

  /**
   * The line `toBlocks` draws. A prop is a prop whichever catalogue it came out
   * of, and nothing here may make a chest into a cube somebody stands on - see
   * the note in ./props.ts.
   */
  test('a level model is a prop, not a block', () => {
    expect(isBlockModel('xp:adventurers/Knight')).toBe(false)
    expect(isBlockModel('bb10/stone')).toBe(true)
  })

  test('the world half keeps its stricter check', () => {
    // A name in a real pack that we do not actually ship a file for. The
    // generated list knows; a path-shaped guess would not.
    expect(isBuildable('bb10/definitely_not_a_model')).toBe(false)
    expect(isPlaceable('bb10/definitely_not_a_model')).toBe(false)
  })
})

describe('how a prop is drawn', () => {
  test('a world model keeps its pack conversion', () => {
    // bb10 is two authored units to the cell, and modelled around its centre.
    expect(placementDrawing('bb10/stone')).toEqual({ scale: 0.5, lift: 0.5 })
  })

  test('a level model is one authored unit to the metre', () => {
    const drawing = placementDrawing('xp:adventurers/Knight')
    expect(drawing?.scale).toBe(1)
  })

  test('an unknown id has no drawing rather than a guessed one', () => {
    expect(placementDrawing('nope/thing')).toBeNull()
  })
})

describe('searching both catalogues', () => {
  test('the world packs come first', () => {
    const groups = searchPlaceable('')
    expect(groups[0].packId).toBe(PLACEABLE_PACKS[0].id)
    expect(groups.some((group) => group.packId.startsWith('xp:'))).toBe(true)
  })

  test('a level pack filter narrows to it, namespace included', () => {
    const groups = searchPlaceable('', 'xp:adventurers')
    expect(groups).toHaveLength(1)
    expect(groups[0].packId).toBe('xp:adventurers')
    expect(groups[0].models.every((model) => model.id.startsWith('xp:adventurers/'))).toBe(true)
  })

  test('a world pack filter does not pull in the level half', () => {
    const groups = searchPlaceable('', 'bb10')
    expect(groups).toHaveLength(1)
    expect(groups[0].packId).toBe('bb10')
  })

  test('every id a search offers is one the document would accept', () => {
    for (const group of searchPlaceable('knight')) {
      for (const model of group.models) expect(isPlaceable(model.id)).toBe(true)
    }
  })

  test('nothing matching is no groups, not empty groups', () => {
    expect(searchPlaceable('zzzznope')).toEqual([])
  })
})

describe('naming a prop', () => {
  test('the namespace and the pack are not part of the name', () => {
    expect(placementLabel('xp:adventurers/Knight')).toBe('Knight')
    expect(placementLabel('park/fountain')).toBe('Fountain')
  })
})
