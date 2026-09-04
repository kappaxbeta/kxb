import { describe, expect, it } from 'bun:test'
import { animatedWebp } from '@/domain/studio/webp-anim'

/**
 * Building the stills by hand rather than encoding real ones.
 *
 * There is no WebP encoder in a test runner, and the thing under test is the
 * *container* - what it does with the bytes it is handed, not what those bytes
 * mean. A hand-built file lets a test say "this one is the simple form, this
 * one carries alpha, this one has an odd-length chunk in it", which is exactly
 * the set of shapes a canvas produces and the set this has to get right.
 */
function riff(chunks: { fourcc: string; body: number[] }[]): Uint8Array {
  const body: number[] = []
  for (const chunk of chunks) {
    for (const letter of chunk.fourcc) body.push(letter.charCodeAt(0))
    const size = chunk.body.length
    body.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff)
    body.push(...chunk.body)
    if (size % 2) body.push(0)
  }

  const out: number[] = []
  for (const letter of 'RIFF') out.push(letter.charCodeAt(0))
  const size = 4 + body.length
  out.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff)
  for (const letter of 'WEBP') out.push(letter.charCodeAt(0))
  out.push(...body)
  return Uint8Array.from(out)
}

const at = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length))

/** Every fourcc in the file, in order, so a test can talk about structure. */
function fourccs(file: Uint8Array): string[] {
  const found: string[] = []
  let cursor = 12
  while (cursor + 8 <= file.length) {
    const fourcc = at(file, cursor, 4)
    const size =
      file[cursor + 4] | (file[cursor + 5] << 8) | (file[cursor + 6] << 16) | (file[cursor + 7] << 24)
    found.push(fourcc)
    cursor += 8 + size + (size % 2)
  }
  return found
}

const simple = riff([{ fourcc: 'VP8 ', body: [1, 2, 3, 4] }])

const withAlpha = riff([
  { fourcc: 'VP8X', body: [0x10, 0, 0, 0, 7, 0, 0, 7, 0, 0] },
  { fourcc: 'ALPH', body: [9, 9, 9] },
  { fourcc: 'VP8 ', body: [1, 2, 3, 4] },
])

describe('animatedWebp', () => {
  it('writes a RIFF/WEBP file whose size field covers everything after it', () => {
    const out = animatedWebp([simple], { width: 8, height: 8, frameMs: 100 })

    expect(at(out, 0, 4)).toBe('RIFF')
    expect(at(out, 8, 4)).toBe('WEBP')

    const declared = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24)
    expect(declared).toBe(out.length - 8)
  })

  it('puts one ANMF per frame under a VP8X and an ANIM', () => {
    const out = animatedWebp([simple, simple, simple], {
      width: 8,
      height: 8,
      frameMs: 100,
    })

    expect(fourccs(out)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF', 'ANMF'])
  })

  it('declares the canvas size minus one, as the container stores it', () => {
    const out = animatedWebp([simple], { width: 320, height: 200, frameMs: 40 })

    // VP8X payload starts at 12 + 8: flags, three reserved, then the two 24-bit
    // sizes.
    const body = out.subarray(20)
    const width = body[4] | (body[5] << 8) | (body[6] << 16)
    const height = body[7] | (body[8] << 8) | (body[9] << 16)
    expect(width).toBe(319)
    expect(height).toBe(199)
  })

  it('always flags alpha and animation', () => {
    const out = animatedWebp([simple], { width: 8, height: 8, frameMs: 100 })
    expect(out[20] & 0x10).toBe(0x10)
    expect(out[20] & 0x02).toBe(0x02)
  })

  it('loops forever by default, and counts when asked', () => {
    const forever = animatedWebp([simple], { width: 8, height: 8, frameMs: 100 })
    const twice = animatedWebp([simple], { width: 8, height: 8, frameMs: 100, loop: 2 })

    // ANIM payload is four bytes of background then the loop count.
    const loopOf = (file: Uint8Array) => {
      const anim = 12 + 8 + 10 + 8 // header, VP8X, its body, ANIM header
      return file[anim + 4] | (file[anim + 5] << 8)
    }

    expect(loopOf(forever)).toBe(0)
    expect(loopOf(twice)).toBe(2)
  })

  it('carries the alpha chunk into the frame, ahead of the picture', () => {
    const out = animatedWebp([withAlpha], { width: 8, height: 8, frameMs: 100 })

    // Inside the ANMF: 16 bytes of frame header, then the chunks.
    const anmf = 12 + 8 + 10 + 8 + 6 + 8
    expect(at(out, anmf + 16, 4)).toBe('ALPH')
  })

  it('drops the still’s own VP8X, which an ANMF may not contain', () => {
    const out = animatedWebp([withAlpha], { width: 8, height: 8, frameMs: 100 })
    // One VP8X in the file: the animation's own.
    expect(fourccs(out).filter((one) => one === 'VP8X')).toHaveLength(1)
  })

  it('reads past an odd-length chunk without losing its place', () => {
    const odd = riff([
      { fourcc: 'VP8X', body: [0x10, 0, 0, 0, 7, 0, 0, 7, 0, 0] },
      { fourcc: 'ALPH', body: [1, 2, 3, 4, 5] },
      { fourcc: 'VP8 ', body: [9, 9] },
    ])

    const out = animatedWebp([odd], { width: 8, height: 8, frameMs: 100 })
    const anmf = 12 + 8 + 10 + 8 + 6 + 8
    expect(at(out, anmf + 16, 4)).toBe('ALPH')
    // ALPH is five bytes, so the picture starts after its pad byte.
    expect(at(out, anmf + 16 + 8 + 5 + 1, 4)).toBe('VP8 ')
  })

  it('refuses a file that is not a WebP', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(() => animatedWebp([png], { width: 8, height: 8, frameMs: 100 })).toThrow(
      /not a WebP/,
    )
  })

  it('refuses a WebP with no picture chunk in it', () => {
    const empty = riff([{ fourcc: 'VP8X', body: [0x10, 0, 0, 0, 7, 0, 0, 7, 0, 0] }])
    expect(() => animatedWebp([empty], { width: 8, height: 8, frameMs: 100 })).toThrow(
      /no picture/,
    )
  })

  it('refuses to write an animation with no frames', () => {
    expect(() => animatedWebp([], { width: 8, height: 8, frameMs: 100 })).toThrow(
      /at least one frame/,
    )
  })
})
