/**
 * What may be in an XP folder, decided from the bytes.
 *
 * `docs/xp/backend.md` §1.1 is the table this implements and §5 is the pipeline
 * it is the first half of. The second half is `src/lib/xp-intake.ts`, which
 * rebuilds images, writes rows and needs `sharp` and a database. This file
 * needs neither.
 *
 * ---------------------------------------------------------------------------
 * Why this is pure, and not part of `xp-intake.ts`
 * ---------------------------------------------------------------------------
 * Because the editor has to run it too. §2 puts every cap in three places on
 * purpose - the editor, so a creator learns at the moment they drag a file in;
 * the route, because the editor is a client and clients lie; and a check
 * constraint, because a bug in the route should be a failed insert rather than
 * a filled disk. The first of those is a browser, so nothing here may import
 * `server-only`, `sharp`, or `node:*`.
 *
 * That is the same split, for the same reason, as `billing/tiers.ts` against
 * `billing/prices.ts` and `promo/application.ts` against `promo/mint.ts`.
 *
 * `Uint8Array` rather than `Buffer` for the same reason: `Buffer` is Node's,
 * and the editor has a `File`.
 *
 * ---------------------------------------------------------------------------
 * What a container parse is actually for
 * ---------------------------------------------------------------------------
 * An image is rebuilt from its pixels (`image-sanitize.ts`), which destroys
 * anything hiding in it whether or not a signature exists for the payload.
 * Audio, video and models are not rebuilt - transcoding is ffmpeg, a minute of
 * CPU and a container in the deploy, to address something that cannot execute
 * in a browser decoding it as media.
 *
 * So they get walked instead: every box, page or chunk from the first to the
 * last, confirming the declared lengths agree with the real one and that the
 * file **ends where its structure says it ends**. A polyglot is a valid file
 * with a payload appended, and appended is exactly what that catches.
 *
 * It is not a guarantee that the file is safe to decode. It is a guarantee that
 * the file is only what it claims to be, which is the property that makes "we
 * accept audio" a bounded statement instead of "we accept bytes".
 */

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

/**
 * `docs/xp/backend.md` §2, as numbers.
 *
 * Per-file caps are by *kind* rather than one figure, because the honest limit
 * for a sound effect and for a minute of video are two orders of magnitude
 * apart and a single number is either uselessly small for one or pointlessly
 * large for the other.
 */
export const CAPS = {
  /** Bytes, per file, by kind. */
  bytes: {
    document: 2 * 1024 * 1024,
    prose: 16 * 1024,
    data: 1024 * 1024,
    image: 8 * 1024 * 1024,
    audio: 8 * 1024 * 1024,
    video: 32 * 1024 * 1024,
    model: 16 * 1024 * 1024,
  },
  /** Bytes, across the whole folder. */
  folderBytes: 128 * 1024 * 1024,
  /**
   * Bytes, across everything a space holds, counted once per blob.
   *
   * Four folders' worth. Named here rather than left as `folderBytes * 4` at
   * the upload route, because the settings page prints it as the denominator
   * of a figure an owner is asked to plan against — and a ceiling somebody is
   * shown must be the same number that refuses them.
   */
  spaceBytes: 4 * 128 * 1024 * 1024,
  /** How many files a folder may hold. */
  files: 256,
  /** `a/b/c/file.png` is four. */
  pathDepth: 4,
  /** Nesting in a `.json` asset. A guard, not a preference - see `jsonDepthOf`. */
  jsonDepth: 32,
  /** How many pictures the store page will show. */
  previews: 8,
} as const

export type XpKind = keyof typeof CAPS.bytes

export interface XpType {
  kind: XpKind
  mime: string
  /** The extension this kind of file must carry. `jpg` also answers to `jpeg`. */
  ext: string
}

// ---------------------------------------------------------------------------
// Reading bytes
// ---------------------------------------------------------------------------

const ascii = (bytes: Uint8Array, at: number, length: number): string => {
  let out = ''
  for (let i = at; i < at + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i])
  return out
}

const u32be = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]

const u32le = (bytes: Uint8Array, at: number): number =>
  bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + ((bytes[at + 3] << 24) >>> 0)

/**
 * A 64-bit big-endian read, as a JS number.
 *
 * Precise to 2^53, which is eight petabytes - comfortably past any cap here, so
 * the loss of the top eleven bits cannot make an oversized file look small. The
 * caller checks against the file's real length anyway.
 */
const u64be = (bytes: Uint8Array, at: number): number => u32be(bytes, at) * 0x1_0000_0000 + u32be(bytes, at + 4)

const starts = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean => {
  if (bytes.length < at + signature.length) return false
  return signature.every((byte, index) => bytes[at + index] === byte)
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

/**
 * Identify a file from its contents, never from its name.
 *
 * `file.type` is whatever the operating system told the browser, or whatever an
 * attacker typed into a multipart header. Renaming `payload.mp4` to `photo.png`
 * defeats an extension check and does not defeat this - which is the whole
 * reason `src/lib/uploads.ts` has the same function and the same comment.
 *
 * **The four image signatures here duplicate that file's, deliberately.** That
 * one is `server-only` and scoped to the avatar and banner pipeline, with its
 * own cap and its own bucket. Importing it would drag `server-only` into the
 * editor's bundle for four byte comparisons. The drift that duplication invites
 * is held off by a test that asserts the two tables agree, which is a mechanism
 * where a comment saying "keep these in step" is a wish.
 */
const SIGNATURES: { type: XpType; test: (bytes: Uint8Array) => boolean }[] = [
  {
    type: { kind: 'image', mime: 'image/png', ext: 'png' },
    test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    type: { kind: 'image', mime: 'image/jpeg', ext: 'jpg' },
    test: (b) => starts(b, [0xff, 0xd8, 0xff]),
  },
  {
    type: { kind: 'image', mime: 'image/gif', ext: 'gif' },
    test: (b) => b.length > 6 && ascii(b, 0, 4) === 'GIF8',
  },
  {
    type: { kind: 'image', mime: 'image/webp', ext: 'webp' },
    test: (b) => b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP',
  },
  {
    type: { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' },
    test: (b) => ascii(b, 0, 4) === 'OggS',
  },
  {
    type: { kind: 'audio', mime: 'audio/wav', ext: 'wav' },
    test: (b) => b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE',
  },
  {
    type: { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' },
    // Either an ID3v2 tag or a bare frame sync. A bare sync is eleven set bits,
    // which is also what a corrupt file looks like - so this only claims the
    // file *might* be an mp3, and `walkMp3` is what decides.
    test: (b) => ascii(b, 0, 3) === 'ID3' || (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  {
    type: { kind: 'video', mime: 'video/mp4', ext: 'mp4' },
    // `>=`, not `>`: a bare ftyp box is size, type and one brand — exactly
    // twelve bytes — and `walkIsoBmff` is what decides whether the rest of the
    // file makes sense. Sniffing is only meant to say which walker to call.
    test: (b) => b.length >= 12 && ascii(b, 4, 4) === 'ftyp',
  },
  {
    type: { kind: 'video', mime: 'video/webm', ext: 'webm' },
    test: (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]),
  },
  {
    type: { kind: 'model', mime: 'model/gltf-binary', ext: 'glb' },
    test: (b) => ascii(b, 0, 4) === 'glTF',
  },
]

/** The kinds that are text and have no magic bytes: JSON, and the two named files. */
const TEXT_EXTS: Record<string, XpType> = {
  json: { kind: 'data', mime: 'application/json', ext: 'json' },
}

export function sniffXpType(bytes: Uint8Array): XpType | null {
  for (const signature of SIGNATURES) {
    if (signature.test(bytes)) return signature.type
  }
  return null
}

/** Extensions we accept, and what each must turn out to be. */
export function typeForExtension(ext: string): XpType | null {
  const normalised = ext === 'jpeg' ? 'jpg' : ext
  if (normalised in TEXT_EXTS) return TEXT_EXTS[normalised]
  return SIGNATURES.find((signature) => signature.type.ext === normalised)?.type ?? null
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * The two names a folder must carry exactly, if it carries them at all.
 *
 * Fixed rather than declared, because the alternative is a document that names
 * the file that describes it, which is a bootstrapping problem with no benefit.
 */
export const DOCUMENT_PATH = 'document.xp.json'
export const VISION_PATH = 'vision.json'
export const PREVIEW_DIR = 'preview/'

const SEGMENT = /^[a-z0-9._-]+$/

export type PathVerdict = { ok: true; ext: string } | { ok: false; reason: string }

/**
 * Is this a name a folder may contain?
 *
 * Run before a single byte is read, because the cheapest rejection is the one
 * that never opens anything.
 *
 * The danger is not `/etc/passwd`. The Storage API takes a key rather than a
 * filesystem path, so `..` is something narrower and just as bad: `a/../../b`
 * normalises into *another tenant's* prefix. That is `isSafeStorageKey`'s
 * argument in `src/lib/uploads.ts`, generalised from two segments to four.
 *
 * Lowercase only, and it is not fussiness. The Hetzner box is case-sensitive
 * and a designer's Mac is not, so `Rock.glb` and `rock.glb` are one file in the
 * editor and two in the bucket - and "it worked on my machine" about *filename
 * casing* is a support conversation nobody enjoys having twice.
 */
export function checkPath(path: string): PathVerdict {
  if (path.length === 0) return { ok: false, reason: 'A file needs a name' }
  if (path.length > 200) return { ok: false, reason: 'That path is too long' }
  if (path !== path.toLowerCase()) {
    return { ok: false, reason: `Use lowercase: ${path.toLowerCase()}` }
  }
  if (path.startsWith('/') || path.endsWith('/')) {
    return { ok: false, reason: 'A path cannot start or end with a slash' }
  }
  if (path.includes('//')) return { ok: false, reason: 'A path cannot contain an empty folder' }
  if (path.includes('\\') || path.includes('\0')) {
    return { ok: false, reason: 'A path cannot contain a backslash or a null byte' }
  }

  const segments = path.split('/')
  if (segments.length > CAPS.pathDepth) {
    return { ok: false, reason: `At most ${CAPS.pathDepth} folders deep` }
  }
  for (const segment of segments) {
    // `.` and `..` are covered by SEGMENT rejecting a segment that is only
    // dots, but they are checked by name first so the message can say why.
    if (segment === '.' || segment === '..') {
      return { ok: false, reason: 'A path cannot contain . or ..' }
    }
    if (!SEGMENT.test(segment)) {
      return { ok: false, reason: `"${segment}" may only use a-z, 0-9, dot, dash and underscore` }
    }
  }

  const name = segments[segments.length - 1]
  // The document is `document.xp.json`, whose *last* dot-part is the extension
  // and whose middle one is not a second extension. Splitting on the last dot
  // is what makes that work without a special case.
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) {
    return { ok: false, reason: `"${name}" needs an extension` }
  }

  return { ok: true, ext: name.slice(dot + 1) }
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export type ContainerVerdict = { ok: true } | { ok: false; reason: string }

const OK: ContainerVerdict = { ok: true }
const bad = (reason: string): ContainerVerdict => ({ ok: false, reason })

/**
 * Walk an Ogg page stream to the end.
 *
 * A page is a 27-byte header, then a segment table of `pageSegments` bytes,
 * then the sum of those bytes as payload. Every page begins `OggS`, so a file
 * with something appended either fails the capture pattern at the join or runs
 * past its own end.
 */
function walkOgg(bytes: Uint8Array): ContainerVerdict {
  let at = 0
  let pages = 0

  while (at < bytes.length) {
    if (ascii(bytes, at, 4) !== 'OggS') return bad('Extra data after the last Ogg page')
    if (at + 27 > bytes.length) return bad('An Ogg page header runs past the end of the file')
    // Byte 4 is the bitstream revision, and it has been 0 since 2002. Anything
    // else is not an Ogg file we can reason about.
    if (bytes[at + 4] !== 0) return bad('Unknown Ogg version')

    const pageSegments = bytes[at + 26]
    const tableAt = at + 27
    if (tableAt + pageSegments > bytes.length) return bad('An Ogg segment table runs past the end')

    let payload = 0
    for (let i = 0; i < pageSegments; i += 1) payload += bytes[tableAt + i]

    at = tableAt + pageSegments + payload
    if (at > bytes.length) return bad('An Ogg page claims more data than the file holds')
    pages += 1
  }

  return pages > 0 ? OK : bad('No Ogg pages')
}

/**
 * Walk a RIFF chunk list, used by WAV.
 *
 * The outer size field counts everything after the first eight bytes, so a file
 * with a payload appended has an outer size smaller than the file - which is
 * the check, and it is one comparison.
 */
function walkRiff(bytes: Uint8Array): ContainerVerdict {
  if (bytes.length < 12) return bad('Too short to be a RIFF file')

  const declared = u32le(bytes, 4)
  if (declared + 8 !== bytes.length) {
    return bad(`RIFF says it is ${declared + 8} bytes and the file is ${bytes.length}`)
  }

  let at = 12
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return bad('A RIFF chunk header runs past the end of the file')
    const size = u32le(bytes, at + 4)
    // Chunks are padded to an even length, and the pad byte is not counted in
    // the size. Missing this reads the pad as the next chunk's id.
    at += 8 + size + (size % 2)
    if (at > bytes.length) return bad('A RIFF chunk claims more data than the file holds')
  }

  return OK
}

const MP3_BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1,
] as const
const MP3_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1] as const
const MP3_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000, -1], // MPEG 1
  2: [22050, 24000, 16000, -1], // MPEG 2
  0: [11025, 12000, 8000, -1], // MPEG 2.5
}

/**
 * Walk an MPEG audio frame stream.
 *
 * The one format here with no box tree: an mp3 is frames back to back, each
 * with a four-byte header from which its own length is computed. So "walk to
 * the end" means computing every frame's length and confirming they tile the
 * file exactly.
 *
 * Two legal things sit outside the frames and are skipped rather than walked:
 * an ID3v2 tag at the front, whose 28-bit synchsafe size is its own small
 * puzzle, and a 128-byte ID3v1 tag at the back. Both are metadata containers
 * that hold arbitrary bytes by design, which is why the *rest* has to tile.
 */
function walkMp3(bytes: Uint8Array): ContainerVerdict {
  let at = 0
  let end = bytes.length

  if (ascii(bytes, 0, 3) === 'ID3') {
    if (bytes.length < 10) return bad('Truncated ID3 tag')
    // Synchsafe: seven bits per byte, so no byte can look like a frame sync.
    const size =
      (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]
    const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0
    at = 10 + size + footer
    if (at > bytes.length) return bad('The ID3 tag runs past the end of the file')
  }

  if (end >= 128 && ascii(bytes, end - 128, 3) === 'TAG') end -= 128

  let frames = 0
  while (at < end) {
    if (at + 4 > end) return bad('An MPEG frame header runs past the end of the file')
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) {
      return bad(`Not an MPEG frame at byte ${at} — extra data in the file`)
    }

    const version = (bytes[at + 1] >> 3) & 0x03
    const layer = (bytes[at + 1] >> 1) & 0x03
    const bitrateIndex = (bytes[at + 2] >> 4) & 0x0f
    const rateIndex = (bytes[at + 2] >> 2) & 0x03
    const padding = (bytes[at + 2] >> 1) & 0x01

    if (version === 1) return bad('Reserved MPEG version')
    // 01 is Layer III. Layers I and II have their own bitrate tables, which are
    // not here - and rather than carry two more tables for formats nothing has
    // emitted in twenty years, this refuses them by name. Guessing a length
    // from the wrong table would mis-tile the file and report the *next* frame
    // as extra data, which is a confusing way to say "unsupported".
    if (layer !== 1) return bad('Only MPEG Layer III (mp3) is read here')

    const rate = MP3_RATES[version]?.[rateIndex] ?? -1
    if (rate <= 0) return bad('Reserved MPEG sample rate')

    const table = version === 3 ? MP3_BITRATES_V1_L3 : MP3_BITRATES_V2_L3
    const bitrate = table[bitrateIndex]
    // 0 is "free format", where the frame length is not in the header at all
    // and has to be found by scanning for the next sync. Refused rather than
    // supported: no encoder anybody uses emits it, and the scan is exactly the
    // kind of resynchronising guesswork this function exists to avoid.
    if (bitrate <= 0) return bad('Free-format or reserved MPEG bitrate')

    // 1152 samples a frame on MPEG 1, 576 on the half-rate versions - which is
    // where the 144 and the 72 come from (samples per frame / 8 bits).
    const length =
      Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / rate) + padding

    if (length <= 4) return bad('Nonsensical MPEG frame length')
    at += length
    frames += 1
  }

  if (at !== end) return bad('The last MPEG frame runs past the end of the file')
  return frames > 0 ? OK : bad('No MPEG frames')
}

/**
 * Walk an ISO base media file's top-level boxes, used by MP4.
 *
 * `size` of 1 means a 64-bit size follows the type; `size` of 0 means "to the
 * end of the file" and may only appear on the last box. Both are in the spec
 * and both are how a lazy walker reads a payload as part of the file.
 */
function walkIsoBmff(bytes: Uint8Array): ContainerVerdict {
  let at = 0
  let sawFtyp = false

  while (at < bytes.length) {
    if (at + 8 > bytes.length) return bad('An MP4 box header runs past the end of the file')

    let size = u32be(bytes, at)
    const type = ascii(bytes, at + 4, 4)
    let header = 8

    if (size === 1) {
      if (at + 16 > bytes.length) return bad('A 64-bit MP4 box header runs past the end')
      size = u64be(bytes, at + 8)
      header = 16
    } else if (size === 0) {
      // Legal, and only as the final box. Treating it as "the rest" is correct
      // *and* is exactly what makes appended bytes invisible - so it is only
      // accepted when it is genuinely last, which it is by construction here:
      // the loop ends after it.
      size = bytes.length - at
    }

    if (size < header) return bad(`MP4 box "${type}" declares an impossible size`)
    if (at + size > bytes.length) {
      return bad(`MP4 box "${type}" claims more data than the file holds`)
    }
    if (at === 0 && type !== 'ftyp') return bad('An MP4 file must start with ftyp')
    if (type === 'ftyp') sawFtyp = true

    at += size
  }

  if (at !== bytes.length) return bad('Extra data after the last MP4 box')
  return sawFtyp ? OK : bad('No ftyp box')
}

/** An EBML variable-length integer: the first set bit says how many bytes it spans. */
function readVint(
  bytes: Uint8Array,
  at: number,
  stripMarker: boolean,
): { value: number; width: number; unknown: boolean } | null {
  if (at >= bytes.length) return null
  const first = bytes[at]
  if (first === 0) return null

  let width = 1
  let mask = 0x80
  while ((first & mask) === 0) {
    width += 1
    mask >>= 1
  }
  if (width > 8 || at + width > bytes.length) return null

  let value = stripMarker ? first & (mask - 1) : first
  let allOnes = (first & (mask - 1)) === mask - 1
  for (let i = 1; i < width; i += 1) {
    value = value * 256 + bytes[at + i]
    if (bytes[at + i] !== 0xff) allOnes = false
  }

  return { value, width, unknown: stripMarker && allOnes }
}

/**
 * Walk a WebM/Matroska file's top-level elements.
 *
 * The one container here that legitimately does not know its own length. A
 * Segment written by a live encoder carries the "unknown size" vint - every
 * data bit set - because the length was not known when the header was written.
 * Refusing those would refuse a large share of real WebM in the world.
 *
 * So an unknown size is accepted as "to the end of the file", and the honest
 * consequence is written here rather than left implicit: **a WebM whose Segment
 * has unknown size cannot be proved free of trailing data.** It is the one hole
 * in §5.3's guarantee, it is narrow - the payload would have to be inside a
 * streaming container to be reached at all - and the alternative is refusing
 * valid files.
 */
function walkEbml(bytes: Uint8Array): ContainerVerdict {
  let at = 0
  let elements = 0

  while (at < bytes.length) {
    const id = readVint(bytes, at, false)
    if (!id) return bad(`Not an EBML element at byte ${at}`)
    const size = readVint(bytes, at + id.width, true)
    if (!size) return bad(`Unreadable EBML size at byte ${at + id.width}`)

    const dataAt = at + id.width + size.width
    if (size.unknown) return elements >= 0 ? OK : bad('No EBML elements')

    at = dataAt + size.value
    if (at > bytes.length) return bad('An EBML element claims more data than the file holds')
    elements += 1
  }

  return elements > 0 ? OK : bad('No EBML elements')
}

const GLB_JSON = 0x4e4f534a // 'JSON'
const GLB_BIN = 0x004e4942 // 'BIN\0'

export interface GlbParse {
  ok: true
  /** The JSON chunk, already parsed. The caller checks what is in it. */
  json: unknown
}

/**
 * Walk a GLB and hand back its JSON chunk.
 *
 * `docs/xp/backend.md` §5.4 is the list. The one that matters is not in the
 * structure at all - it is that the JSON chunk must not name an external `uri`,
 * because a model that fetches from somewhere else when a level loads is both a
 * beacon that reports every player's IP to whoever the author chose and a way
 * to change what a reviewed XP does *after* it was reviewed. That check is
 * `externalUrisIn` below, because it is about meaning rather than about bytes.
 */
export function parseGlb(bytes: Uint8Array): GlbParse | { ok: false; reason: string } {
  if (bytes.length < 12) return { ok: false, reason: 'Too short to be a GLB' }
  if (ascii(bytes, 0, 4) !== 'glTF') return { ok: false, reason: 'Not a GLB' }

  const version = u32le(bytes, 4)
  if (version !== 2) return { ok: false, reason: `GLB version ${version}, and we read 2` }

  const declared = u32le(bytes, 8)
  if (declared !== bytes.length) {
    return { ok: false, reason: `The GLB says it is ${declared} bytes and the file is ${bytes.length}` }
  }

  let at = 12
  let json: unknown = undefined
  let sawBin = false

  while (at < bytes.length) {
    if (at + 8 > bytes.length) return { ok: false, reason: 'A GLB chunk header runs past the end' }
    const length = u32le(bytes, at)
    const type = u32le(bytes, at + 4)
    const dataAt = at + 8

    if (dataAt + length > bytes.length) {
      return { ok: false, reason: 'A GLB chunk claims more data than the file holds' }
    }

    if (type === GLB_JSON) {
      if (json !== undefined) return { ok: false, reason: 'More than one JSON chunk' }
      if (at !== 12) return { ok: false, reason: 'The JSON chunk must come first' }
      try {
        json = JSON.parse(new TextDecoder().decode(bytes.subarray(dataAt, dataAt + length)))
      } catch {
        return { ok: false, reason: "The GLB's JSON chunk does not parse" }
      }
    } else if (type === GLB_BIN) {
      if (json === undefined) return { ok: false, reason: 'A BIN chunk before the JSON chunk' }
      if (sawBin) return { ok: false, reason: 'More than one BIN chunk' }
      sawBin = true
    }
    // Any other chunk type is skipped, which the spec requires of a reader.

    // Chunks are padded to a four-byte boundary and the pad is not counted.
    at = dataAt + length + ((4 - (length % 4)) % 4)
  }

  if (at !== bytes.length) return { ok: false, reason: 'Extra data after the last GLB chunk' }
  if (json === undefined) return { ok: false, reason: 'No JSON chunk' }

  return { ok: true, json }
}

/**
 * Every `uri` in a glTF JSON tree that is not a `data:` URI.
 *
 * A whole-tree walk rather than reading `buffers[].uri` and `images[].uri` by
 * name. Those are the two places the spec puts them, and a walk also catches
 * the third place a future spec version puts one - and costs nothing on a tree
 * that has already been parsed.
 */
export function externalUrisIn(json: unknown): string[] {
  const found: string[] = []

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node === null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'uri' && typeof value === 'string') {
        if (!value.startsWith('data:')) found.push(value)
      } else {
        walk(value)
      }
    }
  }

  walk(json)
  return found
}

/**
 * How deep a parsed JSON value nests.
 *
 * Iterative rather than recursive, because the input is hostile: a file nested
 * forty thousand deep would take the stack out on the way to reporting that it
 * is nested too deep, which is the bug this check exists to prevent happening
 * somewhere else.
 */
export function jsonDepthOf(value: unknown): number {
  let deepest = 0
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }]

  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number }
    if (depth > deepest) deepest = depth
    // No point walking further once it has failed; the answer is already "too
    // deep" and a hostile file is exactly the one that would make us walk it.
    if (deepest > CAPS.jsonDepth) return deepest
    if (node === null || typeof node !== 'object') continue
    for (const child of Object.values(node as Record<string, unknown>)) {
      stack.push({ node: child, depth: depth + 1 })
    }
  }

  return deepest
}

/**
 * The structural check for one file, given what it was sniffed as.
 *
 * Images are absent on purpose. Their check is the rebuild in
 * `image-sanitize.ts`, which is stronger than any walk: nothing that is not a
 * pixel survives a decode and a re-encode. Walking a PNG's chunks would be a
 * weaker check dressed as a second one.
 */
export function checkContainer(bytes: Uint8Array, type: XpType): ContainerVerdict {
  switch (type.ext) {
    case 'ogg':
      return walkOgg(bytes)
    case 'wav':
      return walkRiff(bytes)
    case 'mp3':
      return walkMp3(bytes)
    case 'mp4':
      return walkIsoBmff(bytes)
    case 'webm':
      return walkEbml(bytes)
    case 'glb': {
      const parsed = parseGlb(bytes)
      if (!parsed.ok) return bad(parsed.reason)
      const external = externalUrisIn(parsed.json)
      if (external.length > 0) {
        return bad(
          `This model loads ${external.length === 1 ? 'a file' : 'files'} from somewhere else (${external[0]}). Export it with the textures embedded.`,
        )
      }
      return OK
    }
    default:
      return OK
  }
}
