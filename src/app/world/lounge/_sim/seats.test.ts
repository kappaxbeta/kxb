import { describe, expect, test } from 'bun:test'
import { freeSeat, ridePosition, seatDelta, seatOf } from '@/app/world/lounge/_sim/seats'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { freshUse, type UseSpec } from '@/domain/thingiverse/blueprint'

/** A bench in cell (4, 0, 4), facing north, at its own size. */
const bench = { x: 4, y: 0, z: 4, facing: 0, scale: 1 }

const three: UseSpec = {
  ...freshUse(),
  seats: [
    { x: -0.6, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0.6, y: 0, z: 0 },
  ],
}

/** Round, so a quarter turn's floating point does not fail a test about seats. */
function at(seat: { x: number; y: number; z: number }) {
  return {
    x: Math.round(seat.x * 1000) / 1000,
    y: Math.round(seat.y * 1000) / 1000,
    z: Math.round(seat.z * 1000) / 1000,
  }
}

describe('where a body stands', () => {
  test('the middle of the cell, for a seat at the thing s own origin', () => {
    expect(at(seatOf(bench, freshUse()))).toEqual({ x: 4.5, y: 0, z: 4.5 })
  })

  test('a seat offset along x lands along x while the thing faces north', () => {
    expect(at(seatOf(bench, three, 2))).toEqual({ x: 5.1, y: 0, z: 4.5 })
  })

  test('turning the bench turns the seats with it', () => {
    // A quarter turn takes the seat that was to the east round to the south:
    // this is the bug the rotation exists to prevent, where a turned bench
    // seats somebody in the wall it was pushed against.
    const turned = { ...bench, facing: 1 }
    expect(at(seatOf(turned, three, 2))).toEqual({ x: 4.5, y: 0, z: 3.9 })
  })

  test('a bigger thing has its seats further out', () => {
    expect(at(seatOf({ ...bench, scale: 2 }, three, 2))).toEqual({ x: 5.7, y: 0, z: 4.5 })
  })

  test('a seat index that names nothing falls back to the first', () => {
    // Reachable: somebody edits a three-seater down to one while a second
    // person is sitting in what used to be seat three.
    expect(at(seatOf(bench, three, 9))).toEqual(at(seatOf(bench, three, 0)))
  })
})

describe('which seat you get', () => {
  test('the nearest free one to where you were standing', () => {
    expect(freeSeat(bench, three, { x: 6, z: 4.5 }, [])).toBe(2)
    expect(freeSeat(bench, three, { x: 3, z: 4.5 }, [])).toBe(0)
  })

  test('a seat with a body in it is taken', () => {
    const sitting = [{ x: 5.1, y: 0, z: 4.5 }]
    expect(freeSeat(bench, three, { x: 6, z: 4.5 }, sitting)).toBe(1)
  })

  test('a full bench seats nobody else', () => {
    const full = three.seats.map((_, index) => seatOf(bench, three, index))
    expect(freeSeat(bench, three, { x: 6, z: 4.5 }, full)).toBeNull()
  })

  test('somebody walking past is not sitting on it', () => {
    // A metre away is walking past. Bodies are pushed apart at more than the
    // seat's own radius, so this cannot be a false positive by accident.
    const passing = [{ x: 5.1, y: 0, z: 5.5 }]
    expect(freeSeat(bench, three, { x: 6, z: 4.5 }, passing)).toBe(2)
  })
})

describe('riding along', () => {
  /** A kart: the wheel at the front, a pillion half a cell behind it. */
  const kart = {
    use: {
      enter: null,
      loop: null,
      leave: null,
      seats: [
        { x: 0, y: 0.3, z: 0.4 },
        { x: 0, y: 0.3, z: -0.1 },
      ],
      inputs: [],
    },
  }

  test('the driver s own delta is nothing', () => {
    expect(seatDelta(kart, 1, 0)).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('a pillion is behind the wheel, scaled with the thing', () => {
    expect(seatDelta(kart, 2, 1)).toEqual({ x: 0, y: 0, z: -1 })
  })

  test('a seat index that names nothing rides the wheel rather than nowhere', () => {
    expect(seatDelta(kart, 1, 9)).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('the delta turns with the driver, and the eye height comes off', () => {
    const delta = { x: 0, y: 0, z: -1 }

    // Nose along +z: the pillion sits one cell behind, at the driver's feet.
    const north = ridePosition({ x: 10, y: EYE_HEIGHT, z: 10, yaw: 0 }, delta)
    expect(at(north)).toEqual({ x: 10, y: 0, z: 9 })

    // Nose along +x: behind is now -x.
    const east = ridePosition({ x: 10, y: EYE_HEIGHT, z: 10, yaw: Math.PI / 2 }, delta)
    expect(at(east)).toEqual({ x: 9, y: 0, z: 10 })
  })
})
