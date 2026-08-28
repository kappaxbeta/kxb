import { planDemoWorld } from '@/domain/lounge/demo-world'
import { DEFAULT_WORLD_SIZE } from '@/domain/lounge/events'
import type { BlockPlacement } from '@/domain/lounge/events'
import { DEFAULT_GROUND_MODEL } from '@/domain/lounge/palette'
import { type PitchGoal, planPitch } from '@/domain/lounge/pitch'

/**
 * The worlds you can start from, as a file rather than as rows.
 *
 * A template is a *recipe*, not a saved world: an id, a name, and a pure
 * function that returns the blocks and goals to lay. So there is nothing to
 * migrate, nothing to seed, and nothing to go missing on a fresh database -
 * every space has the same starting worlds the moment the code ships, and
 * adding a fourth is adding an entry below.
 *
 * The drawing on the card is *not* here - it is in
 * `app/world/lounge/template-marks`, keyed by the same id. That split is what
 * keeps this file plain data: `findTemplate` is called from Server Actions, and
 * they have no business loading React to lay some blocks.
 *
 * That is the whole reason this is a file and not a table. The alternative -
 * a `world_templates` table with a JSON blob of blocks in it - would need a
 * migration per template, could differ between local and production, and would
 * still not let the picker draw an icon. Here the catalogue *is* the source, it
 * is typechecked, and the planners are pure enough to test without a database
 * (see ./templates.test.ts).
 *
 * The trade this accepts: a template can only be changed by deploying. That is
 * correct for what these are - the handful of grounds everybody starts from -
 * and a world somebody wants to keep and edit is a battlefield, which *is* a
 * row, saved from the lounge once it has been built in.
 *
 * Both halves of the app import this. The planners must therefore stay free of
 * `node:crypto` and `server-only` - same rule ./streams.ts explains - which is
 * why they return plain data and the writing happens in actions.ts.
 */

export interface TemplatePlan {
  blocks: BlockPlacement[]
  /** Goals to stand once the blocks are down. Empty for grounds without them. */
  goals: PitchGoal[]
}

/**
 * The grounds, by id.
 *
 * A union rather than `string`, so that the picker's dictionary can be keyed on
 * it: adding a ground without writing its two sentences in both languages is a
 * type error here, rather than an English card appearing in the middle of a
 * German panel. The ids themselves are still what a client sends and what a
 * derived world id is built from, so they are as stable as they were.
 */
export const WORLD_TEMPLATE_IDS = [
  'pitch',
  'race',
  'cage',
  'club',
  'living-room',
  'demo-island',
  'flats',
] as const

export type WorldTemplateId = (typeof WORLD_TEMPLATE_IDS)[number]

export interface WorldTemplate {
  /** Stable across deploys: it is what a client sends and what a derived world id is built from. */
  id: WorldTemplateId
  /** The English name. The picker inside a space prints its own translation. */
  name: string
  /** One line, shown under the name in the picker. */
  blurb: string
  /** Whether a match played here has goals to score in. Drives the battle lobby's default. */
  football: boolean
  /**
   * Whether it comes with a start and a finish, so a race can be run on it.
   *
   * Its own flag rather than `football: true` with a different meaning, because
   * the two drive different things: `football` decides what the lobby defaults
   * a match to, and this decides whether the race mode has anywhere to go. A
   * ground could honestly be both one day - a pitch you race around - and one
   * boolean could not say so.
   */
  race?: boolean
  plan: () => TemplatePlan
}

/** What a space gets offered first, and what a match is set on unless it says otherwise. */
export const DEFAULT_TEMPLATE_ID = 'pitch'

/**
 * A flat floor and nothing else.
 *
 * The blank page. This is the old "reset the world" button expressed as a
 * template, which is the point of having templates at all: wiping the world and
 * laying a pitch were two separate buttons doing the same destructive thing
 * with a different payload, and they were both hidden at the bottom of a
 * scrolling panel where nobody on a phone ever found them.
 */
function planFlats(): TemplatePlan {
  const min = -Math.floor(DEFAULT_WORLD_SIZE / 2)
  const max = min + DEFAULT_WORLD_SIZE - 1

  const blocks: BlockPlacement[] = []
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      blocks.push({ x, y: 0, z, model: DEFAULT_GROUND_MODEL })
    }
  }

  return { blocks, goals: [] }
}

/** How far the cage's wall stands from the middle, in cells. */
const CAGE_RADIUS = 14
/** Over head height, like the pitch's - you cannot hop out of a duel. */
const CAGE_WALL_HEIGHT = 4

const CAGE_FLOOR = 'stone'
const CAGE_RING = 'colored_block_red'
const CAGE_WALL = 'bricks_A'

/**
 * A round walled pit, for fighting in.
 *
 * The counterpart to the pitch: no goals, no ball, no ends - just a boundary
 * everybody can see and nowhere to run to. Round rather than square because a
 * square arena has four corners to be cornered in, and the whole appeal of a
 * duelling ground is that every direction is the same.
 *
 * A disc, not a ring: `<=` on the radius fills it. The wall is the shell of
 * cells whose distance rounds to exactly the radius, which is the same test the
 * pitch's centre circle uses - so both agree about what a circle of blocks is.
 */
function planCage(): TemplatePlan {
  const blocks: BlockPlacement[] = []

  for (let x = -CAGE_RADIUS; x <= CAGE_RADIUS; x++) {
    for (let z = -CAGE_RADIUS; z <= CAGE_RADIUS; z++) {
      const distance = Math.hypot(x, z)
      if (distance > CAGE_RADIUS) continue

      // The inner ring is painted, so "get back in the middle" is a thing that
      // can be said. Cosmetic - nothing reads it.
      const inner = Math.round(distance) === CAGE_RADIUS - 5
      blocks.push({ x, y: 0, z, model: inner ? CAGE_RING : CAGE_FLOOR })

      if (Math.round(distance) === CAGE_RADIUS) {
        for (let y = 1; y <= CAGE_WALL_HEIGHT; y++) {
          blocks.push({ x, y, z, model: CAGE_WALL })
        }
      }
    }
  }

  return { blocks, goals: [] }
}

/**
 * A room, as four walls with a gap in one of them.
 *
 * Shared by the club and the living room, which are both "an inside" and were
 * otherwise going to grow two copies of the same nested loop with the same
 * off-by-one in the doorway. Takes the span rather than a radius because a room
 * is a rectangle: the two grounds above are round or square by nature, and a
 * hall that had to be square would be a corridor or a cube.
 *
 * The door is a gap in the +z wall, centred, and it is a *gap* rather than a
 * frame - there is no door model in the palette, and a hole you walk through
 * reads better than a decorated one you cannot.
 */
function room({
  minX,
  maxX,
  minZ,
  maxZ,
  height,
  wall,
  door = 1,
}: {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  height: number
  wall: string
  /** Half-width of the doorway, in cells. Zero seals the room. */
  door?: number
}): BlockPlacement[] {
  const blocks: BlockPlacement[] = []

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const edge = x === minX || x === maxX || z === minZ || z === maxZ
      if (!edge) continue
      if (z === maxZ && Math.abs(x) <= door) continue

      for (let y = 1; y <= height; y++) {
        blocks.push({ x, y, z, model: wall })
      }
    }
  }

  return blocks
}

/** A flat rectangle of one model, at ground level. */
function slab(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  model: string,
  y = 0,
): BlockPlacement[] {
  const blocks: BlockPlacement[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      blocks.push({ x, y, z, model })
    }
  }
  return blocks
}

/** The club's footprint, as a half-span either side of the middle. */
const CLUB_HALF_X = 13
const CLUB_HALF_Z = 11

/** Head height and then some. A club with a low ceiling is a basement. */
const CLUB_WALL_HEIGHT = 8

/** The lit floor in the middle, as a half-span. */
const CLUB_FLOOR_HALF_X = 7
const CLUB_FLOOR_HALF_Z = 6

/**
 * The four colours the dancefloor cycles through.
 *
 * Four rather than two, and cycled on `x + z` rather than checked on parity, so
 * the pattern reads as diagonal bands sweeping across the floor instead of as a
 * chessboard. A chessboard is a kitchen.
 */
const CLUB_FLOOR_COLOURS = [
  'colored_block_red',
  'colored_block_blue',
  'colored_block_yellow',
  'colored_block_green',
] as const

/**
 * A dark concrete hall with a lit floor in the middle of it.
 *
 * The room somebody asks for when they say they want to put music on, and the
 * one thing the catalogue had no answer for: every ground in it was somewhere
 * to compete. This is somewhere to stand about in, which is most of what a team
 * space is actually for.
 *
 * Deliberately not a replica of anywhere. It is a big dark box, a booth at one
 * end, a bar down one side and a floor that is the only bright thing in it -
 * which is the whole recipe, and is also the recipe for a room that stays
 * legible when somebody rebuilds half of it.
 */
function planClub(): TemplatePlan {
  const blocks: BlockPlacement[] = [
    ...slab(-CLUB_HALF_X, CLUB_HALF_X, -CLUB_HALF_Z, CLUB_HALF_Z, 'stone_dark'),
    ...room({
      minX: -CLUB_HALF_X,
      maxX: CLUB_HALF_X,
      minZ: -CLUB_HALF_Z,
      maxZ: CLUB_HALF_Z,
      height: CLUB_WALL_HEIGHT,
      wall: 'bricks_B',
      door: 2,
    }),
  ]

  // The floor, laid over the concrete rather than instead of it, so breaking a
  // panel leaves the room's floor intact underneath.
  for (let x = -CLUB_FLOOR_HALF_X; x <= CLUB_FLOOR_HALF_X; x++) {
    for (let z = -CLUB_FLOOR_HALF_Z; z <= CLUB_FLOOR_HALF_Z; z++) {
      // Non-negative before the modulo: `%` in JavaScript keeps the sign of the
      // left operand, and a negative index into the palette is undefined.
      const band = (x + z + CLUB_FLOOR_COLOURS.length * 8) % CLUB_FLOOR_COLOURS.length
      blocks.push({ x, y: 0, z, model: CLUB_FLOOR_COLOURS[band] })
    }
  }

  // The rig: a truss over the floor with a lamp hung off it every few cells.
  // Open rather than a solid ceiling - the sky is the app's own starfield, and
  // roofing the room over would trade it for the inside of a lid.
  for (let x = -CLUB_FLOOR_HALF_X; x <= CLUB_FLOOR_HALF_X; x++) {
    for (const z of [-4, 0, 4]) {
      blocks.push({ x, y: CLUB_WALL_HEIGHT, z, model: 'metalframe' })
      if (Math.abs(x) % 4 === 0) {
        blocks.push({ x, y: CLUB_WALL_HEIGHT - 1, z, model: 'colored_block_yellow' })
      }
    }
  }

  // The booth, at the far end: two steps up, a desk, and a stack either side.
  for (let x = -3; x <= 3; x++) {
    for (let z = -CLUB_HALF_Z + 1; z <= -CLUB_HALF_Z + 3; z++) {
      blocks.push({ x, y: 1, z, model: 'stone' })
    }
  }
  blocks.push({ x: 0, y: 2, z: -CLUB_HALF_Z + 2, model: 'computer' })
  for (const x of [-4, 4]) {
    for (let y = 1; y <= 4; y++) {
      blocks.push({ x, y, z: -CLUB_HALF_Z + 2, model: 'metal' })
    }
  }

  // The bar, down the west wall: a counter, and the crates it is stocked from.
  for (let z = -3; z <= 5; z++) {
    blocks.push({ x: -CLUB_HALF_X + 2, y: 1, z, model: 'wood' })
    blocks.push({ x: -CLUB_HALF_X + 1, y: 1, z, model: 'barrel' })
  }

  return { blocks, goals: [] }
}

/** The living room's footprint, as a half-span. */
const HOME_HALF_X = 8
const HOME_HALF_Z = 7

/** Low, because it is a room in a house and not a hall. */
const HOME_WALL_HEIGHT = 4

/**
 * Somewhere to sit down.
 *
 * The other half of the answer the club is one half of, and the smaller, more
 * useful one: a room at the scale of a conversation. Everything else in the
 * catalogue is measured in tens of blocks across, which is the right size for a
 * game and the wrong size for four people standing in a circle talking - at
 * pitch scale a group has to *walk* to be near each other.
 *
 * Every fitting is drawn out of the palette rather than approximated: the sofa
 * is coloured blocks, the shelf is the two books models, the television is the
 * computer. There is no furniture in the block set and there does not need to
 * be - the room is legible because the shapes are in the right places.
 */
function planLivingRoom(): TemplatePlan {
  const blocks: BlockPlacement[] = [
    ...slab(-HOME_HALF_X, HOME_HALF_X, -HOME_HALF_Z, HOME_HALF_Z, 'wood'),
    ...room({
      minX: -HOME_HALF_X,
      maxX: HOME_HALF_X,
      minZ: -HOME_HALF_Z,
      maxZ: HOME_HALF_Z,
      height: HOME_WALL_HEIGHT,
      wall: 'bricks_A',
    }),
    // The rug, which is what makes the middle of the floor the middle of the
    // room rather than the widest part of the gap between the furniture.
    ...slab(-3, 3, -2, 2, 'striped_block_red'),
  ]

  // Windows: the wall punched out and glazed at eye level, on both long sides.
  for (const x of [-HOME_HALF_X, HOME_HALF_X]) {
    for (const z of [-3, -2, 2, 3]) {
      for (let y = 2; y <= 3; y++) {
        blocks.push({ x, y, z, model: 'glass' })
      }
    }
  }

  // The sofa, facing the television: a seat with a back behind it, and an arm
  // at each end. Two blocks deep, because one reads as a bench.
  for (let x = -3; x <= 3; x++) {
    blocks.push({ x, y: 1, z: 4, model: 'colored_block_blue' })
    blocks.push({ x, y: 1, z: 5, model: 'colored_block_blue' })
    blocks.push({ x, y: 2, z: 5, model: 'decorative_block_blue' })
  }
  for (const x of [-4, 4]) {
    blocks.push({ x, y: 1, z: 4, model: 'decorative_block_blue' })
    blocks.push({ x, y: 1, z: 5, model: 'decorative_block_blue' })
  }

  /**
   * The low table on the rug, and deliberately not over the origin.
   *
   * Whoever lays this arrives standing on the surface of the column at 0,0 -
   * see `standOn` in the scene - so a table there is a room you begin on top of
   * the furniture in. Nudged one cell toward the sofa instead, which is where a
   * coffee table belongs anyway.
   */
  for (let x = -1; x <= 1; x++) {
    for (const z of [1, 2]) {
      blocks.push({ x, y: 1, z, model: 'wood' })
    }
  }
  blocks.push({ x: 0, y: 2, z: 1, model: 'apple' })

  // The television, on a stand against the far wall, where the sofa is pointed.
  for (let x = -1; x <= 1; x++) {
    blocks.push({ x, y: 1, z: -5, model: 'stone_dark' })
  }
  blocks.push({ x: 0, y: 2, z: -5, model: 'computer' })

  // The shelf, in the corner: three high, so it reads as a bookcase.
  for (let y = 1; y <= 3; y++) {
    blocks.push({ x: -6, y, z: -5, model: y % 2 === 0 ? 'books_B' : 'books_A' })
    blocks.push({ x: -5, y, z: -5, model: y % 2 === 0 ? 'books_A' : 'books_B' })
  }

  // And the two things every room has: something alive in the corner and a
  // lamp beside the seat.
  blocks.push({ x: 6, y: 1, z: -5, model: 'tree' })
  blocks.push({ x: 6, y: 1, z: 4, model: 'metalframe' })
  blocks.push({ x: 6, y: 2, z: 4, model: 'colored_block_yellow' })

  return { blocks, goals: [] }
}

/**
 * The catalogue, in the order the picker shows it.
 *
 * The pitch is first because it is the one with a game in it, and because a
 * match defaults to it - see DEFAULT_TEMPLATE_ID.
 */

// ---------------------------------------------------------------------------
// The race course
// ---------------------------------------------------------------------------

/** How far the run stretches either side of the middle, in cells. */
const RACE_REACH = 30
/** Half the width of the water it crosses. */
const RACE_CHANNEL = 6

const RACE_BANK = 'dirt_with_grass'
const RACE_WATER = 'water'
const RACE_PAD = 'bricks_A'
const RACE_CHECKPOINT = 'colored_block_yellow'
const RACE_START = 'colored_block_green'
const RACE_FINISH = 'colored_block_red'

/**
 * A course to run, with a start and a finish that mean something.
 *
 * The catalogue had five grounds to fight on and none to *race* on, which was a
 * hole with a sharp edge: the summon wizard offers a race mode, and the arena
 * step then told you that no template comes with a start and a finish and you
 * would have to go and lay them by hand. A mode you cannot pick a ground for is
 * a mode nobody plays.
 *
 * So this is the pitch's sibling. The pitch is the one template that comes with
 * its goals already standing; this is the one that comes with its marks - and
 * for the same reason. Where the start and finish go *is* the course, and a
 * course whose ends have to be placed afterwards is not a course, it is a
 * suggestion.
 *
 * ---------------------------------------------------------------------------
 * Why it is jumpable, and how that is known
 * ---------------------------------------------------------------------------
 * Sized against the character controller rather than by eye. A plain jump peaks
 * at about 1.4 blocks and carries you six or so forward at a walk (see
 * `@/domain/lounge/jump`), so no pad ever sits more than one block above the
 * last and the gaps run three to five - three anybody clears, five wants a
 * run-up. The gaps are written out rather than generated because they are the
 * difficulty curve, and a curve nobody can read is a curve nobody can tune.
 */
export function raceRoute(): { x: number; y: number; z: number }[] {
  const route: { x: number; y: number; z: number }[] = []
  let x = -RACE_REACH + 2
  let lastZ = 0

  for (let index = 0; index < RACE_GAPS.length; index += 1) {
    const rising = index % 4 === 3
    const z = rising ? lastZ : Math.round(Math.sin(index / 2) * 2) || 0
    lastZ = z
    route.push({ x, y: 1 + (rising ? 1 : 0), z })

    // A climbing hop gets the short gap - see the note on `RACE_GAPS`.
    const climbing = (index + 1) % 4 === 3
    x += climbing ? Math.min(RACE_GAPS[index], 3) : RACE_GAPS[index]
  }

  return route
}

/**
 * How far apart the pads are, in order.
 *
 * Written out rather than generated because this is the difficulty curve, and
 * a curve nobody can read is a curve nobody can tune. Threes and fours only: a
 * walking jump covers 4.5 cells on the level and 3.4 when it has to land a
 * block higher (see `jumpReach`), so a five is a hop that only a sprinting
 * player makes - from a two-cell pad, which is to say nobody.
 */
const RACE_GAPS = [3, 3, 4, 3, 4, 4, 3, 3, 4, 3, 4, 3, 3, 4, 4, 3]

function planRace(): TemplatePlan {
  const blocks: BlockPlacement[] = []

  // The two banks, and the water between them. The water is what makes a missed
  // jump cost the run and nothing else - lava would make a first attempt a
  // punishment, and this is a thing people should want to try twice.
  for (let x = -RACE_REACH - 9; x <= RACE_REACH + 9; x++) {
    for (let z = -RACE_CHANNEL - 2; z <= RACE_CHANNEL + 2; z++) {
      const bank = x < -RACE_REACH || x > RACE_REACH
      const edge = Math.abs(z) > RACE_CHANNEL
      if (bank || edge) blocks.push({ x, y: 0, z, model: RACE_BANK })
      else blocks.push({ x, y: 0, z, model: RACE_WATER })
    }
  }

  /*
   * The pads, from the route.
   *
   * Laid from `raceRoute` rather than worked out here, so the blocks people
   * jump on and the geometry the test checks are the same list. A course whose
   * test checks a different route from the one it lays is a course with no test
   * at all.
   */
  raceRoute().forEach((pad, index) => {
    const model = index > 0 && index % 5 === 0 ? RACE_CHECKPOINT : RACE_PAD

    // 2x2: a one-block pad is a landing nobody makes.
    for (const dx of [0, 1]) {
      for (const dz of [0, 1]) {
        blocks.push({ x: pad.x + dx, y: pad.y, z: pad.z + dz, model })
      }
    }
  })

  // The gates, in the colours the marks are drawn in - so the line you run
  // through is visible from the other end of the course.
  for (const [gateX, model] of [
    [-RACE_REACH, RACE_START],
    [RACE_REACH, RACE_FINISH],
  ] as const) {
    for (const z of [-3, 3]) {
      for (let y = 1; y <= 4; y++) blocks.push({ x: gateX, y, z, model })
    }
    for (let z = -3; z <= 3; z++) blocks.push({ x: gateX, y: 5, z, model })
  }

  return {
    blocks,
    /*
     * The marks themselves, which are the point of this template.
     *
     * `facing: 1` turns them across the run, so you pass through the frame
     * rather than alongside it - and `y: 1` stands them on the bank rather than
     * in it, because the blocks below occupy y=0.
     */
    goals: [
      { kind: 'start', x: -RACE_REACH, y: 1, z: 0, width: 6, height: 4, facing: 1 },
      { kind: 'finish', x: RACE_REACH, y: 1, z: 0, width: 6, height: 4, facing: 1 },
    ],
  }
}

export const WORLD_TEMPLATES: readonly WorldTemplate[] = [
  {
    id: 'pitch',
    name: 'Football pitch',
    blurb: 'Walled, marked out, a goal at each end. Ready to kick off.',
    football: true,
    plan: () => {
      const plan = planPitch()
      return { blocks: plan.blocks, goals: plan.goals }
    },
  },
  {
    id: 'race',
    name: 'Race course',
    blurb: 'Sixteen pads over the water, with a start gate and a finish gate.',
    football: false,
    race: true,
    plan: planRace,
  },
  {
    id: 'cage',
    name: 'Duelling cage',
    blurb: 'A round walled pit. No goals, nowhere to run.',
    football: false,
    plan: planCage,
  },
  {
    id: 'club',
    name: 'The club',
    blurb: 'A dark hall, a lit dancefloor, a booth and a bar.',
    football: false,
    plan: planClub,
  },
  {
    id: 'living-room',
    name: 'Living room',
    blurb: 'Sofa, rug, telly, bookshelf. A room at the scale of a conversation.',
    football: false,
    plan: planLivingRoom,
  },
  {
    /**
     * The public demo's island, offered as a ground like any other.
     *
     * The one entry here whose planner lives somewhere else, and it stays there:
     * ./demo-world is what /demo builds on the client at mount, and a copy of it
     * would be a second island to keep in step with the screenshots. What this
     * adds is only the catalogue entry - somebody who walked round the demo,
     * liked it and signed up can now stand in it.
     */
    id: 'demo-island',
    name: 'Demo island',
    blurb: 'The island from the public demo: plaza, fountain, stage and trees.',
    football: false,
    plan: () => ({ blocks: planDemoWorld(), goals: [] }),
  },
  {
    id: 'flats',
    name: 'Flat ground',
    blurb: `A bare ${DEFAULT_WORLD_SIZE}×${DEFAULT_WORLD_SIZE} floor, centred on the origin. Build it yourself.`,
    football: false,
    plan: planFlats,
  },
]

/**
 * Look one up by id.
 *
 * Returns undefined rather than throwing, because the id arrives from a client
 * and a server action has to answer an unknown one with a refusal rather than a
 * stack trace.
 */
export function findTemplate(id: string): WorldTemplate | undefined {
  return WORLD_TEMPLATES.find((template) => template.id === id)
}
