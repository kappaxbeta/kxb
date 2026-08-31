import { describe, expect, test } from 'bun:test'
import { accept, completionsFor } from './complete'

/**
 * The completion vocabulary, at its seams: what is offered, in what order,
 * and that accepting one puts the caret where typing would have.
 */

describe('completionsFor', () => {
  test('nothing until two characters, and never the word itself', () => {
    expect(completionsFor('x', 1, '')).toEqual([])
    const offered = completionsFor('circle', 6, '').map((one) => one.text)
    expect(offered).not.toContain('circle')
  })

  test('the platform words come first, the project words after', () => {
    const offered = completionsFor('co', 2, 'function coolHelper() {}')
    const given = offered.filter((one) => one.given).map((one) => one.text)
    const own = offered.filter((one) => !one.given).map((one) => one.text)
    expect(given).toContain('constrain')
    expect(own).toContain('coolHelper')
    // Order: every given word before any project word.
    const firstOwn = offered.findIndex((one) => !one.given)
    expect(offered.slice(0, firstOwn === -1 ? undefined : firstOwn).every((one) => one.given)).toBe(true)
  })

  test('a helper written in another file completes here', () => {
    const offered = completionsFor('drawPe', 6, 'function drawPeep(p) {}').map((one) => one.text)
    expect(offered).toContain('drawPeep')
  })

  test('mid-word carets and dots behave', () => {
    // Caret right after "xp.pre" - the word is "pre", not "xp.pre".
    const offered = completionsFor('xp.pre', 6, '').map((one) => one.text)
    expect(offered).toContain('pressed')
  })

  test('the menu is capped', () => {
    const many = Array.from({ length: 40 }, (_, i) => `common${i}`).join(' ')
    expect(completionsFor('com', 3, many).length).toBeLessThanOrEqual(8)
  })
})

describe('accept', () => {
  test('replaces the half-typed word and lands the caret after it', () => {
    const done = accept('var x = cons', 12, 'constrain')
    expect(done.source).toBe('var x = constrain')
    expect(done.caret).toBe(17)
  })

  test('leaves the tail of the line alone', () => {
    const done = accept('cons + 1', 4, 'constrain')
    expect(done.source).toBe('constrain + 1')
    expect(done.caret).toBe(9)
  })
})
