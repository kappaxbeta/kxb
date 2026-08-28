import { describe, expect, test } from 'bun:test'
import { findModel } from '../assets/catalogue'
import type { Placement, XpWorld } from '../document/format'
import { buildSolids, placementCells, solidsFor, standingSurface } from './solids'

/**
 * These run against the real catalogue rather than a fixture, on purpose. The
 * whole claim of ./solids.ts is that measured geometry lands on the grid where
 * the model is drawn, and a fixture with made-up numbers would prove that the
 * arithmetic is self-consistent while proving nothing about the pack.
 */

function place(model: string, x = 0, y = 0, z = 0, rotation = 0, scale = 1): Placement {
  return { model, x, y, z, rotation, scale }
}

/** A world out of placements alone. Marks are a fact for the rules, not the grid. */
function world(placements: Placement[]): XpWorld {
  return { floorY: 0, ground: false, restart: false,
  fatal: false, placements, marks: [] }
}

/** Width, height and depth of a cell box, in cells. */
function extent(box: NonNullable<ReturnType<typeof placementCells>>) {
  return {
    w: box.maxX - box.minX + 1,
    h: box.maxY - box.minY + 1,
    d: box.maxZ - box.minZ + 1,
  }
}

describe('a wall lands on the cells it looks like it fills', () => {
  test('four wide, four tall, and one thick rather than two', () => {
    // The reason rounding was chosen over flooring: the wall runs -0.5..0.5 in
    // z, straddling a cell boundary. Floored honestly it fills two cells, and a
    // wall you cannot walk within a metre of on either side reads as a corridor.
    const box = placementCells(place('proto/Primitive_Wall'))!
    expect(extent(box)).toEqual({ w: 4, h: 4, d: 1 })
  })

  test('centred on its own origin, so it straddles the cell it was placed at', () => {
    const box = placementCells(place('proto/Primitive_Wall', 10, 0, 5))!
    expect(box.minX).toBe(8)
    expect(box.maxX).toBe(11)
    expect(box.minZ).toBe(5)
    expect(box.maxZ).toBe(5)
  })

  test('a quarter turn swaps width for depth', () => {
    const straight = placementCells(place('proto/Primitive_Wall', 0, 0, 0, 0))!
    const turned = placementCells(place('proto/Primitive_Wall', 0, 0, 0, 90))!
    expect(extent(straight)).toEqual({ w: 4, h: 4, d: 1 })
    expect(extent(turned)).toEqual({ w: 1, h: 4, d: 4 })
  })

  test('a half turn is the same box as none, for a centred model', () => {
    const none = placementCells(place('proto/Primitive_Wall', 3, 0, 7, 0))!
    const half = placementCells(place('proto/Primitive_Wall', 3, 0, 7, 180))!
    expect(half).toEqual(none)
  })

  test('an angle between quarter turns snaps to the nearest one', () => {
    // The model still draws at 80 degrees; only the box snaps. An unsnapped box
    // would be the bounding box of a rotated box, which at 45 degrees is half
    // again as big as the thing it stands for.
    expect(placementCells(place('proto/Primitive_Wall', 0, 0, 0, 80))).toEqual(
      placementCells(place('proto/Primitive_Wall', 0, 0, 0, 90)),
    )
    expect(placementCells(place('proto/Primitive_Wall', 0, 0, 0, -90))).toEqual(
      placementCells(place('proto/Primitive_Wall', 0, 0, 0, 270)),
    )
  })
})

describe('the floor', () => {
  test('Primitive_Floor is a whole cell thick, so you stand where you should', () => {
    // This is why the example world is built out of the Primitive_ set: the
    // decorative floors are half a metre thick and would leave the player
    // standing half a cell above the surface they can see.
    const entry = findModel('proto/Primitive_Floor')!
    expect(entry.size.h).toBe(1)

    const box = placementCells(place('proto/Primitive_Floor', 0, 0, 0))!
    expect(box.minY).toBe(0)
    expect(box.maxY).toBe(0)
    expect(extent(box)).toEqual({ w: 4, h: 1, d: 4 })
  })

  test('a tile at y=0 fills exactly the cell layer at y=0', () => {
    const { isSolid } = buildSolids(world([place('proto/Primitive_Floor', 0, 0, 0)]))
    expect(isSolid(0, 0, 0)).toBe(true)
    expect(isSolid(-2, 0, -2)).toBe(true)
    expect(isSolid(1, 0, 1)).toBe(true)
    // One past the edge, and one layer up, are both empty.
    expect(isSolid(2, 0, 0)).toBe(false)
    expect(isSolid(0, 1, 0)).toBe(false)
  })
})

describe('a hinged model keeps its hinge', () => {
  test('a door runs from its origin, not from its centre', () => {
    // Door_A measures 0..1.6 in x. Assuming the centre would put it half a
    // metre into whatever it is hung in.
    const entry = findModel('proto/Door_A')!
    expect(entry.min.x).toBe(0)

    const box = placementCells(place('proto/Door_A', 4, 0, 0))!
    expect(box.minX).toBe(4)
  })

  test('turned, the leaf swings round the hinge and the hinge stays put', () => {
    /**
     * Three.js sends +x to -z on a quarter turn, so a door whose leaf ran from
     * the origin along +x now runs from the origin along -z. The hinge - the
     * cell the door is placed at - does not move, which is the whole point of
     * storing the min corner instead of assuming models are centred.
     *
     * This test asserted the opposite at first and passed, because the code was
     * wrong in the same direction. What caught it was not this file: it was the
     * example room walking test, where the same mistake put a wall nine cells
     * out of place and the player strolled through the gap.
     */
    const box = placementCells(place('proto/Door_A', 0, 0, 0, 90))!
    expect(box.minX).toBe(0)
    expect(box.minZ).toBe(-2)
    expect(box.maxZ).toBe(-1)
  })

  test('four quarter turns come back to where it started', () => {
    const start = placementCells(place('proto/Door_A', 6, 0, 3, 0))!
    expect(placementCells(place('proto/Door_A', 6, 0, 3, 360))).toEqual(start)
  })
})

describe('scale', () => {
  test('a doubled wall covers twice the cells', () => {
    const normal = placementCells(place('proto/Primitive_Wall', 0, 0, 0, 0, 1))!
    const big = placementCells(place('proto/Primitive_Wall', 0, 0, 0, 0, 2))!
    expect(extent(normal)).toEqual({ w: 4, h: 4, d: 1 })
    expect(extent(big)).toEqual({ w: 8, h: 8, d: 2 })
  })
})

describe('building a world', () => {
  test('a model we do not ship is reported rather than silently dropped', () => {
    const solids = buildSolids(world([place('proto/Primitive_Floor'), place('proto/Nope'), place('nonsense')]))
    expect(solids.skipped).toEqual([1, 2])
    expect(solids.count).toBeGreaterThan(0)
  })

  test('overlapping placements do not double-count cells', () => {
    const one = buildSolids(world([place('proto/Primitive_Floor')]))
    const twice = buildSolids(world([place('proto/Primitive_Floor'), place('proto/Primitive_Floor')]))
    expect(twice.count).toBe(one.count)
  })

  test('an empty world is empty, not solid', () => {
    const solids = buildSolids(world([]))
    expect(solids.count).toBe(0)
    expect(solids.isSolid(0, 0, 0)).toBe(false)
  })

  test('a tiny model still fills the one cell it sits in', () => {
    // A bullet is 0.08 cells across and would round to a box of nothing. An
    // empty box would make `maxX < minX` and the fill loops no-ops, so a
    // pickup would have no collision at all rather than a small one.
    const box = placementCells(place('proto/Bullet', 3, 1, 4))!
    expect(box.maxX).toBeGreaterThanOrEqual(box.minX)
    expect(box.maxY).toBeGreaterThanOrEqual(box.minY)
    expect(box.maxZ).toBeGreaterThanOrEqual(box.minZ)

    const solids = buildSolids(world([place('proto/Bullet', 3, 1, 4)]))
    expect(solids.count).toBeGreaterThan(0)
  })
})

describe('a room you can actually walk in', () => {
  /**
   * A floor with a wall across it, which is the smallest thing that proves the
   * grid and the controller agree: the floor holds you up and the wall stops
   * you, at the cells where they are drawn.
   */
  const room = buildSolids(world([
      place('proto/Primitive_Floor', 0, 0, 0),
      place('proto/Primitive_Floor', 4, 0, 0),
      place('proto/Primitive_Wall', 0, 1, 2),
    ]))

  test('the floor holds you up across both tiles', () => {
    expect(room.isSolid(0, 0, 0)).toBe(true)
    expect(room.isSolid(4, 0, 0)).toBe(true)
  })

  test('the wall stands on the floor rather than in it', () => {
    expect(room.isSolid(0, 1, 2)).toBe(true)
    expect(room.isSolid(0, 4, 2)).toBe(true)
    expect(room.isSolid(0, 5, 2)).toBe(false)
  })

  test('you can stand in front of the wall', () => {
    expect(room.isSolid(0, 1, 1)).toBe(false)
    expect(room.isSolid(0, 1, 0)).toBe(false)
  })
})

describe('a centred model is raised so it stands', () => {
  /**
   * The barrels in the example room sat half in the floor until this existed,
   * which is what an offline shot caught and no assertion had: the collision
   * box and the drawn model disagreed by half a barrel, and only one of them
   * was visible.
   */
  test('a barrel occupies the cell above the floor, not the floor itself', () => {
    const barrel = findModel('proto/Barrel_A')!
    expect(barrel.centred).toBe(true)

    // Placed on a floor whose top is y=1.
    const box = placementCells(place('proto/Barrel_A', 0, 1, 0))!
    expect(box.minY).toBe(1)
    expect(box.maxY).toBe(1)
  })

  test('a model that already stands is not raised', () => {
    const box = placementCells(place('proto/Primitive_Wall', 0, 1, 0))!
    expect(box.minY).toBe(1)
    expect(box.maxY).toBe(4)
  })

  test('the offset scales with the placement', () => {
    const big = placementCells(place('proto/Barrel_A', 0, 1, 0, 0, 4))!
    // Four times as tall, so it still starts on the floor rather than below it.
    expect(big.minY).toBe(1)
    expect(big.maxY).toBe(4)
  })
})

describe('shapes, where a box will not do', () => {
  /**
   * The bug a person found by walking into it: stairs are four cells on a side,
   * so their box is a four-cell cube - stairs you cannot climb, standing in a
   * room, looking exactly like stairs.
   */
  test('stairs are steps, not a cube', () => {
    const solids = buildSolids(world([place('proto/Primitive_Stairs', 0, 0, 0)]))

    // The bottom step is solid and the air above it is not - which is what
    // makes it a step rather than a wall.
    const box = placementCells(place('proto/Primitive_Stairs', 0, 0, 0))!
    const cube = (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1) * (box.maxZ - box.minZ + 1)
    expect(solids.count).toBeLessThan(cube)

    // Somewhere in the volume there is standable ground at more than one
    // height, which a cube cannot offer.
    const heights = new Set<number>()
    for (let x = box.minX; x <= box.maxX; x++) {
      for (let z = box.minZ; z <= box.maxZ; z++) {
        for (let y = box.minY; y <= box.maxY; y++) {
          if (solids.isSolid(x, y, z) && !solids.isSolid(x, y + 1, z)) heights.add(y)
        }
      }
    }
    expect(heights.size).toBeGreaterThan(1)
  })

  test('a doorway has an opening you can walk through', () => {
    /**
     * This test used to assert the opposite, and the reason it changed is worth
     * more than the assertion.
     *
     * `Primitive_Doorway` has a 1.6-metre opening in a four-metre wall and the
     * cell is a metre, so the opening straddles two cells and fills neither.
     * The voxeliser marked both solid and the doorway rasterised to a wall - an
     * opening you could see through and not walk through. That was written down
     * here as an honest limit, with the note that the fix was not a coverage
     * threshold, because eroding every thin wall in the kit to buy one piece is
     * a bad trade.
     *
     * It was not a threshold in the end. The probe box that decides whether a
     * triangle is in a cell was shrunk on all six sides so that a face lying on
     * a boundary belongs to the cell below it - correct between two cells, and
     * wrong at the outside of the model, where there is no second cell and the
     * face was simply thrown away. A shell that loses its outer faces is a shell
     * with nothing in it. See the note in `scripts/voxelise.ts`.
     *
     * So the doorway is a doorway now, and `a plain wall keeps its box` below is
     * the test that says nothing was eroded to get it.
     */
    const solids = buildSolids(world([place('proto/Primitive_Doorway', 0, 0, 0)]))
    const box = placementCells(place('proto/Primitive_Doorway', 0, 0, 0))!

    let open = 0
    for (let x = box.minX; x <= box.maxX; x++) {
      if (!solids.isSolid(x, box.minY, box.minZ)) open += 1
    }
    // Two cells of the four, which is the 1.6m opening rounded out to the
    // lattice rather than in. Generous by 40cm: you can clip the frame, where
    // before you could not pass at all.
    expect(open).toBe(2)

    // And it is an opening rather than a missing wall - the jambs either side
    // are still there, and so is the lintel over the top.
    expect(solids.isSolid(box.minX, box.minY, box.minZ)).toBe(true)
    expect(solids.isSolid(box.maxX, box.minY, box.minZ)).toBe(true)
    expect(solids.isSolid(box.minX + 1, box.maxY, box.minZ)).toBe(true)
  })

  test('a plain wall keeps its box - no mask, no bit tests', () => {
    const solids = buildSolids(world([place('proto/Primitive_Wall', 0, 0, 0)]))
    // Four wide, four tall, one thick, all of it solid.
    expect(solids.count).toBe(16)
  })

  test('a turned shape is turned, not mirrored', () => {
    /**
     * The case that caught a real error. Undoing a quarter turn has 90 and 270
     * as mirror images of each other, and swapping them is invisible on every
     * symmetrical piece in the kit - which is most of them - and wrong on
     * exactly the ones with a shape worth masking.
     *
     * Four turns of the same stairs must fill the same *number* of cells, and
     * turning it by 90 twice must equal turning it by 180.
     */
    const counts = [0, 90, 180, 270].map(
      (rotation) => buildSolids(world([place('proto/Primitive_Stairs', 0, 0, 0, rotation)])).count,
    )
    expect(new Set(counts).size).toBe(1)

    const at90 = buildSolids(world([place('proto/Primitive_Stairs', 0, 0, 0, 90)]))
    const at270 = buildSolids(world([place('proto/Primitive_Stairs', 0, 0, 0, 270)]))
    // Mirror images, so they must *not* be the same set of cells.
    const box = placementCells(place('proto/Primitive_Stairs', 0, 0, 0, 90))!
    let differs = false
    for (let x = box.minX; x <= box.maxX && !differs; x++) {
      for (let y = box.minY; y <= box.maxY && !differs; y++) {
        for (let z = box.minZ; z <= box.maxZ && !differs; z++) {
          if (at90.isSolid(x, y, z) !== at270.isSolid(x, y, z)) differs = true
        }
      }
    }
    expect(differs).toBe(true)
  })
})

/**
 * Springiness rasterised alongside solidity.
 *
 * The claim under test is that a bouncy placement puts its height on exactly
 * the cells it fills - so `bounceOf` and `isSolid` agree about where the pad
 * *is*, and a player who is standing on it is bouncing on it.
 */
describe('bouncy placements land on the grid with everything else', () => {
  function pad(bounce: number, x = 0, y = 0, z = 0): Placement {
    return { ...place('proto/Primitive_Floor', x, y, z), bounce }
  }

  test('every cell the pad fills is bouncy, and nothing else is', () => {
    const solids = buildSolids(world([pad(3)]))
    const box = placementCells(pad(3))!

    for (let x = box.minX; x <= box.maxX; x++) {
      for (let z = box.minZ; z <= box.maxZ; z++) {
        expect(solids.bounceOf(x, box.minY, z)).toBe(3)
      }
    }
    // A cell the placement does not reach, in a direction it is not four wide in.
    expect(solids.bounceOf(box.minX, box.maxY + 1, box.minZ)).toBe(0)
  })

  test('a world with no springs in it answers 0 everywhere', () => {
    const solids = buildSolids(world([place('proto/Primitive_Floor')]))
    expect(solids.bounceOf(0, 0, 0)).toBe(0)
    // And it is still solid, which is the half that must not change.
    expect(solids.isSolid(0, 0, 0)).toBe(true)
  })

  /**
   * Two pads over one another is a seam, and a seam that answered with the
   * *last* one written would be a dead spot whose position depends on the order
   * placements happen to appear in the file - the worst kind of level bug,
   * because moving an unrelated piece fixes it.
   */
  test('where two pads overlap, the higher one wins', () => {
    const quiet = buildSolids(world([pad(1), pad(6)]))
    const loud = buildSolids(world([pad(6), pad(1)]))
    expect(quiet.bounceOf(0, 0, 0)).toBe(6)
    expect(loud.bounceOf(0, 0, 0)).toBe(6)
  })
})

/**
 * Tilting and stretching, and what the grid does about each.
 *
 * The two are here together because they are the same field's worth of feature
 * and they get *opposite* answers out of the rasteriser, which is the thing
 * worth pinning: a stretch changes the numbers a quarter turn swaps and the
 * snap survives it, while a tilt has no quarter turn to snap to and takes the
 * bounding box instead.
 */
describe('a placement that is tilted or stretched', () => {
  test('a level piece is exactly the piece it was before either field existed', () => {
    // The promise the whole `isFlat` fast path is for: absent fields, absent
    // change. Not a tautology - both are read through `?? 0` and `?? 1` on
    // every path, and either default could have been written the other way.
    expect(placementCells({ ...place('proto/Primitive_Wall', 3, 0, 7, 90), pitch: 0, roll: 0 })).toEqual(
      placementCells(place('proto/Primitive_Wall', 3, 0, 7, 90)),
    )
  })

  test('stretching multiplies the model’s own axis, so a wall gets longer', () => {
    const wall = placementCells(place('proto/Primitive_Wall'))!
    const long = placementCells({ ...place('proto/Primitive_Wall'), stretch: { x: 3 } })!
    expect(extent(wall)).toEqual({ w: 4, h: 4, d: 1 })
    expect(extent(long)).toEqual({ w: 12, h: 4, d: 1 })
  })

  test('and it is the model’s axis and not the world’s: turned, the long side turns with it', () => {
    // The reason `stretch` is applied before the turn. In world axes these three
    // numbers would describe a different shape at every angle, which would make
    // `rotation` a field that changes what another field means.
    const turned = placementCells({
      ...place('proto/Primitive_Wall', 0, 0, 0, 90),
      stretch: { x: 3 },
    })!
    expect(extent(turned)).toEqual({ w: 1, h: 4, d: 12 })
  })

  test('the stretch reaches height too, and takes the stand-on-the-floor lift with it', () => {
    // A coin is one of the twenty pieces pivoted at its own middle, so the lift
    // that puts it on the floor is half its height - and half of twice as tall
    // is twice as far up. Getting this wrong sinks a stretched coin into the
    // ground, which is the bug the lift exists to prevent in the first place.
    const coin = placementCells(place('proto/Coin_A'))!
    const tall = placementCells({ ...place('proto/Coin_A'), stretch: { y: 2 } })!
    expect(tall.minY).toBe(coin.minY)
    expect(tall.maxY - tall.minY).toBeGreaterThan(coin.maxY - coin.minY)
  })

  /**
   * The honesty test, and the one that would be worth writing even if nothing
   * else here were: collision must never be *smaller* than the thing drawn.
   * Bumping into air beside a ramp is an annoyance you can see the cause of.
   * Falling through a ramp you are standing on is a level that is broken.
   */
  test('a tilt takes the box around the tilt — bigger than level, never smaller', () => {
    const level = placementCells(place('proto/Primitive_Wall'))!
    const tipped = placementCells({ ...place('proto/Primitive_Wall'), pitch: 30 })!

    expect(tipped.minX).toBeLessThanOrEqual(level.minX)
    expect(tipped.maxX).toBeGreaterThanOrEqual(level.maxX)
    expect(tipped.minY).toBeLessThanOrEqual(level.minY)
    expect(tipped.maxY).toBeGreaterThanOrEqual(level.maxY)
    expect(tipped.minZ).toBeLessThanOrEqual(level.minZ)
    expect(tipped.maxZ).toBeGreaterThanOrEqual(level.maxZ)
    // And it really is bigger: a wall one cell thick, pitched, reaches through
    // several. That is the wedge of air the manual warns about in §4.
    expect(tipped.maxZ - tipped.minZ).toBeGreaterThan(level.maxZ - level.minZ)
  })

  test('a quarter turn of pitch stands a wall on its end', () => {
    // Exact rather than approximate, because 90 degrees maps the box onto
    // itself: four wide and four tall becomes four wide and one tall, four deep.
    const wall = placementCells({ ...place('proto/Primitive_Wall'), pitch: 90 })!
    expect(extent(wall)).toEqual({ w: 4, h: 1, d: 4 })
  })

  test('roll does to the other axis what pitch does to this one', () => {
    const rolled = placementCells({ ...place('proto/Primitive_Wall'), roll: 90 })!
    expect(extent(rolled)).toEqual({ w: 4, h: 4, d: 1 })
  })

  /**
   * A mask is indexed in the model's own frame and a tilt has no way back into
   * it, so a tilted staircase is a solid tilted block rather than a staircase
   * with holes in the wrong places. The same "bigger, never smaller" choice.
   */
  test('a tilted masked model fills its whole box rather than reading its mask', () => {
    const stairs = { ...place('proto/Primitive_Stairs'), pitch: 20 }
    const box = placementCells(stairs)!
    const { isSolid } = buildSolids(world([stairs]))

    let empty = 0
    for (let x = box.minX; x <= box.maxX; x++) {
      for (let y = box.minY; y <= box.maxY; y++) {
        for (let z = box.minZ; z <= box.maxZ; z++) {
          if (!isSolid(x, y, z)) empty += 1
        }
      }
    }
    expect(empty).toBe(0)

    // Level, the same model still reads its mask - or this test would pass by
    // the mask having been dropped for everything.
    const flat = placementCells(place('proto/Primitive_Stairs'))!
    const level = buildSolids(world([place('proto/Primitive_Stairs')]))
    let holes = 0
    for (let x = flat.minX; x <= flat.maxX; x++) {
      for (let y = flat.minY; y <= flat.maxY; y++) {
        for (let z = flat.minZ; z <= flat.maxZ; z++) {
          if (!level.isSolid(x, y, z)) holes += 1
        }
      }
    }
    expect(holes).toBeGreaterThan(0)
  })

  /**
   * The mask undoes the scale per axis. Dividing both horizontal axes by the x
   * multiplier is invisible on every unstretched piece and puts a stretched,
   * turned mask a cell out along its long side - which is a step you fall
   * through on one staircase in a level and not on the one next to it.
   */
  test('a stretched mask is walked back through the axis it was stretched along', () => {
    const stairs = { ...place('proto/Primitive_Stairs'), stretch: { z: 2 } }
    const box = placementCells(stairs)!
    const { isSolid } = buildSolids(world([stairs]))

    // Still a staircase: solid at the bottom, open at the top of the low end.
    expect(isSolid(box.minX, box.minY, box.minZ)).toBe(true)
    let open = 0
    for (let x = box.minX; x <= box.maxX; x++) {
      for (let z = box.minZ; z <= box.maxZ; z++) {
        if (!isSolid(x, box.maxY, z)) open += 1
      }
    }
    expect(open).toBeGreaterThan(0)
  })
})

/**
 * The field that exists because the measured shape is sometimes wrong.
 *
 * A metre cell cannot hold an opening narrower than a metre, so the piece the
 * whole feature is for is an arch whose doorway rounded shut. These run against
 * `Primitive_Wall` rather than an arch, because a wall's box is four by four by
 * one in every version of the catalogue and an arch's is whatever the pack was
 * exported at - a test that pins the *mechanism* should not fail the day
 * somebody re-exports a model.
 */
describe('a collider drawn by hand', () => {
  const wall = 'proto/Primitive_Wall'

  test('"none" fills nothing, and is not a skipped placement', () => {
    const solids = buildSolids(world([{ ...place(wall), collider: 'none' }]))
    expect(solids.count).toBe(0)
    // The distinction that matters: a model the catalogue does not have is a
    // problem worth reporting, and a piece you walk through on purpose is not.
    expect(solids.skipped).toEqual([])
  })

  test('the piece is still drawn where it was - the ghost does not vanish', () => {
    // `placementCells` is the model's box on the grid and stays that whatever
    // the collider says, because the editor's brush preview is built from it.
    const box = placementCells({ ...place(wall), collider: 'none' })!
    expect(extent(box)).toEqual({ w: 4, h: 4, d: 1 })
  })

  test('two boxes are two legs, with air between them', () => {
    // A four-wide wall given a leg at each end: solid at x=-2 and x=1, open in
    // the middle, which is the doorway a mask could not keep.
    const arch: Placement = {
      ...place(wall),
      collider: [
        { x: -2, y: 0, z: -0.5, w: 1, h: 4, d: 1 },
        { x: 1, y: 0, z: -0.5, w: 1, h: 4, d: 1 },
      ],
    }
    const { isSolid, count } = buildSolids(world([arch]))

    expect(isSolid(-2, 0, 0)).toBe(true)
    expect(isSolid(1, 0, 0)).toBe(true)
    // The two cells between the legs, at head height and at the floor.
    expect(isSolid(-1, 0, 0)).toBe(false)
    expect(isSolid(0, 0, 0)).toBe(false)
    expect(isSolid(0, 3, 0)).toBe(false)
    // Two legs, one cell square, four tall.
    expect(count).toBe(8)
  })

  test('the boxes turn with the piece, so a turned arch keeps its doorway', () => {
    /**
     * The thing a collider in *world* axes would get wrong, and it would get it
     * wrong silently: a gateway laid facing north works, the same gateway
     * turned to face east has its legs lying across the road.
     */
    const legs = [
      { x: -2, y: 0, z: -0.5, w: 1, h: 4, d: 1 },
      { x: 1, y: 0, z: -0.5, w: 1, h: 4, d: 1 },
    ]
    const turned = buildSolids(world([{ ...place(wall, 0, 0, 0, 90), collider: legs }]))

    // A quarter turn sends the model's +x to the world's -z, so the legs now
    // run along z and the gap is along z as well.
    expect(turned.isSolid(0, 0, -2)).toBe(true)
    expect(turned.isSolid(0, 0, 1)).toBe(true)
    expect(turned.isSolid(0, 0, 0)).toBe(false)
    expect(turned.isSolid(0, 0, -1)).toBe(false)
    // The same eight cells, stood somewhere else.
    expect(turned.count).toBe(8)
  })

  test('a drawn collider replaces the mask rather than being cut by it', () => {
    /**
     * Stairs are the sharpest case: their mask is a staircase, so anding the
     * two would leave a box with steps cut out of it and an author who drew a
     * solid plinth would get a staircase anyway. The override is the whole
     * answer, which is what makes it predictable.
     */
    const plinth: Placement = {
      ...place('proto/Primitive_Stairs'),
      collider: [{ x: -2, y: 0, z: -2, w: 4, h: 4, d: 4 }],
    }
    const { count } = buildSolids(world([plinth]))
    expect(count).toBe(64)

    // And the same model without the override is not a cube - the mask is
    // genuinely there to be replaced.
    expect(buildSolids(world([place('proto/Primitive_Stairs')])).count).toBeLessThan(64)
  })

  test('the scale reaches a drawn box, as it reaches everything else', () => {
    const twice: Placement = {
      ...place(wall, 0, 0, 0, 0, 2),
      collider: [{ x: -0.5, y: 0, z: -0.5, w: 1, h: 1, d: 1 }],
    }
    // One model-unit cube at scale 2 is two cells on a side.
    expect(buildSolids(world([twice])).count).toBe(8)
  })

  test('a piece you walk through cannot throw you, whatever its bounce says', () => {
    const pad: Placement = { ...place('proto/Primitive_Floor'), bounce: 6, collider: 'none' }
    const solids = buildSolids(world([pad]))
    expect(solids.count).toBe(0)
    expect(solids.bounceOf(0, 0, 0)).toBe(0)
  })

  test('a drawn box carries the bounce, so a pad can be a smaller pad', () => {
    const pad: Placement = {
      ...place('proto/Primitive_Floor'),
      bounce: 6,
      collider: [{ x: -0.5, y: -0.5, z: -0.5, w: 1, h: 1, d: 1 }],
    }
    const solids = buildSolids(world([pad]))
    expect(solids.bounceOf(0, 0, 0)).toBe(6)
    // And nowhere else: the floor is four cells wide and the pad is one.
    expect(solids.bounceOf(2, 0, 2)).toBe(0)
  })
})

/**
 * What a spawn's height gets corrected to, as a question about one column.
 *
 * The editor is the caller (see `grounded` in ./edit), and the reason it is a
 * separate function with its own tests is the boundary it sits on: "a cell is
 * filled from c to c + 1, so feet on top of it are at c + 1" is exactly the
 * off-by-one that put a body half inside a floor in the lounge, and it deserves
 * to be pinned somewhere the editor's own concerns are not in the way.
 */
describe('where feet come to rest', () => {
  const floor = () => buildSolids(world([place('proto/Primitive_Floor', 0, 0, 0)])).isSolid

  test('a height above a tile comes down to the top of it', () => {
    expect(standingSurface(floor(), 0, 9, 0, null)).toBe(1)
  })

  test('a height already on it stays there rather than being nudged', () => {
    expect(standingSurface(floor(), 0, 1, 0, null)).toBe(1)
  })

  test('it looks down and never up, so a spawn under a shelf is left where it is', () => {
    // A drop is what gravity would do; lifting somebody *out* of a place they
    // were put would hide the level problem rather than report it.
    const shelf = buildSolids(world([place('proto/Primitive_Floor', 0, 4, 0)])).isSolid
    expect(standingSurface(shelf, 0, 1, 0, null)).toBeNull()
  })

  test('nothing underneath and no ground plane is null, not zero', () => {
    // The difference the editor turns into "keep the height the author typed".
    // Zero would quietly move a spawn in a level whose floor is not built yet.
    expect(standingSurface(buildSolids(world([])).isSolid, 0, 5, 0, null)).toBeNull()
  })

  test("a world's own ground plane is a surface, and catches what the cells do not", () => {
    expect(standingSurface(buildSolids(world([])).isSolid, 0, 5, 0, 0)).toBe(0)
    expect(standingSurface(buildSolids(world([])).isSolid, 0, 5, 0, 2)).toBe(2)
  })

  test('and a height below that plane is not raised onto it', () => {
    // Symmetry with the shelf above: this only ever comes down.
    expect(standingSurface(buildSolids(world([])).isSolid, 0, -3, 0, 0)).toBeNull()
  })

  test('the column is the one under the point, not the one it rounds to', () => {
    // The tile spans -2..1 in both axes. Just off the end of it is off it.
    expect(standingSurface(floor(), 1.9, 5, 0, null)).toBe(1)
    expect(standingSurface(floor(), 2.1, 5, 0, null)).toBeNull()
  })
})

/**
 * The cache is a promise about *when* a rebuild happens, so it is tested as one.
 *
 * It exists because the editor asks this per frame of a gizmo drag, and the
 * failure it is guarding against is not slowness - it is a stale answer. A wall
 * laid and then not seen would be a spawn that drops through the floor somebody
 * just built.
 */
describe('rasterising is remembered per placement list', () => {
  test('the same placements come back as the same grid', () => {
    const placements = [place('proto/Primitive_Floor', 0, 0, 0)]
    expect(solidsFor(world(placements))).toBe(solidsFor(world(placements)))
  })

  test('a new placement list is a new grid, because new walls are new ground', () => {
    const one = solidsFor(world([place('proto/Primitive_Floor', 0, 0, 0)]))
    const two = solidsFor(world([place('proto/Primitive_Floor', 0, 0, 0)]))
    expect(one).not.toBe(two)
    expect(two.count).toBe(one.count)
  })
})

/**
 * The half-cell everybody has been standing on.
 *
 * Reported three times over two days, the last time with the diagnosis attached:
 * *"the height of the piece of the box is like a cell but not the actual
 * height"*. A placement fills whole cells, so a floor tile 0.500 tall fills the
 * cell from 0 to 1, and the controller stood somebody on the **cell**. Feet at
 * 1.0, art at 0.5, and a body hanging half a metre over the floor it is on - in
 * every level built from any kit whose floors are not exactly a cell thick,
 * which is most of them: the platformer's are 0.5, the dungeon's 0.15, the
 * spaceship's 0.3.
 *
 * `canStandIn` and `arrivalSpot` both carried notes describing this as a quirk
 * to work around. It was the surface being wrong.
 */
describe('a floor thinner than its cell', () => {
  test('the cell it fills is still the whole cell', () => {
    // Unchanged, and it has to be: the grid is a set of integer triples and a
    // floor that filled no cell would be one you fall through.
    const box = placementCells(place('proto/Floor_Prototype'))!
    expect(box.minY).toBe(0)
    expect(box.maxY).toBe(0)
  })

  test('but the surface is where the tile actually stops', () => {
    const solids = buildSolids(world([place('proto/Floor_Prototype')]))
    expect(solids.isSolid(0, 0, 0)).toBe(true)
    expect(solids.topOf(0, 0, 0)).toBeCloseTo(0.5, 5)
  })

  test('a floor a whole cell thick still tops out at its cell', () => {
    // The other half of the same claim, and the one that says this changes
    // nothing for the prototype kit every level we ship is built from.
    const solids = buildSolids(world([place('proto/Primitive_Floor')]))
    expect(solids.topOf(0, 0, 0)).toBeCloseTo(1, 5)
  })

  test('the highest wins where two floors share a cell', () => {
    // A seam between a thin tile and a thick one is not a step down.
    const solids = buildSolids(
      world([place('proto/Floor_Prototype'), place('proto/Primitive_Floor')]),
    )
    expect(solids.topOf(0, 0, 0)).toBeCloseTo(1, 5)
  })

  test('a cell nobody claimed a height for is full to its ceiling', () => {
    // Which is what the controller assumed before any of this existed, and the
    // right answer for a masked model: a mask fills a cell with a *shape*, and
    // the box's top says nothing about where that shape stops inside it.
    const solids = buildSolids(world([place('proto/Primitive_Stairs')]))
    expect(solids.topOf(0, 0, 0)).toBe(1)
  })

  test('and the surface is never outside the cell that carries it', () => {
    // A stack of tiles: each one's top belongs to its own cell, and a top that
    // rounded into the cell above would be a floating surface with air under it.
    const solids = buildSolids(
      world([place('proto/Floor_Prototype', 0, 0, 0), place('proto/Floor_Prototype', 0, 1, 0)]),
    )
    expect(solids.topOf(0, 0, 0)).toBeCloseTo(0.5, 5)
    expect(solids.topOf(0, 1, 0)).toBeCloseTo(1.5, 5)
  })

  test('dropping feet onto it lands on the tile, not on the cell', () => {
    const solids = buildSolids(world([place('proto/Floor_Prototype')]))
    expect(standingSurface(solids.isSolid, 0, 4, 0, null, solids.topOf)).toBeCloseTo(0.5, 5)
    // And without being told about surfaces, the answer it always gave.
    expect(standingSurface(solids.isSolid, 0, 4, 0, null)).toBe(1)
  })
})
