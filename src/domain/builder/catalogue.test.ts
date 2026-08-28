import { describe, expect, test } from 'bun:test'
import { readCatalogue } from '../../../scripts/build-catalogue'
import { CATALOGUE, isBuildable, searchCatalogue } from '@/domain/builder/catalogue'
import { builderUrl, PACK_ORDER, PACKS, splitModel } from '@/domain/builder/packs'

/**
 * The generated catalogue is checked in, which means it can go stale - somebody
 * drops a pack into `public/` and the builder never offers it. This is the
 * guard: the same walk the generator does, compared against what it wrote.
 */
describe('the generated catalogue', () => {
  test('matches what is actually in public/', () => {
    const onDisk = readCatalogue().flatMap(({ packId, models }) =>
      models.map((name) => `${packId}/${name}`),
    )

    // Compared as sorted lists rather than as sets, so a failure prints the
    // handful of ids that differ instead of "expected true, got false".
    expect([...CATALOGUE.map((entry) => entry.id)].sort()).toEqual([...onDisk].sort())
  })

  test('every id resolves to a file under its pack', () => {
    for (const entry of CATALOGUE) {
      const url = builderUrl(entry.id)
      expect(url).toStartWith(PACKS[entry.packId].path + '/')
      expect(url).toEndWith(PACKS[entry.packId].ext)
    }
  })

  test('covers every pack', () => {
    const packs = new Set(CATALOGUE.map((entry) => entry.packId))
    expect([...packs].sort()).toEqual([...PACK_ORDER].sort())
  })
})

describe('model ids', () => {
  test('a bare name is not one', () => {
    expect(splitModel('lava')).toBeNull()
    expect(isBuildable('lava')).toBe(false)
  })

  test('an unknown pack is refused', () => {
    expect(splitModel('nope/lava')).toBeNull()
  })

  // The id ends up in a fetch, so a name that climbs out of its own directory
  // is the failure that actually matters.
  test('a name cannot escape its pack directory', () => {
    expect(splitModel('bb10/../../secret')).toBeNull()
    expect(splitModel('bb10/')).toBeNull()
    expect(builderUrl('bb10/../../secret')).toBe('')
  })

  test('the peep prefix lives in the url, not the id', () => {
    expect(isBuildable('peeps/fox')).toBe(true)
    expect(builderUrl('peeps/fox')).toBe('/xo/peeps/animal-fox.glb')
  })
})

describe('search', () => {
  test('terms match in any order', () => {
    const forward = searchCatalogue('grass sliced')
    const backward = searchCatalogue('sliced grass')
    expect(forward.length).toBeGreaterThan(0)
    expect(forward).toEqual(backward)
  })

  test('underscores and spaces are the same thing', () => {
    expect(searchCatalogue('dirt_with_grass')).toEqual(searchCatalogue('dirt with grass'))
  })

  test('a pack name matches its whole pack', () => {
    const [group] = searchCatalogue('park')
    expect(group.packId).toBe('park')
    expect(group.models.length).toBe(28)
  })

  test('an empty query is everything', () => {
    const all = searchCatalogue('').reduce((sum, group) => sum + group.models.length, 0)
    expect(all).toBe(CATALOGUE.length)
  })

  test('a pack filter narrows to one group', () => {
    const groups = searchCatalogue('', 'bb10')
    expect(groups).toHaveLength(1)
    expect(groups[0].models.length).toBe(58)
  })

  test('nothing matching is no groups, not empty groups', () => {
    expect(searchCatalogue('zzzznope')).toEqual([])
  })
})
