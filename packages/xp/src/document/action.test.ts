import { describe, expect, test } from 'bun:test'
import {
  actedAt,
  actionAsKeys,
  ACTION_KINDS,
  defaultDuration,
  emptyTimeline,
  keysAsAction,
  sampleKeys,
  type XpAction,
  type XpTimeline,
} from './movie'

/**
 * Actions: what a body *does*, as opposed to what a number is.
 *
 * The half keys cannot express. `keys.ts` opens with the argument and
 * docs/xp/scenes.md §2.2 repeats it: keys interpolate a number between two
 * moments, which is right for a light dimming and wrong for an animal crossing
 * a field - that needs a clip chosen from the speed and a body that turns to
 * face where it is going.
 *
 * Everything here is a question about the **fold**, because that is where an
 * action is different from a key: a move starts where the last one finished, so
 * the answer at four seconds depends on everything before it.
 */

const from = { x: 0, y: 0, z: 0, rotation: 0 }

const timeline = (actions: XpAction[]): XpTimeline => ({ ...emptyTimeline(), actions })

const move = (over: Partial<Extract<XpAction, { kind: 'move' }>> = {}): XpAction => ({
  kind: 'move',
  entity: 'hero',
  t: 0,
  duration: 2,
  x: 10,
  z: 0,
  ...over,
})

describe('a move', () => {
  test('arrives exactly where it says, and stays', () => {
    const one = timeline([move()])
    expect(actedAt(one, 'hero', 2, from).x).toBeCloseTo(10)
    expect(actedAt(one, 'hero', 99, from).x).toBeCloseTo(10)
  })

  test('has not started before its moment', () => {
    expect(actedAt(timeline([move({ t: 1 })]), 'hero', 0.5, from).x).toBe(0)
  })

  test('faces where it is going, which is what makes it a walk', () => {
    // Two position keys give you a body sliding across the floor in its idle
    // pose. This is the difference.
    const east = actedAt(timeline([move({ x: 10, z: 0 })]), 'hero', 1, from)
    expect(east.rotation).toBeCloseTo(90)
    const north = actedAt(timeline([move({ x: 0, z: 10 })]), 'hero', 1, from)
    expect(north.rotation).toBeCloseTo(0)
  })

  test('a move to where you already are does not snap the facing', () => {
    const still = actedAt(timeline([move({ x: 0, z: 0 })]), 'hero', 1, {
      ...from,
      rotation: 143,
    })
    expect(still.rotation).toBe(143)
  })

  test('covers ground at one rate, which is what makes the stance hold', () => {
    /*
      The bug this replaced a smoothstep to fix, and the reason it was invisible.

      `PosedEntity` is drawn `measured`, so `SkinnedBody` differentiates the
      position it actually draws and hands that speed to `motionFor`. Under an
      eased move the speed is a bump - nothing at both ends, half again the
      average in the middle - so one walk was drawn as idle, walk, sometimes run,
      walk, idle. Nothing about the *positions* was wrong, which is why it lived
      through a test file.

      Quarters rather than the midpoint, because a smoothstep and a straight line
      agree exactly at the midpoint: 0.5 is the one sample that could never have
      caught this.
    */
    const one = timeline([move({ x: 8, duration: 4 })])
    expect(actedAt(one, 'hero', 1, from).x).toBeCloseTo(2)
    expect(actedAt(one, 'hero', 2, from).x).toBeCloseTo(4)
    expect(actedAt(one, 'hero', 3, from).x).toBeCloseTo(6)
  })

  test('the drawn speed never changes within one move', () => {
    // The property the constant rate exists for, stated the way the stance
    // machine sees it: differentiate the drawn position and you get one number,
    // so a move can never cross the walk/run boundary inside itself.
    const one = timeline([move({ x: 12, duration: 3 })])
    const step = 0.05
    const rates: number[] = []
    for (let t = step; t < 3; t += step) {
      const before = actedAt(one, 'hero', t - step, from)
      const now = actedAt(one, 'hero', t, from)
      rates.push(Math.hypot(now.x - before.x, now.z - before.z) / step)
    }
    for (const rate of rates) expect(rate).toBeCloseTo(4, 5)
  })

  test('keeps facing where it walked once it arrives', () => {
    /*
      A deliberate departure from `src/domain/studio/shot.ts`, which drops back
      to the authored angle the instant a walk ends - it can, because over there
      the facing is a separate fold of turns that travel only borrows.

      Here rotation is one folded value, so leaving it alone while the move ran
      meant the body span back to what it faced before it set off, on the frame
      it arrived: a walk east that ends looking north with nothing in the
      document saying so.
    */
    const one = timeline([move({ x: 10, z: 0, duration: 2 })])
    expect(actedAt(one, 'hero', 1, from).rotation).toBeCloseTo(90)
    expect(actedAt(one, 'hero', 2, from).rotation).toBeCloseTo(90)
    expect(actedAt(one, 'hero', 99, from).rotation).toBeCloseTo(90)
  })

  test('and a turn after it still wins, because it is later in the fold', () => {
    const both = timeline([
      move({ x: 10, z: 0, duration: 2 }),
      { kind: 'turn', entity: 'hero', t: 2, duration: 0.5, rotation: 0 },
    ])
    expect(actedAt(both, 'hero', 2.5, from).rotation).toBeCloseTo(0)
  })

  test('reports a speed while it runs and none once it is over', () => {
    // A speed rather than a clip name: which animation a walking body plays is
    // the host's business, and `_runtime/body/motion.ts` already decides it
    // better than this module could.
    const one = timeline([move({ x: 10, duration: 2 })])
    expect(actedAt(one, 'hero', 1, from).speed).toBeCloseTo(5)
    expect(actedAt(one, 'hero', 3, from).speed).toBe(0)
  })

  test('chains: the second starts where the first finished', () => {
    // The whole reason actions are a fold. "Walk to the door, then walk back"
    // is two things to type rather than four coordinates to keep in agreement.
    const there = timeline([
      move({ t: 0, duration: 1, x: 10, z: 0 }),
      move({ t: 1, duration: 1, x: 10, z: 10 }),
    ])
    const end = actedAt(there, 'hero', 2, from)
    expect(end.x).toBeCloseTo(10)
    expect(end.z).toBeCloseTo(10)
  })

  test('somebody else actions do not move this body', () => {
    expect(actedAt(timeline([move({ entity: 'other' })]), 'hero', 2, from).x).toBe(0)
  })
})

describe('a turn', () => {
  test('goes the short way round', () => {
    // 355 to 345 is ten degrees, not three hundred and fifty.
    const short = actedAt(
      timeline([{ kind: 'turn', entity: 'hero', t: 0, duration: 1, rotation: 345 }]),
      'hero',
      1,
      { ...from, rotation: 355 },
    )
    expect(short.rotation).toBeCloseTo(345)
  })

  test('arrives at the angle and holds it', () => {
    const one = timeline([{ kind: 'turn', entity: 'hero', t: 0, duration: 1, rotation: 90 }])
    expect(actedAt(one, 'hero', 1, from).rotation).toBeCloseTo(90)
    expect(actedAt(one, 'hero', 5, from).rotation).toBeCloseTo(90)
  })
})

describe('a jump', () => {
  const jump = timeline([{ kind: 'jump', entity: 'hero', t: 0, duration: 1, height: 2 }])

  test('leaves the floor and lands back on it', () => {
    expect(actedAt(jump, 'hero', 0, from).y).toBeCloseTo(0)
    expect(actedAt(jump, 'hero', 0.5, from).y).toBeCloseTo(2)
    expect(actedAt(jump, 'hero', 1, from).y).toBeCloseTo(0)
  })

  test('says it is airborne only while it is', () => {
    expect(actedAt(jump, 'hero', 0.5, from).airborne).toBe(true)
    expect(actedAt(jump, 'hero', 2, from).airborne).toBe(false)
  })
})

describe('clips and lines are actions too', () => {
  test('they are in the same list and move nothing', () => {
    // "Animations are actions" - a clip has a moment, a duration and an actor,
    // which is a Beat. Drawing it in a separate row from the walk it happens
    // during was drawing one performance as two.
    const both = timeline([
      move({ x: 4, duration: 1 }),
      { kind: 'play', entity: 'hero', t: 0, duration: 1, clip: 'wave', loop: false },
      { kind: 'say', entity: 'hero', t: 0, duration: 1, text: 'hello' },
    ])
    expect(actedAt(both, 'hero', 1, from).x).toBeCloseTo(4)
  })

  test('every kind has a default length, and none of them is zero', () => {
    for (const kind of ACTION_KINDS) expect(defaultDuration(kind)).toBeGreaterThan(0)
  })
})

describe('an action, as keys', () => {
  test('the keys reproduce what the action was doing', () => {
    // The property that makes it safe to press: nothing moves when you convert.
    const one = timeline([move({ x: 10, duration: 2 })])
    const baked = actionAsKeys(one.actions[0]!, one, from)
    expect(sampleKeys(baked.x, 1, 0)).toBeCloseTo(actedAt(one, 'hero', 1, from).x, 1)
    expect(sampleKeys(baked.x, 2, 0)).toBeCloseTo(10, 1)
  })

  test('lands on the movie own frames rather than a rate of its own', () => {
    const one: XpTimeline = { ...timeline([move({ duration: 1 })]), fps: 10 }
    const baked = actionAsKeys(one.actions[0]!, one, from)
    // A second at ten frames, both ends included.
    expect(baked.x!.length).toBe(11)
  })

  test('a move writes no height track, so it can still be lifted afterwards', () => {
    const one = timeline([move()])
    expect(actionAsKeys(one.actions[0]!, one, from).y).toBeUndefined()
  })

  test('a clip and a line have no keys in them', () => {
    const one = timeline([{ kind: 'say', entity: 'hero', t: 0, duration: 1, text: 'hi' }])
    expect(actionAsKeys(one.actions[0]!, one, from)).toEqual({})
  })
})

describe('keys, as an action', () => {
  const two = {
    x: [
      { t: 1, value: 0, ease: 'linear' as const },
      { t: 3, value: 8, ease: 'linear' as const },
    ],
    z: [
      { t: 1, value: 0, ease: 'linear' as const },
      { t: 3, value: 4, ease: 'linear' as const },
    ],
  }

  test('two matching pairs become the move they describe', () => {
    const lifted = keysAsAction(two, 'hero')
    expect(lifted).toMatchObject({ kind: 'move', entity: 'hero', t: 1, duration: 2, x: 8, z: 4 })
  })

  test('three keys are a path, not a walk', () => {
    expect(
      keysAsAction({ ...two, x: [...two.x, { t: 5, value: 12, ease: 'linear' }] }, 'hero'),
    ).toBe(null)
  })

  test('keys at different moments are two edits, not one move', () => {
    expect(
      keysAsAction(
        { ...two, z: [{ t: 2, value: 0, ease: 'linear' }, { t: 4, value: 4, ease: 'linear' }] },
        'hero',
      ),
    ).toBe(null)
  })

  test('anything else keyed makes it more than a walk', () => {
    expect(
      keysAsAction({ ...two, scale: [{ t: 1, value: 2, ease: 'linear' }] }, 'hero'),
    ).toBe(null)
  })

  test('but a facing is absorbed, because a move sets it anyway', () => {
    expect(
      keysAsAction({ ...two, rotation: [{ t: 1, value: 90, ease: 'linear' }] }, 'hero'),
    ).not.toBe(null)
  })

  test('nothing keyed is nothing to lift', () => {
    expect(keysAsAction(undefined, 'hero')).toBe(null)
    expect(keysAsAction({}, 'hero')).toBe(null)
  })

  test('a round trip through keys and back is the same move', () => {
    const one = timeline([move({ t: 1, duration: 2, x: 8, z: 4 })])
    const baked = actionAsKeys(one.actions[0]!, one, from)
    // Baked keys are dense - one a frame - so they are deliberately *not*
    // liftable. "When possible" means two keys, and this is sixty-one.
    expect(keysAsAction(baked, 'hero')).toBe(null)
  })
})
