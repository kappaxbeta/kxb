import { describe, expect, test } from 'bun:test'
import {
  Crowd,
  delayFor,
  INTERPOLATION_DELAY,
  lerpAngle,
  sampleAt,
  sendDue,
  STALE_AFTER,
} from './presence'
import { EYE_HEIGHT } from '../world/physics'

/**
 * Everybody else, without a second laptop.
 *
 * Two browsers in a room cannot be put inside `bun test`, and every bug in this
 * file looks like "the network is bad" from the outside - a body that stutters,
 * one that slides backwards, one that spins on its own axis crossing north. So
 * the buffer is a function of samples and a clock, and both are handed in.
 */

const at = (x: number, z = 0, facing = 0) => ({ x, y: 1, z, facing })

/**
 * The bug this pins, because it is invisible from inside either half.
 *
 * The sender held an eye and the receiver drew feet, and each side was correct
 * on its own - so the only evidence was that everybody else in the room stood a
 * body-height in the air, which reads as a rendering problem rather than as a
 * unit one. What is asserted is the *conversion*, not a number: a test written
 * against 1.7 would go green again the day somebody changed how tall a person
 * is and left the sender alone.
 */
describe('what goes on the wire', () => {
  test('is the feet, not the eye the controller holds', () => {
    const eye = { x: 3, y: 1 + EYE_HEIGHT, z: -4 }
    const sent = sampleAt(eye, 90)
    // Field by field and `toBeCloseTo` on the one that was subtracted: the
    // height has been through arithmetic, so `1 + 1.7 - 1.7` is 1.0000000000000002
    // and an exact match would be asserting something about IEEE 754 rather
    // than about the format.
    expect(sent.y).toBeCloseTo(1, 10)
    expect({ x: sent.x, z: sent.z, facing: sent.facing }).toEqual({ x: 3, z: -4, facing: 90 })
  })

  test('the two stances ride along, and only while they are true', () => {
    /**
     * Everything else about how a body is animated is worked out by whoever is
     * drawing it, from where that body has been. These two cannot be: a dancing
     * body, a dead one and a body standing perfectly still report the same
     * positions forever. So they are said, and the packet is otherwise exactly
     * the four numbers it has always been - which is the property worth pinning,
     * because it is what makes this safe to add to a wire with players on it.
     */
    const still = sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0)
    expect('dance' in still).toBe(false)
    expect('down' in still).toBe(false)

    expect(sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0, { dance: true }).dance).toBe(true)
    expect(sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0, { down: true }).down).toBe(true)
    // False is the same as absent, so a body that has stopped dancing goes back
    // to sending the packet it sent before it started.
    expect('dance' in sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0, { dance: false })).toBe(false)
  })

  test('a dance is carried through the buffer to whoever draws it', () => {
    // Interpolation has no midpoint between dancing and not, so the flag comes
    // off the sample being drawn *from* rather than being blended into nothing.
    const crowd = new Crowd(0)
    crowd.remember('a', sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0, { dance: true }), 1000)
    crowd.remember('a', sampleAt({ x: 1, y: EYE_HEIGHT, z: 0 }, 0, { dance: true }), 1100)
    expect(crowd.at('a', 1050)?.dance).toBe(true)
  })

  test('and standing on the floor sends a zero rather than a body height', () => {
    expect(sampleAt({ x: 0, y: EYE_HEIGHT, z: 0 }, 0).y).toBeCloseTo(0, 10)
  })

  /**
   * A body drawn where the sender was standing, which is the whole point of the
   * two halves agreeing: what the buffer hands the renderer is a position a
   * model's origin goes at, and a model's origin is on the floor.
   */
  test('so a peer is drawn at the height they were standing at', () => {
    const crowd = new Crowd()
    crowd.remember('a', sampleAt({ x: 0, y: 5 + EYE_HEIGHT, z: 0 }, 0), 1000)
    expect(crowd.at('a', 1000 + INTERPOLATION_DELAY)!.y).toBeCloseTo(5, 10)
  })
})

describe('a body between two samples', () => {
  test('is drawn halfway when the clock is halfway', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1100)

    // The target is `now - delay`, so ask at the moment that lands between them.
    const placed = crowd.at('a', 1050 + INTERPOLATION_DELAY)
    expect(placed!.x).toBeCloseTo(5, 5)
    expect(placed!.settled).toBe(false)
  })

  test('and moves the whole way as the clock does', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1100)
    const quarter = crowd.at('a', 1025 + INTERPOLATION_DELAY)!
    const most = crowd.at('a', 1090 + INTERPOLATION_DELAY)!
    expect(quarter.x).toBeCloseTo(2.5, 5)
    expect(most.x).toBeCloseTo(9, 5)
  })

  /**
   * The reason everybody is drawn in the past at all. Asking for *now* with a
   * delay of nothing would be asking for a sample that has not arrived.
   */
  test('the newest sample is not what is drawn', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1100)
    expect(crowd.at('a', 1100)!.x).toBeLessThan(10)
  })
})

describe('a body with nothing to interpolate', () => {
  test('one sample is where they are', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(4, 5), 1000)
    const placed = crowd.at('a', 1000 + INTERPOLATION_DELAY)!
    expect([placed.x, placed.z]).toEqual([4, 5])
    // Appears where they were, rather than sliding in from the origin.
    expect(crowd.at('a', 1000)!.x).toBe(4)
  })

  test('silence holds them where they stopped rather than guessing on', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1100)
    // Long past the last sample: extrapolating would put them at 30 and then
    // snap them back when they turned out to be standing still.
    const placed = crowd.at('a', 3000)!
    expect(placed.x).toBe(10)
    expect(placed.settled).toBe(true)
  })

  test('somebody who has said nothing is nobody', () => {
    expect(new Crowd().at('ghost', 1000)).toBeNull()
  })
})

describe('a transport that misbehaves', () => {
  /**
   * A reordered sample interpolated in its right place walks a body two steps
   * forward and one back for as long as the network is unhappy. Dropping it
   * costs a frame nobody sees.
   */
  test('a sample from the past is dropped, not sorted in', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1100)
    crowd.remember('a', at(-50), 1050)
    expect(crowd.at('a', 3000)!.x).toBe(10)
  })

  test('two samples in the same millisecond do not divide by zero', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.remember('a', at(10), 1000)
    const placed = crowd.at('a', 1000 + INTERPOLATION_DELAY - 1)
    expect(Number.isFinite(placed!.x)).toBe(true)
  })

  test('the buffer does not grow without end', () => {
    const crowd = new Crowd()
    for (let i = 0; i < 500; i++) crowd.remember('a', at(i), 1000 + i * 125)
    // Still answering correctly after five hundred samples, which is a minute of
    // one player at 8 Hz - and the trimming is what keeps that a constant cost.
    const now = 1000 + 499 * 125
    expect(crowd.at('a', now)!.x).toBeGreaterThan(490)
  })
})

describe('who is still here', () => {
  test('a quiet body is kept for a while and then reported', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    // A dropped packet is not a departure, and a tab that hitches is not either.
    expect(crowd.silent(1000 + STALE_AFTER - 1)).toEqual([])
    expect(crowd.silent(1000 + STALE_AFTER + 1)).toEqual(['a'])
  })

  test('somebody who left is forgotten outright', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0), 1000)
    crowd.forget('a')
    expect(crowd.ids()).toEqual([])
    expect(crowd.at('a', 2000)).toBeNull()
  })
})

describe('turning', () => {
  /**
   * 350° to 10° is twenty degrees, not three hundred and forty. Interpolating
   * the numbers directly spins a body most of the way round its own axis every
   * time it crosses north.
   */
  test('goes the short way round north', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 5)
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 5)
  })

  test('and the ordinary way everywhere else', () => {
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45, 5)
    expect(lerpAngle(90, 0, 0.5)).toBeCloseTo(45, 5)
  })

  test('always lands in 0..360', () => {
    for (const [a, b] of [[350, 10], [10, 350], [0, 180], [270, 45]]) {
      const out = lerpAngle(a, b, 0.5)
      expect(out).toBeGreaterThanOrEqual(0)
      expect(out).toBeLessThan(360)
    }
  })

  test('a body between two samples turns the short way too', () => {
    const crowd = new Crowd()
    crowd.remember('a', at(0, 0, 350), 1000)
    crowd.remember('a', at(0, 0, 10), 1100)
    expect(crowd.at('a', 1050 + INTERPOLATION_DELAY)!.facing).toBeCloseTo(0, 5)
  })
})

/**
 * The stutter, as arithmetic.
 *
 * Reported as remote players stuttering in a live battle. Everything in this
 * file was the right shape and the margin was gone: the delay has to be wide
 * enough that a packet which does not arrive on time still has a sample on the
 * far side of the render target to aim at. When it does not, `at` runs past the
 * newest sample, returns `settled`, and the body stands still until the next
 * packet lands and snaps it forward.
 */
describe('a late packet does not freeze anybody', () => {
  /** Samples arriving exactly on the 8 Hz cadence. */
  function onTime(crowd: Crowd, count: number, interval = 125) {
    for (let i = 0; i < count; i++) {
      crowd.remember('a', { x: i, y: 0, z: 0, facing: 0 }, i * interval)
    }
    return (count - 1) * interval
  }

  /**
   * The claim, stated as the number it is: the tolerance equals the delay, so
   * at two send intervals a packet can miss entirely and the one after it can
   * be most of the way late before anybody stops moving.
   */
  test('the tolerance is two whole send intervals', () => {
    const crowd = new Crowd()
    const newest = onTime(crowd, 3)

    // 249 ms with nothing arriving, and still being interpolated.
    expect(crowd.at('a', newest + 249)!.settled).toBe(false)
    // Past that the connection is genuinely broken, and standing still is the
    // honest thing to draw rather than a guess.
    expect(crowd.at('a', newest + 251)!.settled).toBe(true)
  })

  /**
   * The old value, kept as the thing that must not come back. 150 ms is one
   * send interval plus almost nothing, and against a real 133 ms spacing it
   * left 17 ms - less than any network's jitter.
   */
  /**
   * The old value, side by side with the new one at the moment that separates
   * them. 150 ms is one send interval plus a sliver: a packet 150 ms late - and
   * 150 ms late is an ordinary hiccup - has already parked the body, while two
   * intervals is still interpolating.
   */
  test('the delay that caused it would have frozen here', () => {
    const tight = new Crowd(150)
    const roomy = new Crowd()
    for (const crowd of [tight, roomy]) onTime(crowd, 3)
    const newest = 250

    expect(tight.at('a', newest + 150)!.settled).toBe(true)
    expect(roomy.at('a', newest + 150)!.settled).toBe(false)
  })

  test('and the margin is a whole interval wide, not a sliver', () => {
    const crowd = new Crowd()
    const newest = onTime(crowd, 3)
    // Still interpolating at 124 ms late; parked only once a second interval
    // has gone by with nothing, which is a genuinely broken connection.
    expect(crowd.at('a', newest + 200)!.settled).toBe(false)
    expect(crowd.at('a', newest + 260)!.settled).toBe(true)
  })
})

describe('the delay is derived from the rate, not guessed', () => {
  test('two send intervals, whatever the rate', () => {
    expect(delayFor(8)).toBe(250)
    expect(delayFor(16)).toBe(125)
    expect(delayFor(4)).toBe(500)
  })

  test('and the default answers for a host that filled in nothing sensible', () => {
    expect(delayFor(0)).toBe(INTERPOLATION_DELAY)
    expect(delayFor(-8)).toBe(INTERPOLATION_DELAY)
    expect(delayFor(Number.NaN)).toBe(INTERPOLATION_DELAY)
  })

  /**
   * The relationship that matters, stated once: whatever the rate, the delay
   * covers a packet that never came. A future edit that makes this one interval
   * again fails here rather than in somebody's battle.
   */
  test('a buffer built for a rate absorbs a missing packet at that rate', () => {
    for (const hz of [4, 8, 16]) {
      const interval = 1000 / hz
      const crowd = new Crowd(delayFor(hz))
      for (let i = 0; i < 3; i++) {
        crowd.remember('a', { x: i, y: 0, z: 0, facing: 0 }, i * interval)
      }
      const newest = 2 * interval
      expect(crowd.at('a', newest + interval * 0.99)!.settled).toBe(false)
    }
  })
})

describe('sending at the rate we say we do', () => {
  /** Run a frame loop and report the average gap between sends, in ms. */
  function averageGap(hz: number, fps: number, seconds: number): number {
    const step = 1 / fps
    let since = 0
    let elapsed = 0
    const sends: number[] = []
    for (let frame = 0; frame < fps * seconds; frame++) {
      elapsed += step
      const due = sendDue(since + step, hz)
      since = due.since
      if (due.send) sends.push(elapsed * 1000)
    }
    const gaps = sends.slice(1).map((t, i) => t - sends[i])
    return gaps.reduce((a, b) => a + b, 0) / gaps.length
  }

  /**
   * The bug: the caller reset its accumulator to zero, so the overshoot was
   * thrown away and 8 Hz was really 7.5. Six percent does not sound like much
   * until you notice the receiver's whole margin is smaller than that.
   */
  test('8 Hz at 60fps averages 125 ms, not 133', () => {
    expect(averageGap(8, 60, 10)).toBeCloseTo(125, 0)
  })

  test('and holds at frame rates that do not divide the interval', () => {
    expect(averageGap(8, 144, 10)).toBeCloseTo(125, 0)
    expect(averageGap(8, 30, 10)).toBeCloseTo(125, 0)
    expect(averageGap(12, 60, 10)).toBeCloseTo(1000 / 12, 0)
  })

  test('below the interval, nothing is sent and the clock keeps running', () => {
    const due = sendDue(0.05, 8)
    expect(due.send).toBe(false)
    expect(due.since).toBe(0.05)
  })

  /**
   * A tab returning from the background hands back a delta worth several
   * intervals. One send, not a burst about a position that has not changed.
   */
  test('a long stall sends once rather than catching up', () => {
    const due = sendDue(1.2, 8)
    expect(due.send).toBe(true)
    // Whatever is left is genuinely less than an interval, so the next frame
    // does not immediately fire again.
    expect(due.since).toBeLessThan(1 / 8)
  })

  test('a host with no rate never sends rather than dividing by zero', () => {
    expect(sendDue(999, 0).send).toBe(false)
    expect(sendDue(999, Number.NaN).send).toBe(false)
  })
})

/**
 * The boxes a shot is tested against.
 *
 * The claim being pinned is the one at the top of ./presence: what you hit is
 * what you *saw*. A hitbox built from the newest sample would sit a quarter of a
 * second ahead of the body on screen, so shooting somebody would mean aiming at
 * where they are not.
 */
describe('bodies you can shoot at', () => {
  test('a box stands where the body is drawn, not where the last packet said', () => {
    const crowd = new Crowd(250)
    crowd.remember('ana', { x: 0, y: 0, z: 0, facing: 0 }, 0)
    crowd.remember('ana', { x: 10, y: 0, z: 0, facing: 0 }, 500)

    // Drawn 250 ms in the past: half way between the two samples.
    const drawn = crowd.at('ana', 500)
    const [target] = crowd.targets(500)
    expect(target.id).toBe('ana')
    expect(drawn?.x).toBeCloseTo(5, 5)
    expect((target.box.minX + target.box.maxX) / 2).toBeCloseTo(drawn!.x, 5)
  })

  test('the box stands on the floor the sample gives, and is a body tall', () => {
    const crowd = new Crowd(0)
    crowd.remember('ana', { x: 0, y: 3, z: 0, facing: 0 }, 0)
    const [{ box }] = crowd.targets(0)
    expect(box.minY).toBeCloseTo(3, 5)
    expect(box.maxY).toBeCloseTo(3 + EYE_HEIGHT, 5)
  })

  test('somebody who has said nothing has no box', () => {
    const crowd = new Crowd(250)
    expect(crowd.targets(0)).toEqual([])
  })

  test('everybody in the room gets one', () => {
    const crowd = new Crowd(0)
    crowd.remember('ana', { x: 0, y: 0, z: 0, facing: 0 }, 0)
    crowd.remember('bo', { x: 4, y: 0, z: 0, facing: 0 }, 0)
    expect(crowd.targets(0).map((one) => one.id).sort()).toEqual(['ana', 'bo'])
  })
})
