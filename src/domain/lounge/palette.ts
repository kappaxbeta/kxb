/**
 * The block palette.
 *
 * An allow-list, not just a menu. `model` ends up in the event log forever, so
 * the action validates against this before writing - otherwise a crafted
 * request could put arbitrary strings in immutable history, and the renderer
 * would later try to fetch `/xo/bb10/gltf/<whatever>.gltf`.
 *
 * Ids match the glTF filenames in public/xo/bb10/gltf/. Renaming a file means
 * renaming it here *and* leaving the old id working, because blocks placed
 * under the old name are already in the log.
 */

export const PALETTE_PATH = '/xo/bb10/gltf'

/** Solid, full-cube blocks. These are what building is actually done with. */
export const TERRAIN_BLOCKS = [
  'dirt',
  'dirt_with_grass',
  'dirt_with_snow',
  'grass',
  'grass_with_snow',
  'sand_A',
  'sand_B',
  'sand_with_grass',
  'sand_with_snow',
  'snow',
  'gravel',
  'gravel_with_grass',
  'gravel_with_snow',
  'stone',
  'stone_dark',
  'stone_with_copper',
  'stone_with_gold',
  'stone_with_silver',
  'bricks_A',
  'bricks_B',
  'wood',
  'metal',
  'metalframe',
  'glass',
  'hay',
  'lava',
  'water',
  'prototype',
] as const

/** Flat colours, for when you want to build something legible. */
export const COLOR_BLOCKS = [
  'colored_block_blue',
  'colored_block_green',
  'colored_block_red',
  'colored_block_yellow',
  'decorative_block_blue',
  'decorative_block_green',
  'decorative_block_red',
  'decorative_block_yellow',
  'striped_block_blue',
  'striped_block_green',
  'striped_block_red',
  'striped_block_yellow',
] as const

/** Furniture and clutter. Occupy a cell like anything else. */
export const PROP_BLOCKS = [
  'anvil',
  'apple',
  'barrel',
  'battery',
  'books_A',
  'books_B',
  'chest',
  'computer',
  'crate',
  'dynamite',
  'gift',
  'hay_bale',
  'melon',
  'pipe',
  'trashcan',
  'tree',
  'tree_with_snow',
  'vault',
] as const

/**
 * The three shelves the picker draws, each with a stable id.
 *
 * The `id` is what the block picker's dictionary is keyed on, and it exists
 * because `name` is now a *default* rather than the label: the picker inside a
 * space prints the reader's own language, and keying a translation on an
 * English display string would break the day somebody renamed a shelf. The
 * backoffice still prints `name` and is still English by decision.
 */
export const PALETTE_GROUPS = [
  { id: 'terrain', name: 'Terrain', models: TERRAIN_BLOCKS },
  { id: 'colour', name: 'Colour', models: COLOR_BLOCKS },
  { id: 'props', name: 'Props', models: PROP_BLOCKS },
] as const

/** One of the three shelves, for anything that labels them. */
export type PaletteGroupId = (typeof PALETTE_GROUPS)[number]['id']

export const PALETTE: readonly string[] = [
  ...TERRAIN_BLOCKS,
  ...COLOR_BLOCKS,
  ...PROP_BLOCKS,
]

const PALETTE_SET = new Set(PALETTE)

const PROP_SET: ReadonlySet<string> = new Set(PROP_BLOCKS)

/**
 * Furniture rather than building material.
 *
 * Asked by anything that treats the two differently, which today is rainbow
 * mode: a rainbow cube still reads as a cube, while a rainbow tree is a
 * tree-shaped smear of light. The lounge switch skips props for that reason and
 * the studio offers them as a separate choice.
 */
export function isPropModel(model: string): boolean {
  return PROP_SET.has(model)
}

export function isKnownModel(model: string): boolean {
  return PALETTE_SET.has(model)
}

export function modelUrl(model: string): string {
  return `${PALETTE_PATH}/${model}.gltf`
}

/**
 * The block's picture, for a palette tile or a chip.
 *
 * A file in the repo, shot by `scripts/render-props.ts blocks`. The picker used
 * to draw these itself on first open - a hidden WebGL canvas, 58 glTF loads and
 * a second of main-thread work, repeated in every session, to produce images
 * that are the same for everybody. Re-run that script after adding to the lists
 * above; a block without a thumbnail is a tile with a hole in it.
 */
export function thumbnailUrl(model: string): string {
  return `/thumbs/blocks/${model}.webp`
}

/**
 * Blocks that hurt to stand on.
 *
 * A set of one today, and a set rather than an `=== 'lava'` because the palette
 * is a list somebody adds to: the day a `magma` or a `fire` block arrives, the
 * question "does this burn" should have exactly one place to answer it.
 *
 * Lava is still a solid block you walk on top of, not a fluid you sink into.
 * Making it swallow people would mean a second kind of collision for one block
 * in the palette - and a floor that visibly punishes you for standing on it is
 * already the whole idea.
 */
const BURNING_BLOCKS = new Set(['lava'])

export function isBurning(model: string): boolean {
  return BURNING_BLOCKS.has(model)
}

/** What a new player starts holding. */
export const DEFAULT_MODEL = 'dirt_with_grass'

/**
 * The block a generated floor is made of.
 *
 * `dirt_with_grass` rather than `grass` or `dirt`: it is brown on the sides
 * with a green top, so a flat plain of it reads as ground with a surface. Plain
 * `grass` is green on all six faces, which looks like painted cubes the moment
 * you break one and see the side of its neighbour.
 */
export const DEFAULT_GROUND_MODEL = 'dirt_with_grass'
