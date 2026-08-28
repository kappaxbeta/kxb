import { describe, expect, test } from 'bun:test'
import { wrap } from '@/app/world/_canvas/chat-bubble'

/**
 * A fake context, because there is no canvas in a test runner - and because
 * measuring real glyphs would make these tests about the font rather than about
 * the wrapping.
 *
 * Ten units per character is a lie that keeps every expectation below readable:
 * a width of 100 means ten characters, and the arithmetic stays in your head.
 */
function context(perChar = 10): CanvasRenderingContext2D {
  return {
    measureText: (text: string) => ({ width: text.length * perChar }),
  } as CanvasRenderingContext2D
}

describe('wrap', () => {
  test('keeps a line that fits on one line', () => {
    expect(wrap(context(), 'hello there', 200)).toEqual(['hello there'])
  })

  test('breaks on whitespace, greedily', () => {
    expect(wrap(context(), 'one two three four', 100)).toEqual(['one two', 'three four'])
  })

  test('collapses runs of whitespace, including newlines pasted in', () => {
    expect(wrap(context(), 'one \n\n  two', 200)).toEqual(['one two'])
  })

  /**
   * The case the greedy loop cannot solve by breaking on spaces: one "word"
   * wider than the bubble will ever be. Left whole it sets the width of the
   * canvas, and a pasted URL becomes a billboard several world units across.
   */
  test('a word wider than the bubble is cut, not allowed to widen it', () => {
    const url = 'https://example.com/a/very/long/path/that/nobody/should/paste'
    const lines = wrap(context(), url, 100)

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10)
    }
  })

  test('what is left of a cut word rejoins the flow', () => {
    // "aaaaaaaaaaaa" is twelve at a limit of ten: ten, then two, and the two
    // has room to take the next word with it.
    expect(wrap(context(), 'aaaaaaaaaaaa bb', 100)).toEqual(['aaaaaaaaaa', 'aa bb'])
  })

  /** A width narrower than one character must still terminate. */
  test('an absurdly narrow bubble does not hang', () => {
    const lines = wrap(context(), 'abcdef', 1)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toBe('a')
  })

  test('cuts at four lines and marks the cut', () => {
    // Twelve words at a width of two words a line is six lines' worth.
    const lines = wrap(context(), 'aa bb cc dd ee ff gg hh ii jj kk ll', 70)
    expect(lines).toHaveLength(4)
    expect(lines[3]?.endsWith('…')).toBe(true)
  })

  /**
   * The ellipsis replaces a character rather than being appended, so the last
   * line cannot end up wider than the bubble it was measured against - which
   * would push the canvas past `MAX_WIDTH_PX` and clip the text.
   */
  test('the ellipsis does not make the last line longer than it was', () => {
    const lines = wrap(context(), 'aa bb cc dd ee ff gg hh ii jj kk ll', 70)
    expect(lines[3]?.length).toBeLessThanOrEqual('aa bb'.length)
  })

  test('an empty message produces nothing to paint', () => {
    expect(wrap(context(), '', 200)).toEqual([])
  })
})
