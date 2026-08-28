import { describe, expect, test } from 'bun:test'
import {
  advance,
  angleDelta,
  gaitFor,
  KNOCK_SETTLE_MS,
  KNOCK_TTL_MS,
  type LastSent,
  neverSent,
  type Pose,
  POSITION_EPSILON,
  pruneKnocks,
  RUN_SPEED,
  WALK_SPEED,
  worthSending,
} from '@/app/world/_presence/presence-core'

function pose(x: number, z: number, yaw = 0): Pose {
  return { x, y: 0, z, yaw }
}

describe('angleDelta', () => {
  test('takes the short way round the wrap', () => {
    const from = (350 * Math.PI) / 180
    const to = (10 * Math.PI) / 180
    // Twenty degrees forward, not three hundred and forty back.
    expect((angleDelta(from, to) * 180) / Math.PI).toBeCloseTo(20, 6)
    expect((angleDelta(to, from) * 180) / Math.PI).toBeCloseTo(-20, 6)
  })

  test('is zero for the same heading, however it is expressed', () => {
    expect(angleDelta(1, 1)).toBeCloseTo(0, 12)
    expect(angleDelta(0, Math.PI * 2)).toBeCloseTo(0, 12)
  })

  test('never returns more than half a turn', () => {
    for (let i = 0; i < 360; i++) {
      const d = angleDelta(0, (i * Math.PI) / 180)
      expect(Math.abs(d)).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
  })
})

describe('advance', () => {
  test('closes the gap without overshooting it', () => {
    const current = pose(0, 0)
    const target = pose(10, 0)

    for (let i = 0; i < 200; i++) advance(current, target, 1 / 60)

    expect(current.x).toBeCloseTo(10, 3)
    expect(current.x).toBeLessThanOrEqual(10)
  })

  test('reports the ground distance it actually moved', () => {
    const current = pose(0, 0)
    const travelled = advance(current, pose(3, 4), 1 / 60)
    expect(travelled).toBeCloseTo(Math.hypot(current.x, current.z), 12)
    expect(travelled).toBeGreaterThan(0)
  })

  /**
   * The property that makes the smoothing framerate independent: where a body
   * ends up after a given amount of *time* must not depend on how many frames
   * that time was chopped into. A plain `current += (target - current) * 0.1`
   * fails this, and the failure looks like remote peers moving at different
   * speeds on different machines.
   */
  test('lands in the same place however the time is sliced', () => {
    const coarse = pose(0, 0)
    advance(coarse, pose(10, 0), 1 / 10)

    const fine = pose(0, 0)
    for (let i = 0; i < 6; i++) advance(fine, pose(10, 0), 1 / 60)

    expect(fine.x).toBeCloseTo(coarse.x, 6)
  })

  test('turns the short way, so a body never spins on a wrap', () => {
    const current = pose(0, 0, (350 * Math.PI) / 180)
    const target = pose(0, 0, (10 * Math.PI) / 180)

    advance(current, target, 1 / 60)

    // Moved forward past 350 degrees, not backwards toward 180.
    expect(current.yaw).toBeGreaterThan((350 * Math.PI) / 180)
  })

  test('a body already there does not drift', () => {
    const current = pose(5, 5, 1)
    const travelled = advance(current, pose(5, 5, 1), 1 / 60)
    expect(travelled).toBeCloseTo(0, 12)
    expect(current.x).toBeCloseTo(5, 12)
    expect(current.yaw).toBeCloseTo(1, 12)
  })
})

describe('gaitFor', () => {
  const delta = 1 / 60

  test('standing still is idle', () => {
    expect(gaitFor(0, delta)).toBe('idle')
  })

  test('a shuffle below the walk threshold is still idle', () => {
    expect(gaitFor(WALK_SPEED * 0.5 * delta, delta)).toBe('idle')
  })

  test('walking pace walks', () => {
    expect(gaitFor(WALK_SPEED * 2 * delta, delta)).toBe('walk')
  })

  test('a sprint runs', () => {
    expect(gaitFor(RUN_SPEED * 1.5 * delta, delta)).toBe('run')
  })

  test('a zero-length frame does not divide by zero into a run', () => {
    expect(gaitFor(0, 0)).toBe('idle')
  })
})

describe('worthSending', () => {
  const settled: Omit<LastSent, 'at'> = {
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.5,
    dancing: false,
    health: null,
  }

  function sent(over: Partial<LastSent> = {}): LastSent {
    return { at: 0, ...settled, ...over }
  }

  /**
   * The regression this file exists for. `neverSent()` seeds `NaN`, and every
   * comparison against `NaN` is false - so without the explicit check a tab
   * that joined and stood still would announce nothing until the keepalive.
   */
  test('a tab that has never sent anything always sends', () => {
    expect(worthSending(neverSent(), settled)).toBe(true)
  })

  test('nothing changed is not worth a packet', () => {
    expect(worthSending(sent(), settled)).toBe(false)
  })

  test('a twitch below the epsilon is not worth a packet', () => {
    expect(
      worthSending(sent(), { ...settled, x: settled.x + POSITION_EPSILON / 2 }),
    ).toBe(false)
  })

  test('real movement on any axis is', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(
        worthSending(sent(), { ...settled, [axis]: settled[axis] + 1 }),
      ).toBe(true)
    }
  })

  test('turning round is', () => {
    expect(worthSending(sent(), { ...settled, yaw: settled.yaw + 1 })).toBe(true)
  })

  test('a wrap that is really a small turn is judged as a small turn', () => {
    const last = sent({ yaw: (359 * Math.PI) / 180 })
    const next = { ...settled, yaw: (359.5 * Math.PI) / 180 }
    // Half a degree across the wrap: below the epsilon, so not worth sending -
    // and emphatically not the 359 degrees a naive subtraction would see.
    expect(worthSending(last, next)).toBe(false)
  })

  test('starting to dance is', () => {
    expect(worthSending(sent(), { ...settled, dancing: true })).toBe(true)
  })

  test('taking damage is, without waiting for the keepalive', () => {
    expect(
      worthSending(sent({ health: 100 }), { ...settled, health: 78 }),
    ).toBe(true)
  })
})

describe('pruneKnocks', () => {
  const NOW = 1_000_000

  function knock(userId: string, ageMs: number) {
    return { userId, at: NOW - ageMs }
  }

  /**
   * The regression this function exists for.
   *
   * Broadcast and presence are independent streams on one socket. A visitor
   * tracks and then knocks in consecutive ticks, so the knock can reach the
   * owner *before* the presence sync that says the visitor is there. Pruning on
   * "in presence right now" discarded the knock milliseconds after it landed,
   * and the owner's accept prompt never rendered.
   */
  test('keeps a knock that arrived before its sender showed up in presence', () => {
    const knocks = [knock('sam', 50)]
    expect(pruneKnocks(knocks, new Set(), NOW)).toEqual(knocks)
  })

  test('keeps a knock whose sender presence has caught up with', () => {
    const knocks = [knock('sam', 30_000)]
    expect(pruneKnocks(knocks, new Set(['sam']), NOW)).toEqual(knocks)
  })

  test('drops a settled knock from somebody who has gone', () => {
    expect(pruneKnocks([knock('sam', 30_000)], new Set(), NOW)).toEqual([])
  })

  test('drops a knock nobody ever answered, even if they are still connected', () => {
    expect(pruneKnocks([knock('sam', KNOCK_TTL_MS + 1)], new Set(['sam']), NOW)).toEqual([])
  })

  test('the settle window is the boundary, not an approximation', () => {
    // One millisecond inside the window survives an empty presence set...
    expect(
      pruneKnocks([knock('sam', KNOCK_SETTLE_MS - 1)], new Set(), NOW),
    ).toHaveLength(1)
    // ...and one millisecond past it does not.
    expect(
      pruneKnocks([knock('sam', KNOCK_SETTLE_MS)], new Set(), NOW),
    ).toHaveLength(0)
  })

  test('judges each knock on its own age', () => {
    const fresh = knock('fresh', 100)
    const settled = knock('settled', 30_000)
    const stale = knock('stale', KNOCK_TTL_MS + 1)

    // Only `settled` is vouched for by presence; `fresh` survives on age alone.
    expect(pruneKnocks([fresh, settled, stale], new Set(['settled']), NOW)).toEqual([
      fresh,
      settled,
    ])
  })

  test('an empty list stays empty', () => {
    expect(pruneKnocks([], new Set(), NOW)).toEqual([])
  })
})
