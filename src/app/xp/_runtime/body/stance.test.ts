import { describe, expect, test } from 'bun:test'
import { motionOf, tickStance, type Stance } from '@/app/xp/_runtime/body/stance'

/**
 * What the body plays instead of a walk.
 *
 * Four refs that were declared forty lines apart with unrelated ones between
 * them, three identical countdowns written out in three places, and a priority
 * chain nobody could exercise without a level and a fight.
 */

const stance = (over: Partial<Record<keyof Stance, number | boolean>> = {}): Stance => ({
  hurt: { current: (over.hurt as number) ?? 0 },
  recoil: { current: (over.recoil as number) ?? 0 },
  swing: { current: (over.swing as number) ?? 0 },
  dancing: { current: (over.dancing as boolean) ?? false },
})

describe('a frame off every clip', () => {
  test('takes the delta off all three at once', () => {
    const s = stance({ hurt: 0.5, recoil: 0.4, swing: 0.3 })
    tickStance(s, 0.1)
    // Compared loosely on purpose: 0.4 - 0.1 is not 0.3 in binary, and a clip
    // measured to fifteen decimal places is a test about floats, not stances.
    expect(s.hurt.current).toBeCloseTo(0.4, 10)
    expect(s.recoil.current).toBeCloseTo(0.3, 10)
    expect(s.swing.current).toBeCloseTo(0.2, 10)
  })

  /** A clip that has ended stays ended; it must not go negative and re-arm. */
  test('never goes below zero', () => {
    const s = stance({ hurt: 0.01 })
    tickStance(s, 1)
    expect(s.hurt.current).toBe(0)
    tickStance(s, 1)
    expect(s.hurt.current).toBe(0)
  })

  test('a clip already at rest is left alone', () => {
    const s = stance()
    tickStance(s, 0.5)
    expect([s.hurt.current, s.recoil.current, s.swing.current]).toEqual([0, 0, 0])
  })

  /** Dancing ends by walking out of it, not by waiting. */
  test('does not touch the latch', () => {
    const s = stance({ dancing: true })
    for (let i = 0; i < 100; i++) tickStance(s, 1)
    expect(s.dancing.current).toBe(true)
  })

  test('a whole clip runs out in about its own length', () => {
    const s = stance({ swing: 0.4 })
    let frames = 0
    while (s.swing.current > 0 && frames < 1000) { tickStance(s, 1 / 60); frames++ }
    // 0.4s at 60Hz is twenty-four frames, and drift can make it twenty-five.
    // The property is that it ends in about the right time and does end.
    expect(frames).toBeGreaterThanOrEqual(24)
    expect(frames).toBeLessThanOrEqual(25)
  })
})

/**
 * Dead beats hurt beats shooting. A body that fires and is hit in the same
 * frame plays the hit: the shot is a thing you did and the hit is a thing that
 * happened to you, and the second is the one the person holding the mouse
 * cannot otherwise see.
 */
describe('which stance wins', () => {
  const all = { down: 0, hurt: 1, recoil: 1, swing: 1, dancing: true }

  test('being down beats everything', () => {
    expect(motionOf(all)).toBe('dead')
  })

  test('a hit beats a shot, a swing and a dance', () => {
    expect(motionOf({ ...all, down: null })).toBe('hit')
  })

  test('a shot beats a swing and a dance', () => {
    expect(motionOf({ ...all, down: null, hurt: 0 })).toBe('shoot')
  })

  test('a swing beats a dance', () => {
    expect(motionOf({ ...all, down: null, hurt: 0, recoil: 0 })).toBe('attack')
  })

  test('and a dance is what is left', () => {
    expect(motionOf({ down: null, hurt: 0, recoil: 0, swing: 0, dancing: true })).toBe('dance')
  })

  test('a body doing none of them plays nothing', () => {
    expect(motionOf({ down: null, hurt: 0, recoil: 0, swing: 0, dancing: false })).toBeNull()
  })

  /** Zero is over, not "a moment left". */
  test('a clip at zero does not count as running', () => {
    expect(motionOf({ down: null, hurt: 0, recoil: 0, swing: 0, dancing: false })).toBeNull()
    expect(motionOf({ down: null, hurt: 0.0001, recoil: 0, swing: 0, dancing: false })).toBe('hit')
  })

  /** Being down is a number so that `0` still means down, not "not down". */
  test('down counts at zero seconds left', () => {
    expect(motionOf({ down: 0, hurt: 0, recoil: 0, swing: 0, dancing: false })).toBe('dead')
  })
})
