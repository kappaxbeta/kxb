'use client'

import { useMemo } from 'react'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { finishMarks, startGrid, startMark } from '@/app/world/lounge/_sim/race'
import {
  ARRIVAL_STEP,
  arrivalCell,
  type SpawnSlot,
  spawnPoint,
  standingSurface,
  surfaceAt,
} from '@/app/world/lounge/_sim/spawn'
import type { Goal } from '@/domain/lounge/goal-events'
import type { BlockView } from '@/domain/lounge/queries'
import type { WorldSpawn } from '@/domain/worlds/queries'

/**
 * Where the player starts: standing on the ground at the origin.
 *
 * Derived from the world rather than hardcoded, because "the ground" is not a
 * fixed height. On an empty lounge it is the y=0 plane; on a generated floor
 * the blocks occupy y=0 (spanning 0..1) so the walkable surface is y=1; if
 * someone has built a tower at the origin you spawn on top of it rather than
 * inside it.
 *
 * Computed from `initialBlocks` and not from live `blocks` on purpose - this
 * feeds the Canvas camera prop, which only applies on mount. Recomputing it
 * as people build would be dead state that looks like it does something.
 *
 * A hook of its own because two things need it before anything else runs: the
 * Canvas, which takes it as the camera's opening position, and `playerRef` in
 * ./scene-refs, which is seeded from it so that frame one agrees with that
 * camera. It also decides where a respawn puts you - see `revive`.
 */
export function useSpawn({
  initialBlocks,
  initialGoals,
  racing,
  spawnSlot,
  spawnAt,
  userId,
  worldId,
}: {
  initialBlocks: BlockView[]
  initialGoals: Goal[]
  /** Whether there is a race at all. See the note on the dependency list. */
  racing: boolean
  spawnSlot?: SpawnSlot
  spawnAt?: WorldSpawn
  /** Who is arriving, for the door's hash. Absent for an unpeopled preview. */
  userId?: string
  worldId?: string
}): [number, number, number] {
  return useMemo<[number, number, number]>(() => {
    /**
     * A race lines up on its line, and this is the whole of what makes it fair.
     *
     * The ring above is exactly wrong for a race: it would put a quarter of the
     * field nearer the finish than the rest before anybody had moved. The grid in
     * ./race.ts spreads everybody along the start instead, so the only difference
     * between two racers' opening positions is the width of the line.
     *
     * This is also where a knocked-out racer comes back to, because `revive`
     * teleports to exactly this spot - which is the cost of going down in a race,
     * and the reason a dash at the last corner is worth landing.
     */
    const start = racing ? startMark(initialGoals) : null
    if (start && spawnSlot) {
      const spot = startGrid(start, finishMarks(initialGoals), spawnSlot)
      /**
       * The ground the line stands on, not the top of whatever is built there.
       *
       * `start.y` is the cell the mark's bottom sits in - the floor of the
       * course, by construction, because the mark was placed by somebody
       * standing on it. Capping the search there is what stops a wall, an arch
       * or a grandstand built around the start from being read as the surface:
       * the grid used to put racers on top of it, outside the course, looking
       * down at the field they were supposed to be lined up on.
       *
       * A column with nothing at or below the line's own level falls back to the
       * world floor, which is the same answer an empty column always gave.
       */
      const surface = surfaceAt(
        initialBlocks,
        Math.floor(spot.x),
        Math.floor(spot.z),
        0,
        start.y,
      )
      return [spot.x, surface + EYE_HEIGHT, spot.z]
    }

    /**
     * A match spreads people around a ring; the lounge does not.
     *
     * Dropping every fighter onto one square means the bell goes and they are
     * already standing inside each other, shoving apart instead of fighting.
     * The lounge keeps the origin, which is right for a room you wander into -
     * there is one way in and everybody comes through it.
     */
    const { x, z } = spawnSlot ? spawnPoint(spawnSlot) : { x: 0, z: 0 }

    if (spawnSlot) {
      return [x, surfaceAt(initialBlocks, x, z) + EYE_HEIGHT, z]
    }

    /**
     * A world with a door of its own puts people at it, spread out.
     *
     * `arrivalCell` picks which of the cells around it is yours from a hash of
     * who you are: stable, so leaving and coming back puts you where you were,
     * and needing no agreement with anybody, which matters because at the
     * moment somebody arrives presence has not connected and nobody knows who
     * else is in the room. Two people can still be sent to the same cell; the
     * physics pushes them apart, which is one shove rather than the eight a
     * shared door produces.
     *
     * Nothing is passed as `occupied` for exactly that reason - see the note in
     * ./spawn.ts.
     */
    if (spawnAt) {
      /**
       * The surface one column offers, asked the way the arrival asks it.
       *
       * Hoisted out of the two places below that both need it - the test that
       * picks the cell, and the height the chosen cell is stood at.
       */
      const groundAt = (x: number, z: number): number =>
        standingSurface(
          initialBlocks,
          x,
          z,
          undefined,
          undefined,
          spawnAt.y ?? undefined,
        )

      /**
       * The ground the door itself stands on, which is what every other cell is
       * measured against.
       *
       * Not `spawnAt.y` straight, for two reasons. The block the door was set on
       * may since have been broken, and `standingSurface` already answers that
       * by returning the nearest surface it can find - so asking it is asking
       * where the door is *now*. And a door with no remembered height at all -
       * which is every door a published world carries, because the document
       * stores two numbers - still stands somewhere, and until this was worked
       * out the spread was simply not tested for those: the hash sent people to
       * a cell past the island's edge, which has no surface, and they arrived on
       * the world floor while the door sat twenty blocks above them.
       */
      const anchorGround = groundAt(spawnAt.x, spawnAt.z)

      // Keyed on who is arriving, or on the world when nobody is named - an
      // unpeopled preview has no identity to hash and no crowd to avoid.
      //
      // And spread only onto ground that is beside the door rather than under
      // it - see `standable` in ./spawn.ts for what that test is for.
      const cell = arrivalCell(
        spawnAt,
        userId ?? worldId ?? 'visitor',
        undefined,
        (candidate) =>
          Math.abs(groundAt(candidate.x, candidate.z) - anchorGround) <= ARRIVAL_STEP,
      )

      /**
       * `standingSurface`, not `surfaceAt`.
       *
       * The ground is worked out rather than assumed: the room in the column
       * with space for a body. Build a roof over the door and people arrive
       * under it rather than on it; build a solid tower and they still arrive
       * on top, exactly as before.
       *
       * `spawnAt.y` is what makes that "the room nearest the height the door was
       * set at" rather than "the lowest one". A door on a floating island is a
       * column whose ground floor is wide open, so without the hint the lowest
       * clear surface is the world floor and everybody arrives underneath the
       * island. Null - every door set before this was recorded - keeps the old
       * lowest-first answer.
       */
      /**
       * The middle of the cell, not its corner.
       *
       * `arrivalCell` answers in cells and this used to use the number straight,
       * which stands you on the seam where four cells meet - half a block off
       * the spot, and half a block off the ring drawn on the floor, which marks
       * the cell's centre the way every mark in this world does. Small, and
       * exactly the sort of small that makes somebody who has just placed a
       * spawn point say they did not land on it.
       */
      return [cell.x + 0.5, groundAt(cell.x, cell.z) + EYE_HEIGHT, cell.z + 0.5]
    }

    let surface = 0
    for (const block of initialBlocks) {
      // The four cells that touch the world origin. A generated floor is an
      // even number of blocks wide, so its centre is the corner where those
      // four meet rather than the middle of any one of them - and standing on
      // that corner is what "centred" actually means here.
      //
      // Scoped to those four on purpose: scanning the whole world for its
      // highest block would launch you into the sky off someone's tower.
      const touchesOrigin =
        (block.x === 0 || block.x === -1) && (block.z === 0 || block.z === -1)

      if (touchesOrigin && block.y + 1 > surface) {
        surface = block.y + 1
      }
    }
    return [0, surface + EYE_HEIGHT, 0] as [number, number, number]
    // `racing` rather than `race`: this only asks whether there is a race at all,
    // and the callbacks inside `race` are new on every render - depending on them
    // would re-derive the opening position, and so the respawn point, constantly.
  }, [initialBlocks, initialGoals, racing, spawnSlot, spawnAt, userId, worldId])
}
