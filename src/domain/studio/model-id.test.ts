import { describe, expect, test } from 'bun:test'
import { PACK_MODELS } from '@/domain/builder/catalogue.generated'
import { CATALOGUE } from '@/domain/builder/catalogue'
import { PALETTE } from '@/domain/lounge/palette'
import { modelName, modelPicture, qualifiedModel, storedModel } from '@/domain/studio/model-id'

describe('the bb10 translation', () => {
  /**
   * The invariant the whole thing rests on.
   *
   * `storedModel` strips `bb10/` and keeps the result only if the palette knows
   * it - so a bb10 model the palette never adopted would keep its pack, land
   * half a cell high, and do it silently. The two lists are the same 58 names
   * today. This is what says so out loud, and what will fail the day somebody
   * adds a 59th file to the pack without adding it to the palette.
   */
  test('every bb10 model has a palette name', () => {
    expect([...PACK_MODELS.bb10].sort()).toEqual([...PALETTE].sort())
  })

  test('a qualified bb10 id is stored bare', () => {
    expect(storedModel('bb10/crate')).toBe('crate')
    expect(storedModel('bb10/dirt_with_grass')).toBe('dirt_with_grass')
  })

  test('every other pack passes through untouched', () => {
    expect(storedModel('cosmos/galaxy')).toBe('cosmos/galaxy')
    expect(storedModel('fireworks/rocket_jade_lit')).toBe('fireworks/rocket_jade_lit')
    expect(storedModel('park/fountain')).toBe('park/fountain')
  })

  test('a bare palette name survives being stored again', () => {
    for (const model of PALETTE) expect(storedModel(model)).toBe(model)
  })

  /**
   * Round-tripping the whole catalogue, which is what the picker actually
   * hands over: qualify what the document holds, take back what was pressed,
   * and land on the same model.
   */
  test('the catalogue round-trips', () => {
    for (const entry of CATALOGUE) {
      expect(qualifiedModel(storedModel(entry.id))).toBe(entry.id)
    }
  })

  test('a name we have never shipped is left alone', () => {
    expect(storedModel('bb10/not_a_block')).toBe('bb10/not_a_block')
    expect(qualifiedModel('xp:dungeon/wall')).toBe('xp:dungeon/wall')
  })
})

describe('how a model is shown', () => {
  test('the palette has its own thumbnails', () => {
    expect(modelPicture('crate')).toBe('/thumbs/blocks/crate.webp')
    expect(modelPicture('cosmos/galaxy')).toBe('/thumbs/builder/cosmos/galaxy.webp')
  })

  test('a name says the thing and then the pack', () => {
    expect(modelName('crate')).toBe('Crate · Blocks')
    expect(modelName('fireworks/rocket_jade')).toBe('Rocket jade · Fireworks')
  })
})
