import { describe, expect, test } from 'bun:test'
import {
  type MotionBuffer,
  newMotionBuffer,
  record,
  sample,
} from '@/app/world/_presence/peer-motion'
import { SEND_INTERVAL, type Pose } from '@/app/world/_presence/presence-core'

const SPEED = 4 // units/s, a steady jog
const FRAME = 1000 / 60

function pose(z: number, yaw = 0): Pose {
  return { x: 0, y: 0, z, yaw }
}

function out(): Pose {
  return { x: 0, y: 0, z: 0, yaw: 0 }
}

/**
 * Play a peer walking a straight line at a constant speed through a link, and
 * report how much the *drawn* speed wobbles. That number is the whole point of
 * the module: a body moving steadily should be drawn moving steadily.
 */
function wobble({
  oneWay,
  jitter,
  loss,
  stampWire = true,
  duration = 20_000,
}: {
  oneWay: number
  jitter: number
  loss: number
  stampWire?: boolean
  duration?: number
}): { cv: number; mean: number } {
  let seed = 12345
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const packets: { arrive: number; sent: number; z: number }[] = []
  for (let t = 0; t <= duration; t += SEND_INTERVAL) {
    if (rand() < loss) continue
    packets.push({
      arrive: t + oneWay + (rand() * 2 - 1) * jitter,
      // A deliberate constant offset, to prove the clock estimate cancels it.
      sent: t + 1_000_000,
      z: (SPEED * t) / 1000,
    })
  }
  packets.sort((a, b) => a.arrive - b.arrive)

  const buffer: MotionBuffer = newMotionBuffer()
  const drawn = out()
  let i = 0
  let previous: number | null = null
  const speeds: number[] = []

  for (let t = 0; t <= duration; t += FRAME) {
    while (i < packets.length && packets[i].arrive <= t) {
      const p = packets[i++]
      record(buffer, pose(p.z), stampWire ? p.sent : null, t)
    }
    if (sample(buffer, t, drawn)) {
      // Ignore the opening seconds: the delay is still finding its level.
      if (previous != null && t > 4000) speeds.push(Math.abs(drawn.z - previous) / (FRAME / 1000))
      previous = drawn.z
    }
  }

  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
  const sd = Math.sqrt(speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length)
  return { cv: (sd / mean) * 100, mean }
}

describe('sample', () => {
  test('nothing to draw before the first packet', () => {
    expect(sample(newMotionBuffer(), 0, out())).toBe(false)
  })

  test('a single packet is drawn where it says', () => {
    const buffer = newMotionBuffer()
    record(buffer, pose(7), 1000, 1000)
    const drawn = out()
    expect(sample(buffer, 1000, drawn)).toBe(true)
    expect(drawn.z).toBe(7)
  })

  test('interpolates between the pair either side of the render instant', () => {
    const buffer = newMotionBuffer()
    // Two poses a send apart, no network delay, so the clock offset is zero.
    record(buffer, pose(0), 0, 0)
    record(buffer, pose(1), SEND_INTERVAL, SEND_INTERVAL)

    const drawn = out()
    // Render exactly halfway between them: now - delay must land mid-pair.
    const now = SEND_INTERVAL / 2 + buffer.delay
    sample(buffer, now, drawn)
    expect(drawn.z).toBeCloseTo(0.5, 6)
  })

  test('holds the newest pose rather than extrapolating past it', () => {
    const buffer = newMotionBuffer()
    record(buffer, pose(0), 0, 0)
    record(buffer, pose(1), SEND_INTERVAL, SEND_INTERVAL)

    const drawn = out()
    sample(buffer, 60_000, drawn)
    // Not 400 units away, which is where extrapolation would have put it.
    expect(drawn.z).toBe(1)
  })

  test('takes the short way round the yaw wrap', () => {
    const buffer = newMotionBuffer()
    const from = (350 * Math.PI) / 180
    const to = (10 * Math.PI) / 180
    record(buffer, pose(0, from), 0, 0)
    record(buffer, pose(0, to), SEND_INTERVAL, SEND_INTERVAL)

    const drawn = out()
    sample(buffer, SEND_INTERVAL / 2 + buffer.delay, drawn)
    // Halfway from 350 to 10 the short way is 0, not 180.
    const degrees = ((drawn.yaw * 180) / Math.PI + 360) % 360
    expect(Math.min(degrees, 360 - degrees)).toBeLessThan(1)
  })
})

describe('steadiness', () => {
  /**
   * The regression these numbers exist to hold. Easing toward the newest packet
   * measured +-39% on a perfect link and +-47% on a bad one; see the header of
   * peer-motion.ts for the derivation.
   */
  test('a steady jog is drawn steadily on a good link', () => {
    const { cv, mean } = wobble({ oneWay: 8, jitter: 3, loss: 0 })
    expect(mean).toBeCloseTo(SPEED, 1)
    expect(cv).toBeLessThan(5)
  })

  test('a steady jog is drawn steadily on a bad mobile link', () => {
    const { cv, mean } = wobble({ oneWay: 110, jitter: 45, loss: 0.03 })
    expect(mean).toBeCloseTo(SPEED, 1)
    expect(cv).toBeLessThan(15)
  })

  test('still works for a client too old to send a timestamp', () => {
    const { cv, mean } = wobble({ oneWay: 110, jitter: 45, loss: 0.03, stampWire: false })
    expect(mean).toBeCloseTo(SPEED, 1)
    /**
     * Measures +-31%, against easing's +-47% on the same link and +-4% when the
     * sender does stamp. Stamping on arrival bakes the network's jitter into the
     * timeline the samples are replayed on, so most of the win is lost - which
     * is the argument for the wire field, not against the fallback.
     *
     * It only has to hold for the length of a deploy: `NEXT_DEPLOYMENT_ID` makes
     * open tabs hard-navigate on their next move, so unstamped senders are a
     * minutes-long population, not a permanent one.
     */
    expect(cv).toBeLessThan(35)
  })
})

describe('the playout delay', () => {
  test('sits at the floor on a steady link', () => {
    const buffer = newMotionBuffer()
    for (let t = 0; t <= 5000; t += SEND_INTERVAL) record(buffer, pose(t / 1000), t, t + 10)
    expect(buffer.delay).toBeCloseTo(SEND_INTERVAL * 2, 0)
  })

  test('opens up when arrivals are ragged', () => {
    const buffer = newMotionBuffer()
    let arrive = 0
    for (let i = 0; i < 60; i++) {
      // Alternating early and very late, i.e. heavy jitter.
      arrive += i % 2 === 0 ? SEND_INTERVAL - 60 : SEND_INTERVAL + 60
      record(buffer, pose(i), i * SEND_INTERVAL, arrive)
    }
    expect(buffer.delay).toBeGreaterThan(SEND_INTERVAL * 2)
  })

  test('a peer who went away starts clean', () => {
    const buffer = newMotionBuffer()
    record(buffer, pose(0), 0, 0)
    record(buffer, pose(1), SEND_INTERVAL, SEND_INTERVAL)
    expect(buffer.snaps.length).toBe(2)

    // Gone for a minute, then back - possibly on another network.
    record(buffer, pose(99), 60_000, 60_000)
    expect(buffer.snaps.length).toBe(1)
    expect(buffer.delay).toBeCloseTo(SEND_INTERVAL * 2, 0)
  })
})
