import { describe, expect, test } from 'bun:test'
import { crc32, dosStamp, zip } from '@/lib/zip'

const utf8 = (text: string) => new TextEncoder().encode(text)
const AT = new Date('2026-08-11T13:45:20Z')

describe('crc32', () => {
  /**
   * The published check values for CRC-32/ISO-HDLC. Worth pinning against known
   * answers rather than against our own output: a self-consistent CRC that is
   * the wrong polynomial produces an archive every reader rejects, and the
   * failure is "the zip is corrupt" rather than anything pointing here.
   */
  test('matches the standard check values', () => {
    expect(crc32(utf8(''))).toBe(0)
    expect(crc32(utf8('a'))).toBe(0xe8b7be43)
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
    expect(crc32(utf8('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  test('is stable across calls, so the table is not being mutated', () => {
    expect(crc32(utf8('123456789'))).toBe(crc32(utf8('123456789')))
  })
})

describe('dos stamps', () => {
  test('an ordinary date round-trips into the packed fields', () => {
    const { time, date } = dosStamp(new Date(2026, 7, 11, 13, 45, 20))
    expect((date >> 9) + 1980).toBe(2026)
    expect((date >> 5) & 0x0f).toBe(8)
    expect(date & 0x1f).toBe(11)
    expect(time >> 11).toBe(13)
    expect((time >> 5) & 0x3f).toBe(45)
    // Two-second resolution is the format's, not a rounding choice of ours.
    expect((time & 0x1f) * 2).toBe(20)
  })

  test('a date before the zip epoch clamps rather than wrapping', () => {
    // 1979 would go negative and wrap to something like 2071, which is worse
    // than being wrong in a way somebody can recognise.
    const { date } = dosStamp(new Date(1970, 0, 1))
    expect((date >> 9) + 1980).toBe(1980)
  })
})

describe('the archive', () => {
  const read = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  test('an empty archive is just an end record', () => {
    const out = zip([], AT)
    expect(out.length).toBe(22)
    expect(read(out).getUint32(0, true)).toBe(0x06054b50)
    expect(read(out).getUint16(10, true)).toBe(0)
  })

  test('the end record points at a central directory that is really there', () => {
    const out = zip(
      [
        { path: 'document.xp.json', bytes: utf8('{"format":"xp/2"}') },
        { path: 'preview/01-cover.png', bytes: new Uint8Array([1, 2, 3, 4, 5]) },
      ],
      AT,
    )
    const view = read(out)

    const end = out.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)

    const centralSize = view.getUint32(end + 12, true)
    const centralOffset = view.getUint32(end + 16, true)

    // The offset and size must land exactly on the end record, or a reader
    // walks into the middle of a file's bytes looking for a header.
    expect(centralOffset + centralSize).toBe(end)
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50)
  })

  test("every central entry's offset points at that entry's local header", () => {
    const entries = [
      { path: 'a.json', bytes: utf8('{}') },
      { path: 'b/c.bin', bytes: new Uint8Array(64) },
      { path: 'd.txt', bytes: utf8('hello') },
    ]
    const out = zip(entries, AT)
    const view = read(out)
    const end = out.length - 22

    let at = view.getUint32(end + 16, true)
    for (const entry of entries) {
      expect(view.getUint32(at, true)).toBe(0x02014b50)
      const nameLength = view.getUint16(at + 28, true)
      const localAt = view.getUint32(at + 42, true)

      // The local header the central directory names really is one.
      expect(view.getUint32(localAt, true)).toBe(0x04034b50)
      // And the sizes and CRC agree between the two copies, which is what a
      // reader cross-checks and what an off-by-one in either header breaks.
      expect(view.getUint32(localAt + 14, true)).toBe(view.getUint32(at + 16, true))
      expect(view.getUint32(localAt + 22, true)).toBe(entry.bytes.length)

      at += 46 + nameLength
    }
    expect(at).toBe(end)
  })

  test('the bytes are stored verbatim, because nothing is compressed', () => {
    const payload = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
    const out = zip([{ path: 'x.bin', bytes: payload }], AT)

    // 30-byte header + the 5-character name.
    const dataAt = 30 + 5
    expect([...out.slice(dataAt, dataAt + payload.length)]).toEqual([...payload])
    // Stored: compressed and uncompressed sizes are the same number.
    const view = read(out)
    expect(view.getUint32(18, true)).toBe(view.getUint32(22, true))
    expect(view.getUint16(8, true)).toBe(0)
  })

  test('names are written as UTF-8 and the flag says so', () => {
    const out = zip([{ path: 'models/windmill.glb', bytes: new Uint8Array(1) }], AT)
    const view = read(out)
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
    expect(new TextDecoder().decode(out.slice(30, 30 + 19))).toBe('models/windmill.glb')
  })
})
