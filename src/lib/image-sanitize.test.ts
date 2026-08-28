import { describe, expect, test } from 'bun:test'
import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { MAX_IMAGE_PIXELS, sanitizeImage } from '@/lib/image-sanitize'
import { sniffImageType } from '@/lib/uploads'

/**
 * The re-encode is the whole content check on this pipeline, so these tests are
 * about the two properties it is relied on for: nothing that is not a pixel
 * survives it, and everything that *is* a pixel does.
 *
 * The second half matters as much as the first. A sanitiser that quietly
 * flattens animated GIFs, or that rejects a photo out of a phone, is a
 * regression that reads as "the product is broken" rather than as a security
 * control doing its job.
 */

const PNG = { mime: 'image/png', ext: 'png' } as const
const JPG = { mime: 'image/jpeg', ext: 'jpg' } as const
const GIF = { mime: 'image/gif', ext: 'gif' } as const
const WEBP = { mime: 'image/webp', ext: 'webp' } as const

function solid(width = 16, height = 16) {
  return sharp({ create: { width, height, channels: 3, background: '#3355ff' } })
}

/** Three visibly different 8x8 frames stacked into one 8x24 animation. */
async function animatedGif(): Promise<Buffer> {
  const raw = Buffer.alloc(8 * 24 * 3)
  for (let frame = 0; frame < 3; frame++) {
    for (let pixel = 0; pixel < 8 * 8; pixel++) {
      raw[(frame * 64 + pixel) * 3 + frame] = 255
    }
  }
  return await sharp(raw, { raw: { width: 8, height: 24, channels: 3, pageHeight: 8 } })
    .gif({ delay: [100, 100, 100], loop: 0 })
    .toBuffer()
}

function pagesIn(buffer: Buffer): Promise<number | undefined> {
  return sharp(buffer, { animated: true })
    .metadata()
    .then((meta) => meta.pages)
}

function unwrap(result: Awaited<ReturnType<typeof sanitizeImage>>): Buffer {
  if (!result.ok) throw new Error(`expected clean, got ${result.reason}`)
  return result.bytes
}

describe('sanitizeImage', () => {
  test('keeps the format it was given, for all four we accept', async () => {
    const png = await solid().png().toBuffer()
    const cases = [
      [png, PNG],
      [await sharp(png).jpeg().toBuffer(), JPG],
      [await sharp(png).gif().toBuffer(), GIF],
      [await sharp(png).webp().toBuffer(), WEBP],
    ] as const

    for (const [bytes, type] of cases) {
      const out = unwrap(await sanitizeImage(bytes, type))
      // The extension is in the object key and the mime is served as
      // Content-Type, so a format change here breaks both.
      expect(sniffImageType(out)?.mime).toBe(type.mime)
    }
  })

  test('drops a payload appended after the image data', async () => {
    const png = await solid().png().toBuffer()
    // A valid PNG followed by an executable header and a script tag. Every
    // check the upload route makes before this one passes it: the magic bytes
    // are a real PNG's, and the file is well under the size limit.
    const payload = Buffer.from('MZ\x90\x00<script>alert(1)</script>')
    const polyglot = Buffer.concat([png, payload, Buffer.alloc(2048, 0x41)])

    expect(sniffImageType(polyglot)?.mime).toBe('image/png')

    const out = unwrap(await sanitizeImage(polyglot, PNG))
    expect(out.includes(payload)).toBe(false)
    expect(out.includes(Buffer.from('script'))).toBe(false)
    expect(out.length).toBeLessThan(polyglot.length)
  })

  test('drops EXIF, which is where the GPS coordinates are', async () => {
    const withExif = await solid()
      .withExif({ IFD0: { Copyright: 'GPS-52.5200-13.4050' } })
      .jpeg()
      .toBuffer()
    expect(withExif.includes(Buffer.from('GPS-52.5200-13.4050'))).toBe(true)

    const out = unwrap(await sanitizeImage(withExif, JPG))
    expect(out.includes(Buffer.from('GPS-52.5200-13.4050'))).toBe(false)
  })

  test('keeps every frame of an animation', async () => {
    const gif = await animatedGif()
    expect(await pagesIn(gif)).toBe(3)

    // The failure this guards is silent: without `animated: true` libvips reads
    // page one, the output is a valid GIF, and every reaction image in the
    // product stops moving.
    expect(await pagesIn(unwrap(await sanitizeImage(gif, GIF)))).toBe(3)

    const webp = await sharp(gif, { animated: true }).webp().toBuffer()
    expect(await pagesIn(unwrap(await sanitizeImage(webp, WEBP)))).toBe(3)
  })

  test('is deterministic, because the output is content-addressed', async () => {
    const png = await solid().png().toBuffer()
    const first = unwrap(await sanitizeImage(png, PNG))
    const second = unwrap(await sanitizeImage(png, PNG))
    // Two uploads of one image must land on one checksum and one object.
    expect(first.equals(second)).toBe(true)
  })

  test('rejects an image whose pixels would not fit in memory', async () => {
    // A real 900MP file would have to be built to test this honestly, and
    // building it is the denial of service the limit exists to prevent. The
    // header is what libvips reads first and what the limit is checked against,
    // so patching the IHDR is the same code path with none of the cost.
    const png = await solid(4, 4).png().toBuffer()
    const bomb = Buffer.from(png)
    bomb.writeUInt32BE(30_000, 16) // IHDR width
    bomb.writeUInt32BE(30_000, 20) // IHDR height
    bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)) >>> 0, 29)

    expect(30_000 * 30_000).toBeGreaterThan(MAX_IMAGE_PIXELS)
    expect(await sanitizeImage(bomb, PNG)).toEqual({ ok: false, reason: 'too-many-pixels' })
  })

  test('rejects bytes that are not really an image', async () => {
    // Truncated: the signature is a genuine PNG's, so the sniffer accepts it
    // and this is the only thing standing between it and the bucket.
    const png = await solid().png().toBuffer()
    const truncated = png.subarray(0, Math.floor(png.length / 2))
    expect(sniffImageType(truncated)?.mime).toBe('image/png')
    expect(await sanitizeImage(truncated, PNG)).toEqual({ ok: false, reason: 'unreadable' })

    const garbage = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('not an image'),
    ])
    expect(await sanitizeImage(garbage, PNG)).toEqual({ ok: false, reason: 'unreadable' })
  })

  test('tolerates a file with trailing junk rather than refusing it', async () => {
    // `failOn: 'error'` rather than sharp's stricter default. Real photos carry
    // odd trailing bytes and users would read a rejection as a broken uploader;
    // the re-encode has already discarded whatever was in there.
    const jpeg = await solid().jpeg().toBuffer()
    const scruffy = Buffer.concat([jpeg, Buffer.alloc(64, 0x00)])
    expect((await sanitizeImage(scruffy, JPG)).ok).toBe(true)
  })
})
