/**
 * Just enough PNG for the render scripts: decode the asset pack's textures,
 * encode what the rasterizers produce. Shared by `render-blocks.ts` and
 * `render-stage.ts`, which is the only reason it is a module.
 */

import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'

export interface Image {
  width: number
  height: number
  /** RGBA8, row-major from the top. */
  data: Uint8Array
}

/**
 * Decodes 8-bit RGB, RGBA and palette non-interlaced PNGs.
 *
 * ---------------------------------------------------------------------------
 * Why the palette case is here
 * ---------------------------------------------------------------------------
 * "Which is all the pack ships" was true of Kay Lousberg's kits and stopped
 * being true the moment Kenney's arrived: `minigolf`, `proto-kenny` and
 * `space-station` each ship a `Textures/colormap.png` written as colour type 3
 * — a 256-entry palette and one byte an pixel — because that is what an atlas of
 * flat colours compresses to. The other three Kenney kits in the same download
 * are type 6, so this is a quirk of how each was exported rather than a house
 * style, and there is no arguing the files into agreement.
 *
 * The alternative was converting the three files on the way in, which is a
 * conversion nobody would remember the next time a kit lands, and a diff against
 * the publisher's own bytes that nobody could explain. Sixteen lines of PLTE is
 * cheaper than a rule.
 */
export function decodePng(file: string): Image {
  const buf = readFileSync(file)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const depth = buf[24]
  const colorType = buf[25]
  const interlace = buf[28]

  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2 && colorType !== 3)) {
    throw new Error(`${file}: unsupported PNG (depth ${depth}, colour ${colorType})`)
  }

  /** One byte an pixel for an index; three or four for a colour written out. */
  const channels = colorType === 6 ? 4 : colorType === 3 ? 1 : 3
  const idat: Buffer[] = []
  /**
   * The palette, and the alpha that may or may not come with it.
   *
   * `tRNS` is optional and may be *shorter* than the palette - the spec lets a
   * file describe only the entries that are not opaque - so the read below
   * defaults to 255 rather than indexing into it blindly. Kenney's atlases have
   * no tRNS at all, which is the case that has to keep working.
   */
  let palette: Buffer | null = null
  let alpha: Buffer | null = null
  let at = 8
  while (at < buf.length) {
    const length = buf.readUInt32BE(at)
    const type = buf.toString('ascii', at + 4, at + 8)
    if (type === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + length))
    if (type === 'PLTE') palette = buf.subarray(at + 8, at + 8 + length)
    if (type === 'tRNS') alpha = buf.subarray(at + 8, at + 8 + length)
    if (type === 'IEND') break
    at += 12 + length
  }

  if (colorType === 3 && !palette) throw new Error(`${file}: palette PNG with no PLTE`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  const line = new Uint8Array(stride)
  const prev = new Uint8Array(stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    for (let i = 0; i < stride; i++) {
      const value = raw[pos + i]
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let recon: number
      switch (filter) {
        case 0: recon = value; break
        case 1: recon = value + a; break
        case 2: recon = value + b; break
        case 3: recon = value + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          recon = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error(`${file}: bad filter ${filter}`)
      }
      line[i] = recon & 0xff
    }
    pos += stride

    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      if (palette) {
        // The filtered byte is an index, not a colour. Everything above this
        // point - the filters, the previous scanline - is unchanged, because a
        // palette PNG is filtered over its indices exactly like any other.
        const p = line[s] * 3
        out[d] = palette[p]
        out[d + 1] = palette[p + 1]
        out[d + 2] = palette[p + 2]
        out[d + 3] = alpha && line[s] < alpha.length ? alpha[line[s]] : 255
      } else {
        out[d] = line[s]
        out[d + 1] = line[s + 1]
        out[d + 2] = line[s + 2]
        out[d + 3] = channels === 4 ? line[s + 3] : 255
      }
    }
    prev.set(line)
  }

  return { width, height, data: out }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

export function encodePng({ width, height, data }: Image): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
