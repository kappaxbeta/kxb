/**
 * A race, as the world runs it.
 *
 * Two facts and a rule. The facts are marks the arena already holds - one start
 * line and at least one finish - and the rule is that a racer's own client
 * decides when they crossed. That is the same trust the rest of this folder runs
 * on: `combat.ts` lets each client be authoritative over its own health, and
 * `ReportDefeat` lets each player be the only one who may report going down.
 * Nobody else is in a position to know where you are with sub-frame accuracy,
 * and the alternative - a server stepping sixteen positions sixty times a
 * second - is a different product.
 *
 * What the log does hold is the *order*, because the order is the result. Two
 * racers who cross a tenth of a second apart are separated by whichever report
 * the server accepted first, and that is the only ordering everybody can agree
 * on - see `ReportFinish` in domain/battle/aggregate.ts.
 *
 * Pure functions over plain numbers, like ./spawn.ts and ./football.ts, so the
 * awkward parts - a course with no finish, a field wider than the start line,
 * which way "behind the line" points - are settled in a test rather than by
 * standing on a start line counting people.
 */

import { goalCentre, goalCrossed } from '@/app/world/lounge/_sim/football'
import type { Vec3 } from '@/app/world/lounge/_sim/physics'
import type { SpawnSlot } from '@/app/world/lounge/_sim/spawn'
import type { Goal } from '@/domain/lounge/goal-events'

/** The line racers line up on. Null when the arena has none. */
export function startMark(goals: readonly Goal[]): Goal | null {
  return goals.find((goal) => goal.kind === 'start') ?? null
}

/**
 * The planes that end a run.
 *
 * Plural, because a finish wider than one mark is built out of several and a
 * racer through any of them is home. `raceReady` only asks that there is one.
 */
export function finishMarks(goals: readonly Goal[]): Goal[] {
  return goals.filter((goal) => goal.kind === 'finish')
}

/**
 * Can a race be run here?
 *
 * Asked before the flag falls rather than after, exactly as `goalsReady` is:
 * without a start there is nowhere fair to put anybody, and without a finish the
 * race is a walk that ends when the clock does. Both failures are silent in the
 * worst way if nobody says so up front.
 */
export function raceReady(goals: readonly Goal[]): boolean {
  return startMark(goals) !== null && finishMarks(goals).length > 0
}

/** Which axis a mark's plane is crossed along. The same rule `goalBounds` uses. */
function normalAxis(mark: Goal): 'x' | 'z' {
  return mark.facing % 2 === 0 ? 'z' : 'x'
}

/**
 * How far apart the rows of a crowded grid stand, in cells.
 *
 * Two, not one: a row a single cell back is inside the shoulders of the row in
 * front (see `separate` in ./physics.ts), so the grid would shove itself apart
 * in the seconds before the off and hand the front row a start.
 */
const ROW_GAP = 2

/**
 * Where one racer stands on the grid.
 *
 * Along the line rather than around a ring, which is what makes a race fair in
 * the one way a race has to be: everybody's distance to the finish differs by
 * the width of the line and nothing else. The ring in ./spawn.ts is exactly
 * wrong here - it would put a quarter of the field a lap ahead.
 *
 * The grid is derived from the slot rather than handed out, so every client
 * works out the same arrangement from the same roster without anybody being
 * told - `startingOrder` is what makes that ordering stable.
 *
 * A field wider than the line wraps into rows *behind* it, where behind means
 * away from the finish. With no finish to point away from the rows go to
 * negative, which only happens in an arena that cannot hold a race anyway.
 */
export function startGrid(
  start: Goal,
  finishes: readonly Goal[],
  { index, total }: SpawnSlot,
): { x: number; z: number } {
  const centre = goalCentre(start)
  const axis = normalAxis(start)

  // How many stand abreast: one per cell of the line, and at least one.
  const perRow = Math.max(1, Math.floor(start.width))
  const column = index % perRow
  const row = Math.floor(index / perRow)

  /**
   * Spread across the line, using only as much of it as the field needs.
   *
   * Two racers on a nine-wide line stand three cells apart rather than at
   * opposite ends of it: a line built wide enough for eight should not put a
   * pair of racers in different postcodes.
   */
  const abreast = Math.min(total, perRow)
  const spread = abreast <= 1 ? 0 : (column - (abreast - 1) / 2) * (start.width / abreast)

  // Away from the finish, so a second row is a row back and not a row ahead.
  const back = backwards(centre, axis, finishes)
  const depth = row * ROW_GAP * back

  /**
   * World units, not cells, and unrounded.
   *
   * The ring in ./spawn.ts rounds to whole blocks because a fighter standing on
   * a seam is where the half-open bounds in `collides` are fussiest. A grid has
   * the opposite need: the line's centre falls in the middle of a cell, and
   * rounding a five-abreast grid to cells would bunch two racers onto one square
   * and call it a fair start. Whoever needs a cell to look up the ground under a
   * racer can floor one.
   */
  return {
    x: axis === 'z' ? centre.x + spread : centre.x + depth,
    z: axis === 'z' ? centre.z + depth : centre.z + spread,
  }
}

/**
 * Which way along the plane's normal is away from the finish.
 *
 * The nearest finish decides it, since a course with finishes on both sides of
 * the start is not one this can be right about anyway. Returns -1 or 1, never 0:
 * a start and a finish on exactly the same plane is a race of no length, and a
 * grid stacked on one cell is a less confusing way to see that than a grid that
 * silently overlaps.
 */
function backwards(
  centre: Vec3,
  axis: 'x' | 'z',
  finishes: readonly Goal[],
): number {
  const here = axis === 'z' ? centre.z : centre.x

  let nearest: number | null = null
  for (const finish of finishes) {
    const there = axis === 'z' ? goalCentre(finish).z : goalCentre(finish).x
    if (nearest === null || Math.abs(there - here) < Math.abs(nearest - here)) {
      nearest = there
    }
  }

  if (nearest === null || nearest === here) return -1
  return nearest > here ? -1 : 1
}

/**
 * Did this racer cross a finish between these two positions?
 *
 * Swept, through the same test the ball uses, and for a sharper version of the
 * same reason: a player who dashes covers seven blocks in a moment, and a check
 * that asked "are you standing in the finish right now" would miss exactly the
 * arrivals people care most about. A finish that did not count is the one bug a
 * race cannot survive.
 *
 * Direction-agnostic, like the goal it borrows: running back through the line
 * counts too. That is a real hole in a lap race and no hole at all in this one -
 * a race ends the first time you cross, and the second crossing is somebody
 * standing past the line waving.
 */
export function finishCrossed(
  from: Vec3,
  to: Vec3,
  goals: readonly Goal[],
): boolean {
  return finishMarks(goals).some((finish) => goalCrossed(from, to, finish))
}
