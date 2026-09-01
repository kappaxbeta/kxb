import type { Cell } from '@/domain/builder/draw'

/**
 * Words, as blocks.
 *
 * The tool that exists because the builder's job is marketing renders: a
 * wordmark standing in a world, a room number over a door, a price on a wall.
 * All of those are somebody laying out letters a block at a time, which is
 * twenty minutes of clicking per word and wrong by one cell at the end of it.
 *
 * ---------------------------------------------------------------------------
 * Why a bitmap font and not a real one
 * ---------------------------------------------------------------------------
 * The obvious version rasterises a TTF to a canvas and reads the pixels back,
 * which gets you every glyph in every weight for free. It also gets you a
 * function that only works in a browser, cannot be tested without a DOM, and
 * produces different cells on different platforms depending on which
 * font-smoothing the machine does - so the same document would build a
 * different wordmark on the designer's laptop than on mine.
 *
 * Five by seven is the smallest grid on which every letter is still legible,
 * and at block scale a five-cell-wide letter is already the size of a garden
 * shed. Anything finer would be a wordmark nobody can read from the camera
 * anyway. The cost is honest: this alphabet is what it is, and a glyph that
 * isn't here draws nothing rather than drawing a box.
 */

const GLYPH_WIDTH = 5
export const GLYPH_HEIGHT = 7

/**
 * Rows top-to-bottom, `#` for a filled cell.
 *
 * Kept as art rather than as bit masks because this is a thing people will
 * want to edit - adding an ampersand should be drawing an ampersand, not
 * working out that it is 0x1a2b.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '(': ['..##.', '.#...', '#....', '#....', '#....', '.#...', '..##.'],
  ')': ['.##..', '...#.', '....#', '....#', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

/** Which characters this alphabet can draw, for the editor to warn about the rest. */
export function unsupportedCharacters(text: string): string[] {
  const missing = new Set<string>()
  for (const character of text.toUpperCase()) {
    if (!GLYPHS[character]) missing.add(character)
  }
  return [...missing]
}

export interface TextOptions {
  /**
   * Standing up facing the camera, or lying flat on the ground.
   *
   * Both are the shot somebody wants: a wordmark behind a scene stands, and a
   * name written across a pitch lies down. The alternative - always standing,
   * plus a rotate - does not work, because a lying word reads top-to-bottom
   * away from the camera and a standing one reads bottom-to-top, so the two are
   * different transforms rather than the same one turned.
   */
  plane?: 'wall' | 'floor'
  /** Cells between letters. */
  tracking?: number
  /** How thick, into the third axis. */
  depth?: number
  /**
   * Multiplied in both directions, so a scale of 2 is a 10x14 letter.
   *
   * Integers only. A fractional scale on a lattice means some rows of the glyph
   * get two cells and some get one, which turns an E into a comb.
   */
  scale?: number
}

/**
 * The cells that spell `text`, with its bottom-left corner at `origin`.
 *
 * Bottom-left rather than centred, because the anchor has to be somewhere you
 * can point at: you place the corner of a wordmark against a wall and let it
 * run, and a centred anchor means the word moves when you edit it.
 *
 * Read the return as one stroke. Nothing here dedupes across letters because
 * nothing can overlap - each glyph occupies its own columns.
 */
export function stampText(text: string, origin: Cell, options: TextOptions = {}): Cell[] {
  const plane = options.plane ?? 'wall'
  const tracking = Math.max(0, Math.floor(options.tracking ?? 1))
  const depth = Math.max(1, Math.floor(options.depth ?? 1))
  const scale = Math.max(1, Math.floor(options.scale ?? 1))

  const out: Cell[] = []
  let cursor = 0

  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character]
    // An unknown character advances the cursor rather than collapsing the word,
    // so the rest of it still lands where you were expecting it to.
    if (!glyph) {
      cursor += (GLYPH_WIDTH + tracking) * scale
      continue
    }

    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      for (let column = 0; column < GLYPH_WIDTH; column += 1) {
        if (glyph[row][column] !== '#') continue

        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            // Rows run top-to-bottom in the art and the world runs bottom-up,
            // so the row index is flipped for both planes. On the floor that
            // means the first row is furthest away, which is what makes a word
            // read correctly to a camera looking along +z.
            const across = cursor + column * scale + sx
            const down = (GLYPH_HEIGHT - 1 - row) * scale + sy

            for (let layer = 0; layer < depth; layer += 1) {
              out.push(
                plane === 'wall'
                  ? { x: origin.x + across, y: origin.y + down, z: origin.z + layer }
                  : { x: origin.x + across, y: origin.y + layer, z: origin.z - down },
              )
            }
          }
        }
      }
    }

    cursor += (GLYPH_WIDTH + tracking) * scale
  }

  return out
}

/**
 * The word as a flat grid of lit and unlit cells, reading top-to-bottom.
 *
 * ---------------------------------------------------------------------------
 * Why this is here rather than in the script that draws pictures
 * ---------------------------------------------------------------------------
 * Because there is one alphabet, and the moment a second thing wants to draw
 * with it the letters have to come from the same place or the two drift. The
 * builder stamps this font into a world as blocks; a render script draws it
 * into a PNG as pixels. Those are two *renderers*, and the thing they share is
 * the shape of a letter - so the shape is what this returns, and neither side
 * has an opinion about the other's units.
 *
 * Top-to-bottom, unlike `stampText`, and the difference is not an oversight:
 * that one is placing blocks in a world where y counts upwards, and this one is
 * filling an image where rows count downwards. Both flip from the same source
 * art, each towards its own axis, which is the only arrangement where neither
 * caller has to remember to flip anything.
 *
 * An unknown character leaves its space blank rather than collapsing the word,
 * exactly as `stampText` does, so the two lay a line out identically.
 */
export function textBitmap(
  text: string,
  options: TextOptions = {},
): { width: number; height: number; cells: boolean[] } {
  const tracking = Math.max(0, Math.floor(options.tracking ?? 1))
  const scale = Math.max(1, Math.floor(options.scale ?? 1))
  const { width, height } = textExtent(text, options)
  const cells = new Array<boolean>(Math.max(0, width * height)).fill(false)

  let cursor = 0
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character]
    if (glyph) {
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (glyph[row][column] !== '#') continue
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              const x = cursor + column * scale + sx
              const y = row * scale + sy
              if (x < width && y < height) cells[y * width + x] = true
            }
          }
        }
      }
    }
    cursor += (GLYPH_WIDTH + tracking) * scale
  }

  return { width, height, cells }
}

/**
 * Where each letter starts and how wide it is, in the same grid.
 *
 * What a per-letter animation needs and cannot work out for itself: "the third
 * letter" is a range of columns, and which columns depends on the tracking, the
 * scale and how many characters came before it. Returned for every character
 * including the unknown ones and the spaces, so an index into this list is an
 * index into the string.
 */
export function letterColumns(
  text: string,
  options: TextOptions = {},
): { from: number; width: number }[] {
  const tracking = Math.max(0, Math.floor(options.tracking ?? 1))
  const scale = Math.max(1, Math.floor(options.scale ?? 1))

  return [...text].map((_, index) => ({
    from: index * (GLYPH_WIDTH + tracking) * scale,
    width: GLYPH_WIDTH * scale,
  }))
}

/**
 * How wide and tall a word will be before it is drawn.
 *
 * The editor shows this next to the input, because "will this fit on the wall I
 * am pointing at" is the question you have while typing, not after stamping
 * forty blocks and undoing them.
 */
export function textExtent(
  text: string,
  options: TextOptions = {},
): { width: number; height: number } {
  const tracking = Math.max(0, Math.floor(options.tracking ?? 1))
  const scale = Math.max(1, Math.floor(options.scale ?? 1))
  const count = [...text].length

  return {
    // The trailing gap after the last letter is not part of the word.
    width: count === 0 ? 0 : (count * (GLYPH_WIDTH + tracking) - tracking) * scale,
    height: GLYPH_HEIGHT * scale,
  }
}
