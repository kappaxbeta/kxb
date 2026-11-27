import { describe, expect, test } from 'bun:test'

import { NOTE_LIMIT, noteSeconds, readNote, writeNote } from './note'

const box = { width: 500, height: 250 }

/** A stroke as the pen hands it over: points, and a clock per point. */
const drawn = (points: [number, number][], hue = 300, step = 16) => ({
  hue,
  points: points.map(([x, y]) => ({ x, y })),
  times: points.map((_, index) => 1000 + index * step),
})

describe('writeNote / readNote', () => {
  test('a drawing survives the round trip', () => {
    const note = writeNote([drawn([[0, 0], [250, 125], [500, 250]])], box)
    const back = readNote(note)
    expect(back).not.toBeNull()
    expect(back?.height).toBe(500)
    expect(back?.strokes).toHaveLength(1)
    // Stored against a thousand-wide box: half way across the pad is 500.
    expect(back?.strokes[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 500, y: 250 },
      { x: 1000, y: 500 },
    ])
    expect(back?.strokes[0].hue).toBe(300)
  })

  test('the pauses come back, rounded to the tick', () => {
    const back = readNote(writeNote([drawn([[0, 0], [10, 10], [20, 20]], 188, 40)], box))
    expect(back?.strokes[0].gaps).toEqual([0, 40, 40])
  })

  test('a pad of a different shape stores a different height', () => {
    const tall = readNote(writeNote([drawn([[0, 0], [100, 100]])], { width: 200, height: 400 }))
    expect(tall?.height).toBe(2000)
  })

  test('every stroke keeps its own colour', () => {
    const note = writeNote(
      [drawn([[0, 0], [50, 50]], 188), drawn([[80, 0], [30, 50]], 300)],
      box,
    )
    expect(readNote(note)?.strokes.map((stroke) => stroke.hue)).toEqual([188, 300])
  })

  test('a tap is not a drawing', () => {
    expect(writeNote([drawn([[10, 10]])], box)).toBeNull()
    expect(writeNote([], box)).toBeNull()
  })

  test('a pad with no size yet writes nothing', () => {
    expect(writeNote([drawn([[0, 0], [10, 10]])], { width: 0, height: 0 })).toBeNull()
  })

  test('a very long scribble is cut, and what is left still reads', () => {
    const long = Array.from({ length: 4000 }, (_, i) => [i % 500, (i * 7) % 250] as [number, number])
    const note = writeNote([drawn(long)], box)
    expect(note!.length).toBeLessThanOrEqual(NOTE_LIMIT)
    expect(readNote(note)).not.toBeNull()
  })

  test('nonsense reads as nothing rather than throwing', () => {
    expect(readNote(null)).toBeNull()
    expect(readNote('')).toBeNull()
    expect(readNote('hello')).toBeNull()
    expect(readNote('x9|500|300~0,0,0~5,5,2')).toBeNull()
    expect(readNote('x1|nope|300~0,0,0~5,5,2')).toBeNull()
    // A stroke that trails off mid-number keeps the points it managed to read.
    expect(readNote('x1|500|300~0,0,0~5,5,2~oops')?.strokes[0].points).toHaveLength(2)
  })

  test('how long it takes to draw itself is the sum of its gaps', () => {
    // Eighty milliseconds a point, which is a whole number of ticks and so
    // survives the rounding exactly.
    const note = readNote(writeNote([drawn([[0, 0], [10, 10], [20, 20]], 300, 80)], box))!
    // Two gaps of eighty, plus the beat after the stroke.
    expect(noteSeconds(note)).toBeCloseTo(0.34, 3)
  })
})
