/**
 * Just enough GIF89a to write an animation, on either side of the wire.
 *
 * The sibling of `scripts/png.ts`, which exists for the same reason and says
 * most of it: a couple of surfaces need one format written exactly, and a
 * dependency for that is a dependency in the lockfile, in CI and in every
 * future upgrade.
 *
 * ---------------------------------------------------------------------------
 * Why GIF, when everything else here is PNG or WebP
 * ---------------------------------------------------------------------------
 * Because the output has to *move*, and `sharp` will not write one that does.
 * It reads animated GIF and WebP happily, and it re-encodes an animation it was
 * given, but there is no way to hand it a list of frames: raw input with a
 * `pageHeight` is accepted and then written as one tall still, which is a
 * silent wrong answer rather than an error - measured, not assumed.
 *
 * Of the formats we could write by hand, GIF is the one that suits the job.
 * These are pixel-font titles and flat-shaded scenes: a handful of colours on
 * transparency, hard edges, no gradients. That is precisely what a 256-entry
 * palette and LZW are good at, and precisely what a lossy codec ruins. GIF also
 * plays everywhere without a video element, which is the point of asking for an
 * image.
 *
 * ---------------------------------------------------------------------------
 * Why it lives in `domain` rather than in `scripts`, where it started
 * ---------------------------------------------------------------------------
 * The studio writes these now as well, in the browser, and the browser has no
 * `Buffer`. Rather than keep a second encoder in step with this one - two LZW
 * implementations is two places to get the code-width rule wrong - the whole
 * thing moved here and works in plain `Uint8Array`, which Node accepts
 * everywhere it accepts a Buffer. `scripts/gif.ts` is now a re-export.
 *
 * What is deliberately not here: interlacing, local colour tables, and any
 * disposal method other than "restore to background". Each frame here is drawn
 * whole, so the differences those express are differences between two identical
 * pictures.
 */

/** One frame: 8-bit palette indices, row-major from the top. */
export interface Frame {
  /** One byte per pixel, indexing `palette`. */
  indices: Uint8Array
  /** Hundredths of a second this frame is shown. */
  delayCs: number
}

export interface GifOptions {
  width: number
  height: number
  /** Up to 256 entries of `[r, g, b]`. */
  palette: [number, number, number][]
  /**
   * Which palette entry means "see through", or null for an opaque GIF.
   *
   * GIF transparency is a single index rather than an alpha channel, which is
   * the format's oldest limitation and the reason a soft edge cannot survive
   * one. It is not a limitation for a pixel font; for a rendered scene it is
   * the reason `quantise` hard-edges the alpha rather than dithering it.
   */
  transparent?: number | null
  /** How many times to play. Zero, the default, is forever. */
  loop?: number
}

/**
 * LZW, as the GIF variant of it.
 *
 * Different enough from the LZW anybody remembers that the differences are
 * worth naming: codes are written **least-significant bit first** into the byte
 * stream, the width grows the moment the next code *would* not fit rather than
 * after it overflows, and the dictionary is reset with an explicit clear code
 * whenever it reaches 4096 entries. Getting any of the three wrong produces a
 * file that some decoders open and others reject, which is the worst failure
 * mode available here - so this follows the spec's own ordering rather than a
 * tidier one.
 */
function lzw(indices: Uint8Array, minimumCodeSize: number): number[] {
  const clear = 1 << minimumCodeSize
  const end = clear + 1

  const out: number[] = []
  let bits = 0
  let bitCount = 0

  const write = (code: number, width: number): void => {
    bits |= code << bitCount
    bitCount += width
    while (bitCount >= 8) {
      out.push(bits & 0xff)
      bits >>= 8
      bitCount -= 8
    }
  }

  let dictionary = new Map<string, number>()
  const reset = (): void => {
    dictionary = new Map()
    for (let i = 0; i < clear; i += 1) dictionary.set(String(i), i)
  }

  let width = minimumCodeSize + 1
  let next = end + 1
  reset()
  write(clear, width)

  let current = String(indices[0])
  for (let i = 1; i < indices.length; i += 1) {
    const symbol = String(indices[i])
    const combined = `${current},${symbol}`
    if (dictionary.has(combined)) {
      current = combined
      continue
    }

    write(dictionary.get(current)!, width)
    dictionary.set(combined, next)
    next += 1

    if (next > 4095) {
      write(clear, width)
      reset()
      next = end + 1
      width = minimumCodeSize + 1
    } else if (next > 1 << width) {
      // `>` rather than `>=`: the width grows when the *next* code to be issued
      // needs one more bit, and issuing it a step early desynchronises every
      // decoder that follows the spec.
      width += 1
    }

    current = symbol
  }

  write(dictionary.get(current)!, width)
  write(end, width)
  if (bitCount > 0) out.push(bits & 0xff)

  // Sub-blocks: at most 255 bytes each, terminated by a zero-length one.
  const blocks: number[] = []
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255)
    blocks.push(chunk.length, ...chunk)
  }
  blocks.push(0)

  return blocks
}

export function encodeGif(frames: Frame[], options: GifOptions): Uint8Array {
  const { width, height } = options
  const transparent = options.transparent ?? null
  const loop = options.loop ?? 0

  // The table has to be a power of two, at least four entries, and every entry
  // present - a decoder reads the whole table whether or not we filled it.
  let bits = 2
  while (1 << bits < options.palette.length) bits += 1
  const size = 1 << bits

  const out: number[] = []
  const ascii = (text: string) => {
    for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i))
  }
  const u16 = (value: number) => {
    out.push(value & 0xff, (value >> 8) & 0xff)
  }

  ascii('GIF89a')
  u16(width)
  u16(height)
  // Global table present, colour resolution 8 bits, not sorted, size = bits-1.
  out.push(0x80 | 0x70 | (bits - 1), 0, 0)

  for (let i = 0; i < size; i += 1) {
    const entry = options.palette[i]
    out.push(entry?.[0] ?? 0, entry?.[1] ?? 0, entry?.[2] ?? 0)
  }

  // NETSCAPE2.0, the extension every animated GIF carries to say how often it
  // repeats. Without it a viewer plays the frames once and stops.
  out.push(0x21, 0xff, 11)
  ascii('NETSCAPE2.0')
  out.push(3, 1)
  u16(loop)
  out.push(0)

  for (const frame of frames) {
    out.push(0x21, 0xf9, 4)
    // Disposal 2 - restore to background - so a frame that lights fewer pixels
    // than the one before it does not show the older frame underneath. With
    // disposal 0 a reveal would only ever add, and nothing could disappear.
    out.push((2 << 2) | (transparent === null ? 0 : 1))
    u16(Math.max(1, Math.round(frame.delayCs)))
    out.push(transparent ?? 0, 0)

    out.push(0x2c)
    u16(0)
    u16(0)
    u16(width)
    u16(height)
    out.push(0)

    const minimumCodeSize = Math.max(2, bits)
    out.push(minimumCodeSize, ...lzw(frame.indices, minimumCodeSize))
  }

  out.push(0x3b)
  return Uint8Array.from(out)
}
