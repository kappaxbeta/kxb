import { describe, expect, test } from 'bun:test'
import { fresh, type Line, say, TICKER_LINES } from '@/app/xp/_runtime/hud/ticker'

/**
 * The few lines along the bottom, and the two things six copies of one
 * expression were doing.
 */

const board = () => {
  let lines: Line[] = []
  return {
    get lines() { return lines },
    onSay: (next: (previous: Line[]) => Line[]) => { lines = next(lines) },
    ticker: { nextId: { current: 0 } },
  }
}

const texts = (lines: readonly Line[]) => lines.map((l) => l.text)

describe('saying something', () => {
  test('adds it to the end', () => {
    const b = board()
    say(b.ticker, b.onSay, 'kick off')
    say(b.ticker, b.onSay, 'you caught somebody')
    expect(texts(b.lines)).toEqual(['kick off', 'you caught somebody'])
  })

  test('several at once, in the order given', () => {
    const b = board()
    say(b.ticker, b.onSay, 'a', 'b', 'c')
    expect(texts(b.lines)).toEqual(['a', 'b', 'c'])
  })

  /** Six separate calls would be six renders, and the last five would win anyway. */
  test('a frame that produced several says them in one update', () => {
    const b = board()
    let updates = 0
    const counting = (next: (previous: Line[]) => Line[]) => { updates++; b.onSay(next) }
    say(b.ticker, counting, 'a', 'b', 'c')
    expect(updates).toBe(1)
  })

  test('saying nothing does not touch the board at all', () => {
    const b = board()
    let updates = 0
    say(b.ticker, () => { updates++ }, ...[])
    expect(updates).toBe(0)
  })
})

/**
 * The lines are not unique — a room where two people score reads `+1` twice —
 * and React keying on the text would treat the second as the first
 * re-rendering, so the older line stays put and the new one never animates in.
 */
describe('the ids', () => {
  test('are different even when the words are the same', () => {
    const b = board()
    say(b.ticker, b.onSay, '+1')
    say(b.ticker, b.onSay, '+1')
    const [first, second] = b.lines
    expect(first!.id).not.toBe(second!.id)
  })

  test('only ever go up, across many lines', () => {
    const b = board()
    for (let i = 0; i < 20; i++) say(b.ticker, b.onSay, `line ${i}`)
    const ids = b.lines.map((l) => l.id)
    expect([...ids].sort((x, y) => x - y)).toEqual(ids)
  })
})

describe('it is a ticker, not a transcript', () => {
  test('keeps only the last few', () => {
    const b = board()
    for (let i = 0; i < 12; i++) say(b.ticker, b.onSay, `line ${i}`)
    expect(b.lines.length).toBe(TICKER_LINES)
  })

  test('and the newest is the one that survives', () => {
    const b = board()
    for (let i = 0; i < 12; i++) say(b.ticker, b.onSay, `line ${i}`)
    expect(texts(b.lines).at(-1)).toBe('line 11')
    expect(texts(b.lines)).not.toContain('line 0')
  })

  /** One frame saying more than fits still leaves the board the right height. */
  test('even when one frame says more than fits', () => {
    const b = board()
    say(b.ticker, b.onSay, ...Array.from({ length: 30 }, (_, i) => `x${i}`))
    expect(b.lines.length).toBe(TICKER_LINES)
    expect(texts(b.lines).at(-1)).toBe('x29')
  })
})

/**
 * A script runs inside its own box, and the only thing coming back is a longer
 * array — so the two places watching one keep a count and compare it.
 */
describe('what a script has said since last time', () => {
  test('the first look sees everything', () => {
    const seen = { current: 0 }
    expect(fresh(['a', 'b'], seen)).toEqual(['a', 'b'])
  })

  test('and the next look sees only what is new', () => {
    const seen = { current: 0 }
    fresh(['a', 'b'], seen)
    expect(fresh(['a', 'b', 'c'], seen)).toEqual(['c'])
  })

  test('a list that has not grown gives nothing', () => {
    const seen = { current: 0 }
    fresh(['a'], seen)
    expect(fresh(['a'], seen)).toEqual([])
  })

  test('the mark moves even when nobody looks at the result', () => {
    const seen = { current: 0 }
    fresh(['a', 'b'], seen)
    expect(seen.current).toBe(2)
  })

  test('an empty list is not an error', () => {
    const seen = { current: 0 }
    expect(fresh([], seen)).toEqual([])
    expect(seen.current).toBe(0)
  })

  /**
   * A script that was restarted hands back a shorter array. Reporting the whole
   * thing again would repeat every line it had already printed.
   */
  test('a list that shrank reports nothing rather than everything', () => {
    const seen = { current: 5 }
    expect(fresh(['a', 'b'], seen)).toEqual([])
  })
})
