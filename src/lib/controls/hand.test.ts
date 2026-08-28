import { describe, expect, test } from 'bun:test'
import { DEFAULT_HAND, parseHand } from '@/lib/controls/hand'

describe('parseHand', () => {
  test('takes the two words it knows', () => {
    expect(parseHand('left')).toBe('left')
    expect(parseHand('right')).toBe('right')
  })

  /**
   * The distinction the scenes depend on: nothing stored is *unanswered*, not
   * "right". A `null` here is what puts the question on screen, and a default
   * returned in its place would mean nobody is ever asked.
   */
  test('an absent value is unanswered rather than the default', () => {
    expect(parseHand(null)).toBeNull()
    expect(parseHand(undefined)).toBeNull()
  })

  test('anything else is unanswered too, rather than a throw', () => {
    expect(parseHand('LEFT')).toBeNull()
    expect(parseHand('southpaw')).toBeNull()
    expect(parseHand('')).toBeNull()
    expect(parseHand(1)).toBeNull()
    expect(parseHand({ hand: 'left' })).toBeNull()
  })
})

describe('DEFAULT_HAND', () => {
  test('is the layout every console already ships', () => {
    expect(DEFAULT_HAND).toBe('right')
  })
})
