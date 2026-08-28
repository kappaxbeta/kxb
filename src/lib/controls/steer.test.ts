import { describe, expect, test } from 'bun:test'
import {
  STEER_KEY_TURN_RATE,
  STEER_TURN_RATE,
  steerTurn,
  wrapAngle,
  yawOfForward,
} from '@/lib/controls/steer'

/** Forward for a yaw, in three's convention - the pair every assertion is against. */
function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

describe('yawOfForward', () => {
  test('is the inverse of the convention it names', () => {
    for (const yaw of [0, 0.4, Math.PI / 2, -Math.PI / 2, 3, -3]) {
      const { x, z } = forwardOf(yaw)
      expect(yawOfForward(x, z)).toBeCloseTo(wrapAngle(yaw), 10)
    }
  })
})

describe('wrapAngle', () => {
  test('takes the short way round', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 10)
    expect(wrapAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10)
    expect(wrapAngle(5 * Math.PI)).toBeCloseTo(Math.PI, 10)
  })
})

describe('steerTurn', () => {
  /**
   * The sign, pinned against the convention rather than against itself.
   *
   * Pushing right has to end up *facing* right of where you were, and the only
   * honest way to say that is to turn the yaw back into a direction and check
   * which way it went. Asserting "the number is negative" would pass just as
   * happily with the convention inverted.
   */
  test('pushing right faces you right', () => {
    const before = 0
    const after = before + steerTurn(1, 1 / 60)
    const f = forwardOf(after)
    // Facing down -z and turning right swings the nose toward +x.
    expect(f.x).toBeGreaterThan(0)
    expect(steerTurn(-1, 1 / 60)).toBe(-steerTurn(1, 1 / 60))
  })

  test('is analogue: half a push is half a turn', () => {
    expect(steerTurn(0.5, 1 / 60)).toBeCloseTo(steerTurn(1, 1 / 60) / 2, 12)
  })

  test('a centred stick does not turn', () => {
    expect(steerTurn(0, 1 / 60)).toBe(-0)
  })

  test('is framerate independent - the same second is the same angle', () => {
    const inOneStep = steerTurn(1, 1)
    let stepped = 0
    for (let i = 0; i < 60; i++) stepped += steerTurn(1, 1 / 60)
    expect(stepped).toBeCloseTo(inOneStep, 12)
  })

  test('a full second at the rim is a bit over half a turn', () => {
    expect(Math.abs(steerTurn(1, 1))).toBeCloseTo(STEER_TURN_RATE, 12)
    expect(STEER_TURN_RATE).toBeGreaterThan(Math.PI / 2)
  })

  test('keys turn slower than the rim, so lining up does not overshoot', () => {
    expect(STEER_KEY_TURN_RATE).toBeLessThan(STEER_TURN_RATE)
    expect(Math.abs(steerTurn(1, 1, STEER_KEY_TURN_RATE))).toBeCloseTo(
      STEER_KEY_TURN_RATE,
      12,
    )
  })

  /**
   * Held to the rim, the heading has to keep going round and come back - a
   * model that eased toward a target would stall somewhere instead. This is the
   * regression for the jitter: no fixed point, so nothing to oscillate about.
   */
  test('a held push keeps turning rather than settling', () => {
    let yaw = 0
    const seen: number[] = []
    for (let frame = 0; frame < 240; frame++) {
      yaw += steerTurn(1, 1 / 60)
      seen.push(steerTurn(1, 1 / 60))
    }
    // Four seconds at 2.6 rad/s is a bit under two full turns.
    expect(Math.abs(yaw)).toBeCloseTo(STEER_TURN_RATE * 4, 6)
    // And every frame asked for exactly the same amount: no easing, no wobble.
    expect(new Set(seen.map((n) => n.toFixed(12))).size).toBe(1)
  })
})
