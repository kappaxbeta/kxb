import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  CATALOGUE,
  DEFAULT_MODEL,
  DEFAULT_SKELETON,
  describeModel,
  findModel,
  floorOffset,
  isCentred,
  isKnownModel,
  labelOf,
  packModels,
  packPreview,
  packSize,
  PLAYER_SCALE,
  searchCatalogue,
  searchTiles,
  tileOf,
  VARIANT_COLOURS,
} from './catalogue'
import { credits, modelUrl, PACK_ORDER, PACKS, splitModel, thumbnailUrl } from './packs'
import { readCatalogue } from '../../../../scripts/xp-catalogue'

/**
 * Provenance: copied from src/domain/builder/catalogue.test.ts alongside the
 * modules it covers, per the copy rule in docs/xp/creator.md §1.2 - a copied
 * module without its tests is a copy that silently rots.
 *
 * The drift test is the one that earns its keep: the generated catalogue is
 * checked in, so the only thing standing between it and the filesystem is a
 * test that walks both.
 */

const PUBLIC = path.join(import.meta.dir, '..', '..', '..', '..', 'public')

describe('the generated catalogue', () => {
  test('matches what is actually in public/xp/packs', () => {
    const onDisk = readCatalogue()

    for (const { packId, models } of onDisk) {
      expect(packModels(packId).map((e) => e.name)).toEqual(models.map((m) => m.name))
    }

    // And no pack in the catalogue that is not on disk.
    const diskPacks = new Set(onDisk.map((p) => p.packId))
    for (const entry of CATALOGUE) expect(diskPacks.has(entry.packId)).toBe(true)
  })

  test('the drawn nodes match a fresh read of the .glb', () => {
    for (const { packId, models } of readCatalogue()) {
      for (const model of models) {
        expect(findModel(`${packId}/${model.name}`)?.nodes).toEqual(model.nodes)
      }
    }
  })

  test('every model resolves to a file that exists', () => {
    for (const entry of CATALOGUE) {
      const file = path.join(PUBLIC, modelUrl(entry.id).replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)
    }
  })

  test('every model has a thumbnail', () => {
    for (const entry of CATALOGUE) {
      const file = path.join(PUBLIC, thumbnailUrl(entry.id).replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)
    }
  })
})

describe('model ids', () => {
  test('a name that would escape its pack directory is not an id', () => {
    expect(splitModel('proto/../../etc/passwd')).toBeNull()
    expect(splitModel('proto/')).toBeNull()
    expect(splitModel('/Primitive_Wall')).toBeNull()
    expect(splitModel('nosuchpack/Primitive_Wall')).toBeNull()
    expect(splitModel('Primitive_Wall')).toBeNull()
  })

  test('a known model is buildable and an invented one is not', () => {
    expect(isKnownModel('proto/Primitive_Wall')).toBe(true)
    expect(isKnownModel('proto/Definitely_Not_A_Wall')).toBe(false)
  })

  test('the defaults are models we actually ship', () => {
    expect(isKnownModel(DEFAULT_MODEL)).toBe(true)
    expect(isKnownModel(DEFAULT_SKELETON)).toBe(true)
  })

  test('urls are built from the pack, not concatenated hopefully', () => {
    expect(modelUrl('proto/Primitive_Wall')).toBe('/xp/packs/proto/Primitive_Wall.gltf')
    expect(modelUrl('dummy/Dummy')).toBe('/xp/packs/dummy/Dummy.glb')
    expect(modelUrl('nope/nope')).toBe('')
  })

  test('labels knock the underscores out and leave the casing alone', () => {
    // The prototype kit names in Title_Case where the builder's packs use
    // snake_case, so this only swaps separators and lifts the first letter -
    // lowercasing the rest would turn `Wall_Target` into `Wall target`, which
    // reads as a different thing from what the file is called.
    expect(labelOf('Wall_Window_Closed')).toBe('Wall Window Closed')
    expect(labelOf('target_pieces_A')).toBe('Target pieces A')
    expect(describeModel('proto/Primitive_Wall')).toBe('Primitive Wall · Prototype')
    // An id from a pack we no longer ship shows itself rather than throwing.
    expect(describeModel('gone/thing')).toBe('gone/thing')
  })
})

describe('the packs', () => {
  test('the prototype kit is first - it is what an XP is made of', () => {
    expect(PACK_ORDER[0]).toBe('proto')
  })

  test('every pack in the order exists in the table', () => {
    for (const id of PACK_ORDER) expect(PACKS[id]).toBeDefined()
  })

  test('every pack is CC0, with an author and somewhere to get it', () => {
    for (const id of PACK_ORDER) {
      const pack = PACKS[id]
      expect(pack.licence).toBe('CC0')
      expect(pack.author.length).toBeGreaterThan(0)
      expect(pack.source).toMatch(/^https:\/\//)
    }
  })

  test('credits name every pack', () => {
    expect(credits().map((c) => c.label)).toEqual(PACK_ORDER.map((id) => PACKS[id].label))
  })

  test('packSize counts what the catalogue holds', () => {
    for (const id of PACK_ORDER) {
      expect(packSize(id)).toBe(CATALOGUE.filter((e) => e.packId === id).length)
    }
  })
})

describe('measured sizes', () => {
  test('every model has a positive footprint, in cells', () => {
    for (const entry of CATALOGUE) {
      expect(entry.size.w).toBeGreaterThan(0)
      expect(entry.size.h).toBeGreaterThan(0)
      expect(entry.size.d).toBeGreaterThan(0)
    }
  })

  test('the prototype kit is metric - a wall is four cells by four by one', () => {
    // The claim `scale: 1` rests on: this pack is drawn at a metre a unit, and
    // a cell is a metre. If that is ever wrong, it is wrong here first.
    expect(findModel('proto/Primitive_Wall')?.size).toEqual({ w: 4, h: 4, d: 1 })
    expect(findModel('proto/Primitive_Cube')?.size).toEqual({ w: 4, h: 4, d: 4 })
    expect(findModel('proto/Primitive_Cube_Small')?.size).toEqual({ w: 2, h: 2, d: 2 })
  })

  test('a wall and a half wall are told apart by their size, not their picture', () => {
    const wall = findModel('proto/Primitive_Wall')
    const half = findModel('proto/Primitive_Wall_Half')
    expect(wall?.size.w).toBe(4)
    expect(half?.size.w).toBe(2)
    // Same height, which is exactly why the thumbnails look alike and the
    // number on the tile is doing the work.
    expect(half?.size.h).toBe(wall?.size.h)
  })

  test('an id we do not ship has no entry, rather than throwing', () => {
    expect(findModel('proto/Nope')).toBeNull()
    expect(findModel('nonsense')).toBeNull()
  })
})

describe('centred models', () => {
  test('the guns and the barrels are centred; the walls and floors are not', () => {
    expect(isCentred('proto/Gun_Pistol')).toBe(true)
    expect(isCentred('proto/Barrel_A')).toBe(true)
    expect(isCentred('proto/target_wall_large_A')).toBe(true)
    expect(isCentred('proto/Primitive_Wall')).toBe(false)
    expect(isCentred('proto/Primitive_Floor')).toBe(false)
    expect(isCentred('proto/Door_A')).toBe(false)
  })

  test('an id that is not a model is not centred, rather than throwing', () => {
    expect(isCentred('nope')).toBe(false)
    expect(isCentred('nope/nope')).toBe(false)
  })

  test('twenty of the prototype kit hang rather than stand', () => {
    // The socket set: guns, ammo, coins, the bat, the barrels, the wall
    // targets. If a re-export changes this count, a blueprint's default offset
    // changed with it and somebody should look.
    expect(packModels('proto').filter((m) => m.centred)).toHaveLength(20)
  })

  test('a centred model is lifted half its height to stand on a floor', () => {
    const barrel = findModel('proto/Barrel_A')
    expect(barrel?.centred).toBe(true)
    expect(floorOffset('proto/Barrel_A')).toBeCloseTo((barrel?.size.h ?? 0) / 2, 5)
  })

  test('a model that already stands on the floor is not lifted', () => {
    expect(floorOffset('proto/Primitive_Wall')).toBe(0)
    expect(floorOffset('proto/Door_A')).toBe(0)
    expect(floorOffset('nonsense')).toBe(0)
  })
})

describe('the player', () => {
  test('the dummy stands the same height as a peep, and as the camera', () => {
    // The lounge's convention: a peep is 1.69 cells and the eye is at 1.7, so
    // an avatar's eye is level with the top of its head. The XP's player is
    // sized to the same rule rather than to a new one.
    const height = 2.396 * PLAYER_SCALE
    expect(height).toBeCloseTo(1.7, 1)
  })

  test('width is not the anchor, because the dummy is measured arms-out', () => {
    // 1.94 is arm span in the bind pose, not body. Matching it to a peep's 1.25
    // would shrink the player to two-thirds and leave them short.
    const armSpan = 1.943 * PLAYER_SCALE
    expect(armSpan).toBeGreaterThan(1.25)
  })
})

describe('search', () => {
  test('terms match in any order', () => {
    const found = searchCatalogue('slope half').flatMap((g) => g.models.map((m) => m.name))
    const reversed = searchCatalogue('half slope').flatMap((g) => g.models.map((m) => m.name))
    expect(found).toEqual(reversed)
    expect(found).toContain('Primitive_Slope_Half')
  })

  test('underscores and spaces are the same thing', () => {
    const spaced = searchCatalogue('wall window').flatMap((g) => g.models.map((m) => m.id))
    const scored = searchCatalogue('wall_window').flatMap((g) => g.models.map((m) => m.id))
    expect(spaced).toEqual(scored)
    expect(spaced).toContain('proto/Wall_Window_Closed')
  })

  test('a pack name matches its whole pack', () => {
    const found = searchCatalogue('dungeon')
    expect(found).toHaveLength(1)
    expect(found[0].models).toHaveLength(packSize('dungeon'))
  })

  /**
   * `proto` used to be the example above, and it stopped being a good one when
   * `proto-kenny` landed: an id is matched as a substring, so typing the shorter
   * one now brings back both packs.
   *
   * That is the right answer rather than a regression to fix. Somebody typing
   * "proto" is looking for prototype pieces, and there are two kits of them; a
   * search that returned only the pack whose id matched *exactly* would hide 145
   * models behind a hyphen nobody knew about. The narrowing that does exist is
   * the `packId` filter, which is what the picker's own pack tabs use.
   */
  test('a shorter pack id brings back the longer one too, which is the point', () => {
    const found = searchCatalogue('proto')
    expect(found.map((group) => group.packId)).toEqual(['proto', 'proto-kenny'])
    expect(searchCatalogue('', 'proto')).toHaveLength(1)
  })

  test('an empty query is everything', () => {
    const total = searchCatalogue('').reduce((sum, g) => sum + g.models.length, 0)
    expect(total).toBe(CATALOGUE.length)
  })

  test('a pack filter narrows to one group', () => {
    const found = searchCatalogue('', 'dummy')
    expect(found).toHaveLength(1)
    expect(found[0].packId).toBe('dummy')
  })

  test('nothing matching is no groups, not empty groups', () => {
    expect(searchCatalogue('zzzzznope')).toEqual([])
  })
})

describe('tiles', () => {
  const tiles = () => searchTiles('').flatMap((g) => g.tiles)

  test('every model is on exactly one tile', () => {
    const ids = new Set<string>()
    for (const tile of tiles()) {
      const members = tile.colours.length === 0 ? [tile.entry.id] : Object.values(tile.ids)
      for (const id of members) {
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
    }
    expect(ids.size).toBe(CATALOGUE.length)
  })

  test('the collapse is what makes the grid small again', () => {
    // 4,451 models, 4,081 tiles. This was 611 and 241 when the collapse was
    // written, and the ratio it bought is now a rounding error: twenty-four
    // kits landed at once, and the platformer's 525-into-155 is the only
    // colour family among them. Kenney's six added 482 and not one collapsed -
    // they carry no colourways at all.
    //
    // Kept as a number anyway, because it is the tripwire for the *next*
    // collapse - the forest kit is 198 shapes in eight colourways and would
    // take 1,584 tiles to 198 if `variantOf` ever learned to read `_Color1`.
    // The point is the ratio, not the constant; when a pack lands, move it.
    //
    // `shapes` is the second colour family and the reason it is not collapsed
    // is worth writing down rather than rediscovering: it comes in white,
    // black and purple as well, and `VariantColour` is the five the platformer
    // kit has. Collapsing it means widening that list, which changes what a
    // swatch row is and what `prefer` can mean, for eleven shapes. Not worth
    // it yet; worth it the moment a third family lands.
    expect(CATALOGUE.length).toBe(4451)
    expect(tiles()).toHaveLength(4081)
  })

  test('the grid is only the packs the document declares', () => {
    // What the picker draws for a level built out of the prototype kit and
    // two platformer colourways: two groups, and the platformer's tiles carry
    // only the swatches that are actually declared.
    const declared = new Set(['proto', 'platformer-blue', 'platformer-red'])
    const groups = searchTiles('', 'neutral', declared)
    expect(groups.map((g) => g.packId)).toEqual(['proto', 'platformer'])
    expect(groups[0].tiles).toHaveLength(packSize('proto'))

    const ball = groups[1].tiles.find((t) => t.key === 'ball')
    expect(ball?.colours).toEqual(['blue', 'red'])
    expect(ball?.ids.neutral).toBeUndefined()
  })

  test('a document declaring nothing gets an empty grid, not every pack', () => {
    // The distinction the `only` parameter has to make: an empty set is a
    // document that is built out of nothing yet, and `undefined` is a picker
    // with no document behind it at all. Collapsing the two would open a new
    // level onto 3,892 tiles it has not asked for.
    expect(searchTiles('', 'neutral', new Set())).toHaveLength(0)
    expect(searchTiles('').length).toBeGreaterThan(0)
  })

  test('a preview is spread across a pack rather than taken off the front', () => {
    // Four evenly spaced entries: the first four of this pack alphabetically
    // are two ammo crates and two bundles of arrows.
    const preview = packPreview('adventure')
    expect(preview).toHaveLength(4)
    expect(new Set(preview).size).toBe(4)
    for (const id of preview) expect(isKnownModel(id)).toBe(true)
    expect(preview[0]).toBe(packModels('adventure')[0].id)
    // A pack smaller than the count asked for gives what it has, not blanks.
    expect(packPreview('dummy')).toHaveLength(1)
  })

  test('one shape, five colours, one tile', () => {
    const ball = tiles().find((t) => t.key === 'ball')
    expect(ball?.colours).toEqual([...VARIANT_COLOURS])
    expect(ball?.ids.blue).toBe('platformer-blue/ball_blue')
    expect(ball?.ids.neutral).toBe('platformer-neutral/ball')
  })

  test('a neutral-only piece is a tile with one colour, not a colourless one', () => {
    // The spikes and the chains have no coloured twin. They still belong on the
    // platformer grid rather than in a sixth group nobody would think to look in.
    const sawblade = tiles().find((t) => t.key === 'sawblade')
    expect(sawblade?.colours).toEqual(['neutral'])
    expect(sawblade?.ids.neutral).toBe('platformer-neutral/sawblade')
  })

  test('the preferred colour is what the tile shows, when it has it', () => {
    const blue = searchTiles('', 'blue')
      .flatMap((g) => g.tiles)
      .find((t) => t.key === 'ball')
    expect(blue?.entry.id).toBe('platformer-blue/ball_blue')
    // A shape that does not come in blue falls back rather than disappearing.
    const chain = searchTiles('', 'blue')
      .flatMap((g) => g.tiles)
      .find((t) => t.colours.length === 1)
    expect(chain?.entry.packId).toBe('platformer-neutral')
  })

  test('the other packs are untouched, one tile per model', () => {
    const proto = searchTiles('').find((g) => g.packId === 'proto')
    expect(proto?.tiles).toHaveLength(packSize('proto'))
    expect(proto?.tiles[0].colours).toEqual([])
  })

  test('a colour term narrows but does not select', () => {
    const found = searchTiles('arch blue')
    const arch = found.flatMap((g) => g.tiles).find((t) => t.key === 'arch')
    expect(arch).toBeDefined()
    // Still showing the default colour: searching is not picking.
    expect(arch?.entry.packId).toBe('platformer-blue')
    // By key rather than by taking the first hit: "arch blue" also finds the
    // medieval kit's `building_archeryrange_blue` now, which is the search
    // working - the assertion is about this tile, not about hit order.
    expect(
      searchTiles('arch blue', 'red')
        .flatMap((g) => g.tiles)
        .find((t) => t.key === 'arch')?.entry.packId,
    ).toBe('platformer-red')
  })

  test('a saved id says which tile is lit and which swatch is on', () => {
    expect(tileOf('platformer-red/arch_red')).toEqual({ key: 'arch', colour: 'red' })
    expect(tileOf('platformer-neutral/ball')).toEqual({ key: 'ball', colour: 'neutral' })
    expect(tileOf('proto/Primitive_Floor')).toBeNull()
    expect(tileOf('nope/nope')).toBeNull()
  })

  test('nothing matching is no groups here either', () => {
    expect(searchTiles('zzzzznope')).toEqual([])
  })
})
