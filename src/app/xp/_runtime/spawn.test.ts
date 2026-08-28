import { describe, expect, test } from 'bun:test'
import {
  ARRIVAL_SLOTS,
  ARRIVAL_SPACING,
  arrivalOffset,
  arrivalSpot,
  canStandIn,
  groundedSpot,
  samePlace,
  spawnFor,
  spawnMarks,
} from '@/app/xp/_runtime/spawn'
import { PERSONAL_SPACE, type SolidTest } from '@kxb/xp/engine'
import type { Mark } from '@kxb/xp'

/**
 * Arriving, checked without arriving.
 *
 * The runtime cannot be watched - the Browser pane is always `document.hidden`,
 * so `requestAnimationFrame` never fires - and "did everybody land somewhere
 * sensible" is a question about a moment that lasts one frame. It would
 * otherwise be checked by opening a room with several people in it, which is
 * both expensive and the least reliable way to find out.
 */

function mark(over: Partial<Mark> = {}): Mark {
  return { kind: 'spawn', x: 0, y: 0, z: 0, facing: 0, width: 5, height: 4, ...over }
}

const NOWHERE = { x: 99, y: 99, z: 99, facing: 45 }

describe('which spawn', () => {
  test('a document with no spawn marks falls back to its own point', () => {
    // Which is most documents, and not a degraded case: it is what a
    // single-player level means.
    expect(arrivalSpot([], {}, NOWHERE)).toEqual(NOWHERE)
    expect(arrivalSpot([mark({ kind: 'start' })], {}, NOWHERE)).toEqual(NOWHERE)
  })

  test('a side goes to its own side', () => {
    const marks = [mark({ team: 'red', x: -10 }), mark({ team: 'blue', x: 10 })]
    expect(spawnFor(marks, 'red')?.x).toBe(-10)
    expect(spawnFor(marks, 'blue')?.x).toBe(10)
  })

  test('somebody with no side gets the spawn nobody claimed', () => {
    /**
     * Rather than the first in the file. A level with one team spawn and one
     * neutral one should put the unassigned player at the neutral one - putting
     * them on red's spawn because red was written first is a bug an author
     * cannot see in the document.
     */
    const marks = [mark({ team: 'red', x: -10 }), mark({ x: 3 })]
    expect(spawnFor(marks)?.x).toBe(3)
  })

  test('and somebody with no side gets no side’s spawn at all', () => {
    /**
     * The bug this file shipped with for about ten minutes, caught by looking at
     * what actually changed in the documents we ship rather than by a test.
     *
     * Three of the four carry two spawn marks, both teamed, and `moving-parts`
     * puts its `xp.spawn` deliberately in the middle between them. "Fall back to
     * the first spawn" moved every teamless player six cells onto red's mark,
     * for no reason a reader of the document could see. Null here means the
     * caller uses the document's own point, which is exactly what a document
     * says about a player with no side.
     */
    const sides = [mark({ team: 'red', x: -6 }), mark({ team: 'blue', x: 6 })]
    expect(spawnFor(sides)).toBeNull()
    expect(arrivalSpot(sides, {}, NOWHERE)).toEqual(NOWHERE)
  })

  test('and a side with no spawn of its own still arrives somewhere', () => {
    // A half-finished level is still a level somebody is standing in.
    const marks = [mark({ team: 'red', x: -10 })]
    expect(spawnFor(marks, 'blue')?.x).toBe(-10)
  })

  test('only spawn marks count as spawns', () => {
    const marks = [mark({ kind: 'finish' }), mark({ kind: 'start' }), mark({ x: 4 })]
    expect(spawnMarks(marks)).toHaveLength(1)
    expect(spawnMarks(marks)[0].x).toBe(4)
  })
})

/**
 * Several marks that all fit, which is a choice rather than a tie.
 *
 * Reported against Proto Bug as *"they spawn all on the same spot"*. The
 * document places five spawn marks around the ship and `find` stopped at the
 * first one, so four of them were drawn in the editor, counted by
 * `capabilityProblems` and read by nobody — every player in the room arrived in
 * the same doorway.
 */
describe('a level that placed more than one spawn meant them', () => {
  const around = [mark({ x: -10 }), mark({ x: 0 }), mark({ x: 10 })]

  test('a roomful is spread across them', () => {
    const used = new Set(
      Array.from({ length: 40 }, (_, i) => spawnFor(around, undefined, `1f0a-4b2c-${i}`)?.x),
    )
    expect(used).toEqual(new Set([-10, 0, 10]))
  })

  test('the same person always gets the same one', () => {
    // The same property the slot has, and for the same reason: nobody is told
    // which mark is theirs, so every client has to work out the same answer.
    expect(spawnFor(around, undefined, 'player-abc')).toBe(
      spawnFor(around, undefined, 'player-abc')!,
    )
  })

  test('the editor’s preview, which has no id, still stands on the first', () => {
    // A level opened to be looked at has one arrival and it belongs where the
    // author is looking, which is the first mark in the file.
    expect(spawnFor(around)?.x).toBe(-10)
    expect(arrivalSpot(around, {}, NOWHERE).x).toBe(-10)
  })

  test('a side with two marks of its own is spread across those, and only those', () => {
    const marks = [
      mark({ team: 'red', x: -10 }),
      mark({ team: 'red', x: -6 }),
      mark({ team: 'blue', x: 10 }),
    ]
    const used = new Set(
      Array.from({ length: 40 }, (_, i) => spawnFor(marks, 'red', `1f0a-4b2c-${i}`)?.x),
    )
    expect(used).toEqual(new Set([-10, -6]))
  })

  test('and the mark is picked apart from the slot, so three marks are not three slots', () => {
    /**
     * The bug a single hash would have: mark and slot both taken from the same
     * number puts everybody at mark two in slot two, so a three-mark level uses
     * three of its twenty-seven places and the pile comes back smaller.
     */
    const spots = new Set(
      Array.from({ length: 60 }, (_, i) =>
        JSON.stringify(arrivalSpot(around, { id: `1f0a-4b2c-${i}` }, NOWHERE)),
      ),
    )
    expect(spots.size).toBeGreaterThan(around.length * 3)
  })
})

describe('the grid', () => {
  test('the first arrival stands exactly on the mark', () => {
    // What an author checks by standing on it. A single player nudged a cell off
    // their own spawn would read as the mark being in the wrong place.
    expect(arrivalOffset(0)).toEqual({ across: 0, back: 0 })
    expect(arrivalSpot([mark({ x: 5, z: -3, y: 2 })], {}, NOWHERE)).toEqual({
      x: 5,
      y: 2,
      z: -3,
      facing: 0,
    })
  })

  test('nobody stands close enough to be inside anybody', () => {
    /**
     * The whole point of the task. Every pair of the nine slots has to be at
     * least `PERSONAL_SPACE` apart, which is the distance at which two player
     * boxes touch - anything less and `separate` has work to do on the first
     * frame, which is the untangling this exists to prevent.
     */
    const spots = Array.from({ length: 9 }, (_, slot) => arrivalOffset(slot))

    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const gap = Math.hypot(spots[a].across - spots[b].across, spots[a].back - spots[b].back)
        expect(gap).toBeGreaterThanOrEqual(PERSONAL_SPACE)
      }
    }
  })

  test('and the grid stays small enough to sit on a ledge', () => {
    /**
     * The other half, and the one that is easy to lose while fixing the first.
     * A spread that puts somebody in mid-air is a worse bug than the one it
     * fixes: two people inside each other push apart next frame, and a player
     * spawned over a drop has lost the run before touching a key.
     */
    const spots = Array.from({ length: 9 }, (_, slot) => arrivalOffset(slot))
    const width = Math.max(...spots.map((s) => Math.abs(s.across))) * 2
    const depth = Math.max(...spots.map((s) => Math.abs(s.back)))

    expect(width).toBeLessThanOrEqual(3)
    expect(depth).toBeLessThanOrEqual(3)
  })

  test('rows go backwards, never in front', () => {
    /**
     * A mark's facing is which way you look when you arrive, so a second row
     * belongs behind the first. Arriving in front of somebody puts you in the
     * shot on a spawn nobody has left yet.
     */
    for (let slot = 0; slot < 9; slot++) {
      expect(arrivalOffset(slot).back).toBeGreaterThanOrEqual(0)
    }
  })

  test('columns alternate out from the middle rather than drifting one way', () => {
    // Otherwise every row leans right and a nine-person grid is a wedge hanging
    // off the side of the mark the author placed.
    const row = [arrivalOffset(0), arrivalOffset(1), arrivalOffset(2)]
    expect(row.map((s) => s.across)).toEqual([0, ARRIVAL_SPACING, -ARRIVAL_SPACING])
  })
})

describe('the mark decides which way you look', () => {
  test('a turned mark turns the grid with it', () => {
    /**
     * The geometry has to agree with `./marks.tsx`, which rotates the frame
     * about Y by `facing` degrees. At 90° the mark's "across" is the z axis, so
     * a grid that stayed on x would be laid out sideways through whatever the
     * author placed the spawn against.
     */
    const turned = [mark({ facing: 90 })]
    // Slot 1 is one place across, which at 90° is along -z.
    const spot = arrivalSpot(turned, { id: pick(turned, 1) }, NOWHERE)
    expect(spot.x).toBeCloseTo(0, 6)
    expect(spot.z).toBeCloseTo(-ARRIVAL_SPACING, 6)
  })

  test('you face the way the mark faces, not the way the document said', () => {
    // The whole reason a spawn has a facing: an author points it at what they
    // want somebody to see. Keeping `xp.spawn.facing` would place everybody
    // correctly and then turn them all to look at a wall.
    expect(arrivalSpot([mark({ facing: 180 })], {}, NOWHERE).facing).toBe(180)
  })
})

describe('who gets which slot', () => {
  test('the same person always lands in the same place', () => {
    // Which is what makes a spawn a place rather than a lottery, and what lets
    // every client work the arrangement out without anybody being told.
    const marks = [mark()]
    const once = arrivalSpot(marks, { id: 'player-abc' }, NOWHERE)
    const again = arrivalSpot(marks, { id: 'player-abc' }, NOWHERE)
    expect(again).toEqual(once)
  })

  test('a roomful lands on more than one square', () => {
    /**
     * Not a strong claim about the hash - collisions are allowed and `separate`
     * resolves them - but the failure this is guarding is a hash that returns
     * the same slot for everything, which would look exactly like the bug this
     * whole file exists to fix.
     */
    const marks = [mark()]
    const spots = new Set(
      Array.from({ length: 40 }, (_, i) =>
        JSON.stringify(arrivalSpot(marks, { id: `1f0a-4b2c-9d3e-${i}` }, NOWHERE)),
      ),
    )
    expect(spots.size).toBeGreaterThan(4)
  })

  test('nobody is placed off a mark that is not there', () => {
    // The fallback must not be nudged by a slot: a document with no spawn mark
    // puts everybody on `xp.spawn`, including the person whose id hashes to 7.
    expect(arrivalSpot([], { id: 'player-abc' }, NOWHERE)).toEqual(NOWHERE)
  })
})

/**
 * An id that lands on a given slot, found by trying.
 *
 * The alternative is exporting the hash so a test can invert it, which would
 * make the hash part of the API for the sake of one assertion.
 */
function pick(marks: readonly Mark[], slot: number): string {
  const base = arrivalSpot(marks, {}, NOWHERE)
  const want = arrivalOffset(slot)

  for (let i = 0; i < 10_000; i++) {
    const id = `probe-${i}`
    const spot = arrivalSpot(marks, { id }, NOWHERE)
    const radians = (marks[0].facing * Math.PI) / 180
    const across =
      (spot.x - base.x) * Math.cos(radians) - (spot.z - base.z) * Math.sin(radians)
    const back = -((spot.x - base.x) * Math.sin(radians) + (spot.z - base.z) * Math.cos(radians))
    if (Math.abs(across - want.across) < 1e-6 && Math.abs(back - want.back) < 1e-6) return id
  }

  throw new Error(`no id lands on slot ${slot}`)
}

/**
 * Arriving, and not arriving again.
 *
 * Reported from a live match as "I get reset often randomly": the controller put
 * the player back at the spawn whenever the *object* describing it changed
 * identity, which a re-render anywhere above can do without the spawn having
 * moved at all. `samePlace` is what turns that dependency from an identity into
 * a meaning.
 */
describe('samePlace', () => {
  const spot = { x: 3, y: 1, z: -2, facing: 90 }

  test('a fresh object describing the same spot is the same spot', () => {
    /**
     * The whole bug, in one assertion. `arrivalSpot` is a `useMemo` and it
     * returns a new object whenever any of its inputs changes identity - so this
     * is the common case, not the edge one, and `===` gets it wrong every time.
     */
    const copy = { ...spot }
    expect(samePlace(spot, copy)).toBe(true)
    // The comparison the effect used to make, spelled out: it is false here and
    // it was false in the match, which is why people were sent home mid-game.
    expect(Object.is(spot, copy)).toBe(false)
  })

  test('and two computations of the same spawn agree', () => {
    // Not a contrived literal: the real thing this guards is `arrivalSpot` being
    // called twice with equal inputs, which is exactly what a re-render causes.
    const marks = [mark({ x: 4, z: 4, facing: 45 })]
    const once = arrivalSpot(marks, { id: 'ada' }, { x: 0, y: 0, z: 0, facing: 0 })
    const again = arrivalSpot(marks, { id: 'ada' }, { x: 0, y: 0, z: 0, facing: 0 })
    expect(Object.is(once, again)).toBe(false)
    expect(samePlace(once, again)).toBe(true)
  })

  test('a spot that really moved is a different spot', () => {
    // The other half: a document edited in the workbench, or a player who
    // changed sides, must still be put where the new spawn is.
    expect(samePlace(spot, { ...spot, x: 3.0001 })).toBe(false)
    expect(samePlace(spot, { ...spot, y: 2 })).toBe(false)
    expect(samePlace(spot, { ...spot, z: 0 })).toBe(false)
  })

  test('turning on the spot counts as moving', () => {
    /**
     * `facing` is compared for the same reason `arrivalSpot` returns the mark's
     * heading rather than the document's: where you are looking when you arrive
     * is the point of a spawn having a heading at all. A player switched to the
     * other team's mark can land on the same coordinates facing the other way.
     */
    expect(samePlace(spot, { ...spot, facing: 270 })).toBe(false)
  })
})

/**
 * Standing on a platform, which is where this went wrong.
 *
 * Reported as *"when I put a spawn on a platform I fall through the platform"*,
 * and the file's own warning above `ARRIVAL_SPACING` had already named it: a
 * spread that puts somebody in mid-air is a worse bug than the one it fixes.
 * Tight is not zero.
 */
describe('the spread stays on the floor', () => {
  const ON = mark({ x: 0, y: 4, z: 0, facing: 0 })

  /** A platform two cells across, centred on the mark. Nothing else is solid. */
  const platform = (spot: { x: number; y: number; z: number }) =>
    Math.abs(spot.x) <= 1 && Math.abs(spot.z) <= 1 && spot.y === 4

  test('a slot over the edge is not used, and the mark is', () => {
    /*
     * Every id, rather than one that happens to hash badly: the bug is that
     * *some* players drop, so a test on one id passes eight times out of nine
     * by luck and is worth nothing.
     */
    for (let i = 0; i < 60; i++) {
      const spot = arrivalSpot([ON], { id: `player-${i}` }, NOWHERE, platform)
      expect(platform(spot)).toBe(true)
    }
  })

  test('and a level with room to spread still spreads', () => {
    // The fix must not collapse everybody onto the mark wherever there is floor
    // - two people inside each other is the bug the grid exists for.
    const anywhere = () => true
    const spots = new Set(
      Array.from({ length: 40 }, (_, i) => {
        const spot = arrivalSpot([ON], { id: `player-${i}` }, NOWHERE, anywhere)
        return `${spot.x},${spot.z}`
      }),
    )
    expect(spots.size).toBeGreaterThan(3)
  })

  test('with nothing to stand on anywhere, the mark wins', () => {
    // The author stood there on purpose. A spawn nobody can stand on is a level
    // problem, not something to fix by moving somebody somewhere they did not
    // choose.
    const nothing = () => false
    const spot = arrivalSpot([ON], { id: 'anybody' }, NOWHERE, nothing)
    expect(spot).toEqual({ x: 0, y: 4, z: 0, facing: 0 })
  })

  test('and without the test at all, nothing changes', () => {
    // Most callers are pure - tests, the editor, anything with no world built
    // yet - and they must keep the behaviour they had.
    const asked = arrivalSpot([ON], { id: 'player-7' }, NOWHERE, () => true)
    const unasked = arrivalSpot([ON], { id: 'player-7' }, NOWHERE)
    expect(unasked).toEqual(asked)
  })
})

/**
 * The drawing and the placement have to describe the same nine spots.
 *
 * `Footprint` builds its circles from `arrivalOffset`, and `arrivalSpot` places
 * people from the same function - so this pins that they stay one description.
 * A picture that disagreed with where people land is the bug this whole change
 * is a fix for.
 */
test('every circle the footprint draws is a spot somebody is placed on', () => {
  const mark: Mark = { kind: 'spawn', x: 7, y: 4, z: -3, facing: 90, width: 5, height: 4 }
  const drawn = Array.from({ length: ARRIVAL_SLOTS }, (_, slot) => arrivalOffset(slot))

  const radians = (mark.facing * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)

  // Where each drawn circle ends up in the world, applying the same frame the
  // component's <group rotation> applies.
  const circles = drawn.map((slot) => ({
    x: mark.x + slot.across * cos - slot.back * sin,
    z: mark.z - slot.across * sin - slot.back * cos,
  }))

  // Where players actually land, over enough ids to hit every slot.
  const landed = new Set(
    Array.from({ length: 300 }, (_, i) => {
      const spot = arrivalSpot([mark], { id: `p-${i}` }, { x: 0, y: 0, z: 0, facing: 0 })
      return `${spot.x.toFixed(4)},${spot.z.toFixed(4)}`
    }),
  )

  expect(landed.size).toBe(ARRIVAL_SLOTS)
  for (const circle of circles) {
    expect(landed.has(`${circle.x.toFixed(4)},${circle.z.toFixed(4)}`)).toBe(true)
  }
})

/**
 * Standing room, which the arrival grid used to take on trust.
 *
 * Reported as *"one member always lands in the walls"* while everybody else was
 * fine, and that asymmetry is the diagnosis: the row you stand in is chosen by
 * hashing your id, so a mark whose back row is buried in a wall traps exactly
 * the people whose hash lands there and nobody else. Three of nine slots on the
 * reported level were inside the north wall, and the check in front of them
 * asked only whether there was floor - which, on a level with `world.ground`
 * on, is yes everywhere.
 */
describe('whether a slot is somewhere you can stand', () => {
  /**
   * A floor filling the cell from 0 to 1, and a wall four cells tall at z = -3.
   *
   * The shape of the level it was reported on, and the thickness matters: a
   * placement is rounded to whole cells, so the half-height floor prototype the
   * level is built from is solid from 0 to 1 while it *draws* a top at 0.5.
   */
  const world = { ground: true, floorY: 0 }
  const isSolid: SolidTest = (x, y, z) =>
    (y === 0 && x >= -4 && x <= 12 && z >= -2 && z <= 12) || (z === -3 && y >= 0 && y <= 3)

  const can = canStandIn(world, isSolid)

  test('open floor is somewhere you can stand, even at the mark s own height', () => {
    /**
     * The regression the naive version would cause. A mark laid on the drawn
     * surface sits at 0.5, which is *inside* the solid cell - so a check at that
     * height alone rejects every slot on the level, and everybody piles onto
     * slot zero, which is equally buried.
     */
    expect(can({ x: 5, y: 0.5, z: 0 })).toBe(true)
    expect(can({ x: 5, y: 1, z: 0 })).toBe(true)
  })

  test('and a wall is not, at either height', () => {
    // Four cells tall, so there is nothing to step up onto - which is exactly
    // why the body stays buried where open floor would have lifted it.
    expect(can({ x: 5, y: 0.5, z: -2.5 })).toBe(false)
    expect(can({ x: 3.75, y: 0.5, z: -2.5 })).toBe(false)
  })

  test('nor is thin air off the edge of the ground', () => {
    expect(canStandIn({ ground: false, floorY: 0 }, isSolid)({ x: 40, y: 0.5, z: 40 })).toBe(false)
  })

  test('so no id, whoever they are, is sent into the wall', () => {
    /**
     * The end-to-end version, and the one that would have caught the report. It
     * sweeps ids rather than asserting one, because the failure was never "the
     * spawn is wrong" - it was "the spawn is wrong for one person in three".
     */
    const marks: Mark[] = [{ kind: 'spawn', x: 5, y: 0.5, z: 0, facing: 0, width: 5, height: 4 }]
    for (let n = 0; n < 200; n++) {
      const at = arrivalSpot(marks, { id: `who-${n}` }, { x: 0, y: 0, z: 0, facing: 0 }, can)
      expect({ n, standable: can(at) }).toEqual({ n, standable: true })
    }
  })
})

/**
 * A spawn nobody stands at, made into one on the way past.
 *
 * The editor already drops a spawn onto the ground as it is written, and that
 * does nothing at all for the levels that were saved before it - opening one
 * does not rewrite it. Reported twice as *"the character is always in the air"*,
 * the second time from a game rather than from the stage, which is this half.
 */
describe('an arrival stands on the ground', () => {
  /** A floor filling the cell from 0 to 1, and a platform two cells up at x >= 8. */
  const isSolid: SolidTest = (x, y, z) =>
    (y === 0 && x >= -10 && x <= 20 && z >= -10 && z <= 10) ||
    (y === 2 && x >= 8 && x <= 12 && z >= -2 && z <= 2)

  const world = { ground: true, floorY: 0 }

  test('a spawn up in the air comes down to the floor', () => {
    expect(groundedSpot(world, isSolid, { x: 0, y: 5, z: 0, facing: 90 })).toEqual({
      x: 0,
      y: 1,
      z: 0,
      facing: 90,
    })
  })

  test('and a spawn already standing on it is left exactly alone', () => {
    const at = { x: 0, y: 1, z: 0, facing: 0 }
    expect(groundedSpot(world, isSolid, at)).toBe(at)
  })

  test('a spawn over a platform finds the platform, not the floor under it', () => {
    /**
     * The objection `arrivalSpot` raises, tested rather than argued: a drop
     * cannot move somebody off the thing their author put them on, because the
     * thing is the first solid underneath them.
     */
    expect(groundedSpot(world, isSolid, { x: 10, y: 6, z: 0, facing: 0 }).y).toBe(3)
  })

  test('a spawn over nothing at all keeps the height it was given', () => {
    // A half-built level is not a number to overrule - the same answer the edit
    // layer's own `grounded` gives.
    const nothing = () => false
    const at = { x: 0, y: 7, z: 0, facing: 0 }
    expect(groundedSpot({ ground: false, floorY: 0 }, nothing, at)).toBe(at)
  })

  test('a mark on the drawn top of a half-height floor is not moved at all', () => {
    /**
     * The regression this nearly shipped with, and the reason for the cell of
     * slack. A placement rounds to whole cells, so the half-height floor
     * prototype *draws* a top at 0.5 and is *solid* to 1 - a mark laid where
     * somebody can see the surface is half a cell inside the solid one, and the
     * drop from there answers with the floor beneath it. Correcting on any
     * difference would move the spawn of every prototyping level down by half a
     * cell, silently, for no symptom anybody had.
     */
    expect(groundedSpot(world, isSolid, { x: 0, y: 0.5, z: 0, facing: 0 }).y).toBe(0.5)
  })

  test('and a whole cell of air is the point at which it is not slack any more', () => {
    // 0.9 above the surface is inside the grid's own rounding; 1.0 is somebody
    // standing in the air, which is the thing that was reported.
    expect(groundedSpot(world, isSolid, { x: 0, y: 1.9, z: 0, facing: 0 }).y).toBe(1.9)
    expect(groundedSpot(world, isSolid, { x: 0, y: 2, z: 0, facing: 0 }).y).toBe(1)
  })
})

describe('a seat is not a grid', () => {
  const seat = {
    kind: 'spawn' as const,
    team: 'blue',
    x: 4,
    y: 1,
    z: 6,
    facing: 0,
    width: 1,
    height: 1,
  }
  const shared = { ...seat, team: undefined, x: 4, y: 1, z: 6 }

  test('a player at a team mark lands on it, not a cell away from it', () => {
    /**
     * The grid is for several people arriving at *one* mark. A mark that names a
     * team is a seat - `sideOf` hands the sides out one apiece - so spreading
     * them solves a collision that cannot happen, and it costs the thing the
     * board game puts its seats on a piece for: arriving with one selected.
     */
    const at = arrivalSpot(
      [seat],
      { id: 'somebody-with-a-long-account-id', team: 'blue', seated: true },
      { x: 0, y: 0, z: 0, facing: 0 },
    )
    expect(at).toMatchObject({ x: 4, z: 6 })
  })

  test('and every player at it lands on it, whoever they are', () => {
    // Not one id that happens to hash to slot zero: all of them.
    for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff']) {
      expect(
        arrivalSpot([seat], { id, team: 'blue', seated: true }, { x: 0, y: 0, z: 0, facing: 0 }),
      ).toMatchObject({ x: 4, z: 6 })
    }
  })

  test('a mark with no team still spreads, because it may be shared', () => {
    const spots = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'].map((id) =>
      arrivalSpot([shared], { id }, { x: 0, y: 0, z: 0, facing: 0 }),
    )
    expect(new Set(spots.map((one) => `${one.x},${one.z}`)).size).toBeGreaterThan(1)
  })

  test('and so does a team mark when the room does not seat people one apiece', () => {
    /**
     * The case the first version of this got wrong. Under `assign: 'spread'` a
     * side is a *team* several people deep, so thirty of them share red's mark
     * and the grid is the only thing keeping them out of each other - which is
     * exactly what ../teams.test.ts guards, and what caught it.
     */
    const spots = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'].map((id) =>
      arrivalSpot([seat], { id, team: 'blue' }, { x: 0, y: 0, z: 0, facing: 0 }),
    )
    expect(new Set(spots.map((one) => `${one.x},${one.z}`)).size).toBeGreaterThan(1)
  })
})
