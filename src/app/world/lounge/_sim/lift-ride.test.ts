import { expect, test } from 'bun:test'
import { EYE_HEIGHT, type Riding, step } from '@/app/world/lounge/_sim/physics'
import { deckCells, ThingSolids } from '@/app/world/lounge/_sim/thing-solids'
import { blockKey } from '@/domain/lounge/events'
import { cycleOf, freshLift, type MotionSpec, offsetAt } from '@/domain/thingiverse/motion'

/**
 * A whole lift, from the blueprint down to the body standing on it.
 *
 * Its own file because it is not a test of any one of the three pieces it
 * touches. `motion` says where the deck is, `ThingSolids` says what that means
 * for the world, and `physics` decides what happens to the rider - and the bug
 * this exists to hold shut lived in none of them: each was right on its own and
 * the contract between them was half a cell out.
 *
 * What was reported, and what this reproduces exactly when any part of that
 * contract is broken: "i get lifted but i am not on the object, and it jitters".
 * The cause was that the deck's surface reached the character controller as a
 * cell boundary rather than as a number, so a platform drawn at 1.3 held the
 * rider at 1.0, then teleported them a whole cell at 1.5 - four one-cell jumps
 * over a three-second rise, and the body left hanging a cell in the air when the
 * lift came home.
 *
 * The registration below is deliberately the same shape as `ThingModel`'s frame
 * loop, and it calls the same two functions that loop calls.
 */
function rideALift(halfWidth: number) {
  return rideA(freshLift(), halfWidth)
}

function rideA(motion: MotionSpec, halfWidth: number) {
  const solids = new ThingSolids()
  const dt = 1 / 60

  let covered = ''
  let body: {
    position: { x: number; y: number; z: number }
    velocityY: number
    grounded: boolean
    jumps: number
    rides?: Riding | null
  } = {
    position: { x: 0, y: 1 + EYE_HEIGHT, z: 0 },
    velocityY: 0,
    grounded: true,
    jumps: 0,
  }

  let worstGap = 0
  let worstDrift = 0
  let fastestFrame = 0
  let shoved = false
  let airborne = 0

  for (let i = 0; i < Math.ceil(cycleOf(motion) / dt); i++) {
    const shift = offsetAt(motion, i * dt)
    const box = {
      minX: -halfWidth + shift.x,
      maxX: halfWidth + shift.x,
      minY: shift.y,
      maxY: 1 + shift.y,
      minZ: -halfWidth + shift.z,
      maxZ: halfWidth + shift.z,
    }

    // Every frame, because this is the number the rider stands on.
    solids.ride('lift', {
      minX: box.minX,
      maxX: box.maxX,
      minZ: box.minZ,
      maxZ: box.maxZ,
      top: box.maxY,
    })

    // And the cells only when they have changed - keyed on the cells rather
    // than on a rounded offset, which is what left a *descending* lift's
    // collision hanging in the air above it.
    const keys = deckCells(box)
    const key = keys.join('|')
    if (key !== covered) {
      covered = key
      solids.set('lift', keys)
    }

    const was = body.position.y
    body = step({
      ...body,
      moveX: 0,
      moveZ: 0,
      jump: false,
      delta: dt,
      isSolid: (x, y, z) => solids.has(blockKey(x, y, z)),
      deckUnder: (x, z, r, lo, hi) => solids.surfaceUnder(x, z, r, lo, hi),
      rides: body.rides,
      floorY: -50,
    })

    worstGap = Math.max(worstGap, Math.abs(body.position.y - EYE_HEIGHT - box.maxY))
    fastestFrame = Math.max(fastestFrame, Math.abs(body.position.y - was))
    // How far the body has slipped from the spot on the platform it started on,
    // which for a slider is the whole question.
    worstDrift = Math.max(
      worstDrift,
      Math.hypot(body.position.x - shift.x, body.position.z - shift.z),
    )
    if (!body.grounded) airborne++
    // Off the deck entirely - which is what `escapeFrom` used to do.
    if (
      body.position.x < box.minX ||
      body.position.x > box.maxX ||
      body.position.z < box.minZ ||
      body.position.z > box.maxZ
    ) {
      shoved = true
    }
  }

  return {
    worstGap,
    worstDrift,
    fastestFrame,
    shoved,
    airborne,
    feet: body.position.y - EYE_HEIGHT,
    at: body.position,
  }
}

test('a rider is on the deck for every frame of the trip', () => {
  const wide = rideALift(1.5)

  // On it, not near it. This was ±0.5 - half a cell above the platform on the
  // way up and half a cell below it on the way down.
  expect(wide.worstGap).toBeLessThan(1e-9)

  // Never faster than the platform itself, which is the whole of "it jitters":
  // the body used to climb in 1.0-cell teleports while the deck moved 0.02.
  expect(wide.fastestFrame).toBeLessThan(0.05)

  // Never shoved out by `escapeFrom`, and never falling.
  expect(wide.shoved).toBe(false)
  expect(wide.airborne).toBe(0)

  // And home *on* the lift rather than a cell above it, which is where the
  // cell path parked everybody for good.
  expect(wide.feet).toBeCloseTo(1, 10)
})

test('a platform narrow enough to be squeezed off is ridden too', () => {
  // The nastier half of the report. `escapeFrom` prices sideways cheaper than
  // up, so on a lift about a cell across the cheapest way out of the deck's
  // own cells was off the side of it.
  const narrow = rideALift(0.6)

  expect(narrow.worstGap).toBeLessThan(1e-9)
  expect(narrow.shoved).toBe(false)
  expect(narrow.airborne).toBe(0)
})

test('the cells stop where the deck begins', () => {
  // The contract between the two halves. A deck whose top is at 1.3 is solid
  // through cell 0 and not through cell 1, because cell 1 is where the rider
  // is standing.
  const cells = deckCells({ minX: 0, maxX: 1, minY: 0.3, maxY: 1.3, minZ: 0, maxZ: 1 })

  expect(cells).toContain(blockKey(0, 0, 0))
  expect(cells).not.toContain(blockKey(0, 1, 0))
})

test('a sliding platform takes its rider with it', () => {
  // The `Sliding platform` starter: six cells across and back, forever.
  const slide = rideA(
    { by: { x: 6, y: 0, z: 0 }, out: 4, back: 4, waitOut: 1, waitHome: 1, ease: true },
    1.5,
  )

  // Not a millimetre of slip across the whole trip: the rider is exactly where
  // it started *on the platform*, six cells from where it started in the world.
  expect(slide.worstDrift).toBeLessThan(1e-9)
  expect(slide.shoved).toBe(false)
  expect(slide.airborne).toBe(0)

  // And home again, carried both ways.
  expect(slide.at.x).toBeCloseTo(0, 9)
  expect(slide.feet).toBeCloseTo(1, 10)
})

test('a rider walking on a slider is carried and walks at the same time', () => {
  const solids = new ThingSolids()
  const dt = 1 / 60
  let body: ReturnType<typeof step> = {
    position: { x: 0, y: 1 + EYE_HEIGHT, z: 0 },
    velocityY: 0,
    grounded: true,
    jumps: 0,
    rides: null,
  }

  // A platform sliding a steady one cell a second, and a rider walking across
  // it at a steady half a cell a second, the other way.
  for (let i = 1; i <= 120; i++) {
    const slid = i * dt
    const box = { minX: -3 + slid, maxX: 3 + slid, minY: 0, maxY: 1, minZ: -3, maxZ: 3 }
    solids.ride('slider', { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, top: 1 })
    solids.set('slider', deckCells(box))

    body = step({
      ...body,
      moveX: 0,
      moveZ: -0.5 * dt,
      jump: false,
      delta: dt,
      isSolid: (x, y, z) => solids.has(blockKey(x, y, z)),
      deckUnder: (x, z, r, lo, hi) => solids.surfaceUnder(x, z, r, lo, hi),
      floorY: -50,
    })
  }

  /*
    Two seconds: carried two cells along X by the platform, and walked one cell
    along Z under its own power. Both, not one or the other.

    X is short by exactly one frame of the platform's travel, and that is right
    rather than tolerated: on the frame a body lands on a platform the platform
    has already moved, and it moved while nobody was standing on it. A rider
    that inherited that frame would be dragged a little on every landing.
  */
  const boarding = 1 / 60
  expect(body.position.x).toBeCloseTo(2 - boarding, 9)
  expect(body.position.z).toBeCloseTo(-1, 9)
  expect(body.riding).toBe(true)
})

test('a slider grinds its rider along a wall rather than through it', () => {
  const solids = new ThingSolids()
  const dt = 1 / 60
  // A wall filling the cells from x=2 upward, at the height a rider stands.
  const wall = (x: number, y: number) => x === 2 && y >= 1 && y <= 3
  let body: ReturnType<typeof step> = {
    position: { x: 1.5, y: 1 + EYE_HEIGHT, z: 0.5 },
    velocityY: 0,
    grounded: true,
    jumps: 0,
    rides: null,
  }

  for (let i = 1; i <= 120; i++) {
    const slid = i * dt
    const box = { minX: -3 + slid, maxX: 3 + slid, minY: 0, maxY: 1, minZ: -3, maxZ: 3 }
    solids.ride('slider', { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, top: 1 })
    solids.set('slider', deckCells(box))

    body = step({
      ...body,
      moveX: 0,
      moveZ: 0,
      jump: false,
      delta: dt,
      isSolid: (x, y, z) => wall(x, y) || solids.has(blockKey(x, y, z)),
      deckUnder: (x, z, r, lo, hi) => solids.surfaceUnder(x, z, r, lo, hi),
      floorY: -50,
    })
  }

  // Stopped at the wall rather than pushed inside it, and still standing on the
  // platform that is now sliding out from under it.
  expect(body.position.x).toBeLessThanOrEqual(2 - 0.3 + 1e-9)
  expect(body.position.y - EYE_HEIGHT).toBeCloseTo(1, 10)
})

test('a deck survives its own footprint being re-registered', () => {
  // `set` calls `drop`, and `drop` forgets everything about a thing. A lift
  // crossing a cell boundary does both on one frame, and the order is the
  // renderer's - so losing the deck to the footprint would drop the rider once
  // per cell, which is exactly the symptom this all started as.
  const solids = new ThingSolids()
  solids.ride('lift', { minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 2.4 })
  solids.set('lift', deckCells({ minX: -1, maxX: 1, minY: 1.4, maxY: 2.4, minZ: -1, maxZ: 1 }))

  expect(solids.surfaceUnder(0, 0, 0.3, 0, 4)?.top).toBeCloseTo(2.4, 10)

  // And dismissing it takes the deck with it.
  solids.drop('lift')
  expect(solids.surfaceUnder(0, 0, 0.3, 0, 4)).toBeNull()
})
