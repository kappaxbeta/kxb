import { describe, expect, test } from 'bun:test'

import {
  cycleOf,
  freshCrusher,
  freshLift,
  moves,
  motionProblems,
  offsetAt,
  travelOf,
} from '@/domain/thingiverse/motion'

/** A metre to the right, a second out, a second back, no waiting, no easing. */
const slide = { by: { x: 1, y: 0, z: 0 }, out: 1, back: 1 }

describe('a thing that goes there and comes back', () => {
  test('starts at home', () => {
    expect(travelOf(slide, 0)).toBe(0)
    expect(offsetAt(slide, 0)).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('is half way out half way through the first leg', () => {
    expect(travelOf(slide, 0.5)).toBeCloseTo(0.5, 5)
    expect(offsetAt(slide, 0.5).x).toBeCloseTo(0.5, 5)
  })

  test('reaches the far end, and comes back', () => {
    expect(travelOf(slide, 1)).toBe(1)
    expect(travelOf(slide, 1.5)).toBeCloseTo(0.5, 5)
    expect(travelOf(slide, 2)).toBe(0)
  })

  test('and goes round again, forever', () => {
    // The whole reason the phase wraps: a watcher whose clock has been drifting
    // for an hour is at the same point as one that just arrived, rather than
    // somewhere off the end of the trip.
    expect(travelOf(slide, 100.5)).toBeCloseTo(travelOf(slide, 0.5), 5)
    expect(travelOf(slide, -0.5)).toBeCloseTo(travelOf(slide, 1.5), 5)
  })

  test('a clock nobody set draws it at home rather than nowhere', () => {
    expect(travelOf(slide, Number.NaN)).toBe(0)
  })
})

describe('the waits', () => {
  const waiting = { ...slide, waitOut: 2, waitHome: 3 }

  test('count towards the cycle', () => {
    expect(cycleOf(slide)).toBe(2)
    expect(cycleOf(waiting)).toBe(7)
  })

  test('hold it at the far end', () => {
    expect(travelOf(waiting, 1)).toBe(1)
    expect(travelOf(waiting, 2.9)).toBe(1)
    // And the trip back starts the moment the wait is over.
    expect(travelOf(waiting, 3.5)).toBeCloseTo(0.5, 5)
  })

  test('and at home', () => {
    expect(travelOf(waiting, 4.1)).toBe(0)
    expect(travelOf(waiting, 6.9)).toBe(0)
    expect(travelOf(waiting, 7)).toBe(0)
  })
})

describe('easing', () => {
  test('is flat at both ends, so a lift arrives without a bounce', () => {
    const eased = { ...slide, ease: true }
    expect(travelOf(eased, 0.05)).toBeLessThan(travelOf(slide, 0.05))
    expect(travelOf(eased, 0.5)).toBeCloseTo(0.5, 5)
    expect(travelOf(eased, 0.95)).toBeGreaterThan(travelOf(slide, 0.95))
  })

  test('and a crusher does not ease, because arriving all at once is the point', () => {
    const crusher = freshCrusher()
    expect(crusher.ease).toBeUndefined()
    // A fifth of a second to fall three cells: half way down at a tenth.
    expect(offsetAt(crusher, 0.1).y).toBeCloseTo(-1.5, 5)
  })
})

describe('whether it goes anywhere', () => {
  test('a lift does', () => {
    expect(moves({ motion: freshLift() })).toBe(true)
  })

  test('a thing with no motion, and one told to travel nowhere, do not', () => {
    expect(moves({})).toBe(false)
    expect(moves({ motion: { by: { x: 0, y: 0, z: 0 }, out: 1, back: 1 } })).toBe(false)
  })
})

describe('what is refused', () => {
  test('a trip further than the world should carry a thing', () => {
    expect(motionProblems({ ...slide, by: { x: 40, y: 0, z: 0 } })).toHaveLength(1)
  })

  test('a leg that takes no time, or an age', () => {
    expect(motionProblems({ ...slide, out: 0 })).toHaveLength(1)
    expect(motionProblems({ ...slide, back: 600 })).toHaveLength(1)
  })

  test('a negative wait', () => {
    expect(motionProblems({ ...slide, waitHome: -1 })).toHaveLength(1)
  })

  test('and nothing at all about the two we ship', () => {
    expect(motionProblems(freshLift())).toEqual([])
    expect(motionProblems(freshCrusher())).toEqual([])
  })
})
