import { describe, expect, test } from 'bun:test'

import { nextTarget } from './target'

/** A deterministic stand-in for Math.random, cycling through a short list. */
const rolls = (values: number[]) => {
  let at = 0
  return () => values[at++ % values.length]
}

/**
 * A seeded generator, so "three hundred targets" means the same three hundred
 * every run.
 *
 * `Math.random` was here first and the distance test flaked on it: the picker
 * is allowed to give up after twelve tries (see `APART`), which is rare and
 * therefore exactly the kind of thing that fails once a fortnight in CI and
 * never on the machine you are looking at.
 */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

describe('nextTarget', () => {
  test('never lands where a finger cannot reach', () => {
    const random = seeded(7)
    let target = nextTarget(null, random)
    for (let i = 0; i < 300; i++) {
      target = nextTarget(target, random)
      expect(target.left).toBeGreaterThanOrEqual(18)
      expect(target.left).toBeLessThanOrEqual(82)
      expect(target.top).toBeGreaterThanOrEqual(18)
      expect(target.top).toBeLessThanOrEqual(82)
    }
  })

  test('moves away from the last one', () => {
    const random = seeded(11)
    let target = nextTarget(null, random)
    for (let i = 0; i < 300; i++) {
      const next = nextTarget(target, random)
      expect(Math.hypot(next.left - target.left, next.top - target.top)).toBeGreaterThanOrEqual(30)
      target = next
    }
  })

  test('gives up rather than hanging when nowhere is far enough', () => {
    // Every roll is the same number, so no attempt can ever be far enough
    // away. It has to come back with the middle of the page.
    const stuck = nextTarget(null, rolls([0.5]))
    const again = nextTarget(stuck, rolls([0.5]))
    expect(again.left).toBe(stuck.left)
    expect(again.top).toBe(stuck.top)
  })

  test('asks for every word it knows', () => {
    const random = seeded(3)
    const words = new Set<string>()
    let target = nextTarget(null, random)
    for (let i = 0; i < 200; i++) {
      target = nextTarget(target, random)
      words.add(target.word)
    }
    expect([...words].sort()).toEqual(['dance', 'magic', 'shout'])
  })
})
