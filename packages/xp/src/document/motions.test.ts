import { describe, expect, test } from 'bun:test'
import { angleAt, motionLength, motionNodes, poseAt, type Motion } from './motions'
import { parseXp, XP_FORMAT } from './format'

/**
 * A motion, as the maths and as a document.
 *
 * Both halves are here because both halves are silent when they are wrong. A
 * step whose angle comes back at the wrong sign is a door that opens into the
 * wall - visible only by looking, and only if you happen to. A motion the parser
 * lets through with a step that does nothing is a `play` that reports success
 * and moves nothing.
 */

const DOOR: Motion = {
  steps: [
    { kind: 'turn', node: 'lid', axis: 'y', amount: 90, seconds: 1 },
    { kind: 'turn', axis: 'y', amount: 0, seconds: 2 },
    { kind: 'turn', node: 'lid', axis: 'y', amount: 0, seconds: 1 },
  ],
}

describe('how long, and what it touches', () => {
  test('a motion is as long as its steps put together', () => {
    expect(motionLength(DOOR)).toBe(4)
  })

  test('and the nodes are what a renderer has to find', () => {
    // Deduplicated: `lid` is named twice and is one node. The pause names none.
    expect(motionNodes(DOOR)).toEqual(['lid'])
  })
})

describe('a step on its own', () => {
  test('a spin is degrees a second, and does not come back', () => {
    // The fan. Unbounded on purpose - clamping it to 360 would make a long step
    // stop turning halfway through.
    const spin = { kind: 'spin', node: 'blade', axis: 'y', amount: 180, seconds: 10 } as const
    expect(angleAt(spin, 1)).toBe(180)
    expect(angleAt(spin, 4)).toBe(720)
  })

  test('a turn arrives at its amount and stops there', () => {
    const turn = { kind: 'turn', node: 'lid', axis: 'y', amount: 90, seconds: 2 } as const
    expect(angleAt(turn, 0)).toBe(0)
    expect(angleAt(turn, 2)).toBe(90)
    // Halfway through time is halfway through the angle - smoothstep is
    // symmetric, which is the property that makes it read as a door rather than
    // as a value being set.
    expect(angleAt(turn, 1)).toBeCloseTo(45, 6)
  })

  test('and it eases at both ends rather than starting at full speed', () => {
    /**
     * The reason `turn` is not linear. A door that reaches ninety degrees at a
     * constant rate and stops dead reads as a number being assigned; the curve
     * has a zero derivative at both ends, so it starts and finishes.
     *
     * Checked as a *rate* rather than by comparing against the formula, which
     * would be the test restating the implementation.
     */
    const turn = { kind: 'turn', node: 'lid', axis: 'y', amount: 90, seconds: 2 } as const
    const first = angleAt(turn, 0.1) - angleAt(turn, 0)
    const middle = angleAt(turn, 1.05) - angleAt(turn, 0.95)
    const last = angleAt(turn, 2) - angleAt(turn, 1.9)
    expect(first).toBeLessThan(middle)
    expect(last).toBeLessThan(middle)
  })

  test('a swing goes out and comes back to nothing', () => {
    const swing = { kind: 'swing', node: 'arm', axis: 'x', amount: 30, seconds: 2 } as const
    expect(angleAt(swing, 0)).toBeCloseTo(0, 6)
    expect(angleAt(swing, 0.5)).toBeCloseTo(30, 6)
    expect(angleAt(swing, 1)).toBeCloseTo(0, 6)
    expect(angleAt(swing, 1.5)).toBeCloseTo(-30, 6)
    expect(angleAt(swing, 2)).toBeCloseTo(0, 6)
  })

  test('and `times` is how many trips it makes in the same seconds', () => {
    const once = { kind: 'swing', node: 'arm', axis: 'x', amount: 30, seconds: 2 } as const
    const twice = { ...once, times: 2 }
    expect(angleAt(twice, 0.5)).toBeCloseTo(angleAt(once, 1), 6)
  })

  test('a shake dies away, so it can be dropped into the middle of a sequence', () => {
    /**
     * The difference between a shake and a swing, and the reason it is worth
     * being a separate kind: what falls off is the *amplitude*, not the angle.
     * A shake that ended anywhere but where it started would move everything
     * after it in the sequence.
     */
    const shake = { kind: 'shake', node: 'crate', axis: 'x', amount: 20, seconds: 1 } as const
    expect(angleAt(shake, 0)).toBeCloseTo(0, 6)
    expect(angleAt(shake, 1)).toBeCloseTo(0, 6)
    expect(Math.abs(angleAt(shake, 0.1))).toBeGreaterThan(Math.abs(angleAt(shake, 0.9)))
  })

  test('and it is the same shake on every screen', () => {
    // Deliberately not random. Two viewers computing a pose from a motion and a
    // start time must get the same answer, or the whole "send a name and a
    // moment" design is a lie.
    const shake = { kind: 'shake', node: 'crate', axis: 'x', amount: 20, seconds: 1 } as const
    expect(angleAt(shake, 0.37)).toBe(angleAt(shake, 0.37))
  })

  test('a step with no length has an answer rather than a division', () => {
    // The parser refuses zero seconds, so this is defence rather than a case -
    // and a function that divided by it would take the whole frame down.
    const flat = { kind: 'turn', node: 'lid', axis: 'y', amount: 90, seconds: 0 } as const
    expect(Number.isFinite(angleAt(flat, 0))).toBe(true)
  })
})

describe('where everything is, part way through', () => {
  test('one step at a time, and the last to mention a node wins', () => {
    // The whole of the sequencing rule. During the pause the lid holds ninety,
    // because nothing in the pause says anything about the lid.
    expect(poseAt(DOOR, 1)).toEqual({ lid: { axis: 'y', angle: 90 } })
    expect(poseAt(DOOR, 2)).toEqual({ lid: { axis: 'y', angle: 90 } })
    expect(poseAt(DOOR, 3)).toEqual({ lid: { axis: 'y', angle: 90 } })
  })

  test('and the closing step takes it back', () => {
    expect(poseAt(DOOR, 4).lid!.angle).toBeCloseTo(0, 6)
  })

  test('a step in the future is not pre-empted by the playhead reaching it', () => {
    // Before the third step begins, nothing it says has happened - so the lid is
    // still open rather than already on its way back.
    expect(poseAt(DOOR, 2.99).lid!.angle).toBeCloseTo(90, 6)
  })

  test('a finished motion holds its last frame, like a one-shot clip', () => {
    // Which is what makes "the door stays open" need no verb at all.
    const open: Motion = { steps: [{ kind: 'turn', node: 'lid', axis: 'y', amount: 90, seconds: 1 }] }
    expect(poseAt(open, 5).lid!.angle).toBeCloseTo(90, 6)
  })

  test('and a looping one wraps rather than holding', () => {
    const fan: Motion = {
      loop: true,
      steps: [{ kind: 'turn', node: 'blade', axis: 'y', amount: 90, seconds: 1 }],
    }
    expect(poseAt(fan, 2.5).blade!.angle).toBeCloseTo(poseAt(fan, 0.5).blade!.angle, 6)
  })

  test('a negative second is the start rather than a wrap backwards', () => {
    // The clock is `now - since`, and a packet arriving from a peer whose clock
    // is a fraction ahead makes that negative for a frame. The start of the
    // motion is the only sane reading of "it has not begun yet".
    expect(poseAt(DOOR, -1).lid!.angle).toBeCloseTo(0, 6)
  })
})

/**
 * And the document, which is where the silent failures actually get in.
 */
const level = (blueprints: unknown) =>
  parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    blueprints,
  })

const FAN = {
  model: 'proto/Box_A',
  motions: {
    turning: { loop: true, steps: [{ kind: 'spin', node: 'blade', axis: 'y', amount: 180, seconds: 1 }] },
  },
}

describe('a motion in a document', () => {
  test('survives the round trip', () => {
    const parsed = level({ fan: FAN })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.fan.motions!.turning!.loop).toBe(true)
    expect(parsed.document.blueprints.fan.motions!.turning!.steps).toHaveLength(1)
  })

  test('a motion with no steps is refused, not read as "does nothing"', () => {
    // The same rule an animation graph's `states` has: a graph with no states is
    // not a graph. `play` on an empty motion is a verb that reports success and
    // moves nothing.
    const parsed = level({ fan: { ...FAN, motions: { turning: { steps: [] } } } })
    expect(parsed.ok).toBe(false)
  })

  test('a step of no length is refused, because nobody can see it', () => {
    const parsed = level({
      fan: { ...FAN, motions: { turning: { steps: [{ kind: 'spin', axis: 'y', amount: 1, seconds: 0 }] } } },
    })
    expect(parsed.ok).toBe(false)
  })

  test('`times` on a spin is refused rather than ignored', () => {
    /**
     * A number that does nothing is a number somebody will tune for an hour -
     * the same argument `readTrigger` makes about a `key` on an `enter`.
     */
    const parsed = level({
      fan: {
        ...FAN,
        motions: {
          turning: { steps: [{ kind: 'spin', node: 'b', axis: 'y', amount: 1, seconds: 1, times: 3 }] },
        },
      },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((one) => one.at)).toContain('blueprints.fan.motions.turning.steps[0].times')
  })

  test('a step with no node is a pause, and is allowed', () => {
    // The one field that is optional, and it is what "open, wait, close" needs
    // in the middle.
    const parsed = level({
      fan: { ...FAN, motions: { waiting: { steps: [{ kind: 'turn', axis: 'y', amount: 0, seconds: 1 }] } } },
    })
    expect(parsed.ok).toBe(true)
  })

  test('a kind nobody ships is refused', () => {
    const parsed = level({
      fan: { ...FAN, motions: { turning: { steps: [{ kind: 'wobble', axis: 'y', amount: 1, seconds: 1 }] } } },
    })
    expect(parsed.ok).toBe(false)
  })
})

/**
 * `play`, and the thing it can check that `animate` cannot.
 *
 * A clip name belongs to whichever glTFs a host loaded, so the parser takes any
 * well-formed one. A motion name belongs to a blueprint in this very document,
 * so a `play` naming one nobody wrote is refusable in exactly the way a `spawn`
 * of an unwritten blueprint is.
 */
describe('playing one by name', () => {
  test('a rule may play a motion this level has', () => {
    const parsed = level({
      fan: {
        ...FAN,
        triggers: [{ on: 'enter', do: [{ op: 'play', motion: 'turning', target: 'self' }] }],
      },
    })
    expect(parsed.ok).toBe(true)
  })

  test('and one it does not have is refused, rather than doing nothing', () => {
    const parsed = level({
      fan: {
        ...FAN,
        triggers: [{ on: 'enter', do: [{ op: 'play', motion: 'spinning', target: 'self' }] }],
      },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems[0]!.message).toContain('spinning')
  })

  test('any blueprint s motion, because a rule may target somebody else', () => {
    /**
     * A rule fires with a `self` and an `other`, and `target` may name either -
     * so which blueprint will be playing this is not knowable at parse time.
     * Insisting it be the rule's own would refuse a working level: a pressure
     * plate that opens the door beside it.
     */
    const parsed = level({
      door: FAN,
      plate: {
        model: 'proto/Box_A',
        triggers: [{ on: 'enter', do: [{ op: 'play', motion: 'turning', target: 'other' }] }],
      },
    })
    expect(parsed.ok).toBe(true)
  })
})
