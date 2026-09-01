/**
 * Where the bodies go, when a thing is something you get into.
 *
 * In `_sim` rather than beside the component that calls it, which is the split
 * this folder keeps: what needs a frame loop to mean anything lives in
 * `_canvas`, and the arithmetic that would be just as true written down on
 * paper lives here, where it can be tested without a WebGL context.
 *
 * Both of these have been wrong in ways that are invisible until somebody is
 * standing inside a wall - a rotation applied the wrong way round seats people
 * behind the bench rather than on it - which is exactly the kind of thing a
 * test is for.
 */

import { seatAt, type UseSpec } from '@/domain/thingiverse/blueprint'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'

/**
 * Where a body stands while using something.
 *
 * The seat offset is authored in the *thing's* frame, so it turns with the
 * thing: a bench rotated to face the other way seats somebody facing the other
 * way rather than seating them in the wall behind it. This is the same
 * Y-rotation the renderer applies to the model, written out rather than shared,
 * because the renderer's copy is a three.js Euler on a group and this one is
 * three numbers going into a physics ref.
 */
export function seatOf(
  thing: { x: number; y: number; z: number; facing: number; scale: number },
  use: UseSpec,
  index = 0,
): { x: number; y: number; z: number } {
  // A seat index that names nothing falls back to the first, which every `use`
  // block has. It is reachable: somebody may edit a bench down to one seat
  // while a second person is sitting in what used to be seat three, and
  // shuffling them along is a better answer than dropping them through it.
  const seat = use.seats[index] ?? use.seats[0] ?? { x: 0, y: 0, z: 0 }

  const angle = (thing.facing * Math.PI) / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  // Scaled with the thing, so the seat on a bench blown up to twice its size is
  // still on the bench rather than hovering beside it.
  const x = seat.x * thing.scale
  const z = seat.z * thing.scale

  return {
    x: thing.x + 0.5 + x * cos + z * sin,
    y: thing.y + seat.y * thing.scale,
    z: thing.z + 0.5 + -x * sin + z * cos,
  }
}

/**
 * How close a body has to be to count as being in a seat.
 *
 * Half a cell. Bodies are pushed apart at `PERSONAL_SPACE`, which is wider than
 * this, so two people cannot be standing this close to the same point by
 * accident - which is exactly what makes the test reliable without anybody
 * broadcasting "I am sitting in seat two".
 */
const SEAT_TAKEN = 0.5

/**
 * Which seat to take.
 *
 * The nearest free one to where you are standing, and *free* is judged by
 * looking: a seat with somebody's body in it is taken. Nobody sends a message
 * saying which seat they are in, and this is why they do not have to - the
 * presence channel already carries where every body is, sixty times a second,
 * and a seat is a place.
 *
 * The cost of judging it this way is a real race and a small one: two people
 * pressing E in the same frame can pick the same seat, and what they see is the
 * two bodies standing in the same place until one of them gets up. The
 * alternative is a seat *claim* - a message, an owner, a timeout, a way to be
 * wrong when somebody's tab closes - which is a great deal of machinery for a
 * bench.
 *
 * Null when every seat is taken, which is what stops a ninth person joining an
 * eight-seater.
 */
export function freeSeat(
  thing: { x: number; y: number; z: number; facing: number; scale: number },
  use: UseSpec,
  from: { x: number; z: number },
  bodies: readonly { x: number; y: number; z: number }[],
): number | null {
  let best: number | null = null
  let bestDistance = Infinity

  for (let index = 0; index < use.seats.length; index += 1) {
    const at = seatOf(thing, use, index)

    const taken = bodies.some(
      (body) => Math.hypot(body.x - at.x, body.z - at.z) < SEAT_TAKEN,
    )
    if (taken) continue

    const distance = Math.hypot(at.x - from.x, at.z - from.z)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }

  return best
}

/**
 * Where one seat is relative to the *driver's*, in the thing's frame, scaled.
 *
 * The whole of what a passenger needs to ride: their body is the driver's
 * body plus this, turned to the driver's heading - see `ridePosition`. The
 * vehicle's own origin never enters into it, which is the trick: the driver's
 * pose is the one fact about a moving vehicle every client already has, sixty
 * times a second, and the difference between two seats is a fact about the
 * blueprint that never changes mid-drive.
 *
 * Sockets are resolved (`seatAt`), so a seat that rides on a crate bolted to
 * the tray is measured from where the crate actually is.
 */
export function seatDelta(
  spec: Parameters<typeof seatAt>[0] & { use: UseSpec | null },
  scale: number,
  seat: number,
): { x: number; y: number; z: number } {
  const seats = spec.use?.seats ?? []
  const fallback = { x: 0, y: 0, z: 0 }
  const mine = seatAt(spec, seats[seat] ?? seats[0] ?? fallback)
  const wheel = seatAt(spec, seats[0] ?? fallback)

  return {
    x: (mine.x - wheel.x) * scale,
    y: (mine.y - wheel.y) * scale,
    z: (mine.z - wheel.z) * scale,
  }
}

/**
 * Where a passenger's feet go, given the driver and the seat difference.
 *
 * The driver's broadcast position is their *eye*, as every position in this
 * scene is, and a seat names where feet go - so the eye height comes off
 * here, once, rather than at each of the three call sites (the rider's own
 * pin, the driver's screen, everybody else's).
 *
 * The rotation is the same one `seatOf` applies for a parked thing, run with
 * a continuous heading instead of a quarter turn: while driven, the vehicle's
 * nose is the driver's published yaw.
 */
export function ridePosition(
  driver: { x: number; y: number; z: number; yaw: number },
  delta: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const cos = Math.cos(driver.yaw)
  const sin = Math.sin(driver.yaw)

  return {
    x: driver.x + delta.x * cos + delta.z * sin,
    y: driver.y - EYE_HEIGHT + delta.y,
    z: driver.z + -delta.x * sin + delta.z * cos,
  }
}
