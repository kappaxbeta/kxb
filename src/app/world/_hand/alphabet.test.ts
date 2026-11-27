import { describe, expect, test } from 'bun:test'

import { ALPHABET, handFor, LETTERS, read, REST, SPACE } from './alphabet'
import { costOf, FIST, OPEN, parsePose, POSES, poseName } from './fingers'

/**
 * The alphabet is a hand-written table with a paragraph of reasoning above it,
 * and the two drift apart the first time somebody moves a letter. So the rule
 * is re-run here: the five hands that were chosen because people already know
 * them are named, and every other letter is checked to be sitting exactly where
 * "easiest hand, commonest letter" puts it.
 *
 * The point is not that the derivation is sacred. It is that changing it should
 * mean editing this file too, in front of the sentence that says why.
 */

/** The five hands that overrule the ranking. See `alphabet.ts`. */
const KNOWN: Record<string, string> = { l: 'TI', v: 'IM', o: 'MRP', x: 'IP', i: 'P' }

/** English, commonest first. */
const FREQUENCY = 'etaoinsrhldcumwfgypbvkjxqz'

describe('the table', () => {
  test('every letter spells a hand', () => {
    for (const letter of LETTERS) expect(parsePose(ALPHABET[letter])).not.toBeNull()
  })

  test('no two letters share a hand', () => {
    const hands = LETTERS.map((letter) => handFor(letter))
    expect(new Set(hands).size).toBe(LETTERS.length)
  })

  test('the resting hand and the open hand are not letters', () => {
    for (const letter of LETTERS) {
      expect(handFor(letter)).not.toBe(FIST)
      expect(handFor(letter)).not.toBe(OPEN)
    }
  })
})

describe('the derivation', () => {
  test('the five known hands are the ones named in the reasoning', () => {
    for (const [letter, spelling] of Object.entries(KNOWN)) {
      expect(poseName(handFor(letter as (typeof LETTERS)[number]))).toBe(spelling)
    }
  })

  test('every other letter sits where easiest-hand-commonest-letter puts it', () => {
    const spoken = new Set([FIST, OPEN, ...Object.values(KNOWN).map((s) => parsePose(s))])
    const ranked = POSES.filter((pose) => !spoken.has(pose)).sort(
      (a, b) => costOf(a) - costOf(b) || a - b,
    )
    const remaining = [...FREQUENCY].filter((letter) => !(letter in KNOWN))

    for (const [index, letter] of remaining.entries()) {
      expect(poseName(handFor(letter as (typeof LETTERS)[number]))).toBe(poseName(ranked[index]))
    }
  })

  test('the four hardest hands are left empty', () => {
    const empty = POSES.filter((pose) => read(pose).kind === 'none')
    expect(empty.map(poseName).sort()).toEqual(['IR', 'MP', 'TIR', 'TMP'])
  })

  test('the letters the pen also knows are all cheap hands', () => {
    // xo is the name of the place and dance is one letter, so the four the pen
    // reads have to be hands a stranger can hold. See `signing.ts`.
    for (const letter of ['x', 'o', 'i', 'd'] as const) {
      expect(costOf(handFor(letter))).toBeLessThanOrEqual(2.25)
    }
  })
})

describe('read', () => {
  test('names the two hands that are not letters', () => {
    expect(read(REST)).toEqual({ kind: 'rest' })
    expect(read(SPACE)).toEqual({ kind: 'space' })
  })

  test('a thumb is an e', () => {
    expect(read(parsePose('T') ?? -1)).toEqual({ kind: 'letter', letter: 'e' })
  })

  test('the horns are an x', () => {
    expect(read(parsePose('IP') ?? -1)).toEqual({ kind: 'letter', letter: 'x' })
  })
})

describe('parsePose', () => {
  test('insists on thumb-to-pinky order, so a hand has one spelling', () => {
    expect(parsePose('PI')).toBeNull()
    expect(parsePose('IP')).not.toBeNull()
  })

  test('refuses repeats and strangers', () => {
    expect(parsePose('II')).toBeNull()
    expect(parsePose('TX')).toBeNull()
    expect(parsePose('')).toBeNull()
  })

  test('round-trips every hand', () => {
    for (const pose of POSES.filter((p) => p !== FIST)) {
      expect(parsePose(poseName(pose))).toBe(pose)
    }
  })
})
