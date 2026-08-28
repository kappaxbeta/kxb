/**
 * Turning a list of models into something you can stand on.
 *
 * The character controller in ./physics.ts asks one question - is the unit cell
 * at (x, y, z) filled - and knows nothing else about the world. This is the
 * other half: every placement's measured box, rasterised into cells, once, when
 * the document loads.
 *
 * ---------------------------------------------------------------------------
 * Why a grid and not boxes
 * ---------------------------------------------------------------------------
 * Testing the player against a few thousand oriented boxes every frame is the
 * general solution and the wrong one to start with. A cell set is built once,
 * costs a hash lookup to query, and is exactly what the controller was written
 * against - so the walking, the sliding along walls, the landing and the two
 * jumps all work on day one, with 35 tests already covering them.
 *
 * What it gives up is sub-cell shape: a slope is a staircase to walk on, and a
 * barrel is a cube. That is the right trade for a prototype kit whose pieces
 * are whole numbers of metres, and Section 7 of docs/xp/creator.md is where the
 * per-blueprint box and sphere colliders arrive for the things that need them.
 *
 * ---------------------------------------------------------------------------
 * Shapes, where a box will not do
 * ---------------------------------------------------------------------------
 * A box is convex, and the pieces a level is *interesting* because of are not.
 * `Primitive_Stairs` is four cells on a side, so its box is a four-cell cube -
 * stairs you cannot climb, standing in a room, looking exactly like stairs.
 * `Primitive_Doorway` is a wall with a hole in it, and its box is a wall.
 *
 * Both are the worst kind of bug an editor can have, because the level *looks*
 * right: nothing is missing, nothing is misplaced, and the thing simply does
 * not do what its own picture promises. Neither was theoretical - the stairs
 * shipped in the first example room and somebody walked into them.
 *
 * So a model that does not fill its own box carries a mask of the cells it
 * really occupies, measured off the triangles at build time (`scripts/
 * voxelise.ts`). Eighteen of the eighty-six have one. The rest take the box
 * path, which is a range loop rather than a bit test per cell.
 *
 * What is still given up is sub-cell shape: a step is a cell tall whether the
 * model's step is or not, and a barrel is a cube. That is the right trade for a
 * kit whose pieces are whole numbers of metres.
 *
 * ---------------------------------------------------------------------------
 * Why rounding, not flooring
 * ---------------------------------------------------------------------------
 * The interesting decision. A wall is one metre thick and centred on its own
 * origin, so it runs from -0.5 to +0.5 and straddles a cell boundary. Floored
 * and ceiled honestly, that fills *two* cells - and a wall you cannot walk
 * within a metre of on either side is a wall that feels like a corridor.
 *
 * Rounding both ends asks a different question: which cells does this thing
 * essentially fill? The wall lands in one. A four-wide floor centred on the
 * origin runs -2..2 and lands in four, exactly under itself. A door 1.6 wide
 * takes two, which is the honest answer for a door you walk through.
 *
 * It is not exact and it is not meant to be. A cell grid cannot represent half
 * a wall, so the choice is which way to be wrong, and being wrong in the
 * direction of "the space looks like the space you can walk in" is the one a
 * player can predict.
 */

import { isFlat, stretchOf, tiltedBox, turnOf } from '../document/blueprints'
import { findModel, floorOffset } from '../assets/catalogue'
import type { Placement, XpWorld } from '../document/format'
import type { BounceTest, SolidTest, SurfaceTest } from './physics'

/** A cell, as a key. Faster to build than a nested map and trivial to debug. */
export function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/**
 * Round to a cell, and never hand back negative zero.
 *
 * `Math.round(-0.27)` is `-0`, which is the same cell as `0` by every operator
 * except `Object.is` - so it compares equal in the code and unequal in a test,
 * which is the worst possible combination. Adding zero normalises it (IEEE 754
 * says `-0 + 0` is `+0`) and costs nothing.
 */
const cell = (v: number) => Math.round(v) + 0

/** The cells one placement fills, as half-open integer ranges. */
export interface CellBox {
  minX: number
  minY: number
  minZ: number
  /** Inclusive: the last cell filled, not one past it. */
  maxX: number
  maxY: number
  maxZ: number
  /**
   * Where the box's top really is, in world units, before it was rounded up.
   *
   * The one number the rounding throws away and the one the controller needs:
   * `maxY` says *which cell* the top of this thing is in, and this says
   * **where in it**. A 0.500-tall floor tile at y=0 has `maxY: 0` and `top: 0.5`
   * - the cell it fills, and the height somebody standing on it should be at.
   *
   * See `Solids.topOf` for what reads it and why it took three bug reports to
   * find. Optional so that a `CellBox` written by hand in a test - which is how
   * most of them are made - still describes a box, and reads as "the top is the
   * cell's top", which is what every such box meant before this field existed.
   */
  top?: number
}

/**
 * Where a placement's box lands on the grid.
 *
 * Rotation is snapped to the nearest quarter turn *for the box only* - the
 * model is still drawn at whatever angle the document says. A box is
 * axis-aligned by construction, so the alternative is the bounding box of the
 * rotated box, which for anything at 45 degrees is noticeably bigger than the
 * thing it stands for. A quarter turn swaps width and depth and is exact for
 * every piece in a construction kit; anything else is a prop, and a prop's
 * collision being a quarter-turn approximation is not what anybody will notice
 * first.
 *
 * ---------------------------------------------------------------------------
 * A tilt cannot be snapped, so it is bounded
 * ---------------------------------------------------------------------------
 * The snap above works for one reason: a quarter turn of an axis-aligned box is
 * still an axis-aligned box. `pitch` and `roll` are not that, and there is no
 * cheap axis-aligned shape a tilted box is *close to* - so the only honest
 * answers are the bounding box of the tilt or nothing at all.
 *
 * It takes the bounding box, which is **bigger than what is drawn and never
 * smaller**. A ramp at 30 degrees fills the cells its slope passes through plus
 * the wedge of air above and below it. That is the direction to be wrong in:
 * bumping into air beside a ramp is an annoyance you can see the cause of, and
 * falling through a ramp you are standing on is a level that is broken. Said
 * out loud in §4 of docs/xp/manual.md, beside the note about the rounding.
 *
 * `stretch` needs none of this. It scales the model's own axes before the turn,
 * so a quarter turn still swaps two of them and the snap stays exact.
 */
export function placementCells(placement: Placement): CellBox | null {
  const entry = findModel(placement.model)
  if (!entry) return null

  return localCells(placement, modelBox(entry), standOf(placement))
}

/** A model's own bounds, in the shape `localCells` takes. */
function modelBox(entry: NonNullable<ReturnType<typeof findModel>>): LocalBox {
  return {
    x0: entry.min.x,
    y0: entry.min.y,
    z0: entry.min.z,
    w: entry.size.w,
    h: entry.size.h,
    d: entry.size.d,
  }
}

/** A box in the model's own frame: minimum corner and extent, before the scale. */
interface LocalBox {
  x0: number
  y0: number
  z0: number
  w: number
  h: number
  d: number
}

/**
 * How far a placement is raised so a model pivoted at its middle stands up.
 *
 * Lifted out of `localCells` because the collider path needs the same number:
 * a hand-drawn box is in the model's own frame, and the model's own frame is
 * the thing this offset moves. A leg copied out of the catalogue would
 * otherwise sit half a model below the model it belongs to.
 */
function standOf(placement: Placement): number {
  return floorOffset(placement.model) * placement.scale * stretchOf(placement.stretch).y
}

/**
 * Where one box in a model's frame lands on the grid.
 *
 * The body `placementCells` used to be, with the box passed in rather than read
 * off the catalogue - which is the whole of what a hand-drawn collider needs.
 * Sharing it is not tidiness: the quarter-turn switch below is the piece that
 * was got wrong once already (see the note about the west wall), and a second
 * copy of it for colliders would be a second chance to get it wrong, in a code
 * path that only the levels using the new field would exercise.
 */
function localCells(placement: Placement, local: LocalBox, stand: number): CellBox {
  const s = placement.scale
  const stretch = stretchOf(placement.stretch)
  const of = turnOf(placement)

  if (!isFlat(of)) {
    const box = tiltedBox({
      minX: local.x0,
      minY: local.y0,
      minZ: local.z0,
      maxX: local.x0 + local.w,
      maxY: local.y0 + local.h,
      maxZ: local.z0 + local.d,
    }, placement, of, {
      x: s * stretch.x,
      y: s * stretch.y,
      z: s * stretch.z,
    }, stand)
    const minX = cell(box.minX)
    const minY = cell(box.minY)
    const minZ = cell(box.minZ)
    return {
      minX,
      minY,
      minZ,
      maxX: Math.max(minX, cell(box.maxX) - 1),
      maxY: Math.max(minY, cell(box.maxY) - 1),
      maxZ: Math.max(minZ, cell(box.maxZ) - 1),
      // The tilted box's own top, which is the corner the tilt lifted highest.
      // A ramp is not the thing this was written for and gets the same answer
      // for free: its box stops where its highest corner does.
      top: box.maxY,
    }
  }

  // Quarter turns, normalised to 0..3. `rotation` is degrees, the editor's unit.
  const quarter = ((Math.round(placement.rotation / 90) % 4) + 4) % 4

  /** The box, scaled: minimum corner and extent along each axis. */
  const ox = local.x0 * s * stretch.x
  const oz = local.z0 * s * stretch.z
  const w = local.w * s * stretch.x
  const d = local.d * s * stretch.z

  /**
   * The box, turned about Y.
   *
   * Three.js rotates a point by `x' = x cos + z sin`, `z' = -x sin + z cos`, so
   * a quarter turn sends +x to -z. Both the *extent* and the *offset* have to
   * go through that, and getting only the extent right is a bug that hides: a
   * centred model looks perfect at every angle, because its offset is
   * symmetrical, while a hinged door swings off its hinge and a wall placed on
   * one side of a room turns up in the middle of it.
   *
   * That is exactly how it failed the first time. The walls of the example room
   * are the only turned pieces in it, and the west one landed nine cells inside
   * the room - which a test caught only because the player then walked straight
   * out through the gap where it should have been and fell out of the world.
   */
  let x0: number
  let z0: number
  let width: number
  let depth: number
  switch (quarter) {
    case 1: // 90: the x extent becomes the z extent, running the other way
      x0 = oz
      z0 = -(ox + w)
      width = d
      depth = w
      break
    case 2: // 180: both axes flip about the origin
      x0 = -(ox + w)
      z0 = -(oz + d)
      width = w
      depth = d
      break
    case 3: // 270
      x0 = -(oz + d)
      z0 = ox
      width = d
      depth = w
      break
    default:
      x0 = ox
      z0 = oz
      width = w
      depth = d
  }
  const minX = cell(placement.x + x0)
  const minZ = cell(placement.z + z0)
  const minY = cell(placement.y + local.y0 * s * stretch.y + stand)
  /** Where the geometry stops, before `cell` rounds it up. See `CellBox.top`. */
  const top = placement.y + (local.y0 + local.h) * s * stretch.y + stand

  return {
    top,
    minX,
    minY,
    minZ,
    // Rounded then stepped back one, so a box exactly one cell wide fills one
    // cell rather than two. A box that rounds to nothing - a bullet - still
    // fills the single cell it sits in rather than none, which keeps
    // `maxX >= minX` true and the loops below non-empty.
    maxX: Math.max(minX, cell(placement.x + x0 + width) - 1),
    maxY: Math.max(minY, cell(top) - 1),
    maxZ: Math.max(minZ, cell(placement.z + z0 + depth) - 1),
  }
}

/** What one placement contributes to the grid. */
export interface PlacementSolid {
  /**
   * The cell boxes it fills. One on the measured path, none for `none`, and as
   * many as the author drew otherwise.
   */
  boxes: CellBox[]
  /**
   * The occupancy mask to test inside `boxes[0]`, when there is one.
   *
   * Only ever set on the measured path. A hand-drawn collider *replaces* the
   * measured shape rather than intersecting with it - somebody drawing boxes is
   * doing it because the mask was wrong, and anding the two would mean the
   * override could only ever take cells away. It would also be unreadable: the
   * reason you can predict a two-box arch is that the two boxes are the whole
   * answer.
   */
  mask?: NonNullable<ReturnType<typeof findModel>>['mask']
}

/**
 * What a placement fills, after its collider override has its say.
 *
 * Separate from `placementCells`, which stays what it was: *the model's box on
 * the grid*, which is what the editor's brush ghost and the room-fit test want
 * and neither of which cares what the piece collides as. Folding the override
 * into it would have made a ghost vanish for a `none` piece, which is a preview
 * that lies about where the piece lands.
 *
 * Null means the model is not in the catalogue - the one thing `buildSolids`
 * reports as skipped. A piece you walk through is not skipped: it was read,
 * understood, and fills nothing on purpose.
 */
export function placementSolid(placement: Placement): PlacementSolid | null {
  const entry = findModel(placement.model)
  if (!entry) return null

  const collider = placement.collider
  if (collider === 'none') return { boxes: [] }

  const stand = standOf(placement)

  if (collider) {
    return {
      boxes: collider.map((box) =>
        localCells(placement, {
          x0: box.x ?? 0,
          y0: box.y ?? 0,
          z0: box.z ?? 0,
          w: box.w,
          h: box.h,
          d: box.d,
        }, stand),
      ),
    }
  }

  return {
    boxes: [localCells(placement, modelBox(entry), stand)],
    // A tilted piece fills its whole bounding box: the mask is indexed in the
    // model's frame and a tilt has no way back into it. See `maskFilled`.
    ...(isFlat(placement) && entry.mask ? { mask: entry.mask } : {}),
  }
}

/**
 * Is this world cell inside the model's shape?
 *
 * The world cell is walked back into the model's own frame: undo the placement,
 * undo the quarter turn, undo the scale, then read the bit. Backwards rather
 * than forwards - stamping the mask into the world - because a scaled placement
 * maps several world cells onto one mask cell, and iterating the mask would
 * leave gaps between them.
 *
 * The turn is the same one `placementCells` snapped, so the shape and the box
 * it lives in can never disagree about which way the piece is facing.
 *
 * **A tilted placement never gets here** - `buildSolids` drops the mask for one,
 * because the box it lives in is no longer the model's box swapped about and
 * there is nothing to walk a world cell back through. A tilted staircase is
 * therefore a solid tilted block, which is the same "bigger, never smaller"
 * choice `placementCells` makes one function up. A mask read against a box it
 * does not belong to would be the opposite: holes in the wrong places, which is
 * a level you fall through.
 */
function maskFilled(
  mask: NonNullable<ReturnType<typeof findModel>>['mask'],
  box: CellBox,
  placement: Placement,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!mask) return true

  // Where this cell sits inside the placement's box, in cells.
  const bx = x - box.minX
  const by = y - box.minY
  const bz = z - box.minZ

  const s = placement.scale
  const stretch = stretchOf(placement.stretch)
  const quarter = ((Math.round(placement.rotation / 90) % 4) + 4) % 4

  /**
   * Undo the scale: a piece at scale 2 maps two world cells onto each mask cell.
   *
   * Per axis, because `stretch` may make them differ - and in the *model's*
   * axes, which a quarter turn has already swapped: at 90 and 270 the world's x
   * runs along the model's z, so that is the multiplier to divide by. Dividing
   * both by the x one is invisible on every unstretched piece and puts a
   * stretched, turned mask a cell out along its long side.
   */
  const swapped = quarter === 1 || quarter === 3
  const sx = s * (swapped ? stretch.z : stretch.x)
  const sz = s * (swapped ? stretch.x : stretch.z)
  const u = Math.floor(bx / sx)
  const w = Math.floor(bz / sz)
  const my = Math.floor(by / (s * stretch.y))

  // Undo the turn. The box's own extents were swapped by the same rotation, so
  // the widths to reflect against come from the mask rather than from the box.
  let mx: number
  let mz: number
  switch (quarter) {
    /**
     * At 90 degrees model +x went to world -z, so a world cell `w` along z came
     * from model cell `nx - 1 - w` along x, and a world cell `u` along x came
     * straight from model z.
     *
     * Worth deriving rather than guessing: the first version had this case and
     * 270 the other way round, which is invisible on every symmetrical piece in
     * the kit and wrong on exactly the ones that have a shape worth masking.
     */
    case 1:
      mx = mask.nx - 1 - w
      mz = u
      break
    case 2:
      mx = mask.nx - 1 - u
      mz = mask.nz - 1 - w
      break
    case 3:
      mx = w
      mz = mask.nz - 1 - u
      break
    default:
      mx = u
      mz = w
  }

  if (mx < 0 || my < 0 || mz < 0 || mx >= mask.nx || my >= mask.ny || mz >= mask.nz) {
    return false
  }

  const index = mx + mask.nx * (my + mask.ny * mz)
  const nibble = parseInt(mask.bits[index >> 2] ?? '0', 16)
  return (nibble & (1 << (index & 3))) !== 0
}

/**
 * How many cells a rasterised world may fill before it is refused.
 *
 * Not a limit on ambition - a 256-cell world 64 high is four million cells and
 * would be a legitimate thing to build. It is a limit on one *document* turning
 * into a set that costs more than the browser has, which a handful of
 * placements scaled up by a thousand would otherwise do.
 */
export const MAX_SOLID_CELLS = 2_000_000

export interface Solids {
  /** The predicate the character controller takes. */
  isSolid: SolidTest
  /**
   * How high landing on each cell throws you, in cells. 0 everywhere in a world
   * with no springs in it, which is nearly all of them.
   *
   * Rasterised alongside `isSolid` in the same pass rather than looked up per
   * frame: a bouncy tile is a property of the *grid* once a document is loaded,
   * and asking "which placement is under my feet" sixty times a second would
   * reintroduce exactly the per-instance search this whole module exists to
   * avoid.
   */
  bounceOf: BounceTest
  /**
   * Where the geometry in a cell actually *stops*, rather than where its cell does.
   *
   * ---------------------------------------------------------------------------
   * The half-cell everybody has been standing on
   * ---------------------------------------------------------------------------
   * Reported three times, most recently as *"the height of the piece is like a
   * cell but not the actual height"*, which is the whole bug in the reporter's
   * own words. A placement rasterises into **whole cells** - it has to, the grid
   * is a `Set` of integer triples - so the platformer kit's floors, which are
   * 0.500 tall on purpose (`packs.ts`: "a stack of two makes a full one"), fill
   * the cell from 0 to 1. The controller then stands you on the *cell*: feet at
   * 1.0, art at 0.5, and a body visibly hanging half a metre over the floor it
   * is standing on. Every level built out of that kit, everywhere, since the
   * grid existed.
   *
   * `canStandIn` and `arrivalSpot` both have notes describing this as a quirk to
   * work around. It is not a quirk, it is the surface being wrong.
   *
   * So the pass that fills the cells also records how high the thing that filled
   * them really reaches, and the controller lands on *that*. The grid stays a
   * set of integer triples and stays as cheap to ask; this is one more `Map`
   * beside `bounceOf`, built in the same loop, read by the same "what is under my
   * feet" question.
   *
   * **The highest wins** where two placements fill one cell, matching what
   * `bounceOf` does a field up and what the controller does when a cell and a
   * blocker meet at one surface: a seam between two floors is not a step.
   *
   * Returns the cell's own top - `y + 1`, exactly what the controller assumed
   * before this existed - for a cell nothing claimed a height for. That is the
   * honest answer for the two cases that have none: a masked model, where the
   * cell is filled by a shape rather than a box and its top is wherever the
   * geometry happens to pass, and a cell of a world built by a caller that does
   * not rasterise. Never *above* the cell top and never below its floor, so a
   * surface is always somewhere inside the cell that carries it.
   */
  topOf: SurfaceTest
  /** How many cells ended up filled. Worth showing; it is a useful smell. */
  count: number
  /** Placements whose model is not in the catalogue, by index. Should be empty. */
  skipped: number[]
}

/**
 * Rasterise a world into a set of filled cells.
 *
 * Built once per document rather than per frame. A world is immutable while you
 * are walking around in it for now; when the editor can move a piece while the
 * try-out is running, this becomes an incremental update rather than a rebuild,
 * and the shape of that is: remove the old box's cells, add the new one's.
 */
export function buildSolids(world: XpWorld): Solids {
  const filled = new Set<string>()
  /**
   * The real top of whatever filled each cell. See `Solids.topOf`.
   *
   * Empty for every cell whose height is its cell's - the map is only written
   * where the geometry stops *inside* the cell, so a world built entirely out of
   * whole-cell architecture allocates nothing and the lookup falls through to
   * `y + 1`, which is what it always was.
   */
  const tops = new Map<string, number>()
  /**
   * Left empty in a world with no springs, and that is the point: the lookup
   * below is a `Map.get` on an empty map, which costs nothing measurable and
   * means the feature is free for every document that does not use it.
   */
  const springs = new Map<string, number>()
  const skipped: number[] = []

  world.placements.forEach((placement, index) => {
    const solid = placementSolid(placement)
    if (!solid) {
      skipped.push(index)
      return
    }

    /**
     * Nothing at all for a `none`, and that includes its `bounce`.
     *
     * A pad you fall through cannot throw you, so the loop below not running is
     * the whole behaviour rather than something to special-case. Worth saying
     * out loud because the two fields are independent everywhere else: a
     * document that sets both is not refused, it is a pad somebody turned off.
     */
    for (const box of solid.boxes) {
      for (let x = box.minX; x <= box.maxX; x++) {
        for (let y = box.minY; y <= box.maxY; y++) {
          for (let z = box.minZ; z <= box.maxZ; z++) {
            if (filled.size >= MAX_SOLID_CELLS) return
            // A masked model fills only the cells its geometry passes through;
            // everything else fills its box.
            if (solid.mask && !maskFilled(solid.mask, box, placement, x, y, z)) continue
            const key = cellKey(x, y, z)
            filled.add(key)
            /**
             * How high this box really reaches inside this cell.
             *
             * Only ever written for the *top* cell of a box, because that is the
             * only one where the two answers differ - a cell in the middle of a
             * wall is filled to its ceiling by definition, and recording `y + 1`
             * for it would be a map entry per cell of every level for no
             * information at all.
             *
             * And not for a masked cell: a mask fills a cell with a *shape*, and
             * the box's top says nothing about where that shape stops inside it.
             * Those keep the cell's own top, which is what the controller has
             * always used and is the safe direction - somebody stands on top of
             * a staircase's step rather than sinking into it.
             */
            if (box.top !== undefined && y === box.maxY && !solid.mask) {
              // Clamped into the cell it belongs to. A box whose top rounds to
              // the cell above - a wall exactly four cells tall - has its top
              // *at* this cell's ceiling, and a box shorter than nothing cannot
              // put a surface below the floor somebody is standing on.
              const within = Math.min(y + 1, Math.max(y, box.top))
              const already = tops.get(key)
              // The highest wins, as `bounce` does below: where a half-height
              // floor and a full-height block share a cell, the surface is the
              // one you would actually stand on.
              if (already === undefined || within > already) tops.set(key, within)
            }
            if (placement.bounce !== undefined) {
              // The highest wins where two pads overlap, matching what the
              // controller does when a cell and a box meet at one surface. A
              // seam between two springs is not a dead spot.
              const already = springs.get(key)
              if (already === undefined || placement.bounce > already) {
                springs.set(key, placement.bounce)
              }
            }
          }
        }
      }
    }
  })

  return {
    isSolid: (x, y, z) => filled.has(cellKey(x, y, z)),
    bounceOf: (x, y, z) => springs.get(cellKey(x, y, z)) ?? 0,
    // `y + 1` for anything nobody claimed a height for, which is the cell's own
    // top and exactly what the controller assumed before this existed.
    topOf: (x, y, z) => tops.get(cellKey(x, y, z)) ?? y + 1,
    count: filled.size,
    skipped,
  }
}

/**
 * `buildSolids`, remembered per placement list.
 *
 * Rasterising is a once-per-document cost everywhere it was used until now - the
 * runtime builds it when a level loads and walks around on it for the rest of the
 * session. The editor asks a different question at a different rate: *what is
 * under this spawn*, on every frame of a gizmo drag, which is the one call
 * pattern the un-cached function cannot survive. A world of a few thousand
 * placements is a few hundred thousand cells, and sixty of those a second is a
 * stall you can feel in the handle you are dragging.
 *
 * Keyed on `world.placements` rather than on the world or the document, and that
 * is the whole trick: an edit to a *mark* rebuilds the document, the world and
 * the marks array, and leaves the placements array exactly the object it was. So
 * the identity that survives a drag is precisely the identity this depends on,
 * and the day somebody lays a wall it misses - correctly, because a new wall is
 * new ground.
 *
 * A `WeakMap`, so a document that goes away takes its cells with it.
 */
const RASTERISED = new WeakMap<readonly Placement[], Solids>()

export function solidsFor(world: XpWorld): Solids {
  const already = RASTERISED.get(world.placements)
  if (already) return already
  const built = buildSolids(world)
  RASTERISED.set(world.placements, built)
  return built
}

/**
 * Where feet asked to be at `y` would actually come to rest, in one column.
 *
 * A drop, not a search: it looks *down* from the height it is given and returns
 * the top of the first solid it meets, which is the same answer gravity would
 * give a body let go there and nothing else. Looking up is deliberately not part
 * of it - a spawn buried inside a wall is a level problem, and quietly lifting
 * somebody out of one would hide it.
 *
 * `floorY` is the world's own plane when the document has one turned on, and
 * null when it does not - the two answers to "there is nothing here" being *you
 * land on the ground* and *there is no ground*. Null out means nothing to stand
 * on at all, which the caller is the one that can decide about: the editor keeps
 * the height the author typed, because a spawn over a hole they have not filled
 * in yet is a level half-built rather than a number to overrule.
 *
 * Cells rather than surfaces on the way down: a cell `c` is filled from `c` to
 * `c + 1`, so feet resting on top of it are at `c + 1`, which is why the loop
 * tests `top - 1` and returns `top`.
 */
export function standingSurface(
  isSolid: SolidTest,
  x: number,
  y: number,
  z: number,
  floorY: number | null,
  /**
   * Where the cell's geometry stops, when the caller rasterised one.
   *
   * The same answer the controller now lands on (`Solids.topOf`), asked here so
   * that "where would feet dropped here come to rest" and "where does the
   * controller actually put them" cannot give two different numbers. They did:
   * this returned the cell top, so an editor grounding a spawn onto a
   * half-height floor wrote the height of the *cell* into the document.
   */
  topOf?: SurfaceTest,
): number | null {
  const column = Math.floor(x)
  const row = Math.floor(z)
  const bottom = floorY ?? 0

  for (let top = Math.floor(y); top > bottom; top--) {
    if (isSolid(column, top - 1, row)) return topOf ? topOf(column, top - 1, row) : top
  }

  return floorY !== null && y >= floorY ? floorY : null
}
