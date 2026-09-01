import { describe, expect, test } from 'bun:test'
import {
  type DriveState,
  REVERSE_FRACTION,
  stepDrive,
  wallSlow,
} from '@/app/world/lounge/_sim/drive'

const tuning = { top: 12, turn: 2 }
const still: DriveState = { speed: 0, heading: 0, steer: 0 }

/** Run many small frames, the way the loop does. */
function run(
  state: DriveState,
  input: { throttle: number; steer: number },
  seconds: number,
): DriveState {
  let current: DriveState = state
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    current = stepDrive(current, input, tuning, dt)
  }
  return current
}

describe('speed chases the throttle', () => {
  test('flat out reaches top speed, and stays there', () => {
    const going = run(still, { throttle: 1, steer: 0 }, 3)
    expect(going.speed).toBeCloseTo(tuning.top, 1)
  })

  test('a released throttle coasts to a stop', () => {
    const going = run(still, { throttle: 1, steer: 0 }, 3)
    const rolled = run(going, { throttle: 0, steer: 0 }, 4)
    expect(rolled.speed).toBeCloseTo(0, 1)
  })

  test('braking sheds speed faster than coasting', () => {
    const going = run(still, { throttle: 1, steer: 0 }, 3)
    const braked = run(going, { throttle: -1, steer: 0 }, 0.4)
    const coasted = run(going, { throttle: 0, steer: 0 }, 0.4)
    expect(Math.abs(braked.speed)).toBeLessThan(Math.abs(coasted.speed))
  })

  test('reverse is a fraction of forward', () => {
    const backing = run(still, { throttle: -1, steer: 0 }, 4)
    expect(backing.speed).toBeCloseTo(-tuning.top * REVERSE_FRACTION, 1)
  })
})

describe('steering is a turn rate, paid for with speed', () => {
  test('a parked vehicle cannot turn on the spot', () => {
    const turned = run(still, { throttle: 0, steer: 1 }, 1)
    expect(turned.heading).toBeCloseTo(0, 5)
  })

  test('a moving one turns, and right is right', () => {
    const going = run(still, { throttle: 1, steer: 1 }, 2)
    // Right-hand down turns the nose clockwise seen from above, which in this
    // frame is a decreasing heading - see the note in `stepDrive`.
    expect(going.heading).toBeLessThan(-0.5)
  })

  test('reversing flips the arc', () => {
    const backing = run(still, { throttle: -1, steer: 1 }, 2)
    expect(backing.heading).toBeGreaterThan(0.1)
  })

  test('the drawn steer eases rather than snapping', () => {
    const one = stepDrive(still, { throttle: 0, steer: 1 }, tuning, 1 / 60)
    expect(one.steer).toBeGreaterThan(0)
    expect(one.steer).toBeLessThan(0.5)
  })
})

describe('the move it asks the physics for', () => {
  test('a straight run moves along the heading', () => {
    const north = stepDrive(
      { speed: 6, heading: 0, steer: 0 },
      { throttle: 1, steer: 0 },
      tuning,
      0.1,
    )
    expect(north.moveX).toBeCloseTo(0, 5)
    expect(north.moveZ).toBeGreaterThan(0.5)
  })

  test('a wall keeps a sliver of the momentum', () => {
    expect(wallSlow(12)).toBeGreaterThan(0)
    expect(wallSlow(12)).toBeLessThan(6)
  })
})
