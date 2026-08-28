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
