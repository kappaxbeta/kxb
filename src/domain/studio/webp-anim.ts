/**
 * A stack of still WebPs, as one animated WebP.
 *
 * ---------------------------------------------------------------------------
 * Why this is a muxer and not an encoder
 * ---------------------------------------------------------------------------
 * The browser already has a WebP encoder in it - `canvas.toBlob('image/webp')`
 * is libwebp, compiled in, with the alpha channel intact - and it will encode
 * exactly one frame at a time and offer no way to ask for an animation.
 *
 * That gap is a *container* gap, not a compression one. An animated WebP is the
 * same VP8 or VP8L bitstreams a still carries, listed inside `ANMF` chunks
 * under one `VP8X` header. So this takes the stills the canvas produced, opens
 * each one, lifts the picture out of its wrapper and writes them all into a new
 * one. No pixels are touched, nothing is re-compressed, and the file is a fifth
 * the size of the same take as a GIF because it never lost its alpha channel or
 * its colours.
 *
 * The alternative was a WASM build of libwebp for the animation encoder: a
 * megabyte of dependency, in the lockfile and in the bundle, to re-do work the
 * browser has already done.
 *
 * ---------------------------------------------------------------------------
 * What a still actually looks like coming out of a canvas
 * ---------------------------------------------------------------------------
 * Two shapes, and this has to handle both:
 *
 *   RIFF....WEBP VP8 <lossy bitstream>                    - opaque, simple
 *   RIFF....WEBP VP8X ALPH <alpha> VP8 <lossy bitstream>  - with transparency
 *
 * and `VP8L` in place of `VP8 ` when the encoder chose lossless. An `ANMF`
 * payload takes the same chunks as the second form minus the `VP8X`, which is
 * why this reads chunk by chunk rather than assuming an offset: a fixed slice
 * would work perfectly on opaque frames and silently truncate every transparent
 * one, which is the failure the whole feature exists to avoid.
 *
 * Spec: https://developers.google.com/speed/webp/docs/riff_container
 */

/** `VP8X` flags. Animation and alpha are the only two this writes. */
const HAS_ALPHA = 0x10
const IS_ANIMATED = 0x02

/**
 * Frame flags: overwrite the canvas, then clear it again.
 *
 * Bit 1 is blending and bit 0 is disposal, and both are set for the same
 * reason: every frame here is a whole picture, drawn from a clean canvas. With
 * blending on, a transparent pixel would show whatever the previous frame left
 * under it - which turns an animation of a moving body into a smear of every
 * position it has ever been in.
 */
const REPLACE_FRAME = 0x03

export interface AnimatedWebpOptions {
  width: number
  height: number
  /** How long each frame is shown, in milliseconds. */
  frameMs: number
  /** How many times to play. Zero, the default, is forever. */
  loop?: number
}

interface Chunk {
  fourcc: string
  /** The payload, without its header and without any padding byte. */
  body: Uint8Array
}

const text = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])

const u32 = (bytes: Uint8Array, at: number) =>
  bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24 >>> 0)

/**
 * Every chunk in one still, in order.
 *
 * Chunks are padded to an even length and the pad byte is *not* counted in the
 * size field - the one detail of RIFF that everybody gets wrong once, and which
 * shows up as every chunk after the first odd-sized one being read from one
 * byte too early.
 */
function chunksOf(file: Uint8Array): Chunk[] {
  if (file.length < 12 || text(file, 0) !== 'RIFF' || text(file, 8) !== 'WEBP') {
    throw new Error('that is not a WebP file')
  }

  const chunks: Chunk[] = []
  let at = 12
  while (at + 8 <= file.length) {
    const fourcc = text(file, at)
    const size = u32(file, at + 4)
    const from = at + 8
    if (from + size > file.length) throw new Error(`the ${fourcc} chunk runs past the end`)
    chunks.push({ fourcc, body: file.subarray(from, from + size) })
    at = from + size + (size % 2)
  }

  return chunks
}

/**
 * What goes inside one `ANMF`: the alpha, if there is any, and the picture.
 *
 * A simple-format still has no `VP8X` and so no `ALPH` either - its whole file
 * after the header is the one bitstream chunk, and that is a legal frame
 * payload on its own.
 */
function frameChunks(file: Uint8Array): Chunk[] {
  const chunks = chunksOf(file)
  const wanted = chunks.filter(
    (chunk) => chunk.fourcc === 'ALPH' || chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L',
  )

  if (!wanted.some((chunk) => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L')) {
    throw new Error('that WebP has no picture in it')
  }

  // ALPH first, which is the order the spec fixes rather than a preference:
  // a decoder reads the alpha before the frame it belongs to.
  return [...wanted].sort((a, b) => (a.fourcc === 'ALPH' ? -1 : b.fourcc === 'ALPH' ? 1 : 0))
}

/** A chunk, header and all, with its pad byte when the body is odd. */
function writeChunk(into: number[], fourcc: string, body: ArrayLike<number>): void {
  for (let i = 0; i < 4; i += 1) into.push(fourcc.charCodeAt(i))
  const size = body.length
  into.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff)
  for (let i = 0; i < size; i += 1) into.push(body[i])
  if (size % 2) into.push(0)
}

const push24 = (into: number[], value: number) => {
  into.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff)
}

/**
 * Mux the stills into one animation.
 *
 * `frames` are complete WebP files - whatever `canvas.toBlob('image/webp')`
 * handed back, read as bytes. Every one of them must be the size the options
 * say: an `ANMF` carries its own width and height and a decoder trusts them, so
 * a frame that disagrees with the canvas is a frame drawn at the wrong scale
 * rather than an error anybody sees.
 */
export function animatedWebp(
  frames: readonly Uint8Array[],
  options: AnimatedWebpOptions,
): Uint8Array {
  if (frames.length === 0) throw new Error('an animation needs at least one frame')

  const { width, height, frameMs } = options
  const loop = options.loop ?? 0

  const body: number[] = []

  /*
    VP8X: the canvas size, and what else is in the file.

    Alpha is declared unconditionally rather than by looking for an `ALPH`
    chunk. The flag says "some frame may have transparency", and the frames it
    describes are captured off a canvas with an alpha channel - so the honest
    answer is yes even for the take that happens to fill every pixel. Declaring
    it and having none costs nothing; the reverse makes a decoder composite an
    alpha channel it was told was absent.
  */
  const vp8x: number[] = [HAS_ALPHA | IS_ANIMATED, 0, 0, 0]
  push24(vp8x, width - 1)
  push24(vp8x, height - 1)
  writeChunk(body, 'VP8X', vp8x)

  // Background colour, as BGRA. Transparent, because that is what a page puts
  // behind one of these - and it is only ever used by a viewer that fills the
  // canvas itself before the first frame.
  writeChunk(body, 'ANIM', [0, 0, 0, 0, loop & 0xff, (loop >> 8) & 0xff])

  for (const frame of frames) {
    const anmf: number[] = []
    // Offsets are stored halved - a frame may only start on an even pixel. Both
    // are zero here: every frame is the whole canvas.
    push24(anmf, 0)
    push24(anmf, 0)
    push24(anmf, width - 1)
    push24(anmf, height - 1)
    push24(anmf, Math.max(1, Math.round(frameMs)))
    anmf.push(REPLACE_FRAME)

    for (const chunk of frameChunks(frame)) writeChunk(anmf, chunk.fourcc, chunk.body)

    writeChunk(body, 'ANMF', anmf)
  }

  const out = new Uint8Array(12 + body.length)
  out.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  // The size field counts everything after it, which includes the four bytes
  // spelling WEBP - the other half of the mistake the pad byte belongs to.
  const size = 4 + body.length
  out.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4)
  out.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  out.set(Uint8Array.from(body), 12)

  return out
}
