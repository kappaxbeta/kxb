/**
 * The shop. Everything you can buy, place, and stand next to.
 *
 * One entry per *thing you choose in the palette*, which is not the same as one
 * entry per model - a chopping station is a counter with a board on it, and the
 * player should buy that as a single idea rather than assembling it from two.
 * `extras` is what lets a catalog entry be a small composition without inventing
 * a scene format.
 *
 * Both packs are authored at 2 units per grid square: counters run x from -1 to
 * +1, floor tiles are exactly 2x2, and walls are 4 tall. `TILE` (in
 * `domain/world/grid`) is 2 because the models say so, and fighting that would
 * mean rescaling 200 models to save one multiplication.
 *
 * `scale` is the exception, and stays an exception. A handful of models are
 * drawn slightly over their own square - a stove 2.29 deep, crates filling the
 * full 2x2 with no margin - and those clip their neighbours or bury themselves
 * in the wall. Scaling those few is the fix; scaling by habit would put the
 * whole room back out of step with the grid.
 */

import type { ItemId } from './recipes'

/**
 * The packs a model can come from.
 *
 * Two vendors, mixed on purpose. Tiny Treats is the better *room* - its walls
 * corner properly and its worktops are 1.5 deep rather than 2.04, so they stop
 * intersecting each other across a 2-unit square - while the restaurant pack has
 * the food, which Tiny Treats mostly does not. A model is written `pack/name`,
 * and a bare name still means the restaurant pack so that the food tables read
 * the way they always did.
 */
const PACKS: Record<string, string> = {
  restaurant: '/xo/restaunt',
  cafe: '/tinyXO/cafe',
  kitchen: '/tinyXO/kitchen',
  bakery: '/tinyXO/bakerygoods',
}

export const RESTAURANT_PATH = PACKS.restaurant

export function propUrl(model: string): string {
  const cut = model.indexOf('/')
  if (cut === -1) return `${PACKS.restaurant}/${model}.gltf`
  return `${PACKS[model.slice(0, cut)] ?? PACKS.restaurant}/${model.slice(cut + 1)}.gltf`
}

/**
 * The palette's picture of an entry.
 *
 * Keyed by catalog id, not by model, because a chopping station is a counter
 * with a board on it and the picture has to show both. Written by
 * `scripts/render-props.ts`; re-run it after changing an entry's models.
 */
export function propThumbUrl(id: string): string {
  return `/thumbs/cafe/${id}.webp`
}

/**
 * What a prop *does* when you walk up and press E.
 *
 * `none` is the interesting one: decor is mechanically inert on purpose, so that
 * decorating stays a choice about how the room looks rather than a hidden stat
 * check. The only thing decor feeds is `ambience`, and that is a tip multiplier,
 * not a gate.
 */
export type StationKind =
  | 'crate'
  | 'prep'
  | 'stove'
  | 'oven'
  | 'counter'
  | 'icecream'
  | 'coffee'
  | 'display'
  | 'sink'
  | 'bin'
  | 'table'
  | 'chair'
  | 'none'

/**
 * Stations that make one thing on their own, with no ingredients.
 *
 * Press E, wait, take it. Grouping them means the coffee machine did not need a
 * second copy of the ice cream machine's five lines of state handling, and the
 * next such appliance will not need a third.
 */
export const SELF_SERVE: readonly StationKind[] = ['icecream', 'coffee']

export function isSelfServe(kind: StationKind): boolean {
  return SELF_SERVE.includes(kind)
}

export interface PropExtra {
  model: string
  x?: number
  y?: number
  z?: number
  /** Radians, applied about Y. */
  rotY?: number
  /** Uniform scale, for the few models the pack authored off-grid. */
  scale?: number
}

export interface PropDef {
  id: string
  name: string
  model: string
  category: 'kitchen' | 'dining' | 'decor'
  price: number
  station: StationKind
  /**
   * Blocks walking. Default true - most furniture does.
   *
   * Chairs are the deliberate exception. A chair is 0.75 wide sitting on a 2-unit
   * square, so making its whole square solid would wall off a third of a small
   * dining room with furniture you can see straight past. Customers need to walk
   * *onto* a chair to sit on it anyway.
   */
  solid?: boolean
  /** Height of the surface things sit on, in world units above the floor. */
  surfaceY?: number
  /** What a crate hands you. Only meaningful when `station` is `crate`. */
  yields?: ItemId
  /** Contribution to the room's ambience score, which tips scale with. */
  ambience?: number
  /**
   * Small enough to stand on a worktop.
   *
   * Decor only, and only the genuinely small things: a jar shelf on a counter
   * reads as a jar shelf on a counter, an extractor hood on one reads as a bug.
   * A prop with this set can be bought onto a square that is already occupied,
   * provided what is there has a `surfaceY` to put it on - see `canPlace`.
   */
  onSurface?: boolean
  /** Extra models composed on top of the base one. */
  extras?: PropExtra[]
  /**
   * Uniform scale.
   *
   * A last resort, and deliberately rare. Both packs are authored to the same
   * 2-unit square, so anything needing this is a model the vendor drew slightly
   * over its own grid - a bread oven at 2.2 wide, a stack of pizza boxes drawn
   * at counter size rather than at box size. Scaling those is cheaper than
   * dropping them, and much cheaper than the alternative the room currently
   * shows: two neighbouring props whose faces intersect and flicker.
   */
  scale?: number
  /** One-line explanation shown in the palette. */
  blurb?: string
}

/**
 * The ingredient crates, pulled in off the walls.
 *
 * The restaurant pack draws them at exactly 2x2 - the full size of a square -
 * so a crate against a wall has its corner buried in the panelling and two
 * crates side by side touch. Every other prop in the room leaves a margin, and
 * these looked wrong precisely because they were the only ones that did not.
 *
 * Shared rather than repeated six times because all six crates are the same box
 * with different contents, and six copies of a number is six chances for one of
 * them to be left behind.
 */
const CRATE_SCALE = 0.85

/** The pack's 0.92 lid height, scaled to match - see `surfaceY`. */
const CRATE_SURFACE = 0.78

export const PROPS: PropDef[] = [
  // --- kitchen --------------------------------------------------------------
  {
    id: 'counter',
    name: 'Prep counter',
    model: 'cafe/countertop_straight_A_large',
    category: 'kitchen',
    price: 40,
    station: 'counter',
    surfaceY: 1,
    blurb: 'Assembles a burger, a raw pizza, or cake batter.',
  },
  {
    id: 'board',
    name: 'Chopping board',
    model: 'cafe/countertop_straight_B_long',
    category: 'kitchen',
    price: 60,
    station: 'prep',
    surfaceY: 1,
    extras: [
      { model: 'kitchen/cuttingboard', y: 1 },
      { model: 'kitchen/knife', x: 0.6, y: 1.2 },
    ],
    blurb: 'Slices tomato and pepperoni, grates cheese, rolls dough.',
  },
  {
    id: 'stove',
    name: 'Stove',
    model: 'stove_single',
    category: 'kitchen',
    price: 120,
    station: 'stove',
    /**
     * The restaurant pack's stove, kept for looks and pulled in to fit.
     *
     * It is drawn 2.29 deep against a 2.0 square, which is what made it clip
     * whatever stood behind it. Scaling is the right answer here rather than
     * swapping the model: the shape is the one that reads as a stove, and 0.87
     * is exactly enough to bring the hob inside its own tile.
     */
    scale: 0.87,
    // The pack's 1.21, scaled with the model - `surfaceY` is a world height and
    // the pan on top is not.
    surfaceY: 1.05,
    extras: [{ model: 'pan_A', y: 1.21, z: -0.25 }],
    blurb: 'Cooks patties. Leave one on too long and it burns.',
  },
  {
    id: 'oven',
    name: 'Oven',
    model: 'cafe/bread_oven',
    category: 'kitchen',
    price: 260,
    station: 'oven',
    // The pack drew this 2.2 wide against a 2.0 square, so it is the one large
    // prop that needs pulling in - otherwise it clips whatever is beside it.
    scale: 0.9,
    surfaceY: 1,
    ambience: 2,
    blurb: 'Bakes a raw pizza or a cake. Assemble on a counter first.',
  },
  {
    id: 'coffee',
    name: 'Coffee machine',
    model: 'cafe/counter_table',
    category: 'kitchen',
    price: 150,
    station: 'coffee',
    surfaceY: 1,
    ambience: 2,
    extras: [
      { model: 'cafe/coffee_machine', y: 1, z: -0.25 },
      { model: 'cafe/mug_B_stacked', x: 0.65, y: 1 },
    ],
    blurb: 'Press once, wait, take a coffee. No ingredients, quick money.',
  },
  {
    id: 'display',
    name: 'Display case',
    model: 'cafe/display_case_long',
    category: 'kitchen',
    price: 130,
    station: 'display',
    surfaceY: 0.95,
    ambience: 3,
    blurb: 'Put a whole cake in. Take slices back out, one customer at a time.',
  },
  {
    id: 'icecream',
    name: 'Ice cream machine',
    model: 'icecream_machine',
    category: 'kitchen',
    price: 180,
    station: 'icecream',
    scale: 0.95,
    surfaceY: 1.1,
    blurb: 'Pulls a cone on demand. No prep, small margin.',
  },
  {
    id: 'sink',
    name: 'Sink',
    model: 'kitchen/countertop_sink',
    category: 'kitchen',
    price: 70,
    station: 'sink',
    surfaceY: 1,
    blurb: 'Washes the dirty plates customers leave behind.',
  },
  {
    id: 'bin',
    name: 'Waste bin',
    model: 'cafe/trash_can',
    category: 'kitchen',
    price: 20,
    station: 'bin',
    surfaceY: 1.1,
    blurb: 'Swallows anything. The only cure for a burnt patty.',
  },

  // --- crates ---------------------------------------------------------------
  {
    id: 'crate_buns',
    name: 'Bun crate',
    model: 'crate_buns',
    category: 'kitchen',
    price: 25,
    station: 'crate',
    yields: 'bun',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  {
    id: 'crate_steak',
    name: 'Patty crate',
    model: 'crate_steak',
    category: 'kitchen',
    price: 35,
    station: 'crate',
    yields: 'patty_raw',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  {
    id: 'crate_tomatoes',
    name: 'Tomato crate',
    model: 'crate_tomatoes',
    category: 'kitchen',
    price: 25,
    station: 'crate',
    yields: 'tomato',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  {
    id: 'crate_cheese',
    name: 'Cheese crate',
    model: 'crate_cheese',
    category: 'kitchen',
    price: 30,
    station: 'crate',
    yields: 'cheese',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  {
    id: 'crate_dough',
    name: 'Dough crate',
    model: 'crate_dough',
    category: 'kitchen',
    price: 30,
    station: 'crate',
    yields: 'dough',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  {
    id: 'crate_pepperoni',
    name: 'Pepperoni crate',
    model: 'crate_pepperoni',
    category: 'kitchen',
    price: 40,
    station: 'crate',
    yields: 'pepperoni',
    scale: CRATE_SCALE,
    surfaceY: CRATE_SURFACE,
  },
  /**
   * The two the bakery pack brought with it.
   *
   * Composed from a plain crate rather than drawn as one, because neither pack
   * ships a flour crate or an egg crate - and a sack sitting in an open crate
   * reads as "flour lives here" just as well as a printed label would.
   */
  {
    id: 'crate_flour',
    name: 'Flour sacks',
    model: 'cafe/crate',
    category: 'kitchen',
    price: 25,
    station: 'crate',
    yields: 'flour',
    surfaceY: 0.5,
    extras: [
      { model: 'cafe/flour_sack_open', x: -0.2, y: 0.5 },
      { model: 'cafe/flour_sack_closed', x: 0.3, y: 0.5, z: 0.15, rotY: 0.6 },
    ],
  },
  {
    id: 'crate_eggs',
    name: 'Egg crate',
    model: 'cafe/crate',
    category: 'kitchen',
    price: 25,
    station: 'crate',
    yields: 'egg',
    surfaceY: 0.5,
    extras: [
      { model: 'cafe/egg_A', x: -0.2, y: 0.5 },
      { model: 'cafe/egg_B', x: 0.15, y: 0.5, z: 0.2 },
      { model: 'cafe/egg_A', x: 0.3, y: 0.5, z: -0.15, rotY: 1.1 },
    ],
  },

  // --- dining ---------------------------------------------------------------
  {
    id: 'table',
    name: 'Table',
    model: 'kitchen/table_A',
    category: 'dining',
    price: 45,
    station: 'table',
    surfaceY: 1,
    blurb: 'Customers eat here. Needs a chair next to it.',
  },
  {
    id: 'table_round',
    name: 'Round table',
    model: 'cafe/table_round_A',
    category: 'dining',
    price: 55,
    station: 'table',
    surfaceY: 1,
    ambience: 1,
    blurb: 'Same job, nicer room.',
  },
  {
    id: 'chair',
    name: 'Chair',
    model: 'cafe/chair_A',
    category: 'dining',
    price: 20,
    station: 'chair',
    solid: false,
    blurb: 'A seat. Only counts if it touches a table.',
  },
  {
    id: 'chair_b',
    name: 'Padded chair',
    model: 'cafe/chair_B',
    category: 'dining',
    price: 30,
    station: 'chair',
    solid: false,
    ambience: 1,
  },
  {
    id: 'stool',
    name: 'Stool',
    model: 'chair_stool',
    category: 'dining',
    price: 12,
    station: 'chair',
    solid: false,
  },

  // --- decor ----------------------------------------------------------------
  {
    id: 'pillar',
    name: 'Pillar',
    model: 'pillar_A',
    category: 'decor',
    price: 30,
    station: 'none',
    ambience: 2,
  },
  {
    id: 'menu',
    name: 'Menu stand',
    model: 'menu',
    category: 'decor',
    price: 15,
    station: 'none',
    solid: false,
    ambience: 2,
    onSurface: true,
    blurb: 'Stands on a table, or by the door.',
  },
  {
    id: 'jars',
    name: 'Tin shelf',
    model: 'cafe/tin_A_beige',
    category: 'decor',
    price: 18,
    station: 'none',
    solid: false,
    ambience: 2,
    extras: [
      { model: 'cafe/tin_B_brown', x: 0.45, z: 0.2 },
      { model: 'cafe/tin_A_grey', x: -0.4, z: 0.35 },
    ],
    onSurface: true,
    blurb: 'Stands on a counter, or on the floor.',
  },
  {
    id: 'dishrack',
    name: 'Dish rack',
    model: 'kitchen/dishrack_plates',
    category: 'decor',
    price: 22,
    station: 'none',
    solid: false,
    ambience: 1,
    onSurface: true,
    blurb: 'Stands on a counter, or on the floor.',
  },
  {
    id: 'pizzaboxes',
    name: 'Pizza boxes',
    model: 'pizzabox_stacked',
    category: 'decor',
    price: 16,
    station: 'none',
    solid: false,
    ambience: 1,
    // Drawn at 2.3 across, which is a counter's worth of pizza box. A third of
    // that is a stack of boxes, which is what it is supposed to be.
    scale: 0.35,
    onSurface: true,
    blurb: 'Stands on a counter, or on the floor.',
  },
  {
    id: 'pastry_stand',
    name: 'Pastry stand',
    model: 'cafe/pastry_stand_A_decorated',
    category: 'decor',
    price: 26,
    station: 'none',
    solid: false,
    ambience: 3,
    onSurface: true,
    blurb: 'Stands on the display case, or on a table.',
  },
  {
    id: 'register',
    name: 'Cash register',
    model: 'cafe/cash_register',
    category: 'decor',
    price: 40,
    station: 'none',
    solid: false,
    ambience: 3,
    onSurface: true,
    blurb: 'Stands on the counter by the door. Decoration, not a till.',
  },
  {
    id: 'plant',
    name: 'Potted plant',
    model: 'cafe/plant_A',
    category: 'decor',
    price: 24,
    station: 'none',
    solid: false,
    ambience: 3,
    blurb: 'Softens a corner.',
  },
  {
    id: 'towel',
    name: 'Towel rail',
    model: 'towelrail',
    category: 'decor',
    price: 14,
    station: 'none',
    solid: false,
    ambience: 1,
  },
  {
    id: 'cabinet',
    name: 'Wall shelf',
    model: 'cafe/wall_shelf_bakery_B',
    category: 'decor',
    price: 35,
    station: 'none',
    solid: false,
    ambience: 3,
    blurb: 'Hangs high on the wall. Put it against one.',
  },
  {
    id: 'hood',
    name: 'Extractor hood',
    model: 'kitchen/extractor_hood',
    category: 'decor',
    price: 45,
    station: 'none',
    solid: false,
    ambience: 3,
    blurb: 'Hangs high. Looks right over a stove.',
  },
  {
    id: 'condiments',
    name: 'Condiments',
    model: 'ketchup',
    category: 'decor',
    price: 10,
    station: 'none',
    solid: false,
    ambience: 1,
    extras: [{ model: 'mustard', x: 0.35 }],
    onSurface: true,
    blurb: 'Stands on a table where diners can reach them.',
  },
]

const PROP_BY_ID = new Map(PROPS.map((prop) => [prop.id, prop]))

export function prop(id: string): PropDef | undefined {
  return PROP_BY_ID.get(id)
}

/** Whether this can be stood on a worktop rather than on the floor. */
export function isTopper(def: PropDef): boolean {
  return def.onSurface === true
}

/** Solidity with the default applied, so callers stop repeating `?? true`. */
export function isSolid(def: PropDef): boolean {
  return def.solid !== false
}

/**
 * What a removed prop is worth.
 *
 * Half, rounded down. Generous enough that redecorating is not punished, mean
 * enough that buying and selling is not a way to stall for time.
 */
export function refundOf(def: PropDef): number {
  return Math.floor(def.price / 2)
}

/**
 * Floor and wall models, which are not bought individually.
 *
 * The room's shell is derived from its tile set rather than placed by hand -
 * see `grid.ts`. Extending the room is one purchase, not a floor plus however
 * many wall segments the new shape happens to need.
 */
export const FLOOR_MODEL = 'cafe/floor_wood'

/**
 * One model per kind of wall the floor plan can imply.
 *
 * The reason the shell moved to this pack. Every piece here is 2 wide, 4 tall
 * and *centred on its origin*, so a segment lands on the middle of a tile edge
 * with no half-width shift - and, more to the point, corners are real models
 * rather than two slabs left to intersect. `wallsFor` decides which one an edge
 * gets; see `WallKind`.
 */
export const WALL_MODELS = {
  straight: 'cafe/wall_panelled_bakery_straight',
  door: 'cafe/wall_panelled_bakery_doorway',
  corner_inner: 'cafe/wall_panelled_bakery_corner_inner',
  corner_outer: 'cafe/wall_panelled_bakery_corner_outer',
} as const
