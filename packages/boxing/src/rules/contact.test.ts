import { describe, expect, test } from 'bun:test'
import { COUNTER, resolve, healthCost, staggers } from './contact'
import { CHIP, MOVES } from './moves'

/**
 * What beats what.
 *
 * Every case here is a *balance* claim rather than a code one - "a slip beats
 * an uppercut" is a sentence about the game, and the only way to know it is
 * still true after somebody retunes the frame data is to ask. A fighting game
 * whose match-ups live only in a reviewer's head is one that gets silently
 * rebalanced by a one-line change to a reach.
 */

const standing = { move: 'idle' as const, elapsed: 0, stamina: 100 }

describe('distance', () => {
  test('a punch that falls short is a miss, however badly it was defended', () => {
    const gap = MOVES.jab.reach! + 0.01
    expect(resolve(MOVES.jab, gap, standing).kind).toBe('miss')
  })

  test('the straights outreach the short punches', () => {
    // The ladder in ./moves claims this. If a tuning pass ever inverts it, the
    // uppercut becomes a long-range guard break and the game has no answer.
    expect(MOVES.cross.reach!).toBeGreaterThan(MOVES.hook.reach!)
    expect(MOVES.hook.reach!).toBeGreaterThan(MOVES.uppercut.reach!)
  })

  test('an uppercut cannot be thrown from jab distance', () => {
    const gap = MOVES.jab.reach!
    expect(resolve(MOVES.uppercut, gap, standing).kind).toBe('miss')
    expect(resolve(MOVES.jab, gap, standing).kind).toBe('clean')
  })
})

describe('the guard', () => {
  const blocking = (stamina = 100) => ({ move: 'block' as const, elapsed: 0.2, stamina })

  test('a blocked punch costs a tenth of its damage and a chunk of stamina', () => {
    const contact = resolve(MOVES.hook, 1, blocking())
    expect(contact).toEqual({
      kind: 'blocked',
      damage: MOVES.hook.damage! * CHIP,
      stamina: MOVES.hook.guardCost!,
    })
  })

  test('a block does not stagger, which is the whole point of blocking', () => {
    expect(staggers(resolve(MOVES.hook, 1, blocking()))).toBe(false)
  })

  test('the uppercut goes straight through a full guard for everything', () => {
    const contact = resolve(MOVES.uppercut, 1, blocking())
    expect(contact).toEqual({ kind: 'broken', damage: MOVES.uppercut.damage! })
  })

  /**
   * The reason stamina is the interesting bar. A fighter who has blocked all
   * round has nothing left to block with, and finds out by being hit properly.
   */
  test('a guard with nothing left behind it breaks', () => {
    const nearlyEmpty = blocking(MOVES.overhand.guardCost! - 1)
    expect(resolve(MOVES.overhand, 1, nearlyEmpty).kind).toBe('broken')
  })

  test('the same punch against a fresh guard is merely blocked', () => {
    expect(resolve(MOVES.overhand, 1, blocking()).kind).toBe('blocked')
  })
})

describe('the timed defences', () => {
  const at = (move: 'slip' | 'parry', elapsed: number) => ({ move, elapsed, stamina: 100 })

  test('a slip beats the punch that beats the guard', () => {
    // Slip and block between them answer everything, and neither answers all of
    // it. That is the whole defensive triangle.
    const mid = MOVES.slip.startup + MOVES.slip.active / 2
    expect(resolve(MOVES.uppercut, 1, at('slip', mid)).kind).toBe('slipped')
  })

  test('a slip is not safe while it is starting', () => {
    expect(resolve(MOVES.cross, 1, at('slip', 0.01)).kind).toBe('clean')
  })

  test('a slip is not safe once it is recovering', () => {
    const late = MOVES.slip.startup + MOVES.slip.active + 0.01
    expect(resolve(MOVES.cross, 1, at('slip', late)).kind).toBe('clean')
  })

  test('a parry takes the punch and gives nothing back', () => {
    const mid = MOVES.parry.startup + MOVES.parry.active / 2
    const contact = resolve(MOVES.overhand, 1, at('parry', mid))
    expect(contact.kind).toBe('parried')
    expect(healthCost(contact)).toBe(0)
  })

  test('a parry window is narrower than a slip window', () => {
    // If this inverts, parry is strictly worse than slip and nobody presses it.
    expect(MOVES.parry.active).toBeLessThan(MOVES.slip.active)
  })
})

describe('counters', () => {
  test('catching somebody starting a punch hurts more', () => {
    const winding = { move: 'overhand' as const, elapsed: 0.05, stamina: 100 }
    const contact = resolve(MOVES.cross, 1, winding)
    expect(contact).toEqual({
      kind: 'clean',
      damage: MOVES.cross.damage! * COUNTER,
      counter: true,
    })
  })

  test('catching somebody in recovery is not a counter - the recovery is the punishment', () => {
    const spent = { move: 'overhand' as const, elapsed: 0.5, stamina: 100 }
    const contact = resolve(MOVES.cross, 1, spent)
    expect(contact).toEqual({ kind: 'clean', damage: MOVES.cross.damage!, counter: false })
  })

  test('walking into a punch is not a counter', () => {
    const walking = { move: 'walkIn' as const, elapsed: 0.3, stamina: 100 }
    expect(resolve(MOVES.cross, 1, walking)).toMatchObject({ counter: false })
  })
})

describe('the order of the checks', () => {
  /**
   * `contact.ts` says reordering these rebalances the game without touching a
   * number. This is that claim, asserted: a fighter who is somehow both
   * slipping and out of range is out of range, and one who slips a guard
   * breaker has slipped it.
   */
  test('reach is checked before any defence', () => {
    const far = MOVES.uppercut.reach! + 1
    const mid = MOVES.slip.startup + MOVES.slip.active / 2
    expect(resolve(MOVES.uppercut, far, { move: 'slip', elapsed: mid, stamina: 100 }).kind)
      .toBe('miss')
  })
})
