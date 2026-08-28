/**
 * A QR encoder, because the payload is ours and the alternative was a package.
 *
 * ---------------------------------------------------------------------------
 * Scope, deliberately narrow
 * ---------------------------------------------------------------------------
 * Byte mode, error correction level M, versions 1 to 10. That is not a
 * half-finished general encoder - it is the exact subset a handshake needs, and
 * every part left out is a part that could be wrong without anything noticing:
 *
 * - **Byte mode only.** The payload is base64url. Alphanumeric mode would pack
 *   it tighter, but base64url contains lowercase and `_`, which alphanumeric
 *   mode cannot represent at all - so the "optimisation" would be a silent
 *   corruption for exactly half the alphabet.
 * - **Level M only.** Fifteen percent recovery. L would fit more in a smaller
 *   grid and is the wrong trade for something read off a phone screen held by
 *   somebody else at arm's length.
 * - **Versions 1 to 10.** Ten holds 213 bytes at this level and a handshake is
 *   about 120, so the ceiling is roughly four candidates past what any hotspot
 *   produces. Past version 10 the version-information block changes shape and
 *   the modules get too fine to read off a screen anyway.
 *
 * Encoding only. A *decoder* is a genuinely harder problem - binarisation,
 * locating the finder patterns, correcting perspective, then all of this in
 * reverse - and guessing at it would produce something that works on a
 * screenshot and fails on a photograph. Reading a code is left to the camera
 * app, which every phone already has and which is better at it than anything
 * that would fit in this file. See the note in ./link on why that is enough.
 */

/** How many bytes each version holds at level M, byte mode. */
const CAPACITY = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213] as const

/**
 * Per version at level M: EC codewords per block, then the block layout.
 *
 * Straight from the tables in ISO/IEC 18004. Written out rather than derived
 * because there is no formula - the committee chose them - and a table you can
 * read against the standard is worth more than a clever reconstruction.
 */
const BLOCKS: { ec: number; groups: [count: number, data: number][] }[] = [
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
]

/** Where the alignment patterns sit, per version. Empty for version 1. */
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

// ---------------------------------------------------------------------------
// GF(256)
// ---------------------------------------------------------------------------

/**
 * Log and antilog tables for the field QR uses, generated once.
 *
 * The primitive polynomial is 0x11d, which is the standard's. Reed-Solomon over
 * this field is what the error correction is, and doing it with tables turns
 * every multiply into two lookups and an add.
 */
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]
}

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

/** The generator polynomial for `degree` error-correction codewords. */
function generator(degree: number): Uint8Array {
  let poly = Uint8Array.from([1])
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= multiply(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

/** Polynomial long division; the remainder is the error correction. */
function remainder(data: Uint8Array, degree: number): Uint8Array {
  const poly = generator(degree)
  const out = new Uint8Array(data.length + degree)
  out.set(data)
  for (let i = 0; i < data.length; i += 1) {
    const lead = out[i]
    if (lead === 0) continue
    for (let j = 0; j < poly.length; j += 1) out[i + j] ^= multiply(poly[j], lead)
  }
  return out.subarray(data.length)
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

class Bits {
  private readonly bits: number[] = []

  push(value: number, width: number) {
    for (let i = width - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1)
  }

  get length() {
    return this.bits.length
  }

  /** Padded to a byte boundary and returned as codewords. */
  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8))
    this.bits.forEach((bit, i) => {
      if (bit) out[i >> 3] |= 0x80 >> (i & 7)
    })
    return out
  }
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

export interface QrCode {
  /** Modules per side, not counting the quiet zone. */
  size: number
  /** Row-major, true where the module is dark. */
  modules: boolean[][]
  version: number
}

/**
 * Encode a string as a QR matrix.
 *
 * Throws only when the text is too long for version 10, which for a handshake
 * means something upstream produced far more candidates than a local network
 * can have. The caller shows the link instead.
 */
export function encodeQr(text: string): QrCode {
  const data = new TextEncoder().encode(text)

  const version = CAPACITY.findIndex((room) => data.length <= room) + 1
  if (version === 0) {
    throw new Error(`${data.length} bytes is past what a version-10 code holds`)
  }

  const layout = BLOCKS[version - 1]
  const total = layout.groups.reduce((sum, [count, size]) => sum + count * size, 0)

  // Mode 4 is byte mode; the length is eight bits up to version 9 and sixteen
  // from ten, which is the one place the header changes shape inside our range.
  const bits = new Bits()
  bits.push(0b0100, 4)
  bits.push(data.length, version >= 10 ? 16 : 8)
  for (const byte of data) bits.push(byte, 8)

  // A terminator of up to four zero bits, then zeroes to the byte boundary.
  const room = total * 8
  bits.push(0, Math.min(4, room - bits.length))
  if (bits.length % 8 !== 0) bits.push(0, 8 - (bits.length % 8))

  const codewords = new Uint8Array(total)
  codewords.set(bits.bytes())
  // The specified filler, alternating, for whatever room is left.
  for (let i = bits.bytes().length, flip = 0; i < total; i += 1, flip += 1) {
    codewords[i] = flip % 2 === 0 ? 0xec : 0x11
  }

  /**
   * Split into blocks, correct each, then interleave.
   *
   * The interleave is what makes the error correction worth having: a thumb
   * over one corner of the code damages a few codewords of *every* block rather
   * than destroying one block outright.
   */
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let at = 0
  for (const [count, size] of layout.groups) {
    for (let i = 0; i < count; i += 1) {
      const block = codewords.subarray(at, at + size)
      at += size
      dataBlocks.push(block)
      ecBlocks.push(remainder(block, layout.ec))
    }
  }

  const interleaved: number[] = []
  const longest = Math.max(...dataBlocks.map((block) => block.length))
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i])
  }
  for (let i = 0; i < layout.ec; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i])
  }

  return draw(version, Uint8Array.from(interleaved))
}

const SIZE = (version: number) => version * 4 + 17

function draw(version: number, codewords: Uint8Array): QrCode {
  const size = SIZE(version)
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  )
  /** True where a function pattern lives, so data placement skips it. */
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))

  const set = (row: number, column: number, dark: boolean) => {
    modules[row][column] = dark
    reserved[row][column] = true
  }

  // The three finder patterns, with their separators.
  for (const [row, column] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = row + dr
        const c = column + dc
        if (r < 0 || r >= size || c < 0 || c >= size) continue
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3))
        set(r, c, ring !== 2 && ring <= 3)
      }
    }
  }

  // Alignment patterns, everywhere the table says except under a finder.
  const centres = ALIGNMENT[version - 1]
  for (const row of centres) {
    for (const column of centres) {
      if (reserved[row][column]) continue
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          set(row + dr, column + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
        }
      }
    }
  }

  // Timing patterns: the alternating row and column that let a reader work out
  // the module pitch.
  for (let i = 8; i < size - 8; i += 1) {
    if (!reserved[6][i]) set(6, i, i % 2 === 0)
    if (!reserved[i][6]) set(i, 6, i % 2 === 0)
  }

  // The dark module, which is always dark and always here.
  set(size - 8, 8, true)

  // Reserve the format information, written after the mask is chosen.
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8][i]) set(8, i, false)
    if (!reserved[i][8]) set(i, 8, false)
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false)
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false)
  }

  // Version information, from version 7 up.
  if (version >= 7) {
    const info = versionBits(version)
    for (let i = 0; i < 18; i += 1) {
      const bit = ((info >> i) & 1) === 1
      const row = Math.floor(i / 3)
      const column = (i % 3) + size - 11
      set(row, column, bit)
      set(column, row, bit)
    }
  }

  /**
   * The data, placed in a zigzag from the bottom right.
   *
   * Two columns at a time, upward then downward, skipping the vertical timing
   * column entirely - which is the off-by-one every hand-written encoder gets
   * wrong, and which shows up as a code that scans as garbage rather than as one
   * that does not scan.
   */
  let bit = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (const column of [right, right - 1]) {
        if (reserved[row][column]) continue
        const value = bit < codewords.length * 8
          ? ((codewords[bit >> 3] >> (7 - (bit & 7))) & 1) === 1
          : false
        modules[row][column] = value
        bit += 1
      }
    }
    upward = !upward
  }

  // Try every mask and keep the least ugly, which is what the penalty rules
  // are for: a code with large blank runs is a code a reader loses its place in.
  let best: boolean[][] | null = null
  let bestMask = 0
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row, r) =>
      row.map((value, c) => (reserved[r][c] ? value === true : (value === true) !== masked(mask, r, c))),
    )
    writeFormat(candidate, reserved, mask)
    const score = penalty(candidate)
    if (score < bestScore) {
      bestScore = score
      best = candidate
      bestMask = mask
    }
  }

  void bestMask
  return { size, modules: best as boolean[][], version }
}

function masked(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return column % 3 === 0
    case 3:
      return (row + column) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0
    default:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
  }
}

/** BCH(15,5) over the format bits, with the standard mask applied. */
function formatBits(mask: number): number {
  // 0b00 is error correction level M, in the standard's own odd ordering.
  const data = (0b00 << 3) | mask
  let value = data << 10
  for (let i = 4; i >= 0; i -= 1) {
    if ((value >> (10 + i)) & 1) value ^= 0b10100110111 << i
  }
  return ((data << 10) | value) ^ 0b101010000010010
}

function writeFormat(modules: boolean[][], reserved: boolean[][], mask: number) {
  void reserved
  const size = modules.length
  const bits = formatBits(mask)
  const at = (i: number) => ((bits >> i) & 1) === 1

  /**
   * The first copy: down column 8, then left along row 8.
   *
   * The axis is the thing to get right here. Bits 0..5 run *down the column*
   * beside the top-left eye and the tail runs *along the row* - not the other
   * way round. Transposed, every structural check still passes: the finders,
   * the timing, the dark module and both copies agree with each other, because
   * they are consistently wrong together. The only symptom is that no reader on
   * earth decodes the result, which is why this needed a scan to catch.
   */
  for (let i = 0; i <= 5; i += 1) modules[i][8] = at(i)
  modules[7][8] = at(6)
  modules[8][8] = at(7)
  modules[8][7] = at(8)
  for (let i = 9; i <= 14; i += 1) modules[8][14 - i] = at(i)

  // The second copy: along row 8 from the right edge, then down column 8 from
  // the bottom. Eight bits then seven.
  for (let i = 0; i <= 7; i += 1) modules[8][size - 1 - i] = at(i)
  for (let i = 8; i <= 14; i += 1) modules[size - 15 + i][8] = at(i)

  // Always dark, and the loop above stops just short of it.
  modules[size - 8][8] = true
}

/** BCH(18,6) over the version number, for version 7 and up. */
function versionBits(version: number): number {
  let value = version << 12
  for (let i = 5; i >= 0; i -= 1) {
    if ((value >> (12 + i)) & 1) value ^= 0b1111100100101 << i
  }
  return (version << 12) | value
}

/**
 * How badly a masked grid reads, by the standard's four rules.
 *
 * Lower is better. The rules exist because some masks turn ordinary data into
 * something that looks like a finder pattern, and a reader that finds five
 * finder patterns does not read the code at all.
 */
function penalty(modules: boolean[][]): number {
  const size = modules.length
  let score = 0

  // Rule 1: runs of five or more of the same colour, each way.
  for (let i = 0; i < size; i += 1) {
    for (const line of [modules[i], modules.map((row) => row[i])]) {
      let run = 1
      for (let j = 1; j < size; j += 1) {
        if (line[j] === line[j - 1]) {
          run += 1
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else {
          run = 1
        }
      }
    }
  }

  // Rule 2: every 2x2 block of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const value = modules[r][c]
      if (value === modules[r][c + 1] && value === modules[r + 1][c] && value === modules[r + 1][c + 1]) {
        score += 3
      }
    }
  }

  // Rule 3: the finder-lookalike, either orientation.
  const PATTERN = [true, false, true, true, true, false, true, false, false, false, false]
  const REVERSED = [...PATTERN].reverse()
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j <= size - 11; j += 1) {
      for (const line of [modules[i], modules.map((row) => row[i])]) {
        const window = line.slice(j, j + 11)
        if (window.every((value, k) => value === PATTERN[k])) score += 40
        if (window.every((value, k) => value === REVERSED[k])) score += 40
      }
    }
  }

  // Rule 4: how far the dark proportion is from half.
  const dark = modules.flat().filter(Boolean).length
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

/**
 * The matrix as an SVG path, which is how a component should draw it.
 *
 * One `<path>` of many little squares rather than a rect per module: a
 * version-7 code is two thousand modules, and two thousand DOM nodes to draw a
 * square inch is a scroll janking for no reason.
 */
export function qrPath(code: QrCode): string {
  const parts: string[] = []
  for (let row = 0; row < code.size; row += 1) {
    for (let column = 0; column < code.size; column += 1) {
      if (code.modules[row][column]) parts.push(`M${column} ${row}h1v1h-1z`)
    }
  }
  return parts.join('')
}
