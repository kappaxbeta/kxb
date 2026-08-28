/**
 * A zip file, stored rather than deflated.
 *
 * ---------------------------------------------------------------------------
 * Why there is no dependency here
 * ---------------------------------------------------------------------------
 * An XP folder is `.png`, `.jpg`, `.webp`, `.mp3`, `.ogg`, `.mp4`, `.webm` and
 * `.glb` — every one of which is already a compressed container. Deflating them
 * saves a percent or two and costs real CPU on a box with 3.7GB across two
 * replicas. The one genuinely compressible member is the JSON, which is
 * kilobytes.
 *
 * So the compression this needs is *none*, and a zip with no compression is a
 * header, the bytes, and a table at the end. That is small enough to own, and
 * owning it means no third-party code in the path of the one feature that is
 * somebody's answer to "what happens to my work" (docs/xp/backend.md §7.0).
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not implement
 * ---------------------------------------------------------------------------
 * **Zip64.** The 32-bit fields here cap an archive at 4GB and an entry at 4GB,
 * and `CAPS` in `src/lib/xp-formats.ts` caps a folder at 128MB and a file at
 * 32MB. The caps are what make the simple format safe, so a change to them has
 * to come back here — which is why this comment names them rather than saying
 * "sizes are small".
 *
 * **Data descriptors.** They exist so a writer can emit the header before it
 * knows the CRC, which is what streaming from an unknown source needs. Every
 * caller here has the whole file in memory already, so the CRC is known first
 * and the simpler layout applies.
 */

/** Store, not deflate. See the header. */
const METHOD_STORE = 0

/**
 * Bit 11: the name is UTF-8.
 *
 * Without it a name outside ASCII is interpreted as CP437 by most readers, so
 * `café/putt.ogg` unpacks as `cafÃ©`. `checkPath` restricts paths to a-z, 0-9,
 * dot, dash and underscore — so this cannot matter today, and it is set anyway
 * because the day that rule relaxes is not the day anybody will remember a flag
 * bit in a file writer.
 */
const FLAG_UTF8 = 0x0800

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

let CRC_TABLE: Uint32Array | null = null

/** The standard CRC-32 table, built once on first use. */
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  CRC_TABLE = table
  return table
}

export function crc32(bytes: Uint8Array): number {
  const table = crcTable()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * MS-DOS time and date, which is what a zip stores.
 *
 * Two-second resolution and an epoch of 1980, both of which are the format's
 * and not a choice. A date before 1980 clamps rather than wrapping to something
 * absurd — an archive stamped 2071 because somebody's clock was wrong is worse
 * than one stamped 1980.
 */
export function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear())
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  }
}

export interface ZipEntry {
  /** The path inside the archive. Forward slashes, no leading slash. */
  path: string
  bytes: Uint8Array
}

/**
 * Build the whole archive in memory.
 *
 * In memory rather than streamed, and the cap is the reason it is defensible:
 * 128MB is the most a folder can be, and this box has held a 200MB image
 * re-encode already (`image-sanitize.ts`). Streaming would be better and it is
 * a different shape — the central directory has to know every entry's offset,
 * so a streaming writer emits it last while holding a table of what it wrote.
 * Worth doing when the cap moves, and only then.
 */
export function zip(entries: ZipEntry[], at: Date): Uint8Array {
  const stamp = dosStamp(at)
  const encoder = new TextEncoder()

  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const sum = crc32(entry.bytes)
    const size = entry.bytes.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, LOCAL_SIG, true)
    lv.setUint16(4, 20, true) // version needed to extract
    lv.setUint16(6, FLAG_UTF8, true)
    lv.setUint16(8, METHOD_STORE, true)
    lv.setUint16(10, stamp.time, true)
    lv.setUint16(12, stamp.date, true)
    lv.setUint32(14, sum, true)
    lv.setUint32(18, size, true) // compressed
    lv.setUint32(22, size, true) // uncompressed — the same, because stored
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // no extra field
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL_SIG, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, FLAG_UTF8, true)
    cv.setUint16(10, METHOD_STORE, true)
    cv.setUint16(12, stamp.time, true)
    cv.setUint16(14, stamp.date, true)
    cv.setUint32(16, sum, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attributes
    cv.setUint32(38, 0, true) // external attributes
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local, entry.bytes)
    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)

  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, END_SIG, true)
  ev.setUint16(4, 0, true) // this disk
  ev.setUint16(6, 0, true) // disk with the central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true) // no archive comment

  const parts = [...locals, ...centrals, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)

  const out = new Uint8Array(total)
  let at2 = 0
  for (const part of parts) {
    out.set(part, at2)
    at2 += part.length
  }
  return out
}
