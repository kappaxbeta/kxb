import { describe, expect, test } from 'bun:test'
import type { Cell } from '@/domain/builder/draw'
import {
  GLYPH_HEIGHT,
  stampText,
  textExtent,
  unsupportedCharacters,
} from '@/domain/builder/glyphs'

const origin: Cell = { x: 0, y: 0, z: 0 }

/** The stamped word, drawn back out as art, so a failure is readable. */
function render(cells: Cell[]): string[] {
  const xs = cells.map((cell) => cell.x)
  const ys = cells.map((cell) => cell.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const rows: string[] = []
  for (let y = maxY; y >= minY; y -= 1) {
    let row = ''
    for (let x = minX; x <= maxX; x += 1) {
      row += cells.some((cell) => cell.x === x && cell.y === y) ? '#' : '.'
    }
    rows.push(row)
  }
  return rows
}

describe('stamping a word', () => {
  test('a letter comes out the right way up', () => {
    // 'L' is the one glyph where upside-down is unmistakable.
    expect(render(stampText('L', origin))).toEqual([
      '#....',
      '#....',
      '#....',
      '#....',
      '#....',
      '#....',
      '#####',
    ])
  })

  test('letters read left to right, with a gap between them', () => {
    expect(render(stampText('LI', origin))).toEqual([
      '#.....#####',
      '#.......#..',
      '#.......#..',
      '#.......#..',
      '#.......#..',
      '#.......#..',
      '#####.#####',
    ])
  })

  test('the bottom-left corner sits on the origin', () => {
    const cells = stampText('L', { x: 4, y: 2, z: -3 })
    expect(Math.min(...cells.map((cell) => cell.x))).toBe(4)
    expect(Math.min(...cells.map((cell) => cell.y))).toBe(2)
    expect(cells.every((cell) => cell.z === -3)).toBe(true)
  })

  test('a standing word rises in y', () => {
    const cells = stampText('A', origin, { plane: 'wall' })
    expect(new Set(cells.map((cell) => cell.z))).toEqual(new Set([0]))
    expect(Math.max(...cells.map((cell) => cell.y))).toBe(GLYPH_HEIGHT - 1)
  })

  // A word lying on the ground has to read correctly to a camera looking along
  // +z, which means its first row is the furthest away - hence the negative z.
  test('a lying word runs away from the camera on one level', () => {
    const cells = stampText('A', origin, { plane: 'floor' })
    expect(new Set(cells.map((cell) => cell.y))).toEqual(new Set([0]))
    expect(Math.min(...cells.map((cell) => cell.z))).toBe(-(GLYPH_HEIGHT - 1))
    expect(Math.max(...cells.map((cell) => cell.z))).toBe(0)
  })

  test('depth thickens into the third axis', () => {
    const thin = stampText('I', origin, { plane: 'wall', depth: 1 })
    const thick = stampText('I', origin, { plane: 'wall', depth: 3 })
    expect(thick).toHaveLength(thin.length * 3)
    expect(new Set(thick.map((cell) => cell.z))).toEqual(new Set([0, 1, 2]))
  })

  test('scale multiplies both directions evenly', () => {
    const cells = stampText('L', origin, { scale: 2 })
    const rows = render(cells)
    expect(rows).toHaveLength(GLYPH_HEIGHT * 2)
    expect(rows[0]).toHaveLength(10)
    // Every row is doubled: an E at scale 2 must not come out as a comb.
    for (let row = 0; row < rows.length; row += 2) {
      expect(rows[row]).toBe(rows[row + 1])
    }
  })

  test('tracking widens the gap between letters, not inside them', () => {
    const tight = stampText('LL', origin, { tracking: 0 })
    const loose = stampText('LL', origin, { tracking: 3 })
    expect(tight).toHaveLength(loose.length)
    expect(Math.max(...loose.map((cell) => cell.x))).toBe(
      Math.max(...tight.map((cell) => cell.x)) + 3,
    )
  })

  test('a space takes up room and draws nothing', () => {
    expect(stampText(' ', origin)).toEqual([])
    expect(stampText('L L', origin).length).toBe(stampText('LL', origin).length)
    expect(Math.max(...stampText('L L', origin).map((cell) => cell.x))).toBeGreaterThan(
      Math.max(...stampText('LL', origin).map((cell) => cell.x)),
    )
  })

  test('lowercase is stamped as capitals', () => {
    expect(stampText('kxb', origin)).toEqual(stampText('KXB', origin))
  })

  // The alternative is collapsing the word, which moves every letter after the
  // bad one - so you fix a typo and the whole wordmark has shifted.
  test('an unknown character holds its place', () => {
    const withGlyph = stampText('LOL', origin)
    const withHole = stampText('L~L', origin)
    const lastColumn = (cells: Cell[]) => Math.max(...cells.map((cell) => cell.x))
    expect(lastColumn(withHole)).toBe(lastColumn(withGlyph))
  })

  test('nothing to stamp is no cells', () => {
    expect(stampText('', origin)).toEqual([])
  })
})

describe('the alphabet', () => {
  test('covers letters, digits and the punctuation a wordmark needs', () => {
    expect(unsupportedCharacters('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toEqual([])
    expect(unsupportedCharacters('0123456789')).toEqual([])
    expect(unsupportedCharacters(".,!?-+/:'*<>=#@() ")).toEqual([])
  })

  test('names what it cannot draw, once each', () => {
    expect(unsupportedCharacters('naïve ~ naïve').sort()).toEqual(['~', 'Ï'])
  })

  test('every glyph is five wide and seven tall', () => {
    for (const character of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      const cells = stampText(character, origin)
      expect(Math.max(...cells.map((cell) => cell.y))).toBeLessThan(GLYPH_HEIGHT)
      expect(Math.max(...cells.map((cell) => cell.x))).toBeLessThan(5)
    }
  })
})

describe('the extent shown while typing', () => {
  test('matches what actually gets stamped', () => {
    for (const options of [{}, { scale: 2 }, { tracking: 0 }, { tracking: 4, scale: 3 }]) {
      const cells = stampText('KXB TEAM', origin, options)
      const extent = textExtent('KXB TEAM', options)
      // The trailing space in a word means the drawn cells can stop short of
      // the reserved width, never past it.
      expect(Math.max(...cells.map((cell) => cell.x))).toBeLessThan(extent.width)
      expect(Math.max(...cells.map((cell) => cell.y))).toBe(extent.height - 1)
    }
  })

  test('an empty word has no width', () => {
    expect(textExtent('')).toEqual({ width: 0, height: GLYPH_HEIGHT })
  })
})
