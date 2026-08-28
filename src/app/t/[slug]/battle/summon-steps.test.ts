import { describe, expect, test } from 'bun:test'
import {
  canLeave,
  furthest,
  stepAt,
  STEPS_BY_KIND,
  stepsFor,
} from '@/app/t/[slug]/battle/summon-steps'

/**
 * The wizard's navigation, which used to be four expressions scattered through
 * 1,300 lines of markup.
 *
 * Every question below was previously settled by reading JSX and counting: does
 * the fork disappear when a space has no levels? can you leave the config step
 * without picking one? does the step counter agree with the strip above it?
 */

describe('which questions get asked', () => {
  test('the xo path is a mode, a ground, the rules and the fighters', () => {
    expect(stepsFor('xo', true)).toEqual(['kind', 'mode', 'arena', 'rules', 'fighters'])
  })

  test('the xp path is shorter, because the level is the mode and the clock', () => {
    expect(stepsFor('xp', true)).toEqual(['kind', 'xp', 'config', 'fighters'])
  })

  /**
   * No levels to offer means no question to ask, and the wizard opens on `mode`
   * exactly as it did before the fork existed.
   */
  test('with nothing to fork to, the first step disappears entirely', () => {
    expect(stepsFor('xo', false)).toEqual(['mode', 'arena', 'rules', 'fighters'])
    expect(stepsFor('xo', false)).not.toContain('kind')
  })

  /**
   * There is no way to have chosen `xp` when the fork was never shown, so a
   * stale `kind` must not produce a list nobody can complete.
   */
  test('and a leftover xp kind does not survive losing the fork', () => {
    expect(stepsFor('xp', false)).toEqual(['mode', 'arena', 'rules', 'fighters'])
  })

  test('both paths start on the fork and end on the fighters', () => {
    for (const kind of ['xo', 'xp'] as const) {
      const steps = stepsFor(kind, true)
      expect(steps[0]).toBe('kind')
      expect(steps.at(-1)).toBe('fighters')
    }
  })

  test('no path asks the same question twice', () => {
    for (const steps of Object.values(STEPS_BY_KIND)) {
      expect(new Set(steps).size).toBe(steps.length)
    }
  })
})

describe('where the wizard is', () => {
  const steps = stepsFor('xo', true)

  test('reads the step at the index', () => {
    expect(stepAt(steps, 0)).toBe('kind')
    expect(stepAt(steps, 2)).toBe('arena')
    expect(stepAt(steps, 4)).toBe('fighters')
  })

  /**
   * Reachable for a frame when the list shortens under a stale index. Falling
   * back beats rendering nothing.
   */
  test('an index past the end falls back to the first step', () => {
    expect(stepAt(steps, 99)).toBe('kind')
    expect(stepAt(stepsFor('xp', true), 4)).toBe('kind')
  })

  test('and an empty list still answers with a step', () => {
    expect(stepAt([], 0)).toBe('mode')
  })
})

describe('whether Next is live', () => {
  const anything = { named: true, chosen: true }

  test('a step with a default in it is always passable', () => {
    expect(canLeave('kind', { named: false, chosen: false })).toBe(true)
    expect(canLeave('mode', { named: false, chosen: false })).toBe(true)
    expect(canLeave('arena', { named: false, chosen: false })).toBe(true)
    expect(canLeave('xp', { named: false, chosen: false })).toBe(true)
    expect(canLeave('fighters', { named: false, chosen: false })).toBe(true)
  })

  test('the xo path will not leave its rules without a name', () => {
    expect(canLeave('rules', { ...anything, named: false })).toBe(false)
    expect(canLeave('rules', { ...anything, named: true })).toBe(true)
  })

  /**
   * The config step asks for both. Pressing on with neither would summon a
   * match with nothing to play.
   */
  test('the xp path will not leave its config without a name and a level', () => {
    expect(canLeave('config', { named: false, chosen: false })).toBe(false)
    expect(canLeave('config', { named: true, chosen: false })).toBe(false)
    expect(canLeave('config', { named: false, chosen: true })).toBe(false)
    expect(canLeave('config', { named: true, chosen: true })).toBe(true)
  })

  /** A chosen level is not what the xo path is short of. */
  test('a chosen level does not stand in for a name on the xo path', () => {
    expect(canLeave('rules', { named: false, chosen: true })).toBe(false)
  })
})

describe('how far it has been', () => {
  test('going forward moves the mark', () => {
    expect(furthest(0, 1)).toBe(1)
    expect(furthest(2, 3)).toBe(3)
  })

  /**
   * The reason it is tracked rather than derived: somebody who reached the last
   * screen and stepped back two to fix the clock should be able to jump forward
   * again rather than pressing Next three times.
   */
  test('stepping back does not shut the steps in front of you', () => {
    expect(furthest(4, 2)).toBe(4)
    expect(furthest(4, 0)).toBe(4)
  })

  test('and the mark never moves backwards over a whole walk', () => {
    let reached = 0
    for (const next of [1, 2, 3, 4, 2, 1, 3, 0]) reached = furthest(reached, next)
    expect(reached).toBe(4)
  })
})
