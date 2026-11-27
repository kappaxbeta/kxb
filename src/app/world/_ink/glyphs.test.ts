import { describe, expect, test } from 'bun:test'

import { readGlyph } from './glyphs'
import { circle, joined, line } from './handwriting'

/** A d: a bowl with a stem up its right-hand side, drawn in one go. */
const oneStrokeD = joined(circle(100, 100, 40, 3), line({ x: 140, y: 100 }, { x: 140, y: 20 }, 2))

describe('readGlyph', () => {
  test('a shaky circle is an O', () => {
    expect(readGlyph([circle(200, 200, 60, 6)])).toBe('o')
  })

  test('two lines through each other are an X', () => {
    const first = line({ x: 60, y: 60 }, { x: 140, y: 140 }, 3)
    const second = line({ x: 140, y: 60 }, { x: 60, y: 140 }, 3)
    expect(readGlyph([first, second])).toBe('x')
  })

  test('an X written without lifting the finger is still an X', () => {
    const scrawl = joined(
      line({ x: 60, y: 60 }, { x: 140, y: 140 }),
      line({ x: 140, y: 140 }, { x: 140, y: 60 }),
      line({ x: 140, y: 60 }, { x: 60, y: 140 }),
    )
    expect(readGlyph([scrawl])).toBe('x')
  })

  test('a bowl and a stem are the dancing letter, in either order', () => {
    const bowl = circle(100, 100, 40, 4)
    const stem = line({ x: 140, y: 20 }, { x: 140, y: 140 }, 2)
    expect(readGlyph([bowl, stem])).toBe('bowl')
    expect(readGlyph([stem, bowl])).toBe('bowl')
  })

  test('a d drawn in one stroke is the dancing letter too', () => {
    expect(readGlyph([oneStrokeD])).toBe('bowl')
  })

  test('a p is the same answer as a d - the stem is just longer', () => {
    const bowl = circle(100, 90, 36, 4)
    const stem = line({ x: 64, y: 60 }, { x: 64, y: 200 }, 2)
    expect(readGlyph([bowl, stem])).toBe('bowl')
  })

  test('a ring with a short stem on its right is an a, not a d', () => {
    const bowl = circle(100, 100, 40, 3)
    const stem = line({ x: 140, y: 64 }, { x: 142, y: 146 }, 2)
    expect(readGlyph([bowl, stem])).toBe('a')
    expect(readGlyph([stem, bowl])).toBe('a')
  })

  test('an a whose stem trails under the ring is still an a', () => {
    const bowl = circle(100, 100, 40, 3)
    const stem = line({ x: 140, y: 62 }, { x: 141, y: 176 }, 2)
    expect(readGlyph([bowl, stem])).toBe('a')
  })

  test('a stem a whole ring deep under it is a p', () => {
    const bowl = circle(100, 100, 40, 3)
    const stem = line({ x: 140, y: 64 }, { x: 140, y: 220 }, 2)
    expect(readGlyph([bowl, stem])).toBe('bowl')
  })

  test('the same stem climbing above the ring is still a d', () => {
    const bowl = circle(100, 100, 40, 3)
    const stem = line({ x: 140, y: 30 }, { x: 140, y: 140 }, 2)
    expect(readGlyph([bowl, stem])).toBe('bowl')
  })

  test('a short stem on the left is not an a', () => {
    const bowl = circle(100, 100, 40, 3)
    const stem = line({ x: 60, y: 64 }, { x: 60, y: 146 }, 2)
    expect(readGlyph([bowl, stem])).toBe('bowl')
  })

  test('an a written in one stroke is an a', () => {
    // How a hand writes it: in at the top right, once round anticlockwise,
    // and straight down the right side without lifting.
    const ring = Array.from({ length: 41 }, (_, i) => {
      const angle = -Math.PI / 3 - (i / 40) * Math.PI * 2
      return { x: 100 + Math.cos(angle) * 40, y: 100 + Math.sin(angle) * 40 }
    })
    const top = ring[ring.length - 1]
    const scrawl = joined(ring, line(top, { x: top.x + 1, y: 146 }, 2))
    expect(readGlyph([scrawl])).toBe('a')
  })

  test('a circle and a line that never meet are not a letter', () => {
    const bowl = circle(100, 100, 40)
    const elsewhere = line({ x: 500, y: 40 }, { x: 500, y: 160 })
    expect(readGlyph([bowl, elsewhere])).toBeNull()
  })

  test('a stroke standing up is an i', () => {
    expect(readGlyph([line({ x: 60, y: 60 }, { x: 60, y: 200 }, 2)])).toBe('i')
    // Leaning a little is still standing up. Nobody draws a plumb line with a
    // finger on a moving bus.
    expect(readGlyph([line({ x: 60, y: 60 }, { x: 96, y: 200 }, 2)])).toBe('i')
  })

  test('a stroke lying down, or lying across, is not', () => {
    expect(readGlyph([line({ x: 60, y: 60 }, { x: 200, y: 60 })])).toBeNull()
    // The one that matters: half an X is not a letter, or no X could ever be
    // assembled from its two halves. See LEAN_I.
    expect(readGlyph([line({ x: 60, y: 60 }, { x: 200, y: 200 })])).toBeNull()
  })

  test('a cross drawn beside a ring is not a bowl', () => {
    // The arm of an X is long, straight and more down than across - which is
    // the whole of what a stem used to have to be. Two letters written next to
    // each other must not accidentally spell a third.
    const ring = circle(100, 100, 40, 3)
    const arm = line({ x: 170, y: 55 }, { x: 230, y: 145 }, 2)
    expect(readGlyph([ring, arm])).toBeNull()
  })

  test('two lines that meet at a corner are not a cross', () => {
    const down = line({ x: 60, y: 60 }, { x: 100, y: 140 })
    const up = line({ x: 100, y: 140 }, { x: 140, y: 60 })
    expect(readGlyph([down, up])).toBeNull()
  })

  test('two lines lying along each other are not a cross', () => {
    const there = line({ x: 60, y: 60 }, { x: 140, y: 140 })
    const back = line({ x: 141, y: 139 }, { x: 61, y: 61 })
    expect(readGlyph([there, back])).toBeNull()
  })

  test('a tap is not handwriting', () => {
    expect(readGlyph([circle(100, 100, 6)])).toBeNull()
    expect(readGlyph([[{ x: 10, y: 10 }, { x: 11, y: 11 }]])).toBeNull()
  })

  test('three strokes are more than any letter here has', () => {
    const bowl = circle(100, 100, 40)
    const stem = line({ x: 140, y: 20 }, { x: 140, y: 140 })
    expect(readGlyph([bowl, stem, stem])).toBeNull()
  })
})
