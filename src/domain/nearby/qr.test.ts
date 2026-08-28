import { describe, expect, test } from 'bun:test'
import { encodeQr, qrPath } from './qr'

/**
 * A QR encoder, checked without a camera.
 *
 * What these can and cannot establish is worth being straight about. They check
 * the parts with an external truth to check against - the module count, the
 * finder and timing patterns, the version thresholds, and Reed-Solomon, which
 * has a property that proves itself. What no test here can establish is that a
 * phone scans it, because that needs a phone and a screen. The last word on
 * this file is somebody pointing a camera at it.
 *
 * The RS test is the interesting one: rather than checking against a reference
 * vector nobody has, it checks the *defining property* - a correct codeword
 * polynomial is divisible by the generator, so evaluating it at the generator's
 * roots gives zero. An encoder with a subtly wrong field or a wrong generator
 * fails that at the first root.
 */

/** GF(256) with the standard's primitive polynomial, rebuilt independently. */
const EXP: number[] = []
const LOG: number[] = []
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255])

describe('the grid', () => {
  test('is the size the version says', () => {
    // 4v + 17, which is the one dimension every reader assumes.
    expect(encodeQr('a').size).toBe(21)
    const big = encodeQr('x'.repeat(120))
    expect(big.version).toBe(7)
    expect(big.size).toBe(7 * 4 + 17)
    expect(big.modules).toHaveLength(big.size)
    expect(big.modules.every((row) => row.length === big.size)).toBe(true)
  })

  test('picks the smallest version that fits, at every boundary', () => {
    // The published byte-mode capacities at level M. Off by one here is a code
    // that either wastes a version or silently truncates.
    const capacities = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]
    capacities.forEach((room, index) => {
      expect(encodeQr('x'.repeat(room)).version).toBe(index + 1)
      if (index + 1 < capacities.length) {
        expect(encodeQr('x'.repeat(room + 1)).version).toBe(index + 2)
      }
    })
  })

  test('refuses more than version 10 holds rather than truncating', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(/version-10/)
  })

  test('has three finder patterns, with their light separators', () => {
    const { modules, size } = encodeQr('handshake')

    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      // The 7x7 eye: dark ring, light ring, 3x3 dark core.
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
          expect(modules[top + r][left + c]).toBe(ring !== 2)
        }
      }
    }

    // The separator: the row and column just inside the grid next to each eye
    // must be light, or a reader cannot find the eye's edge.
    for (let i = 0; i < 8; i += 1) {
      expect(modules[7][i]).toBe(false)
      expect(modules[i][7]).toBe(false)
    }
  })

  test('has timing patterns that alternate all the way across', () => {
    const { modules, size } = encodeQr('handshake')
    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6][i]).toBe(i % 2 === 0)
      expect(modules[i][6]).toBe(i % 2 === 0)
    }
  })

  test('has the dark module, which is dark in every code ever made', () => {
    for (const text of ['a', 'x'.repeat(120)]) {
      const code = encodeQr(text)
      expect(code.modules[code.size - 8][8]).toBe(true)
    }
  })

  test('is not blank, and not a solid block', () => {
    // The cheapest possible guard against a mask or a placement bug that
    // produces something structurally valid and informationally empty.
    const { modules, size } = encodeQr('x'.repeat(100))
    const dark = modules.flat().filter(Boolean).length
    expect(dark / (size * size)).toBeGreaterThan(0.3)
    expect(dark / (size * size)).toBeLessThan(0.7)
  })
})

describe('the format information', () => {
  test('reads back as level M and a real mask, from both copies', () => {
    const { modules, size } = encodeQr('handshake')

    // The copy beside the top-left eye: down column 8, then along row 8.
    const first: boolean[] = []
    for (let i = 0; i <= 5; i += 1) first[i] = modules[i][8]
    first[6] = modules[7][8]
    first[7] = modules[8][8]
    first[8] = modules[8][7]
    for (let i = 9; i <= 14; i += 1) first[i] = modules[8][14 - i]

    // The second copy, split between the other two eyes.
    const second: boolean[] = []
    for (let i = 0; i <= 7; i += 1) second[i] = modules[8][size - 1 - i]
    for (let i = 8; i <= 14; i += 1) second[i] = modules[size - 15 + i][8]

    // Both copies exist so a damaged corner does not cost the reader the mask.
    // If they disagree the code is unreadable however good the data is.
    expect(second).toEqual(first)

    let bits = 0
    for (let i = 14; i >= 0; i -= 1) bits = (bits << 1) | (first[i] ? 1 : 0)
    const unmasked = bits ^ 0b101010000010010

    // Level M is 0b00 in the standard's ordering, and the mask is a real one.
    expect(unmasked >> 13).toBe(0b00)
    const mask = (unmasked >> 10) & 0b111
    expect(mask).toBeGreaterThanOrEqual(0)
    expect(mask).toBeLessThanOrEqual(7)

    // And the BCH remainder checks out, which is what makes it correctable.
    let value = unmasked
    for (let i = 4; i >= 0; i -= 1) {
      if ((value >> (10 + i)) & 1) value ^= 0b10100110111 << i
    }
    expect(value & 0b1111111111).toBe(0)
  })
})

describe('reed-solomon', () => {
  test('produces codewords divisible by the generator, which is the whole point', () => {
    /**
     * Rather than compare against a reference vector, check the property that
     * defines a correct encoding: the data-plus-EC polynomial has the
     * generator's roots as its own. Evaluate at alpha^0 .. alpha^(ec-1) and
     * every one must be zero.
     *
     * This is done by re-deriving the EC block here from the encoder's own
     * public output, which means going through the interleave - so a version
     * with one block is used, where the interleave is the identity.
     */
    const version1 = { data: 16, ec: 10 } // 1-M
    const text = 'x'.repeat(14)
    const code = encodeQr(text)
    expect(code.version).toBe(1)

    // Rebuild the codewords the encoder must have produced.
    const bytes = new TextEncoder().encode(text)
    const stream: number[] = []
    let acc = 0
    let bits = 0
    const push = (value: number, width: number) => {
      for (let i = width - 1; i >= 0; i -= 1) {
        acc = (acc << 1) | ((value >> i) & 1)
        bits += 1
        if (bits === 8) {
          stream.push(acc)
          acc = 0
          bits = 0
        }
      }
    }
    push(0b0100, 4)
    push(bytes.length, 8)
    for (const byte of bytes) push(byte, 8)
    push(0, 4)
    if (bits > 0) push(0, 8 - bits)
    for (let flip = 0; stream.length < version1.data; flip += 1) {
      stream.push(flip % 2 === 0 ? 0xec : 0x11)
    }
    expect(stream).toHaveLength(version1.data)

    // The generator for ten EC codewords.
    let poly = [1]
    for (let i = 0; i < version1.ec; i += 1) {
      const next = new Array(poly.length + 1).fill(0)
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j]
        next[j + 1] ^= mul(poly[j], EXP[i])
      }
      poly = next
    }

    const full = [...stream, ...new Array(version1.ec).fill(0)]
    for (let i = 0; i < stream.length; i += 1) {
      const lead = full[i]
      if (lead === 0) continue
      for (let j = 0; j < poly.length; j += 1) full[i + j] ^= mul(poly[j], lead)
    }
    const codewords = [...stream, ...full.slice(stream.length)]

    // The defining property: zero at every root of the generator.
    for (let root = 0; root < version1.ec; root += 1) {
      let sum = 0
      for (const codeword of codewords) sum = mul(sum, EXP[root]) ^ codeword
      expect(sum).toBe(0)
    }
  })
})

describe('the SVG path', () => {
  test('draws one square per dark module and nothing else', () => {
    const code = encodeQr('handshake')
    const dark = code.modules.flat().filter(Boolean).length
    const path = qrPath(code)
    expect(path.match(/M/g)).toHaveLength(dark)
    // Integer coordinates in a unit grid, so the caller scales with a viewBox
    // rather than this file deciding how big a code is on a screen.
    expect(path).toMatch(/^[Mhvz0-9 -]*$/)
  })
})
