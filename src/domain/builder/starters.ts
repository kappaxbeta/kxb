import { area, type Cell, circle, disc, extrude, line, rect } from '@/domain/builder/draw'
import { stampText } from '@/domain/builder/glyphs'
import {
  type BuilderWorld,
  DEFAULT_WORLD,
  place,
  type Placement,
} from '@/domain/builder/world'

/**
 * Somewhere to start.
 *
 * The builder opens on a bare 25×25 slab, and a bare slab is the hardest thing
 * to begin with - not because laying blocks is hard, but because "a place" is a
 * shape you recognise long before you can draw one. Everybody's first world was
 * therefore the same twenty minutes of walling in a rectangle to discover what
 * the wall tool does.
 *
 * So: a handful of worlds that are already a place, each of them ordinary
 * enough to be worth changing. They are *starting points*, not templates in the
 * sense of something you fill in - the moment one is loaded it is simply the
 * world you are building, with a full undo stack behind it.
 *
 * They are also the catalogue's first shelf: `scripts/seed-worlds.ts` publishes
 * every one of them as the kxb.team team's own, and a space drops them in as
 * battlefields. That second life is what sets the two rules below.
 *
 * ---------------------------------------------------------------------------
 * Blocks only
 * ---------------------------------------------------------------------------
 * The builder can draw from twelve packs of furniture; a space's copy of a
 * world keeps only the `bb10` blocks (see domain/worlds/blocks.ts). The first
 * starters leaned on park benches, parasols and desks for their character, and
 * arrived in a space as empty shells - an office that was four walls, a square
 * that was paving round a pool. So every starter is now built from the block
 * palette alone, furniture included: a desk is a wood block with a computer on
 * it, a tree is a trunk with a canopy of tree blocks, a lamp is a post with a
 * yellow block on top. What the card shows is what you get, and the test in
 * ./starters.test.ts holds it there.
 *
 * ---------------------------------------------------------------------------
 * Markings are floor, not kerb
 * ---------------------------------------------------------------------------
 * The generated slab sits at y=-1, so the obvious way to draw a line on it is
 * a block at y=0 - and that is a kerb. The first pitch's touchlines were a
 * ring of one-block steps the ball bounced off. So any world that paints its
 * floor (lines, paths, a runner, a rug) has no generated slab at all: the floor
 * is laid as placements at y=-1, and the paint *replaces* floor cells rather
 * than standing on them. `place` is last-one-wins per cell, which is what makes
 * that a single stroke.
 *
 * ---------------------------------------------------------------------------
 * Why they are generated rather than shipped as files
 * ---------------------------------------------------------------------------
 * A JSON file of a maze is eight hundred coordinates that nobody can review, no
 * one can adjust, and which silently breaks the day a model id is renamed. The
 * generators below are a screen each, they say what they mean, and they are
 * written against the same drawing primitives the tools use - so a starter
 * cannot contain a shape the editor could not have drawn.
 *
 * Nothing here is random. A starter that came out differently each time would
 * make "open the arena" a thing you could not do twice, and a course that is
 * the same course for everybody is what lets two people talk about it.
 */

export interface Starter {
  id: string
  name: string
  /** One line in the picker. What you get, not what it is for. */
  hint: string
  build: () => BuilderWorld
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const GRASS = 'bb10/dirt_with_grass'
const DIRT = 'bb10/dirt'
const SAND = 'bb10/sand_A'
const GRAVEL = 'bb10/gravel'
const STONE = 'bb10/stone'
const DARK = 'bb10/stone_dark'
const GOLD = 'bb10/stone_with_gold'
const BRICK = 'bb10/bricks_A'
const BRICK_B = 'bb10/bricks_B'
const WOOD = 'bb10/wood'
const SNOW = 'bb10/snow'
const WATER = 'bb10/water'
const LAVA = 'bb10/lava'
const GLASS = 'bb10/glass'
const METAL = 'bb10/metal'
const FRAME = 'bb10/metalframe'
const TREE = 'bb10/tree'
const RED = 'bb10/colored_block_red'
const BLUE = 'bb10/colored_block_blue'
const GREEN = 'bb10/colored_block_green'
const YELLOW = 'bb10/colored_block_yellow'
const RUG = 'bb10/decorative_block_red'
const COUCH = 'bb10/decorative_block_blue'

const CHEST = 'bb10/chest'
const CRATE = 'bb10/crate'
const BARREL = 'bb10/barrel'
const COMPUTER = 'bb10/computer'
const BOOKS_A = 'bb10/books_A'
const BOOKS_B = 'bb10/books_B'
const APPLE = 'bb10/apple'
const MELON = 'bb10/melon'
const HAY_BALE = 'bb10/hay_bale'
const ANVIL = 'bb10/anvil'
const BATTERY = 'bb10/battery'
const PIPE = 'bb10/pipe'
const TRASHCAN = 'bb10/trashcan'
const GIFT = 'bb10/gift'
const VAULT = 'bb10/vault'

const at = (x: number, y: number, z: number): Cell => ({ x, y, z })

/**
 * A rounded coordinate, with negative zero flattened out.
 *
 * `Math.round(-0.4)` is `-0`, which is a real hazard here rather than a
 * curiosity: `cellKey` builds its key by interpolation, and `${-0}` is `"0"` -
 * so a cell at -0 and a cell at 0 are the same key but different values. A
 * world built with one and re-read as the other is not equal to itself, which
 * is exactly what the round-trip test caught.
 */
const round = (value: number): number => Math.round(value) || 0

/** One run of cells in one model. What every starter is a list of. */
interface Stroke {
  model: string
  cells: Cell[]
  rotation?: number
  scale?: number
}

/**
 * A world, from a floor and a list of strokes.
 *
 * Every starter is written as "this ground, then these runs of cells in these
 * models", because that is what building one actually is. Laid through `place`
 * rather than by pushing placements, so a starter obeys the same one-model-per-
 * cell rule the editor does - two strokes crossing leaves the later one, not
 * both.
 */
function compose(
  name: string,
  ground: BuilderWorld['ground'],
  strokes: Stroke[],
  camera?: Partial<BuilderWorld['camera']>,
  /** Where people come in. Omitted means the middle, which is most worlds. */
  spawn?: { x: number; z: number },
  /**
   * Goals and race marks.
   *
   * The difference between a course and a *race*: a finish drawn in red blocks
   * is scenery, and a `finish` mark is a thing the game ends a match on. See
   * `WorldMark`.
   */
  marks?: BuilderWorld['marks'],
): BuilderWorld {
  let placements: Placement[] = []

  for (const stroke of strokes) {
    placements = place(placements, stroke.cells, {
      model: stroke.model,
      rotation: stroke.rotation ?? 0,
      scale: stroke.scale ?? 1,
    })
  }

  return {
    ...DEFAULT_WORLD,
    name,
    ground,
    placements,
    camera: { ...DEFAULT_WORLD.camera, ...camera },
    spawn: spawn ?? null,
    marks: marks ?? [],
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const key = (cell: Cell) => `${cell.x},${cell.y},${cell.z}`

/** `cells` with every cell of `holes` taken out. How a pit is dug in a floor. */
function without(cells: Cell[], holes: Cell[]): Cell[] {
  const gone = new Set(holes.map(key))
  return cells.filter((cell) => !gone.has(key(cell)))
}

/** A ring of radius `r`, centred on (cx, cz). */
const ring = (r: number, y: number, cx = 0, cz = 0): Cell[] =>
  circle(at(cx - r, y, cz - r), at(cx + r, y, cz + r))

/** The same ring, filled. */
const fill = (r: number, y: number, cx = 0, cz = 0): Cell[] =>
  disc(at(cx - r, y, cz - r), at(cx + r, y, cz + r))

/** The cells of a rectangular ring from -half to half, at `y`. */
const square = (half: number, y: number): Cell[] => rect(at(-half, y, -half), at(half, y, half))

/** Every other cell of a ring, so a wall top reads as battlements. */
const crenels = (cells: Cell[]): Cell[] => cells.filter((cell) => (cell.x + cell.z) % 2 === 0)

/** The same cells, one level up or down. */
const raise = (cells: Cell[], by: number): Cell[] =>
  cells.map((cell) => ({ x: cell.x, y: cell.y + by, z: cell.z }))

/** A ring of wall, `height` tall, with gaps knocked in the middle of each side. */
function wallWithGaps(half: number, height: number, gap: number): Cell[] {
  const doorway = (cell: Cell) =>
    (Math.abs(cell.x) === half && Math.abs(cell.z) <= gap) ||
    (Math.abs(cell.z) === half && Math.abs(cell.x) <= gap)

  return extrude(square(half, 0).filter((cell) => !doorway(cell)), height)
}

/**
 * A round wall with a gate at each of the four compass points.
 *
 * The ring's cells near the axis are the gate: at x=0 and x=±1 the circle
 * crosses z=±r, and knocking those out leaves a three-wide opening, which is
 * what a character with a radius needs to walk through without sidling.
 */
function roundWall(r: number, height: number): Cell[] {
  const gate = (cell: Cell) =>
    (Math.abs(cell.x) <= 1 && Math.abs(cell.z) >= r - 2) ||
    (Math.abs(cell.z) <= 1 && Math.abs(cell.x) >= r - 2)
  return extrude(ring(r, 0).filter((cell) => !gate(cell)), height)
}

/**
 * A lamp post: two of `post` and a yellow block on top.
 *
 * The block world has no lantern, and this is what one looks like built out of
 * what it does have. Three cells tall, so it clears a head and reads as a post
 * rather than as a bollard with a hat.
 */
function lamp(x: number, z: number, y = 0, post = METAL): Stroke[] {
  return [
    { model: post, cells: extrude([at(x, y, z)], 2) },
    { model: YELLOW, cells: [at(x, y + 2, z)] },
  ]
}

/**
 * A tree, out of blocks: a two-block trunk and a canopy of tree blocks.
 *
 * The palette's `tree` is a single leafy cube, which is a bush. Stacked into a
 * three-by-three with a cross on top and a tip, it is a tree - and one you can
 * climb, which the park pack's never was.
 */
function bigTree(x: number, z: number, y = 0): Stroke[] {
  return [
    { model: WOOD, cells: extrude([at(x, y, z)], 2) },
    {
      model: TREE,
      cells: [
        ...area(at(x - 1, y + 2, z - 1), at(x + 1, y + 2, z + 1)),
        at(x, y + 3, z),
        at(x - 1, y + 3, z),
        at(x + 1, y + 3, z),
        at(x, y + 3, z - 1),
        at(x, y + 3, z + 1),
        at(x, y + 4, z),
      ],
    },
  ]
}

/** A young tree: one block of trunk, one of leaves. An orchard is a row of these. */
function sapling(x: number, z: number, y = 0): Stroke[] {
  return [
    { model: WOOD, cells: [at(x, y, z)] },
    { model: TREE, cells: [at(x, y + 1, z)] },
  ]
}

/** A tree on a patch of grass, for worlds whose floor is paving. */
function plantedTree(x: number, z: number): Stroke[] {
  return [{ model: GRASS, cells: area(at(x - 1, -1, z - 1), at(x + 1, -1, z + 1)) }, ...bigTree(x, z)]
}

/**
 * A staircase of solid steps.
 *
 * One block of rise per step, because that is what a hop clears: the character
 * has no step-up, so stairs in a block world are a thing you bounce up, and a
 * two-block riser is a wall. Filled underneath, so they read as masonry and
 * there is nothing to crawl into.
 */
function stairs(
  origin: Cell,
  direction: '+x' | '-x' | '+z' | '-z',
  rise: number,
  width: number,
  tread = 1,
): Cell[] {
  const dx = direction === '+x' ? 1 : direction === '-x' ? -1 : 0
  const dz = direction === '+z' ? 1 : direction === '-z' ? -1 : 0
  const out: Cell[] = []

  for (let step = 0; step < rise; step += 1) {
    for (let t = 0; t < tread; t += 1) {
      const along = step * tread + t
      for (let w = 0; w < width; w += 1) {
        // Across the run, whichever axis that is.
        const x = origin.x + dx * along + dz * w
        const z = origin.z + dz * along + dx * w
        for (let level = 0; level <= step; level += 1) out.push(at(x, origin.y + level, z))
      }
    }
  }
  return out
}

/** A three-by-three striped canopy at `y`, on a post rising from `base`. */
function parasol(x: number, z: number, base: number): Stroke[] {
  const canopy = area(at(x - 1, base + 3, z - 1), at(x + 1, base + 3, z + 1))
  return [
    { model: METAL, cells: extrude([at(x, base + 1, z)], 2) },
    { model: RED, cells: canopy.filter((cell) => (cell.x - x) % 2 === 0) },
    { model: SNOW, cells: canopy.filter((cell) => (cell.x - x) % 2 !== 0) },
  ]
}

/** A striped awning: red and white by column. */
function awning(cells: Cell[]): Stroke[] {
  return [
    { model: RED, cells: cells.filter((cell) => cell.x % 2 === 0) },
    { model: SNOW, cells: cells.filter((cell) => cell.x % 2 !== 0) },
  ]
}

/** A wood table with something on it, and a crate either side to sit on. */
function table(x: number, z: number, dish: string, y = 0): Stroke[] {
  return [
    { model: WOOD, cells: [at(x, y, z)] },
    { model: dish, cells: [at(x, y + 1, z)] },
    { model: CRATE, cells: [at(x - 1, y, z), at(x + 1, y, z)] },
  ]
}

/** A desk: two of wood, a machine on one end, a crate pulled up behind. */
function desk(x: number, z: number, top: string = COMPUTER): Stroke[] {
  return [
    { model: WOOD, cells: [at(x, 0, z), at(x + 1, 0, z)] },
    { model: top, cells: [at(x, 1, z)] },
    { model: CRATE, cells: [at(x, 0, z + 1)] },
  ]
}

// ---------------------------------------------------------------------------
// The starters
// ---------------------------------------------------------------------------

export const STARTERS: readonly Starter[] = [
  {
    id: 'yard',
    name: 'Flat yard',
    hint: 'A 25×25 lawn and nothing else. The empty page.',
    build: () => compose('Flat yard', { cols: 25, rows: 25, model: GRASS, rounded: false }, []),
  },

  {
    id: 'arena',
    name: 'Lava pit arena',
    hint: 'A round wall, a stone island in a ring of lava, four bridges over it, and cover on top.',
    build: () => {
      /*
       * The island is what you fight on; the pit is what you fight *near*.
       *
       * A flat floor inside a wall is a room, and a room is where the person
       * with the longest reach wins. A moat of lava one block down turns the
       * edge into a hazard - knocked back off the island costs you a fifth of a
       * bar every half second until you hop out - and four bridges turn "where
       * are they coming from" into a question worth asking.
       */
      const bridges = [
        area(at(-1, -1, 8), at(1, -1, 12)),
        area(at(-1, -1, -12), at(1, -1, -8)),
        area(at(8, -1, -1), at(12, -1, 1)),
        area(at(-12, -1, -1), at(-8, -1, 1)),
      ].flat()
      const pit = without(without(fill(11, -1), fill(8, -1)), bridges)

      const towers = [at(10, 0, 10), at(10, 0, -11), at(-11, 0, 10), at(-11, 0, -11)]
      const towerFoot = (corner: Cell) =>
        area(at(corner.x, 0, corner.z), at(corner.x + 1, 0, corner.z + 1))

      return compose(
        'Lava pit arena',
        null,
        [
          { model: SAND, cells: without(fill(17, -1), pit) },
          { model: DARK, cells: ring(17, -1) },
          { model: LAVA, cells: raise(pit, -1) },
          { model: STONE, cells: fill(8, -1) },
          { model: DARK, cells: ring(8, -1) },
          { model: STONE, cells: bridges },

          // The wall, a course of dark stone along the top with every other
          // block knocked out, and four towers with a fire on each.
          { model: STONE, cells: roundWall(15, 3) },
          { model: DARK, cells: crenels(raise(roundWall(15, 1), 3)) },
          { model: YELLOW, cells: [at(2, 3, 15), at(-2, 3, 15), at(2, 3, -15), at(-2, 3, -15), at(15, 3, 2), at(15, 3, -2), at(-15, 3, 2), at(-15, 3, -2)] },
          { model: BRICK, cells: towers.flatMap((corner) => extrude(towerFoot(corner), 6)) },
          { model: DARK, cells: towers.flatMap((corner) => raise(towerFoot(corner), 6)) },
          { model: LAVA, cells: towers.map((corner) => at(corner.x, 7, corner.z)) },

          // On the island: four blocks of cover you can double-jump onto, and
          // a plinth in the middle with the prize on it. King of the hill.
          {
            model: DARK,
            cells: [at(4, 0, 4), at(4, 0, -5), at(-5, 0, 4), at(-5, 0, -5)].flatMap((corner) =>
              extrude(area(at(corner.x, 0, corner.z), at(corner.x + 1, 0, corner.z + 1)), 2),
            ),
          },
          { model: STONE, cells: fill(2, 0) },
          { model: GOLD, cells: [at(0, 1, 0)] },
          { model: CHEST, cells: [at(0, 2, 0)] },

          // Round the outside: crates and barrels by the gates, so the ring
          // between the wall and the pit is somewhere to hide rather than a
          // corridor.
          { model: CRATE, cells: [...extrude([at(13, 0, 3)], 2), ...extrude([at(-13, 0, -3)], 2), at(3, 0, -13), at(-3, 0, 13)] },
          { model: BARREL, cells: [at(13, 0, -3), at(-13, 0, 3), at(-3, 0, -13), at(3, 0, 13)] },
        ],
        { position: [26, 22, 30], target: [0, 1, 0] },
        // Inside the south gate, facing the bridge.
        { x: 0, z: 13 },
      )
    },
  },

  {
    id: 'pitch',
    name: 'Football ground',
    hint: 'A walled pitch with goals at both ends, a stand along one side and floodlights.',
    build: () => {
      const goal = (x: number, colour: string): Stroke => ({
        model: colour,
        cells: [
          ...extrude([at(x, 0, -3)], 4),
          ...extrude([at(x, 0, 3)], 4),
          ...area(at(x, 4, -3), at(x, 4, 3)),
        ],
      })
      // Four tiers of seats, each a block higher and two deeper than the last,
      // filled underneath. The wall is three high; the top tier sees over it.
      const tiers = [0, 1, 2, 3].map((tier) => ({
        model: tier % 2 === 0 ? STONE : DARK,
        cells: extrude(area(at(-18, 0, 14 + tier * 2), at(18, 0, 15 + tier * 2)), tier + 1),
      }))
      const mast = (x: number, z: number): Stroke[] => [
        { model: METAL, cells: extrude([at(x, 0, z)], 8) },
        { model: YELLOW, cells: area(at(x - 1, 8, z), at(x + 1, 8, z)) },
      ]

      return compose(
        'Football ground',
        null,
        [
          { model: GRASS, cells: area(at(-24, -1, -15), at(24, -1, 22)) },

          // The lines, painted *into* the floor. A line that stands on the
          // grass is a kerb across the pitch - which is what the first version
          // of this was, and the ball told everybody.
          { model: SNOW, cells: rect(at(-20, -1, -12), at(20, -1, 12)) },
          { model: SNOW, cells: line(at(0, -1, -12), at(0, -1, 12)) },
          { model: SNOW, cells: [...ring(4, -1), at(0, -1, 0)] },
          { model: SNOW, cells: rect(at(-19, -1, -5), at(-14, -1, 5)) },
          { model: SNOW, cells: rect(at(14, -1, -5), at(19, -1, 5)) },

          // The wall: over head height so the ball stays in, the ends in the
          // colour of the side that defends them. One way in, on the stand
          // side, opposite the dugouts.
          {
            model: BRICK,
            cells: extrude(
              rect(at(-21, 0, -13), at(21, 0, 13)).filter(
                (cell) => !(cell.z === 13 && Math.abs(cell.x) <= 1),
              ),
              3,
            ),
          },
          { model: RED, cells: extrude(line(at(-21, 0, -13), at(-21, 0, 13)), 3) },
          { model: BLUE, cells: extrude(line(at(21, 0, -13), at(21, 0, 13)), 3) },
          goal(-19, RED),
          goal(19, BLUE),
          // Corner flags.
          { model: WOOD, cells: [at(-20, 0, -12), at(20, 0, -12), at(-20, 0, 12), at(20, 0, 12)] },
          { model: YELLOW, cells: [at(-20, 1, -12), at(20, 1, -12), at(-20, 1, 12), at(20, 1, 12)] },

          ...tiers,
          ...mast(-23, -14),
          ...mast(23, -14),
          ...mast(-23, 21),
          ...mast(23, 21),

          // The scoreboard, outside the far wall: a dark panel on two posts,
          // red on the left, blue on the right, and nothing in between yet.
          { model: METAL, cells: [...extrude([at(-4, 0, -15)], 3), ...extrude([at(4, 0, -15)], 3)] },
          { model: DARK, cells: area(at(-4, 3, -15), at(4, 5, -15)) },
          { model: RED, cells: [at(-2, 4, -15)] },
          { model: SNOW, cells: [at(0, 4, -15)] },
          { model: BLUE, cells: [at(2, 4, -15)] },
        ],
        { position: [10, 32, 44], target: [0, 0, 2], fov: 46 },
        undefined,
        // The goals, as marks - which is what makes this a pitch a match can be
        // played on the moment it lands in a space, rather than a green
        // rectangle somebody has to stand goals in. Red defends -X.
        [
          { kind: 'red', x: -19, y: 0, z: 0, width: 5, height: 4, facing: 1 },
          { kind: 'blue', x: 19, y: 0, z: 0, width: 5, height: 4, facing: 1 },
        ],
      )
    },
  },

  {
    id: 'square',
    name: 'Market square',
    hint: 'A fountain, four market stalls, a café corner and a clock tower. Somewhere to meet.',
    build: () => {
      const stall = (x0: number, goods: string): Stroke[] => [
        { model: WOOD, cells: area(at(x0, 0, -12), at(x0 + 2, 0, -12)) },
        { model: goods, cells: [at(x0 + 1, 1, -12)] },
        { model: WOOD, cells: [...extrude([at(x0, 0, -13)], 3), ...extrude([at(x0 + 2, 0, -13)], 3)] },
        ...awning(area(at(x0, 3, -13), at(x0 + 2, 3, -12))),
      ]

      return compose(
        'Market square',
        null,
        [
          { model: STONE, cells: area(at(-16, -1, -16), at(16, -1, 16)) },
          // Two paths crossing, and the plaza where they meet.
          { model: DARK, cells: area(at(-1, -1, -16), at(1, -1, 16)) },
          { model: DARK, cells: area(at(-16, -1, -1), at(16, -1, 1)) },
          { model: DARK, cells: fill(6, -1) },
          { model: GRAVEL, cells: ring(6, -1) },

          // The fountain: a stone rim you can sit on, water inside it, and a
          // column in the middle with the spout on top.
          { model: WATER, cells: fill(2, -1) },
          { model: STONE, cells: ring(3, 0) },
          { model: STONE, cells: extrude([at(0, 0, 0)], 2) },
          { model: WATER, cells: [at(0, 2, 0)] },

          ...plantedTree(-13, -5),
          ...plantedTree(13, -5),
          ...plantedTree(13, 5),
          ...plantedTree(-13, 5),
          ...lamp(7, 7),
          ...lamp(-7, 7),
          ...lamp(7, -7),
          ...lamp(-7, -7),
          { model: WOOD, cells: [...area(at(-9, 0, 3), at(-9, 0, 5)), ...area(at(-9, 0, -5), at(-9, 0, -3)), ...area(at(9, 0, 3), at(9, 0, 5)), ...area(at(9, 0, -5), at(9, 0, -3))] },

          // Market along the north side: four stalls under striped awnings.
          ...stall(-11, APPLE),
          ...stall(-5, MELON),
          ...stall(1, HAY_BALE),
          ...stall(7, BOOKS_A),

          // The café, in the south-west corner, under parasols.
          ...table(-13, 12, APPLE),
          ...parasol(-13, 12, 0),
          ...table(-13, 8, MELON),
          ...parasol(-13, 8, 0),
          ...table(-9, 12, APPLE),
          ...parasol(-9, 12, 0),

          // The clock tower, in the south-east: brick to the cap, a face on
          // each side, and a bell under the roof.
          { model: BRICK, cells: extrude(area(at(11, 0, 11), at(13, 0, 13)), 10) },
          { model: DARK, cells: area(at(11, 10, 11), at(13, 10, 13)) },
          { model: SNOW, cells: [at(12, 7, 10), at(12, 7, 14), at(10, 7, 12), at(14, 7, 12)] },
          { model: DARK, cells: [at(11, 11, 11), at(13, 11, 11), at(11, 11, 13), at(13, 11, 13), at(12, 12, 12)] },
          { model: YELLOW, cells: [at(12, 11, 12)] },
        ],
        { position: [24, 18, 28], target: [0, 1, 0] },
        { x: 0, z: 10 },
      )
    },
  },

  {
    id: 'keep',
    name: 'Stone keep',
    hint: 'A moat, a gate, a hall with a gallery round it, stairs up, and four towers.',
    build: () => {
      const moat = without(
        [...square(12, -1), ...square(13, -1)],
        area(at(-1, -1, 12), at(1, -1, 13)),
      )
      const towers = [at(9, 0, 9), at(9, 0, -10), at(-10, 0, 9), at(-10, 0, -10)]
      const towerFoot = (corner: Cell) =>
        area(at(corner.x, 0, corner.z), at(corner.x + 1, 0, corner.z + 1))

      return compose(
        'Stone keep',
        null,
        [
          { model: GRASS, cells: without(area(at(-18, -1, -18), at(18, -1, 18)), moat) },
          { model: WATER, cells: raise(moat, -1) },
          { model: DARK, cells: [...square(10, -1), ...square(11, -1)] },
          { model: STONE, cells: area(at(-1, -1, 12), at(1, -1, 13)) },
          { model: STONE, cells: area(at(-8, -1, -8), at(8, -1, 8)) },
          { model: RED, cells: area(at(-1, -1, -5), at(1, -1, 11)) },

          // The wall, the battlements, and a gallery round the inside at
          // half height - high ground over the hall, reached by two flights
          // of stairs. A keep whose upper floor nobody could get to was the
          // first version of this, and it was a ceiling.
          { model: BRICK, cells: room({ x: -9, z: -9, width: 18, depth: 18, height: 6, door: 'south', windows: false }) },
          { model: DARK, cells: crenels(square(9, 6)) },
          { model: WOOD, cells: [...square(8, 4), ...square(7, 4)] },
          { model: STONE, cells: stairs(at(3, 0, 5), '+x', 4, 2) },
          { model: STONE, cells: stairs(at(-3, 0, -6), '-x', 4, 2) },

          { model: STONE, cells: towers.flatMap((corner) => extrude(towerFoot(corner), 9)) },
          { model: DARK, cells: towers.flatMap((corner) => raise(towerFoot(corner), 9)) },
          { model: LAVA, cells: [at(9, 10, -10), at(-10, 10, 9)] },
          { model: DARK, cells: [...extrude([at(-10, 10, -10)], 2), ...extrude([at(9, 10, 9)], 2)] },
          { model: RED, cells: [at(-9, 11, -10)] },
          { model: BLUE, cells: [at(10, 11, 9)] },
          { model: YELLOW, cells: [at(2, 3, 10), at(-2, 3, 10)] },

          // Inside: a throne on a dais at the far end, the treasury behind
          // it, a smithy in one corner and a well in the other.
          { model: STONE, cells: area(at(-2, 0, -7), at(2, 0, -6)) },
          { model: RED, cells: [at(0, 1, -7)] },
          { model: DARK, cells: [at(0, 2, -7)] },
          { model: CHEST, cells: [at(-2, 0, -8), at(2, 0, -8)] },
          { model: GOLD, cells: [at(0, 0, -8)] },
          { model: ANVIL, cells: [at(6, 0, -6)] },
          { model: BARREL, cells: [at(6, 0, -4), at(5, 0, -8)] },
          { model: CRATE, cells: extrude([at(7, 0, -7)], 2) },
          { model: DARK, cells: area(at(-6, 0, 2), at(-4, 0, 4)).filter((cell) => !(cell.x === -5 && cell.z === 3)) },
          { model: WATER, cells: [at(-5, -1, 3)] },
          { model: HAY_BALE, cells: [at(6, 0, 6), at(7, 0, 6), at(6, 1, 6)] },

          ...bigTree(-16, -16),
          ...bigTree(16, -16),
          ...bigTree(-16, 16),
          ...bigTree(16, 16),
        ],
        { position: [28, 22, 32], target: [0, 3, 0] },
        // Across the moat from the gate.
        { x: 0, z: 15 },
      )
    },
  },

  {
    id: 'island',
    name: 'Floating island',
    hint: 'A plaza and a pool over the void, a pier off one side and a bridge to a campfire off the other.',
    build: () =>
      compose(
        'Floating island',
        // No generated slab: the island is drawn, so it can be round and can
        // have an edge that falls away rather than stopping flat.
        null,
        [
          { model: GRASS, cells: fill(19, -1) },
          // Two courses of dirt under the rim, so the island has a thickness
          // and reads as floating rather than as a decal on the void.
          { model: DIRT, cells: fill(17, -2) },
          { model: DIRT, cells: fill(13, -3) },
          { model: GRAVEL, cells: fill(8, -4) },
          { model: GRAVEL, cells: fill(4, -5) },

          { model: STONE, cells: fill(11, 0) },
          { model: DARK, cells: ring(11, 0) },
          { model: DARK, cells: ring(7, 0) },
          { model: WATER, cells: fill(3, 0) },
          { model: STONE, cells: ring(4, 0) },
          // A lip round the pool, so nobody walks into it without meaning to.
          { model: DARK, cells: ring(4, 1) },

          ...bigTree(-15, -6),
          ...bigTree(14, -9),
          ...bigTree(-9, 14),
          ...bigTree(14, 11),
          { model: TREE, cells: [at(-13, 0, 9), at(11, 0, -14), at(6, 0, 16), at(-16, 0, 2), at(2, 0, -16)] },
          ...lamp(-8, -8, 1),
          ...lamp(8, -8, 1),
          ...lamp(-8, 8, 1),
          ...lamp(8, 8, 1),
          { model: WOOD, cells: [at(-6, 1, -1), at(-6, 1, 0), at(6, 1, -1), at(6, 1, 0)] },

          // A pier off the west side, out over nothing, with a light at the
          // end of it - the place you go to look down.
          { model: WOOD, cells: area(at(-25, -1, -1), at(-19, -1, 1)) },
          ...lamp(-25, 0, 0),

          // And a footbridge off the east to a smaller island with a fire on
          // it. Logs round the fire to sit on; the fire itself one block up,
          // ringed in dark stone, so you have to mean it to stand in it.
          { model: WOOD, cells: area(at(19, -1, -1), at(23, -1, 1)) },
          { model: GRASS, cells: fill(5, -1, 28, 0) },
          { model: DIRT, cells: fill(3, -2, 28, 0) },
          { model: GRAVEL, cells: fill(1, -3, 28, 0) },
          { model: DARK, cells: area(at(27, 0, -1), at(29, 0, 1)) },
          { model: LAVA, cells: [at(28, 0, 0)] },
          { model: WOOD, cells: [...area(at(27, 0, -3), at(29, 0, -3)), ...area(at(27, 0, 3), at(29, 0, 3)), ...area(at(25, 0, -1), at(25, 0, 1)), ...area(at(31, 0, -1), at(31, 0, 1))] },
          { model: CHEST, cells: [at(31, 0, 3)] },
        ],
        { position: [26, 20, 28] },
        // The pier end of the plaza, so arrivals face the pool rather than
        // standing in it.
        { x: 0, z: 9 },
      ),
  },

  {
    id: 'parkour',
    name: 'Parkour tower',
    hint: 'A spiral of pads over lava, up to a lookout with something on it.',
    build: () => {
      const course = parkourSpiral()
      return compose(
        'Parkour tower',
        // No slab: the floor *is* the lava. What is under you is half of what
        // makes a jump a jump - a course over a lawn is a walk you are doing
        // oddly - and a ring of sand round the lava was a ring of safe ground
        // to walk back on.
        null,
        [
          { model: LAVA, cells: fill(6, -1) },
          { model: DARK, cells: ring(6, -1) },

          // The pad you start on, and the course going up.
          { model: DARK, cells: area(at(-3, 0, -3), at(3, 0, 3)) },
          { model: BRICK, cells: course.pads },
          { model: YELLOW, cells: course.checkpoints },
          { model: GREEN, cells: course.finish },

          // The word, stood up behind the tower where you see it from the
          // ground and from every pad on the way up.
          {
            model: RED,
            cells: stampText('JUMP', at(-16, 13, -20), { plane: 'wall', scale: 2, tracking: 2 }),
          },

          // Islets: somewhere for the eye to go that is not the next pad.
          ...islet(-17, 4, -6, 'tree'),
          ...islet(16, 11, 7, 'bush'),
          ...islet(-13, 19, 12, 'tree'),
          ...islet(15, 25, -11, 'bush'),

          ...lamp(-4, 0, -4),
          ...lamp(4, 0, 4),
          { model: CHEST, cells: [at(0, 28, 0)] },
          { model: GIFT, cells: [at(-1, 28, 1), at(1, 28, -1)] },
        ],
        { position: [30, 26, 30], target: [0, 8, 0] },
        { x: 0, z: 0 },
        [
          { kind: 'start', x: 0, y: 1, z: 3, width: 5, height: 3, facing: 0 },
          // On the lookout, where the climb ends. A tower with no finish is a
          // tower you can be first up and have no way to prove it.
          { kind: 'finish', x: 0, y: 28, z: 0, width: 5, height: 3, facing: 0 },
        ],
      )
    },
  },

  {
    id: 'race',
    name: 'Parkour race',
    hint: 'A long run of pads over lava, GO to END. Miss a jump and you start again.',
    build: () => {
      const course = parkourRun()
      return compose(
        'Parkour race',
        // No slab: the floor is lava, end to end. The first version ran over
        // water, on the argument that a first attempt should not be punished -
        // and what that produced was a course nobody had to finish, because a
        // missed jump was a walk back onto the next pad. Lava is the price
        // that makes a pad a pad: you go in, you burn, you start again.
        null,
        [
          { model: LAVA, cells: area(at(-52, -1, -12), at(56, -1, 12)) },
          { model: DARK, cells: rect(at(-52, -1, -12), at(56, -1, 12)) },

          // The two ends: a wide grass platform to stand on before you go, and
          // one to stand on when you are done. Both one block up off the lava,
          // so they read as platforms over it rather than as the far bank.
          { model: GRASS, cells: area(at(-50, 0, -8), at(-36, 0, 8)) },
          { model: GRASS, cells: area(at(36, 0, -8), at(54, 0, 8)) },

          // Said in letters standing at the back of each end, where the camera
          // and the other runners can read them. Eleven and seventeen cells
          // wide, which is why the ends are the size they are.
          {
            model: GREEN,
            cells: stampText('GO', at(-47, 1, -8), { plane: 'wall', tracking: 1 }),
          },
          {
            model: RED,
            cells: stampText('END', at(37, 1, -8), { plane: 'wall', tracking: 1 }),
          },

          { model: BRICK, cells: course.pads },
          { model: YELLOW, cells: course.checkpoints },

          // The line itself, as a pair of posts you run between - the moment
          // that makes a finish a finish rather than a place the pads stop.
          {
            model: RED,
            cells: [...extrude([at(34, 0, -3)], 5), ...extrude([at(34, 0, 3)], 5)],
          },
          { model: RED, cells: area(at(34, 5, -3), at(34, 5, 3)) },
          {
            model: GREEN,
            cells: [...extrude([at(-34, 0, -3)], 5), ...extrude([at(-34, 0, 3)], 5)],
          },
          { model: GREEN, cells: area(at(-34, 5, -3), at(-34, 5, 3)) },

          // A podium at the finish, because a race wants somewhere to stand
          // afterwards - and a chest, because a run wants a reward at the end
          // of it even when the reward is a box.
          { model: STONE, cells: area(at(42, 1, -2), at(42, 1, 2)) },
          { model: STONE, cells: area(at(42, 2, -1), at(42, 2, 1)) },
          { model: GOLD, cells: [at(42, 3, 0)] },
          { model: CHEST, cells: [at(46, 1, 0)] },
          { model: GIFT, cells: [at(46, 1, 2), at(46, 1, -2)] },

          // Scenery, so the run crosses somewhere rather than nowhere.
          ...islet(-20, 9, -14, 'tree'),
          ...islet(6, 12, 15, 'bush'),
          ...islet(24, 8, -15, 'tree'),
          ...lamp(-40, 1, -7),
          ...lamp(-40, 1, 7),
          ...lamp(41, 1, -7),
          ...lamp(41, 1, 7),
          { model: WOOD, cells: [at(-47, 1, 6), at(-46, 1, 6), at(50, 1, 6), at(51, 1, 6)] },
          ...bigTree(-47, -5, 1),
          ...bigTree(51, -5, 1),
          { model: TREE, cells: [at(-44, 1, 7), at(52, 1, 3)] },
        ],
        // Along the run rather than across it, so the card shows the whole race.
        { position: [-6, 34, 58], target: [0, 2, 0], fov: 52 },
        // On the start platform, behind the gate.
        { x: -41, z: 0 },
        // In the gates, so running through the posts is what starts and ends
        // the race rather than something you do beside it.
        [
          { kind: 'start', x: -34, y: 0, z: 0, width: 6, height: 5, facing: 1 },
          { kind: 'finish', x: 34, y: 0, z: 0, width: 6, height: 5, facing: 1 },
        ],
      )
    },
  },

  {
    id: 'village',
    name: 'Village green',
    hint: 'Four cottages round a green, a well, a pond, an orchard and a windmill.',
    build: () => {
      const pond = fill(3, -1, -13, 5)
      const sails: Cell[] = [at(13, 5, 3)]
      for (let d = 1; d <= 3; d += 1) {
        sails.push(at(13, 5 + d, 3 + d), at(13, 5 - d, 3 - d), at(13, 5 + d, 3 - d), at(13, 5 - d, 3 + d))
      }
      const fence = square(7, 0).filter((cell) => Math.abs(cell.x) > 1 && Math.abs(cell.z) > 1)

      return compose(
        'Village green',
        null,
        [
          { model: GRASS, cells: without(area(at(-20, -1, -20), at(20, -1, 20)), pond) },
          // The paths first, so the houses sit on top of them where they cross.
          { model: GRAVEL, cells: [...area(at(-19, -1, -1), at(19, -1, 1)), ...area(at(-1, -1, -19), at(1, -1, 19))] },
          { model: STONE, cells: fill(4, -1) },
          // The well: a ring two high, and water you can see down into.
          { model: DARK, cells: [...ring(2, 0), ...ring(2, 1)] },
          { model: WATER, cells: fill(1, -1) },
          // A low fence round the green, open where the paths cross it. One
          // block: a thing you hop, not a thing that keeps you out.
          { model: WOOD, cells: fence },

          { model: WOOD, cells: [...cottage(-12, -12), ...cottage(9, -12), ...cottage(-12, 9), ...cottage(9, 9)].filter((cell) => cell.y < 4) },
          { model: BRICK, cells: [...cottage(-12, -12), ...cottage(9, -12), ...cottage(-12, 9), ...cottage(9, 9)].filter((cell) => cell.y >= 4) },
          // Somebody lives in each of them.
          { model: CHEST, cells: [at(-8, 0, -10)] },
          { model: BOOKS_A, cells: [at(-10, 0, -10)] },
          { model: HAY_BALE, cells: [at(11, 0, -10), at(12, 0, -10), at(11, 1, -10)] },
          { model: BARREL, cells: [at(14, 0, -8)] },
          { model: WOOD, cells: [at(-8, 0, 12)] },
          { model: APPLE, cells: [at(-8, 1, 12)] },
          { model: CRATE, cells: [at(-10, 0, 13)] },
          { model: BOOKS_B, cells: [at(12, 0, 12)] },
          { model: MELON, cells: [at(14, 0, 13)] },

          ...lamp(5, 5, 0, WOOD),
          ...lamp(-5, 5, 0, WOOD),
          ...lamp(5, -5, 0, WOOD),
          ...lamp(-5, -5, 0, WOOD),
          { model: WOOD, cells: [at(-6, 0, 3), at(-6, 0, 4), at(6, 0, -4), at(6, 0, -3)] },
          ...bigTree(-17, -4),
          ...bigTree(17, 4),
          ...bigTree(4, -17),
          ...bigTree(-4, 17),
          { model: TREE, cells: [at(-11, 0, -5), at(-7, 0, -5), at(10, 0, 8), at(14, 0, 8)] },

          // The pond, a block down with a sandy edge.
          { model: WATER, cells: raise(pond, -1) },
          { model: SAND, cells: ring(4, -1, -13, 5) },

          // The windmill: a brick tower with a cap, and sails crossing on the
          // face that looks over the green.
          { model: BRICK, cells: extrude(area(at(14, 0, 2), at(16, 0, 4)), 7) },
          { model: DARK, cells: area(at(14, 7, 2), at(16, 7, 4)) },
          { model: WOOD, cells: sails },
          { model: DARK, cells: [at(13, 5, 3)] },
          { model: HAY_BALE, cells: [at(14, 0, 6), at(15, 0, 6), at(14, 1, 6)] },
          { model: CRATE, cells: [at(17, 0, 6)] },

          // An orchard behind the north-east cottage.
          ...sapling(11, -16),
          ...sapling(14, -16),
          ...sapling(17, -16),
          ...sapling(11, -19),
          ...sapling(14, -19),
          ...sapling(17, -19),
        ],
        { position: [28, 22, 32] },
        { x: 0, z: 9 },
      )
    },
  },

  {
    id: 'bank',
    name: 'The money house',
    hint: 'Marble, columns, teller windows, and a vault with the gold still in it.',
    build: () =>
      compose(
        'The money house',
        null,
        [
          { model: STONE, cells: area(at(-16, -1, -14), at(16, -1, 14)) },
          // The floor, in two tones, so the hall reads as laid rather than as
          // the ground happening to be stone.
          { model: DARK, cells: area(at(-11, -1, -9), at(11, -1, 9)) },
          { model: STONE, cells: area(at(-9, -1, -7), at(9, -1, 7)) },
          // A red runner from the door to the counter. One stroke, and the hall
          // stops being a grey box and starts having a direction.
          { model: RED, cells: area(at(-1, -1, 0), at(1, -1, 12)) },

          { model: STONE, cells: room({ x: -12, z: -10, width: 24, depth: 20, height: 4, door: 'south' }) },
          // Columns either side of the door, and along the hall. A bank is
          // columns; take them away and this is a warehouse with money in it.
          {
            model: STONE,
            cells: [-9, -3, 3, 9].flatMap((x) => [
              ...extrude([at(x, 0, -8)], 6),
              ...extrude([at(x, 0, 8)], 6),
            ]),
          },

          // The vault: a room within the room, walled in dark stone, with the
          // door standing open and the gold visible through it. The back wall
          // is a rack of safety-deposit frames.
          { model: DARK, cells: room({ x: -11, z: -9, width: 8, depth: 7, height: 5, door: 'east', windows: false }) },
          { model: FRAME, cells: area(at(-10, 1, -9), at(-4, 2, -9)) },
          { model: GOLD, cells: area(at(-10, 0, -8), at(-7, 0, -6)) },
          { model: GOLD, cells: area(at(-10, 1, -8), at(-9, 1, -7)) },
          { model: VAULT, cells: [at(-9, 0, -3)] },
          { model: CHEST, cells: [at(-5, 0, -8), at(-5, 0, -4)] },

          // The counter: dark stone with a register on it at each end, and
          // glass above it between them - teller windows - open at the end
          // for the staff to get through.
          { model: DARK, cells: area(at(1, 0, -2), at(8, 0, -2)) },
          { model: COMPUTER, cells: [at(3, 1, -2), at(7, 1, -2)] },
          { model: GLASS, cells: extrude([at(1, 1, -2), at(2, 1, -2), at(4, 1, -2), at(5, 1, -2), at(6, 1, -2), at(8, 1, -2)], 2) },
          { model: CRATE, cells: [at(3, 0, -4), at(7, 0, -4)] },

          // The waiting side: benches, plants, a bin.
          { model: WOOD, cells: [at(2, 0, 5), at(3, 0, 5), at(7, 0, 5), at(8, 0, 5)] },
          { model: TREE, cells: [at(10, 0, -6), at(10, 0, 6)] },
          { model: TRASHCAN, cells: [at(-10, 0, 8)] },
          ...lamp(-3, 0, 11),
          ...lamp(3, 0, 11),

          // Said on the roof line, in gold, facing the street.
          { model: YELLOW, cells: stampText('BANK', at(-11, 4, -10), { plane: 'wall', tracking: 1 }) },
        ],
        { position: [26, 22, 30], target: [0, 2, 0] },
        // Outside the front door, so you walk in rather than appear behind the
        // counter.
        { x: 0, z: 13 },
      ),
  },

  {
    id: 'restaurant',
    name: 'The corner restaurant',
    hint: 'Six tables, a kitchen with the oven lit, and a terrace under parasols.',
    build: () =>
      compose(
        'The corner restaurant',
        null,
        [
          { model: GRAVEL, cells: area(at(-16, -1, -16), at(16, -1, 16)) },
          { model: BRICK_B, cells: room({ x: -11, z: -11, width: 20, depth: 16, height: 4, door: 'south' }) },
          { model: WOOD, cells: area(at(-10, -1, -10), at(8, -1, 4)) },

          // The kitchen, behind a pass you can see over - which is the whole
          // reason to put a kitchen in a world. The hob and the oven mouth
          // are lava, which is the one block that looks lit.
          { model: STONE, cells: area(at(-10, -1, -10), at(-4, -1, -5)) },
          { model: STONE, cells: area(at(-10, 0, -4), at(-5, 0, -4)) },
          { model: MELON, cells: [at(-8, 1, -4)] },
          { model: APPLE, cells: [at(-6, 1, -4)] },
          { model: METAL, cells: [at(-9, 0, -9)] },
          { model: LAVA, cells: [at(-9, 1, -9)] },
          { model: BRICK, cells: extrude(area(at(-7, 0, -9), at(-5, 0, -9)), 3) },
          { model: LAVA, cells: [at(-6, 0, -9)] },
          { model: METAL, cells: extrude([at(-4, 0, -9)], 2) },
          { model: WOOD, cells: [at(-8, 0, -6), at(-7, 0, -6)] },
          { model: MELON, cells: [at(-7, 1, -6)] },
          { model: APPLE, cells: [at(-8, 1, -6)] },
          { model: BARREL, cells: [at(-10, 0, -6)] },

          // The dining room: three pairs of tables, laid.
          ...table(-7, 0, APPLE),
          ...table(-2, 0, MELON),
          ...table(3, 0, APPLE),
          ...table(-7, 3, MELON),
          ...table(-2, 3, APPLE),
          ...table(3, 3, MELON),
          { model: TREE, cells: [at(7, 0, -9), at(7, 0, 3)] },

          // The terrace, outside the door, under parasols. Somewhere to stand
          // when the room is full.
          { model: STONE, cells: area(at(-8, -1, 7), at(6, -1, 12)) },
          ...table(-6, 9, APPLE),
          ...parasol(-6, 9, 0),
          ...table(-1, 9, MELON),
          ...parasol(-1, 9, 0),
          ...table(4, 9, APPLE),
          ...parasol(4, 9, 0),
          ...awning(area(at(-4, 3, 6), at(2, 3, 7))),
          { model: RED, cells: stampText('EAT', at(-9, 4, -11), { plane: 'wall', tracking: 1 }) },
          ...bigTree(-13, 10),
          ...bigTree(11, 10),
        ],
        { position: [24, 20, 30], target: [0, 2, 0] },
        { x: 0, z: 14 },
      ),
  },

  {
    id: 'school',
    name: 'The little school',
    hint: 'A classroom with a board and rows of desks, a yard with goals in it, and a pyramid to be king of.',
    build: () =>
      compose(
        'The little school',
        null,
        [
          { model: GRASS, cells: area(at(-18, -1, -16), at(18, -1, 18)) },
          { model: BRICK, cells: room({ x: -14, z: -12, width: 20, depth: 16, height: 4, door: 'south' }) },
          { model: WOOD, cells: area(at(-13, -1, -11), at(5, -1, 3)) },

          // The board, which is what makes a room a classroom, and the teacher's
          // table in front of it.
          { model: GREEN, cells: area(at(-11, 2, -12), at(-4, 3, -12)) },
          { model: WOOD, cells: [at(-8, 0, -10), at(-7, 0, -10)] },
          { model: BOOKS_A, cells: [at(-8, 1, -10)] },
          { model: APPLE, cells: [at(-7, 1, -10)] },
          { model: CRATE, cells: [at(-8, 0, -11)] },

          // Three rows of two desks, a crate behind each, all facing the board -
          // a classroom whose chairs face the wrong way reads as a jumble sale.
          ...desk(-10, -6, BOOKS_B),
          ...desk(-5, -6, BOOKS_A),
          ...desk(-10, -3, BOOKS_A),
          ...desk(-5, -3, COMPUTER),
          ...desk(-10, 0, COMPUTER),
          ...desk(-5, 0, BOOKS_B),
          { model: TREE, cells: [at(3, 0, -10), at(3, 0, 2)] },
          { model: TRASHCAN, cells: [at(-2, 0, 5)] },

          // The yard: a hard court with a little pitch painted on it and a
          // goal at each end, benches at the edge, and trees for the corner
          // nobody plays in.
          { model: GRAVEL, cells: area(at(-9, -1, 6), at(9, -1, 16)) },
          { model: SNOW, cells: rect(at(-7, -1, 7), at(7, -1, 15)) },
          { model: SNOW, cells: area(at(-7, -1, 11), at(7, -1, 11)) },
          { model: SNOW, cells: ring(2, -1, 0, 11) },
          { model: RED, cells: [...extrude([at(-2, 0, 7)], 2), ...extrude([at(2, 0, 7)], 2), ...area(at(-2, 2, 7), at(2, 2, 7))] },
          { model: BLUE, cells: [...extrude([at(-2, 0, 15)], 2), ...extrude([at(2, 0, 15)], 2), ...area(at(-2, 2, 15), at(2, 2, 15))] },
          { model: WOOD, cells: [at(-8, 0, 5), at(-7, 0, 5), at(7, 0, 5), at(8, 0, 5)] },
          ...lamp(-10, 5),
          ...lamp(10, 5),
          ...bigTree(-15, 12),
          ...bigTree(16, 5),

          // A stepped pyramid beside the yard, with a present on top. Three
          // hops up, and whoever is on it is king of it.
          { model: STONE, cells: [...area(at(11, 0, 10), at(15, 0, 14)), ...area(at(12, 1, 11), at(14, 1, 13)), at(13, 2, 12)] },
          { model: GIFT, cells: [at(13, 3, 12)] },

          // The flagpole by the door.
          { model: METAL, cells: extrude([at(-13, 0, 6)], 6) },
          { model: YELLOW, cells: [at(-12, 5, 6), at(-11, 5, 6)] },
        ],
        { position: [26, 22, 32], target: [0, 2, 2] },
        // Just outside the classroom door, between the bench and the bin.
        { x: -4, z: 5 },
        // Goals in the yard, so the lunch-break kickabout is a match.
        [
          { kind: 'red', x: 0, y: 0, z: 7, width: 3, height: 2, facing: 0 },
          { kind: 'blue', x: 0, y: 0, z: 15, width: 3, height: 2, facing: 0 },
        ],
      ),
  },

  {
    id: 'office',
    name: 'The office floor',
    hint: 'Desks with machines on, a glass meeting room, a server rack, a couch nobody sits on, and plants.',
    build: () =>
      compose(
        'The office floor',
        null,
        [
          { model: DARK, cells: area(at(-17, -1, -15), at(17, -1, 15)) },
          { model: FRAME, cells: room({ x: -13, z: -11, width: 24, depth: 20, height: 4, door: 'south' }) },
          { model: WOOD, cells: area(at(-12, -1, -10), at(10, -1, 8)) },

          // The meeting room: a glass box in the corner, waist-high so it is a
          // room you can see people being serious in. A whiteboard on the
          // back wall, a table, crates round it.
          { model: GLASS, cells: room({ x: -12, z: -10, width: 9, depth: 8, height: 2, door: 'east' }) },
          { model: SNOW, cells: area(at(-10, 1, -11), at(-6, 2, -11)) },
          { model: WOOD, cells: area(at(-9, 0, -6), at(-7, 0, -6)) },
          { model: COMPUTER, cells: [at(-8, 1, -6)] },
          { model: CRATE, cells: [at(-10, 0, -6), at(-6, 0, -6), at(-9, 0, -8), at(-7, 0, -8), at(-9, 0, -4), at(-7, 0, -4)] },

          // Six desks in three rows, each with a machine on it and a crate
          // pulled up behind.
          ...desk(0, -6),
          ...desk(5, -6),
          ...desk(0, -1),
          ...desk(5, -1),
          ...desk(0, 4),
          ...desk(5, 4),

          // The corner nobody uses, which every office has and which is the
          // detail that makes this one read as real.
          { model: RUG, cells: area(at(5, -1, 4), at(9, -1, 8)) },
          { model: COUCH, cells: area(at(6, 0, 7), at(8, 0, 7)) },
          { model: WOOD, cells: [at(7, 0, 5)] },
          { model: BOOKS_A, cells: [at(7, 1, 5)] },

          // The kitchen counter: a machine, a cooler, a bowl of apples.
          { model: DARK, cells: area(at(-12, 0, 7), at(-9, 0, 7)) },
          { model: METAL, cells: [at(-11, 1, 7)] },
          { model: GLASS, cells: [at(-12, 1, 7)] },
          { model: APPLE, cells: [at(-9, 1, 7)] },

          // The server rack, with the batteries on top and the pipe that
          // goes nowhere.
          { model: FRAME, cells: extrude([at(9, 0, -6), at(9, 0, -5)], 2) },
          { model: BATTERY, cells: [at(9, 2, -6), at(9, 2, -5)] },
          { model: PIPE, cells: [at(9, 0, -4)] },
          { model: DARK, cells: [at(9, 0, 0)] },
          { model: COMPUTER, cells: [at(9, 1, 0)] },

          { model: TREE, cells: [at(-2, 0, 7), at(9, 0, -9), at(2, 0, -9)] },
          { model: BLUE, cells: stampText('HQ', at(-6, 4, -11), { plane: 'wall', tracking: 1 }) },
          ...lamp(-4, 10),
          ...lamp(2, 10),
          ...bigTree(-15, 12),
          ...bigTree(13, 12),
        ],
        { position: [26, 22, 30], target: [0, 2, 0] },
        { x: -1, z: 13 },
      ),
  },
] as const

/**
 * The pads of the two courses, in the order they are jumped.
 *
 * Exported for the test that checks every hop can actually be made. That test
 * is the reason the courses are generated at all rather than drawn: a route is
 * a claim about the character controller, and a claim is a thing that should
 * fail in CI rather than in front of somebody standing on a pad they cannot
 * leave.
 */
export function starterRoutes(): Record<'parkour' | 'race', Cell[]> {
  return { parkour: parkourSpiral().route, race: parkourRun().route }
}

export function findStarter(id: string): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id)
}

/**
 * The tower: a spiral of pads climbing to a lookout.
 *
 * The other half of the pair with `parkourRun` below, and they are deliberately
 * different exercises. A spiral is a *climb* - you go up, alone, and the reward
 * is height. A line is a race - you go along, beside somebody, and the reward
 * is being first. Same jump physics, two entirely different rooms.
 *
 * Every pad rises exactly one block and the gaps are three, which a plain jump
 * clears with room to spare. Every fifth is a checkpoint in another colour, so
 * a climb has landmarks and somebody watching from the ground can say how far
 * up you are.
 */
function parkourSpiral(): {
  pads: Cell[]
  checkpoints: Cell[]
  finish: Cell[]
  /** The pad anchors in the order they are jumped, so a test can check the hops. */
  route: Cell[]
} {
  const pads: Cell[] = []
  const checkpoints: Cell[] = []
  const route: Cell[] = []
  const steps = 26
  /*
   * Four, not eight.
   *
   * At radius eight the chord between two pads an eighth of a turn apart is
   * 6.1 cells, and a walking jump that has to land one block higher covers
   * 3.4 (see `jumpReach`). So the tower looked like a course and was not one:
   * the first coloured pad was simply unreachable. The radius is what fixes it,
   * because the rise is what makes it a climb.
   */
  const radius = 4

  for (let step = 0; step < steps; step += 1) {
    // Just under a full turn every eight pads, so the spiral drifts round the
    // tower rather than stacking one pad directly over another.
    const angle = (step / 8) * Math.PI * 2
    const x = round(Math.cos(angle) * radius)
    const z = round(Math.sin(angle) * radius)
    const y = step + 1

    const pad = [
      { x, y, z },
      { x: x + 1, y, z },
      { x, y, z: z + 1 },
      { x: x + 1, y, z: z + 1 },
    ]

    if (step > 0 && step % 5 === 0) checkpoints.push(...pad)
    else pads.push(...pad)
    route.push({ x, y, z })
  }

  /*
   * The lookout on top, wide enough to stand about on and see what you climbed.
   *
   * One block above the last pad, and *over* it rather than at the middle of
   * the tower: the last pad is out on the spiral, so a lookout centred on the
   * origin made the final hop a diagonal 4.2 - the one jump on the whole tower
   * nobody could make. It reaches out to meet the climber instead.
   */
  const top = steps + 1
  const last = route[route.length - 1] ?? { x: 0, y: top, z: 0 }
  route.push({ x: last.x, y: top, z: last.z })
  return {
    pads,
    checkpoints,
    // Spanning the middle *and* the top of the spiral, so it is both a platform
    // you land on and a place to stand.
    finish: area(at(Math.min(-2, last.x - 1), top, Math.min(-2, last.z - 1)), at(Math.max(2, last.x + 1), top, Math.max(2, last.z + 1))),
    route,
  }
}

/**
 * The run: pads from one bank to the other, and where it changes colour.
 *
 * Horizontal rather than a tower, and that is the whole difference between a
 * climb and a *race*: a spiral is somewhere you go up, a line is somewhere you
 * go along - and going along is a thing two people can do at the same time and
 * compare. It also means the finish is visible from the start, which is what
 * makes anybody set off.
 *
 * Sized against the character controller rather than by eye. A plain jump peaks
 * at about 1.4 blocks and carries you six or so forward at a walk (see
 * `@/domain/lounge/jump`), so no pad is ever more than one block above the last
 * and the gaps run from three to five - three anybody makes, five is a run-up.
 * The rhythm is deliberate: the gaps grow, then ease off, then grow again, so
 * the run has a shape instead of being a metronome.
 *
 * Every fifth pad is a checkpoint in another colour: landmarks to call out, and
 * a way to say how far somebody got when they went in the water.
 */
function parkourRun(): { pads: Cell[]; checkpoints: Cell[]; route: Cell[] } {
  const pads: Cell[] = []
  const checkpoints: Cell[] = []
  const route: Cell[] = []
  /** The last pad's z, so a rising hop can go straight rather than diagonally. */
  let lastZ = 0

  // The gaps, in order. Written out rather than generated because this is the
  // difficulty curve, and a curve you cannot read is a curve nobody can tune.
  /*
   * Three and four, never five.
   *
   * A walking jump covers 4.5 cells level and 3.4 when it has to land a block
   * higher (`jumpReach`), and the weave below adds up to a cell of sideways
   * distance on top of the gap - so a five was a hop that only a sprinting
   * player could make from a two-cell pad, which is to say nobody.
   */
  const gaps = [3, 3, 4, 3, 4, 4, 3, 3, 4, 3, 4, 3, 3, 4, 4, 3, 4, 3, 3, 3]

  let x = -32
  let index = 0

  for (const gap of gaps) {
    /*
     * A gentle weave, and a height that steps up every fourth pad.
     *
     * The weave is held still across a rising hop - `z` repeats the previous
     * pad's - because a rising jump reaches 3.4 cells and a sideways cell on
     * top of a three-cell gap is 3.2 before you have missed the middle of the
     * pad. Straight ahead when you are going up, sideways when you are not.
     */
    const rising = index % 4 === 3
    const z = rising ? lastZ : round(Math.sin(index / 2) * 2)
    const y = 1 + (rising ? 1 : 0)
    lastZ = z

    // 2x2, because a one-block pad is a landing nobody makes.
    const pad = [
      { x, y, z },
      { x: x + 1, y, z },
      { x, y, z: z + 1 },
      { x: x + 1, y, z: z + 1 },
    ]

    if (index > 0 && index % 5 === 0) checkpoints.push(...pad)
    else pads.push(...pad)
    route.push({ x, y, z })

    // A hop that has to climb gets the short gap, whatever the curve said: a
    // walking jump covers 4.5 cells level and 3.4 rising, so a four with a step
    // up in it is the one hop on the run that cannot be made.
    const climbing = (index + 1) % 4 === 3
    x += climbing ? Math.min(gap, 3) : gap
    index += 1
  }

  return { pads, checkpoints, route }
}

/**
 * One cottage: four walls, a doorway and a pitched roof, at a corner.
 *
 * Returned as cells rather than as a world so the caller can split it by
 * height - walls in one material, roof in another - which is the whole
 * difference between a house and a box.
 */
function cottage(x: number, z: number): Cell[] {
  const out: Cell[] = []
  const width = 7
  const depth = 6

  // Walls, with a gap left for the door on the side facing the green.
  for (const cell of extrude(rect(at(x, 0, z), at(x + width, 0, z + depth)), 4)) {
    const doorway =
      cell.y < 3 &&
      cell.z === (z > 0 ? z : z + depth) &&
      Math.abs(cell.x - (x + Math.floor(width / 2))) <= 0
    if (!doorway) out.push(cell)
  }

  // Windows: a course of gaps at head height on the two long sides, so a
  // cottage reads as somewhere with people in it rather than as a shed.
  const windows = new Set<string>()
  for (const dx of [2, width - 2]) {
    windows.add(`${x + dx},2,${z}`)
    windows.add(`${x + dx},2,${z + depth}`)
  }

  /*
   * A pitched roof: each course one cell narrower on all four sides, so it
   * steps up to a ridge. Filled rather than an outline - a ring of blocks per
   * course is a roof with a hole down the middle of it, which is invisible from
   * the ground and obvious the moment anybody flies.
   *
   * The first course overhangs the walls by one, which is the eave, and the
   * thing that makes a stepped roof read as a roof.
   */
  for (let course = 0; course < 4; course += 1) {
    const y = 4 + course
    out.push(
      ...area(
        at(x - 1 + course, y, z - 1 + course),
        at(x + width + 1 - course, y, z + depth + 1 - course),
      ),
    )
  }

  // A chimney, off to one side of the ridge. Two blocks, and worth every one:
  // it is the detail that stops four identical roofs reading as a warehouse.
  out.push({ x: x + 2, y: 7, z: z + 2 }, { x: x + 2, y: 8, z: z + 2 })

  return out.filter((cell) => !windows.has(`${cell.x},${cell.y},${cell.z}`))
}

/**
 * A small island hanging in the air, with something growing on it.
 *
 * Five cells square, which is enough to read as land from across the tower
 * and small enough that four of them cost nothing. Deliberately out of reach
 * of the course: they are scenery, and a player who lands on one has found a
 * shortcut rather than a feature.
 */
function islet(x: number, y: number, z: number, plant: 'tree' | 'bush'): Stroke[] {
  return [
    { model: GRASS, cells: area(at(x - 2, y, z - 2), at(x + 2, y, z + 2)) },
    { model: DIRT, cells: area(at(x - 1, y - 1, z - 1), at(x + 1, y - 1, z + 1)) },
    ...(plant === 'tree' ? bigTree(x, z, y + 1) : [{ model: TREE, cells: [at(x, y + 1, z)] }]),
  ]
}

/**
 * Four walls, a floor's worth of footprint, a doorway and windows.
 *
 * Every building in here is the same shape underneath - a box you can walk into
 * and see into - so it is one function rather than four nearly-identical loops.
 * What differs between a bank and a school is entirely what is *inside* it.
 *
 * No roof, deliberately. These worlds are looked at from above as often as they
 * are stood in - the catalogue card is a three-quarter view - and a lid turns
 * every interior into a grey rectangle. It also makes them pleasant to build
 * on: somebody forking the school can see what they are rearranging.
 */
function room(opts: {
  /** The minimum corner. */
  x: number
  z: number
  width: number
  depth: number
  height: number
  door?: 'north' | 'south' | 'east' | 'west'
  /** Openings at head height along the long sides. On by default. */
  windows?: boolean
}): Cell[] {
  const { x, z, width, depth, height, door = 'south', windows = true } = opts
  const maxX = x + width
  const maxZ = z + depth
  const midX = Math.round(x + width / 2)
  const midZ = Math.round(z + depth / 2)

  const isDoor = (cell: Cell) => {
    if (cell.y > 2) return false
    // Two cells wide: one is a gap you sidle through, and the character
    // controller has a radius.
    if (door === 'south') return cell.z === maxZ && Math.abs(cell.x - midX) <= 1
    if (door === 'north') return cell.z === z && Math.abs(cell.x - midX) <= 1
    if (door === 'east') return cell.x === maxX && Math.abs(cell.z - midZ) <= 1
    return cell.x === x && Math.abs(cell.z - midZ) <= 1
  }

  // Every third cell, at head height, and never in a corner - a window in the
  // corner of a box reads as a missing block.
  const isWindow = (cell: Cell) =>
    windows &&
    cell.y === 2 &&
    cell.x > x &&
    cell.x < maxX &&
    cell.z > z &&
    cell.z < maxZ &&
    (cell.x - x) % 3 === 0 !== ((cell.z - z) % 3 === 0)

  return extrude(rect(at(x, 0, z), at(maxX, 0, maxZ)), height).filter(
    (cell) => !isDoor(cell) && !isWindow(cell),
  )
}
