/**
 * Everything you can put in the house or the garden.
 *
 * The Tiny Treats pack is authored at the same 2 units per square as the
 * restaurant set - floors are exactly 2x2, walls are 2 wide and 4 tall - so
 * nothing here is scaled and `TILE` carries over unchanged. What it does *not*
 * share is the wall origin: these walls are centred on x and straddle z, where
 * `wall_half` hangs off its corner. That difference is the only reason the house
 * derives its own shell instead of borrowing the café's.
 *
 * Model ids are `folder/name`, because the pack ships one folder per room and
 * two folders both contain a `floor_wood`. Flattening them would have meant
 * renaming files, and a renamed file is one that no longer matches the itch.io
 * download when the pack is updated.
 */

import { TILE } from '../world/grid'

export const TINY_PATH = '/tinyXO'

export function modelUrl(model: string): string {
  return `${TINY_PATH}/${model}.gltf`
}

/**
 * The palette's picture of a catalog entry.
 *
 * Keyed by entry id, not by model, because a desk is a desk *with the computer
 * on it* and the picture has to show what you actually buy. Written by
 * `scripts/render-props.ts`; re-run it after changing an entry's models.
 */
export function propThumbUrl(id: string): string {
  return `/thumbs/home/${id}.webp`
}

/**
 * Which room a square is, which decides its floor, its walls, and what the
 * palette offers while you stand in it.
 *
 * `garden` is in the same list rather than a separate concept because it *is*
 * the same thing to everything downstream: a set of squares with a floor model
 * and a list of things that may sit on them. Its only peculiarity is having
 * hedges where the rooms have walls.
 */
export type Theme = 'bedroom' | 'living' | 'kitchen' | 'bath' | 'garden'

export const THEME_NAMES: Record<Theme, string> = {
  bedroom: 'Bedroom',
  living: 'Living room',
  kitchen: 'Kitchen',
  bath: 'Bathroom',
  garden: 'Garden',
}

/**
 * The shell models for one theme.
 *
 * Every wall in this pack is 2 wide, 4 tall and centred on x, which is what lets
 * one set of numbers drive four different wallpapers.
 *
 * The `inner`/`outer` split is the pack telling us how it wants to be used. A
 * plain `wall_..._straight` is finished on both faces and spans z from -0.25 to
 * +0.3, so it is what an *outside* wall wants. A `wall_modular_..._straight_A`
 * is a single 0.3-thick skin sitting on z from 0 to 0.3, and its `_B` twin fills
 * -0.25 to 0. Two rooms either side of the same edge therefore each hang their
 * own skin facing inward and the two abut exactly - which is how the bedroom can
 * be papered blue on its side of a wall the bathroom has tiled on the other,
 * with nothing overlapping to z-fight.
 *
 * `floorY` is the exception that proves the pack is otherwise consistent: the
 * kitchen's floor tile is modelled from y=0 upward instead of down to y=-0.5
 * like every other one, so it needs dropping or the room stands on a plinth.
 */
export interface Shell {
  floor: string
  floorY?: number
  /** Both faces finished, for an edge with nothing on the other side. */
  outerWall: string
  /** One skin, hung facing into the room, for an edge shared with another room. */
  innerWall: string
  outerDoor: string
  innerDoor: string
  /** Used on outside walls, so the house is not a windowless box. */
  window: string
}

export const SHELLS: Record<Theme, Shell> = {
  bedroom: {
    floor: 'bedroom/floor_wood',
    outerWall: 'bedroom/wall_panelled_straight_blue',
    innerWall: 'bedroom/wall_modular_panelled_straight_blue_A',
    outerDoor: 'bedroom/wall_panelled_doorway_blue',
    innerDoor: 'bedroom/wall_modular_panelled_doorway_blue',
    window: 'bedroom/wall_panelled_window_blue_large',
  },
  living: {
    floor: 'livingroom/floor_wood',
    outerWall: 'livingroom/wall_panelled_living_room_straight',
    innerWall: 'livingroom/wall_modular_panelled_living_room_straight_A',
    outerDoor: 'livingroom/wall_panelled_living_room_doorway',
    innerDoor: 'livingroom/wall_modular_panelled_living_room_doorway_A',
    window: 'livingroom/wall_panelled_living_room_window_large',
  },
  kitchen: {
    floor: 'kitchen/floor_tiles_kitchen',
    floorY: -TILE / 4,
    outerWall: 'kitchen/wall_tiles_kitchen_straight',
    innerWall: 'kitchen/wall_modular_tiles_kitchen_straight_A',
    outerDoor: 'kitchen/wall_tiles_kitchen_doorway',
    innerDoor: 'kitchen/wall_modular_tiles_kitchen_doorway',
    window: 'kitchen/wall_tiles_kitchen_window_large',
  },
  bath: {
    floor: 'bathroom/floor_tiled',
    outerWall: 'bathroom/wall_tiled_straight',
    innerWall: 'bathroom/wall_modular_tiled_straight_A',
    outerDoor: 'bathroom/wall_tiled_doorway',
    innerDoor: 'bathroom/wall_modular_tiled_doorway',
    window: 'bathroom/wall_tiled_window_large',
  },
  garden: {
    /**
     * The garden is one theme over every square, so it has no inner edges at
     * all and the modular entries are never reached. A hedge is also not a wall
     * - it is 1.5 tall against a wall's 4 - which is exactly why the garden
     * still reads as outdoors while you are standing inside it.
     */
    floor: 'park/floor_grass_sliced_base',
    outerWall: 'park/hedge_straight',
    innerWall: 'park/hedge_straight',
    outerDoor: 'park/hedge_straight',
    innerDoor: 'park/hedge_straight',
    window: 'park/hedge_straight',
  },
}

/** Extra models composed onto a catalog entry, in its local space. */
export interface HomeExtra {
  model: string
  x?: number
  y?: number
  z?: number
  rotY?: number
}

export interface HomeProp {
  id: string
  name: string
  model: string
  /**
   * Which themes' palettes offer this.
   *
   * A list rather than a single theme because a pot plant belongs in every room
   * and a rug belongs in most of them. The palette filters by the square you are
   * pointing at, so a bath cannot be bought while standing in the kitchen - not
   * as a rule about taste, but because the rooms are how a hundred and eighty
   * models stay findable.
   */
  themes: Theme[]
  price: number
  /**
   * How many squares deep it is, along the way it faces.
   *
   * Beds, sofas and baths are three units long in a two-unit square. Letting
   * them own one square would push a third of the model through a wall, and the
   * pack has no shorter variants, so instead they claim the square behind them
   * and are drawn centred across both. Everything else is 1 and never thinks
   * about it.
   */
  depth?: 1 | 2
  /**
   * How many squares wide it is, across the way it faces.
   *
   * The counterpart to `depth`, and needed for the same reason by the models
   * the pack drew the other way round: a sofa is three units side to side and
   * under two front to back, so it is one square deep and two wide. Giving it
   * `depth: 2` instead - which is what it had - reserved the square *behind* it
   * while the arms still hung half a square into the neighbours either side.
   * That is the whole reason a sofa could never be pushed up to a wall.
   *
   * It grows to the right of its facing, mirroring the way depth grows away
   * from you, and is drawn centred across both squares.
   */
  width?: 1 | 2
  /**
   * A shove in the prop's own space, in world units, applied after the
   * centring that `depth` and `width` imply.
   *
   * Furniture in this pack is modelled to a tidy square but not to a *full*
   * one: a bookcase is half a unit shallower than the square it stands in, so
   * centring it leaves it stranded a third of a metre off the wall with a gap
   * behind it that reads as a mistake. Rather than making every entry declare
   * where its back is, only the ones that belong against something carry a
   * `z`, and the number is always the same idea: enough to bring the back face
   * up to the wall's inner skin, which stands 0.3 proud of the square's edge.
   *
   * `scripts/prop-bounds.ts` measures the models and prints the value each
   * entry wants, so these are recovered rather than guessed. Negative pulls a
   * prop forward - a toilet and a fridge are both deeper than their square, and
   * without it they sit *inside* the wall.
   */
  nudge?: { x?: number; z?: number }
  /** Blocks walking. Default true - most furniture does. */
  solid?: boolean
  /**
   * Height of the surface things sit on, when this is something you put things
   * on. Only read by the renderer, for props that carry extras.
   */
  surfaceY?: number
  /** What this adds to the house's comfort, which the café pays out as tips. */
  comfort?: number
  /**
   * What happens when you walk up and press E.
   *
   * Only furniture you get *into* has one. The peeps pack has four clips - idle,
   * walk, run, dance - and none of them is sitting, so a pose here is the body
   * raised to the seat and, for a bed, tipped onto its back. That is exactly how
   * the café seats its customers, and it reads correctly for the same reason:
   * the chair is underneath you.
   *
   * `y` is the surface the body rests on, measured off the model rather than
   * guessed - a stool is 0.6 tall and a sofa cushion is 0.62, and half a unit
   * out in either direction is the difference between sitting down and hovering.
   */
  use?: { pose: 'sit' | 'lie'; y: number; label: string }
  extras?: HomeExtra[]
  blurb?: string
}

/**
 * The shop.
 *
 * Prices are in café coins, and a burger is fourteen. That is the only scale
 * that matters here: a sofa at 180 is roughly a busy lunchtime, which is meant
 * to be long enough that you choose between it and the bath, and short enough
 * that you get one this evening.
 */
export const HOME_PROPS: HomeProp[] = [
  // --- bedroom --------------------------------------------------------------
  {
    id: 'bed',
    name: 'Bed',
    model: 'bedroom/bed_blue',
    themes: ['bedroom'],
    price: 220,
    nudge: { z: 0.2 },
    depth: 2,
    comfort: 8,
    use: { pose: 'lie', y: 0.78, label: 'Have a lie down' },
    blurb: 'Two squares long. The one thing a bedroom is not a bedroom without.',
  },
  {
    id: 'bed_pink',
    name: 'Bed, pink',
    model: 'bedroom/bed_pink',
    themes: ['bedroom'],
    price: 220,
    nudge: { z: 0.2 },
    depth: 2,
    comfort: 8,
    use: { pose: 'lie', y: 0.78, label: 'Have a lie down' },
  },
  {
    id: 'closet',
    name: 'Wardrobe',
    model: 'bedroom/closet_blue',
    themes: ['bedroom'],
    price: 130,
    comfort: 3,
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    model: 'bedroom/nightstand_blue',
    themes: ['bedroom'],
    price: 45,
    nudge: { z: 0.18 },
    surfaceY: 0.75,
    comfort: 2,
    extras: [{ model: 'bedroom/alarm_clock', y: 0.75 }],
    blurb: 'Comes with the clock that wakes you for the breakfast rush.',
  },
  {
    id: 'desk',
    name: 'Desk',
    model: 'bedroom/desk_blue',
    themes: ['bedroom'],
    price: 110,
    nudge: { z: -0.12 },
    surfaceY: 1,
    comfort: 3,
    extras: [
      { model: 'bedroom/computer', y: 1 },
      { model: 'bedroom/keyboard', y: 1, z: 0.45 },
    ],
  },
  {
    id: 'desk_chair',
    name: 'Desk chair',
    model: 'bedroom/desk_chair_blue',
    themes: ['bedroom'],
    price: 40,
    solid: false,
    comfort: 1,
    use: { pose: 'sit', y: 0.55, label: 'Sit down' },
  },
  {
    id: 'teddy',
    name: 'Teddy bear',
    model: 'bedroom/teddy_bear',
    themes: ['bedroom', 'living'],
    price: 30,
    solid: false,
    comfort: 3,
  },
  {
    id: 'toys',
    name: 'Toy pile',
    model: 'bedroom/play_block_A',
    themes: ['bedroom'],
    price: 22,
    solid: false,
    comfort: 2,
    extras: [
      { model: 'bedroom/play_block_C', x: 0.35, z: 0.3 },
      { model: 'bedroom/soccer_ball', x: -0.45, z: 0.25 },
      { model: 'bedroom/rubicks_cube_A', x: 0.1, z: -0.4 },
    ],
  },
  {
    id: 'piggybank',
    name: 'Piggy bank',
    model: 'bedroom/piggybank',
    themes: ['bedroom'],
    price: 25,
    solid: false,
    comfort: 1,
    blurb: 'Purely ornamental. Your coins live in the café till.',
  },

  // --- living room ----------------------------------------------------------
  {
    id: 'couch',
    name: 'Sofa',
    model: 'livingroom/couch_A_blue',
    themes: ['living'],
    price: 180,
    nudge: { z: -0.17 },
    width: 2,
    comfort: 7,
    use: { pose: 'sit', y: 0.62, label: 'Sit down' },
    blurb: 'Two squares wide, and it goes right up to the wall.',
  },
  {
    id: 'couch_orange',
    name: 'Sofa, orange',
    model: 'livingroom/couch_B_orange',
    themes: ['living'],
    price: 180,
    nudge: { z: -0.17 },
    width: 2,
    comfort: 7,
    use: { pose: 'sit', y: 0.62, label: 'Sit down' },
  },
  {
    id: 'armchair',
    name: 'Armchair',
    model: 'livingroom/chair_A_blue',
    themes: ['living'],
    price: 85,
    nudge: { z: -0.17 },
    comfort: 4,
    use: { pose: 'sit', y: 0.62, label: 'Sit down' },
  },
  {
    id: 'rocking_chair',
    name: 'Rocking chair',
    model: 'livingroom/rocking_chair_brown',
    themes: ['living'],
    price: 95,
    comfort: 5,
    use: { pose: 'sit', y: 0.58, label: 'Sit and rock' },
  },
  {
    id: 'coffee_table',
    name: 'Coffee table',
    model: 'livingroom/table_B_brown',
    themes: ['living'],
    price: 70,
    surfaceY: 0.6,
    comfort: 2,
    extras: [{ model: 'livingroom/mug_duck', y: 0.6 }],
  },
  {
    id: 'tv',
    name: 'Television',
    model: 'livingroom/tv_cabinet_A',
    themes: ['living'],
    price: 210,
    surfaceY: 0.75,
    comfort: 6,
    extras: [{ model: 'livingroom/tv_A_standing', y: 0.75 }],
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    model: 'livingroom/fireplace_A',
    themes: ['living'],
    price: 260,
    nudge: { z: -0.2 },
    comfort: 9,
    blurb: 'The single cosiest thing in the catalogue.',
  },
  {
    id: 'bookshelf',
    name: 'Bookcase',
    model: 'livingroom/closet_B_decorated',
    themes: ['living', 'bedroom'],
    price: 120,
    nudge: { z: 0.41 },
    comfort: 4,
  },
  {
    id: 'aquarium',
    name: 'Aquarium',
    model: 'livingroom/aquarium',
    themes: ['living'],
    price: 150,
    nudge: { z: 0.25 },
    comfort: 5,
  },
  {
    id: 'rug',
    name: 'Rug',
    model: 'livingroom/rug_A_large',
    themes: ['living', 'bedroom'],
    price: 55,
    solid: false,
    comfort: 3,
    blurb: 'Flat, so you can walk on it and put a table on top.',
  },
  {
    id: 'standing_lamp',
    name: 'Standing lamp',
    model: 'livingroom/lamp_standing_A',
    themes: ['living', 'bedroom'],
    price: 60,
    nudge: { z: -0.13 },
    solid: false,
    comfort: 3,
  },
  {
    id: 'record_player',
    name: 'Record player',
    model: 'livingroom/record_player_brown',
    themes: ['living'],
    price: 90,
    nudge: { z: 0.18 },
    comfort: 4,
  },
  {
    id: 'clock_standing',
    name: 'Grandfather clock',
    model: 'livingroom/clock_standing',
    themes: ['living'],
    price: 140,
    nudge: { z: 0.29 },
    comfort: 4,
  },

  {
    id: 'stool',
    name: 'Stool',
    model: 'livingroom/stool_A_blue',
    themes: ['living', 'kitchen'],
    price: 30,
    solid: false,
    comfort: 1,
    use: { pose: 'sit', y: 0.6, label: 'Perch on it' },
  },

  // --- kitchen --------------------------------------------------------------
  {
    id: 'counter_home',
    name: 'Countertop',
    model: 'kitchen/countertop_straight_A',
    themes: ['kitchen'],
    price: 60,
    surfaceY: 1,
    comfort: 1,
  },
  {
    id: 'sink_home',
    name: 'Sink unit',
    model: 'kitchen/countertop_sink',
    themes: ['kitchen'],
    price: 80,
    surfaceY: 1,
    comfort: 1,
  },
  {
    id: 'stove_home',
    name: 'Stove',
    model: 'kitchen/stove',
    themes: ['kitchen'],
    price: 150,
    nudge: { z: -0.23 },
    surfaceY: 1,
    comfort: 3,
    extras: [{ model: 'kitchen/pot', y: 1 }],
  },
  {
    id: 'fridge_home',
    name: 'Fridge',
    model: 'kitchen/fridge',
    themes: ['kitchen'],
    price: 190,
    nudge: { z: -0.42 },
    comfort: 4,
  },
  {
    id: 'kitchen_table',
    name: 'Kitchen table',
    model: 'kitchen/table_A',
    themes: ['kitchen'],
    price: 90,
    surfaceY: 1,
    comfort: 3,
    extras: [
      { model: 'kitchen/plate', y: 1, x: -0.3 },
      { model: 'kitchen/mug_red', y: 1, x: 0.4, z: 0.3 },
    ],
  },
  {
    id: 'kitchen_chair',
    name: 'Kitchen chair',
    model: 'kitchen/chair',
    themes: ['kitchen'],
    price: 35,
    solid: false,
    comfort: 1,
    use: { pose: 'sit', y: 0.6, label: 'Sit down' },
  },
  {
    id: 'dishrack_home',
    name: 'Dish rack',
    model: 'kitchen/dishrack_plates',
    themes: ['kitchen'],
    price: 28,
    solid: false,
    comfort: 1,
  },
  {
    id: 'toaster',
    name: 'Toaster and kettle',
    model: 'kitchen/countertop_straight_B',
    themes: ['kitchen'],
    price: 75,
    surfaceY: 1,
    comfort: 2,
    extras: [
      { model: 'kitchen/toaster', y: 1, x: -0.4 },
      { model: 'kitchen/kettle', y: 1, x: 0.45 },
    ],
  },

  // --- bathroom -------------------------------------------------------------
  {
    id: 'bath',
    name: 'Bath',
    model: 'bathroom/bath',
    themes: ['bath'],
    price: 240,
    nudge: { z: 0.2 },
    depth: 2,
    comfort: 8,
    use: { pose: 'lie', y: 0.75, label: 'Take a bath' },
    blurb: 'Two squares long. Rubber duck included.',
    extras: [{ model: 'bathroom/ducky', y: 0.9 }],
  },
  {
    id: 'shower',
    name: 'Shower',
    model: 'bathroom/shower',
    themes: ['bath'],
    price: 170,
    nudge: { z: -0.38 },
    comfort: 5,
  },
  {
    id: 'toilet',
    name: 'Toilet',
    model: 'bathroom/toilet',
    themes: ['bath'],
    price: 90,
    nudge: { z: -0.51 },
    comfort: 2,
    use: { pose: 'sit', y: 0.72, label: 'Sit down' },
  },
  {
    id: 'bathroom_cabinet',
    name: 'Basin cabinet',
    model: 'bathroom/cabinet_bathroom',
    themes: ['bath'],
    price: 110,
    nudge: { z: -0.19 },
    surfaceY: 1,
    comfort: 3,
    extras: [{ model: 'bathroom/toothbrush_cup_decorated', y: 1 }],
  },
  {
    id: 'bathroom_bin',
    name: 'Bin',
    model: 'bathroom/bin',
    themes: ['bath'],
    price: 18,
    nudge: { z: 0.42 },
    solid: false,
    comfort: 1,
  },
  {
    id: 'towels',
    name: 'Folded towels',
    model: 'bathroom/towel_stacked',
    themes: ['bath'],
    price: 24,
    solid: false,
    comfort: 2,
  },
  {
    id: 'bath_mat',
    name: 'Bath mat',
    model: 'bathroom/mat',
    themes: ['bath'],
    price: 20,
    solid: false,
    comfort: 2,
  },
  {
    id: 'candles',
    name: 'Candles',
    model: 'bathroom/candle',
    themes: ['bath', 'living'],
    price: 26,
    solid: false,
    comfort: 3,
  },

  // --- plants, which belong everywhere --------------------------------------
  {
    id: 'monstera',
    name: 'Monstera',
    model: 'plants/monstera_plant_large_potted',
    themes: ['bedroom', 'living', 'kitchen', 'bath', 'garden'],
    price: 65,
    solid: false,
    comfort: 4,
  },
  {
    id: 'yucca',
    name: 'Yucca',
    model: 'plants/yucca_plant_medium_potted',
    themes: ['bedroom', 'living', 'kitchen', 'bath', 'garden'],
    price: 50,
    solid: false,
    comfort: 3,
  },
  {
    id: 'sansevieria',
    name: 'Snake plant',
    model: 'plants/sansevieria_plant_medium_potted',
    themes: ['bedroom', 'living', 'kitchen', 'bath', 'garden'],
    price: 45,
    solid: false,
    comfort: 3,
  },
  {
    id: 'cactus',
    name: 'Cactus',
    model: 'plants/cacti_plant_pot_small',
    themes: ['bedroom', 'living', 'kitchen', 'bath', 'garden'],
    price: 28,
    solid: false,
    comfort: 2,
  },
  {
    id: 'pothos',
    name: 'Pothos',
    model: 'plants/pothos_plant_medium_potted',
    themes: ['bedroom', 'living', 'kitchen', 'bath', 'garden'],
    price: 40,
    solid: false,
    comfort: 3,
  },

  // --- garden ---------------------------------------------------------------
  {
    id: 'garden_tree',
    name: 'Tree',
    model: 'park/tree_large',
    themes: ['garden'],
    price: 120,
    comfort: 5,
  },
  {
    id: 'garden_bush',
    name: 'Bush',
    model: 'park/bush_large',
    themes: ['garden'],
    price: 35,
    solid: false,
    comfort: 2,
  },
  {
    id: 'garden_bench',
    name: 'Bench',
    model: 'park/bench',
    themes: ['garden'],
    price: 80,
    comfort: 4,
    use: { pose: 'sit', y: 0.62, label: 'Sit down' },
  },
  {
    id: 'garden_fountain',
    name: 'Fountain',
    model: 'park/fountain',
    themes: ['garden'],
    price: 300,
    comfort: 9,
    blurb: 'Four units across, so give it a square of its own.',
  },
  {
    id: 'garden_lantern',
    name: 'Street lantern',
    model: 'park/street_lantern',
    themes: ['garden'],
    price: 70,
    solid: false,
    comfort: 3,
  },
  {
    id: 'garden_flowers',
    name: 'Flower bed',
    model: 'park/flower_A',
    themes: ['garden'],
    price: 20,
    solid: false,
    comfort: 2,
    extras: [
      { model: 'park/flower_B', x: 0.5, z: 0.4 },
      { model: 'park/flower_A', x: -0.45, z: 0.5 },
      { model: 'park/grass_A', x: 0.2, z: -0.5 },
    ],
  },
  {
    id: 'garden_path',
    name: 'Cobbles',
    model: 'house/cobblestones',
    themes: ['garden'],
    price: 12,
    solid: false,
    blurb: 'Flat. Walk on it.',
  },
  {
    id: 'garden_mailbox',
    name: 'Mailbox',
    model: 'house/mailbox',
    themes: ['garden'],
    price: 55,
    nudge: { z: -0.38 },
    solid: false,
    comfort: 2,
    extras: [{ model: 'house/letter', x: 0.4, y: 0.05 }],
  },
  {
    id: 'garden_trashcan',
    name: 'Bin',
    model: 'park/trashcan',
    themes: ['garden'],
    price: 22,
    solid: false,
  },
]

const BY_ID = new Map(HOME_PROPS.map((entry) => [entry.id, entry]))

export function homeProp(id: string): HomeProp | undefined {
  return BY_ID.get(id)
}

/** Solidity with the default applied, so callers stop repeating `?? true`. */
export function isSolid(def: HomeProp): boolean {
  return def.solid !== false
}

/** Squares deep, with the default applied. */
export function depthOf(def: HomeProp): number {
  return def.depth ?? 1
}

/** Squares wide, with the default applied. */
export function widthOf(def: HomeProp): number {
  return def.width ?? 1
}

/**
 * How far a wall's inner face stands from the square's edge.
 *
 * Every wall in the pack is a 0.3-thick skin hung on the boundary and facing
 * into the room, so a prop with its back on the boundary is a prop with its
 * back 0.3 deep in the wallpaper. Named here rather than in `plan.ts` because
 * this is the only thing that reads it: the walls themselves are placed from
 * the boundary and never think about their own thickness.
 */
export const WALL_SKIN = 0.3

/**
 * What a sold prop is worth.
 *
 * Half, rounded down, exactly as in the café. Generous enough that rearranging
 * is not punished, mean enough that the shop is not a bank.
 */
export function refundOf(def: HomeProp): number {
  return Math.floor(def.price / 2)
}

/** What the palette shows while you are pointing at a given room. */
export function propsFor(theme: Theme): HomeProp[] {
  return HOME_PROPS.filter((entry) => entry.themes.includes(theme))
}
