/**
 * The football pitch template.
 *
 * A pure planner: it returns the blocks and the two goals that make up a
 * playable arena, and writes nothing. That split is the point - laying the pitch
 * is a couple of thousand block placements across a dozen chunk streams, and
 * "did the halfway line end up in the middle" is a question worth answering in a
 * test rather than by flying over a generated world counting cells.
 *
 * It is also why this lives in `domain/lounge` next to the palette rather than
 * beside the ball simulation: the action that writes it and the button that
 * offers it are on opposite sides of the network, and both need to agree about
 * what a pitch is.
 *
 * Every dimension below is odd on purpose. An even-sided rectangle has its
 * centre on the *corner* where four cells meet, and a five-wide goal centred on
 * a corner sits half a block off to one side; odd spans put the centre in the
 * middle of a cell, so the goals, the halfway line, the centre circle and the
 * kickoff spot all agree about where the middle is. See DEFAULT_WORLD_SIZE in
 * ./events.ts for the same argument reaching the opposite conclusion, because a
 * plain floor has nothing that needs centring on it.
 */

import type { BlockPlacement } from '@/domain/lounge/events'
import {
  DEFAULT_GOAL_HEIGHT,
  DEFAULT_GOAL_WIDTH,
  type GoalKind,
} from '@/domain/lounge/goal-events'

/** Across the pitch, in cells. Odd, so it has a middle. */
export const PITCH_WIDTH = 21

/** Goal to goal, in cells. Odd, for the same reason. */
export const PITCH_LENGTH = 33

/**
 * How high the wall around it stands.
 *
 * Three blocks: over head height, so the ball cannot be trivially lobbed out of
 * play, but low enough to see over from outside. The wall is the reason a match
 * does not turn into ten minutes of fetching - a ball that leaves the pitch has
 * to be walked back, and there is no throw-in.
 */
export const WALL_HEIGHT = 3

/** How far in from the end wall the goal line sits. */
const GOAL_INSET = 1

/** Radius of the centre circle, in cells. */
const CIRCLE_RADIUS = 4

const GRASS = 'dirt_with_grass'
/** White, for the lines. The only thing in the palette that reads as paint. */
const LINE = 'snow'
const WALL = 'bricks_A'
const RED_WALL = 'colored_block_red'
const BLUE_WALL = 'colored_block_blue'

/** A goal the template lays down, before it has an id. */
export interface PitchGoal {
  kind: GoalKind
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

export interface PitchPlan {
  blocks: BlockPlacement[]
  goals: PitchGoal[]
  /** The rectangle the pitch occupies, walls included. For the copy in the UI. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/**
 * Half of an odd span, as a cell index.
 *
 * A span of 21 runs from -10 to 10, so this is 10 - and the middle cell is 0,
 * whose centre is at 0.5 in world units.
 */
function half(span: number): number {
  return (span - 1) / 2
}

/**
 * Lay out a pitch centred on the origin.
 *
 * Centred rather than positioned, because the template's whole job is to be the
 * thing you get before you have any opinions - and the player spawn, the world
 * origin and the middle of the pitch being the same place is what makes it
 * playable the instant it appears.
 *
 * The order of the returned blocks matters in one respect: later entries
 * overwrite earlier ones at the same cell when the caller batches them, and the
 * lines are emitted after the grass they are painted on. Everything else is
 * disjoint.
 */
export function planPitch(): PitchPlan {
  const hx = half(PITCH_WIDTH)
  const hz = half(PITCH_LENGTH)

  // The wall stands one cell outside the playing surface, so the full extent is
  // one wider on each side. Grass is laid under the wall too - a ring of void
  // under a wall looks like a mistake from outside, and costs the same.
  const minX = -hx - 1
  const maxX = hx + 1
  const minZ = -hz - 1
  const maxZ = hz + 1

  const blocks: BlockPlacement[] = []

  // --- the ground -----------------------------------------------------------
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      blocks.push({ x, y: 0, z, model: GRASS })
    }
  }

  // --- markings, painted over the grass -------------------------------------
  //
  // The halfway line, the centre circle and a box in front of each goal. Purely
  // cosmetic - nothing in football.ts reads them - but a green rectangle with
  // two coloured planes in it does not read as a pitch, and people need to be
  // able to see where they are standing relative to the middle.
  for (let x = -hx; x <= hx; x++) {
    blocks.push({ x, y: 0, z: 0, model: LINE })
  }

  // A ring, not a disc: only cells whose distance from the middle rounds to the
  // radius. Cell (x, z) has its centre at (x + 0.5, z + 0.5) and the pitch's
  // middle is (0.5, 0.5), so the offsets are just x and z - which is exactly the
  // property the odd spans were chosen for.
  for (let x = -hx; x <= hx; x++) {
    for (let z = -hz; z <= hz; z++) {
      const distance = Math.hypot(x, z)
      if (Math.round(distance) === CIRCLE_RADIUS) {
        blocks.push({ x, y: 0, z, model: LINE })
      }
    }
  }

  // The goal areas. Wide enough to stand in as a keeper, so "get back in the
  // box" means something.
  const boxHalfWidth = Math.floor(DEFAULT_GOAL_WIDTH / 2) + 2
  const boxDepth = 4
  for (const end of [-1, 1] as const) {
    const goalLine = end * (hz - GOAL_INSET)
    const front = goalLine - end * boxDepth

    for (let x = -boxHalfWidth; x <= boxHalfWidth; x++) {
      blocks.push({ x, y: 0, z: front, model: LINE })
    }
    for (
      let z = Math.min(goalLine, front);
      z <= Math.max(goalLine, front);
      z++
    ) {
      blocks.push({ x: -boxHalfWidth, y: 0, z, model: LINE })
      blocks.push({ x: boxHalfWidth, y: 0, z, model: LINE })
    }
  }

  // --- the wall -------------------------------------------------------------
  //
  // The two ends are painted in their team's colour, so which way you are
  // shooting is readable from anywhere on the pitch without looking for the
  // goal itself. Red defends -Z; blue defends +Z.
  for (let y = 1; y <= WALL_HEIGHT; y++) {
    for (let x = minX; x <= maxX; x++) {
      blocks.push({ x, y, z: minZ, model: RED_WALL })
      blocks.push({ x, y, z: maxZ, model: BLUE_WALL })
    }
    // The corners are already placed by the loop above, so the sides skip them.
    for (let z = minZ + 1; z <= maxZ - 1; z++) {
      blocks.push({ x: minX, y, z, model: WALL })
      blocks.push({ x: maxX, y, z, model: WALL })
    }
  }

  return { blocks, goals: planGoalPair(), bounds: { minX, maxX, minZ, maxZ } }
}

/**
 * The template's two goals, without the pitch under them.
 *
 * Split out because it is separately useful: a space that has already built its
 * own arena wants goals in it without the template flattening their work first,
 * and this is what the picker's "stand both goals" button lays down. The
 * positions are exactly the pitch template's, so a pitch laid later lines up
 * with goals stood earlier.
 *
 * `x: 0` is the middle cell of an odd-width pitch, and a goal's mouth is
 * centred on the middle of the cell it names - so both goals and the halfway
 * line share one centre line, and `kickoffSpot` lands on the centre circle
 * without being told where it is.
 *
 * `y: 1` stands them on top of the grass, which fills cell 0 in both the pitch
 * template and the default generated floor.
 *
 * `facing: 0` puts both planes across Z, which is the axis the pitch is long
 * on - you score by travelling the length of it. A plane has no front, so both
 * ends use the same facing; see the note on `Goal.facing`.
 */
export function planGoalPair(): PitchGoal[] {
  const hz = half(PITCH_LENGTH)

  return [
    {
      kind: 'red',
      x: 0,
      y: 1,
      z: -(hz - GOAL_INSET),
      width: DEFAULT_GOAL_WIDTH,
      height: DEFAULT_GOAL_HEIGHT,
      facing: 0,
    },
    {
      kind: 'blue',
      x: 0,
      y: 1,
      z: hz - GOAL_INSET,
      width: DEFAULT_GOAL_WIDTH,
      height: DEFAULT_GOAL_HEIGHT,
      facing: 0,
    },
  ]
}
