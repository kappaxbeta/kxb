import { describe, expect, test } from 'bun:test'
import {
  createTurnLatch,
  pastDeadZone,
  snapTurn,
  STICK_DEAD_ZONE,
  TURN_OFF,
  TURN_ON,
  TURN_STEP,
  walkFromStick,
} from '@/app/world/lounge/_sim/vr-input'

describe('a stick at rest', () => {
  test('a hand off the controller reads as nothing', () => {
    expect(pastDeadZone(0)).toBe(0)
    expect(pastDeadZone(undefined)).toBe(0)
  })

  test('the wobble a resting stick has is swallowed', () => {
    expect(pastDeadZone(STICK_DEAD_ZONE / 2)).toBe(0)
    expect(pastDeadZone(-STICK_DEAD_ZONE / 2)).toBe(0)
  })

  test('and a real push is passed through at its own strength', () => {
    // Not normalised on the way out: leaning the stick gently should walk
    // gently, which is the whole reason the axis is a float and not a flag.
    expect(pastDeadZone(0.5)).toBe(0.5)
    expect(pastDeadZone(-1)).toBe(-1)
  })
})

describe('walking', () => {
  test('pushed away from you is forwards', () => {
    // The one inversion in this file. WebXR reports -1 for a stick pushed away
    // from the hand; the scene calls forwards positive.
    expect(walkFromStick(0, -1).forward).toBe(1)
    expect(walkFromStick(0, 1).forward).toBe(-1)
  })

  test('pushed right is right', () => {
    expect(walkFromStick(1, 0).strafe).toBe(1)
    expect(walkFromStick(-1, 0).strafe).toBe(-1)
  })

  test('a stick nobody is touching walks nowhere', () => {
    expect(walkFromStick(undefined, undefined)).toEqual({ forward: 0, strafe: 0 })
    expect(walkFromStick(0.05, -0.05)).toEqual({ forward: 0, strafe: 0 })
  })
})

describe('snap turning', () => {
  test('a push past the threshold turns once', () => {
    const latch = createTurnLatch()
    expect(snapTurn(1, latch)).toBe(-TURN_STEP)
  })

  test('right turns right, which is a negative yaw', () => {
    expect(snapTurn(1, createTurnLatch())).toBe(-TURN_STEP)
    expect(snapTurn(-1, createTurnLatch())).toBe(TURN_STEP)
  })

  test('a stick held down turns exactly once, not once a frame', () => {
    const latch = createTurnLatch()
    expect(snapTurn(1, latch)).toBe(-TURN_STEP)

    // Sixty frames of a thumb that has not moved. Without the latch this is a
    // world spinning at nine hundred degrees a second.
    for (let frame = 0; frame < 60; frame += 1) {
      expect(snapTurn(1, latch)).toBe(0)
    }
  })

  test('and the stick has to come most of the way back before the next one', () => {
    const latch = createTurnLatch()
    snapTurn(1, latch)

    // Between the two thresholds: released enough to look released, not enough
    // to count. This gap is what stops a wavering thumb chattering.
    expect(snapTurn((TURN_ON + TURN_OFF) / 2, latch)).toBe(0)
    expect(snapTurn(1, latch)).toBe(0)

    expect(snapTurn(0, latch)).toBe(0)
    expect(snapTurn(1, latch)).toBe(-TURN_STEP)
  })

  test('a nudge short of the threshold does not turn at all', () => {
    const latch = createTurnLatch()
    expect(snapTurn(TURN_ON, latch)).toBe(0)
    expect(snapTurn(TURN_ON - 0.01, latch)).toBe(0)
    expect(latch.held).toBe(false)
  })

  test('turning back the other way is a fresh push, not a continuation', () => {
    const latch = createTurnLatch()
    expect(snapTurn(1, latch)).toBe(-TURN_STEP)
    // Straight across the middle without pausing. The release is what arms the
    // next turn, and crossing zero is a release.
    expect(snapTurn(0, latch)).toBe(0)
    expect(snapTurn(-1, latch)).toBe(TURN_STEP)
  })
})
