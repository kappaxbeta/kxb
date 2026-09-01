/**
 * Where everybody starts.
 *
 * The lounge has always spawned people on the origin, which is right for a room
 * you wander into: there is one door and everyone comes through it. A match is
 * the opposite - dropping eight fighters onto one square means the bell goes
 * and they are already inside each other, shoving apart (see `separate` in
 * ./physics.ts) instead of fighting.
 *
 * So a match spreads them around a ring. Pure functions over plain numbers, for
 * the same reason physics.ts and combat.ts are: the awkward cases - one
 * fighter, two, a team that should not be split across the map - are far easier
 * to pin down in a test than in a room full of people.
 */

/**
 * How far from the middle fighters start, in blocks.
 *
 * Far enough that nobody opens within dash range of anybody (a dash covers
 * ~7 blocks), close enough that the first fight happens rather than everybody
 * spending ten seconds walking inward.
 */
export const SPAWN_RADIUS = 9

export interface SpawnSlot {
  /** Position in the starting order, 0-based. */
  index: number
  /** How many are starting. */
  total: number
}

/**
 * A point on the ring for one fighter.
 *
 * Rounded to whole blocks so a spawn lands on a cell centre rather than
 * straddling a seam, which is where the half-open bounds in `collides` are
 * fussiest.
 *
 * One fighter - or none - starts in the middle, because a ring of one is just
 * an arbitrary corner of the map to be standing in.
 */
export function spawnPoint(
  { index, total }: SpawnSlot,
  radius = SPAWN_RADIUS,
): { x: number; z: number } {
  if (total <= 1) return { x: 0, z: 0 }

  const angle = (index / total) * Math.PI * 2
  return {
    x: Math.round(Math.cos(angle) * radius),
    z: Math.round(Math.sin(angle) * radius),
  }
}

/**
 * The starting order, arranged so team-mates are neighbours.
 *
 * Sorted by side first, so a team occupies one arc of the ring rather than
 * being scattered around it - opening a team match with your side spread across
 * the map and an opponent between each pair is not a team match.
 *
 * Then by id, which is arbitrary but *stable*: every client sorts the same
 * roster the same way, so everybody agrees who stands where without anybody
 * having to be told.
 */
export function startingOrder(
  fighters: readonly { userId: string; side?: string | null }[],
): string[] {
  return [...fighters]
    .sort((a, b) => {
      const sideA = a.side ?? ''
      const sideB = b.side ?? ''
      if (sideA !== sideB) return sideA < sideB ? -1 : 1
      return a.userId < b.userId ? -1 : 1
    })
    .map((fighter) => fighter.userId)
}

/**
 * Where one arrival stands, given where the door is.
 *
 * A world can now say where people come in (see `BuilderWorld.spawn`), and the
 * moment it does, everybody walking in lands on the same block - which in a
 * room of eight is a pile that shoves itself apart over the next second (see
 * `separate` in ./physics.ts). Nobody arrives *at* a door; they arrive around
 * it.
 *
 * So: a fixed set of cells around the anchor, and everybody takes one. Which
 * one is decided by a hash of who you are, for two reasons - it needs no
 * agreement between clients, and it is stable, so walking out and back in puts
 * you where you were rather than somewhere new.
 *
 * `occupied` is the improvement on that when the caller knows more: the scene
 * knows where everybody is standing by the time somebody respawns, and passing
 * those cells in makes the choice a real search rather than a hash. It is
 * optional because at the moment somebody *arrives* nobody knows anything yet -
 * presence has not connected.
 *
 * The hash is not a collision-free identity: two people can be sent to the same
 * cell, and that is fine. It is one overlap the physics already resolves rather
 * than eight, and the alternative - a client asking a server which slot is
 * free - is a round trip on the join path to save one second of shuffling.
 */

/**
 * The cells an arrival may take, nearest first.
 *
 * The anchor itself is first: with one person in the room the door is exactly
 * where they should be standing, and a ring that never uses its own centre
 * looks like the spawn point is broken. The two rings after it are eight and
 * sixteen cells, which is enough spread for a full room.
 */
export const ARRIVAL_CELLS: readonly { x: number; z: number }[] = [
  { x: 0, z: 0 },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((step) => {
    const angle = (step / 8) * Math.PI * 2
    // `|| 0` because `Math.round(-0.2)` is `-0`, which prints as "-0" in a cell
    // key and compares unequal to the 0 everything else uses.
    return { x: Math.round(Math.cos(angle) * 2) || 0, z: Math.round(Math.sin(angle) * 2) || 0 }
  }),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((step) => {
    // Offset half a step from the inner ring, so the two rings interleave
    // rather than standing in each other's shadow.
    const angle = ((step + 0.5) / 8) * Math.PI * 2
    return { x: Math.round(Math.cos(angle) * 4) || 0, z: Math.round(Math.sin(angle) * 4) || 0 }
  }),
]

/**
 * A small, stable hash of a string.
 *
 * FNV-1a, because it is six lines and spreads short similar strings - which is
 * what user ids are - far better than summing char codes.
 */
function hash(value: string): number {
  let out = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index)
    out = Math.imul(out, 16777619)
  }
  return out >>> 0
}

export function arrivalCell(
  anchor: { x: number; z: number },
  who: string,
  occupied: ReadonlySet<string> = new Set(),
  /**
   * Whether a cell is somewhere this world can actually put somebody.
   *
   * The spread reaches four cells, and it was reaching them blind. On open
   * ground that is exactly right and is the whole point. On a floating island
   * it is how the door came to be ignored *again* after it learnt to remember
   * its height: the island is a dozen blocks across, the hash sends you to a
   * cell past its edge, and that column has no surface at the door's height -
   * or at any height - so the arrival falls back to the world floor far below.
   * The height was honoured perfectly and you still landed on the ground,
   * which from the inside is indistinguishable from it having been thrown
   * away.
   *
   * A predicate rather than a list of good cells, because only the caller
   * knows what "standing room" means here - it has the blocks and the door's
   * remembered height, and this module deliberately has neither. Absent, this
   * is exactly the hash it always was, which is what every world without a
   * remembered height still gets.
   */
  standable?: (cell: { x: number; z: number }) => boolean,
): { x: number; z: number } {
  const start = hash(who) % ARRIVAL_CELLS.length

  // From your own cell outward, taking the first free one. Everybody starts at
  // a different point in the same list, so two people looking for a free cell
  // at the same moment do not converge on the same answer.
  for (let step = 0; step < ARRIVAL_CELLS.length; step += 1) {
    const offset = ARRIVAL_CELLS[(start + step) % ARRIVAL_CELLS.length]
    const cell = { x: anchor.x + offset.x, z: anchor.z + offset.z }
    if (occupied.has(`${cell.x},${cell.z}`)) continue
    if (standable && !standable(cell)) continue
    return cell
  }

  /**
   * Nowhere in the spread worked.
   *
   * With a `standable` test that means the door is on something smaller than
   * the spread and every offset falls off it, so the answer is the door
   * itself: it was placed by somebody standing there, which makes it the one
   * cell in the ring known to hold a person. A pile on the anchor is what the
   * spread exists to avoid and is still far better than a room whose visitors
   * arrive in mid-air over it.
   */
  if (standable && standable(anchor)) return { x: anchor.x, z: anchor.z }

  // Every cell taken - more than 25 people standing on the door. Yours anyway,
  // and the physics pushes everyone apart; refusing to place somebody is not
  // an option a join path has.
  const mine = ARRIVAL_CELLS[start]
  return { x: anchor.x + mine.x, z: anchor.z + mine.z }
}

/**
 * How far from the door's own height a cell may be and still count as beside it.
 *
 * One cell, which is a step - the same height the movement code will walk you
 * up without a jump, so a door on a platform with a lip around it still
 * spreads onto the lip. Two would reach a floor you would have to jump to, and
 * "beside the door" would start meaning "on the next thing along".
 */
export const ARRIVAL_STEP = 1

/**
 * The height of the ground under a cell.
 *
 * Scoped to the one column rather than scanning the world for its highest
 * block, which would launch you into the sky off somebody's tower. Returns the
 * floor when the column is empty, so an arena with a hole in it drops you onto
 * the world's floor rather than into nothing.
 *
 * `ceiling` is the highest surface worth standing on, and it exists for the case
 * where "the top of this column" is the wrong answer: a start line with a wall,
 * an arch or a grandstand built around it. Without it, the highest block wins
 * and the grid puts racers on the roof - outside the course, looking down at the
 * field they were meant to be lined up on. With it, anything built *above* the
 * ground the line stands on is ignored, and a racer stands on the ground.
 *
 * Omitted everywhere the top genuinely is the answer - the lounge's door, a
 * template's floor - so this changes nothing for them.
 */
export function surfaceAt(
  blocks: readonly { x: number; y: number; z: number }[],
  x: number,
  z: number,
  floorY = 0,
  ceiling = Infinity,
): number {
  let surface = floorY

  for (const block of blocks) {
    if (block.x !== x || block.z !== z) continue
    const top = block.y + 1
    // Above the ceiling is scenery, not ground. A block whose *top* is level
    // with the ceiling is still floor you can stand on, which is why this is
    // `>` rather than `>=` - the ground a mark sits on has its top at the
    // mark's own y.
    if (top > ceiling) continue
    if (top > surface) surface = top
  }

  return surface
}

/**
 * How many cells of clear air a body needs above the ground it stands on.
 *
 * Two. The eye is at 1.7 and the head is a little above it, so one cell is a
 * surface you are wedged into rather than standing on. Cells rather than the
 * exact height because the world is a lattice and half a block of headroom is
 * not a thing anybody can build.
 */
export const HEADROOM = 2

/**
 * Where a person can actually stand in this column.
 *
 * `surfaceAt` answers "the top of this column", which is the right answer for an
 * open lounge and the wrong one for anything with a lid on it: build a roof over
 * the door and the top of the column is the roof, so people arrive on it. The
 * race worked around this by capping at the start mark's own height, which it
 * can do because a mark records where it was placed. A door does not - and
 * deliberately, per `world_spawns`: storing a height means a spawn floating a
 * metre up the day somebody digs under it.
 *
 * So the question is asked properly instead. Not "how high is this column" but
 * "where in this column is there room for a body", and of the answers, the
 * lowest one that is the top of an actual block - because a room with a roof
 * has two valid surfaces and the one you meant is the floor you built the roof
 * over, and because the world floor is not a floor at all under an island, it
 * is the level below which nothing falls. See the two loops at the bottom.
 *
 * That also keeps the case the old rule existed for. A solid tower has no gap
 * anywhere inside it, so every surface but the top fails the headroom check and
 * you arrive on top of it exactly as before. The rule did not change for open
 * ground; it just stopped being fooled by a ceiling, and then by a hole.
 */
export function standingSurface(
  blocks: readonly { x: number; y: number; z: number }[],
  x: number,
  z: number,
  floorY = 0,
  headroom = HEADROOM,
  /**
   * The height the door was set at, if it has one.
   *
   * Without it this returns the lowest surface in the column that has headroom
   * and something under it, which is right for a room with a roof on it - you
   * arrive on the floor rather than the tiles - and right on an island, whose
   * ground level is open air. What it cannot answer is which of two floors a
   * door was set on when both are real: a doorway on the first storey of a
   * house is the ground floor to this, and only the remembered height says
   * otherwise.
   *
   * A preference rather than a rule: it picks the clear surface *nearest* the
   * remembered height, so a door still works when the block it was set on has
   * since been broken, and an arrival never ends up inside anything. Undefined
   * is every spawn written before doors had a height, and behaves exactly as
   * it always did.
   */
  prefer?: number,
): number {
  /**
   * The column, as a set of filled cells.
   *
   * Built once rather than re-scanning per candidate, because this runs on
   * arrival for every person walking into a world and the block list is the
   * whole lounge.
   */
  const filled = new Set<number>()
  let highest = floorY

  for (const block of blocks) {
    if (block.x !== x || block.z !== z) continue
    filled.add(block.y)
    if (block.y + 1 > highest) highest = block.y + 1
  }

  // Every surface in this column: the world floor, and the top of each block.
  // Sorted, so "the lowest that works" is the first one that works.
  const surfaces = [floorY, ...[...filled].map((y) => y + 1)].sort((a, b) => a - b)

  const clearAt = (surface: number): boolean => {
    if (surface < floorY) return false
    for (let step = 0; step < headroom; step += 1) {
      if (filled.has(surface + step)) return false
    }
    return true
  }

  /**
   * The one nearest the height the door remembers, when it remembers one.
   *
   * Ties go to the higher surface: a door set exactly between two is a door on
   * the thing that was built, not on the ground under it.
   */
  if (prefer !== undefined) {
    let best: number | null = null
    for (const surface of surfaces) {
      if (!clearAt(surface)) continue
      if (
        best === null ||
        Math.abs(surface - prefer) < Math.abs(best - prefer) ||
        (Math.abs(surface - prefer) === Math.abs(best - prefer) && surface > best)
      ) {
        best = surface
      }
    }
    if (best !== null) return best
  }

  /**
   * The lowest clear surface that is the top of something, and only then the
   * bare world floor.
   *
   * "Lowest first" was the whole rule, and under anything floating it picks the
   * world floor: an island twenty blocks up is a column whose ground level is
   * wide open, so the lowest surface with headroom is the empty plane far below
   * the island - and every world in the catalogue whose door stands on
   * something raised put its visitors under it rather than on it. Reported as
   * the arrival being on 0.
   *
   * A remembered height answers this exactly, and above; this is the answer for
   * every door that has none - which is every door a published world carries,
   * because `BuilderWorld.spawn` is two numbers and stores no height at all.
   *
   * The distinction that does the work is between a surface that is the top of
   * a *block* and the world floor, which is nothing but the level below which
   * you cannot fall. Standing on the floor of a column that has blocks in it
   * and none of them under you is standing in a hole in the world; standing on
   * the lowest block-top with room above it is standing on the thing that was
   * built there. So the floor is kept as the answer of last resort - an empty
   * column, a pit dug out of the ground - rather than as the first one.
   *
   * Still lowest-first among the block-tops, which is what keeps the case this
   * function was written for: a roof over the door leaves two clear surfaces
   * and the one somebody meant is the floor they built the roof over, not the
   * roof.
   */
  let bare: number | null = null
  for (const surface of surfaces) {
    if (!clearAt(surface)) continue
    // The top of a block: something was built here to stand on.
    if (filled.has(surface - 1)) return surface
    if (bare === null) bare = surface
  }
  if (bare !== null) return bare

  /**
   * Nowhere in this column has room, which means it is solid to the top - a
   * tower, or a wall you have marked the door inside of. The top of it is where
   * the old rule would have put somebody and is still the least bad answer:
   * standing on the thing beats standing inside it.
   */
  return highest
}
