import { describe, expect, test } from 'bun:test'
import { sniffImageType } from '@/lib/uploads'
import {
  CAPS,
  checkContainer,
  checkPath,
  externalUrisIn,
  jsonDepthOf,
  parseGlb,
  sniffXpType,
  typeForExtension,
} from '@/lib/xp-formats'

/**
 * A corpus, not a suite.
 *
 * Every container walker here exists to answer one question - *is this file
 * only what it claims to be* - and the only way to know it answers it is to
 * hand it files that are nearly right. So most of what follows builds a valid
 * file and then breaks it in one specific way, because a test that only feeds
 * it garbage proves the easy half.
 *
 * The builders are the interesting part and they are deliberately explicit
 * rather than pulled from fixture files: a checked-in `.mp4` is a thing nobody
 * can read the bytes of when a test fails, and "a payload after the last box"
 * is a property of the construction rather than of any particular file.
 */

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array => {
  const flat: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') {
      for (const char of part) flat.push(char.charCodeAt(0))
    } else {
      for (const byte of part) flat.push(byte)
    }
  }
  return Uint8Array.from(flat)
}

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

/** One Ogg page carrying `payload` bytes, in a single segment. */
function oggPage(payload = 4): Uint8Array {
  return bytes(
    'OggS',
    [0], // version
    [0x02], // header type: first page
    [0, 0, 0, 0, 0, 0, 0, 0], // granule
    [1, 0, 0, 0], // serial
    [0, 0, 0, 0], // sequence
    [0, 0, 0, 0], // checksum, not verified here
    [1], // one segment
    [payload], // its length
    new Uint8Array(payload),
  )
}

/** A RIFF/WAVE with one `data` chunk of `size` bytes. */
function wav(size = 4, { lie = 0 } = {}): Uint8Array {
  const body = bytes('WAVE', 'data', le32(size), new Uint8Array(size + (size % 2)))
  return bytes('RIFF', le32(body.length + lie), body)
}

/**
 * An MPEG 1 Layer III frame at 128kbps / 44100Hz.
 *
 * 144 * 128000 / 44100 = 417.9…, floored to 417, plus no padding.
 */
const MP3_FRAME_BYTES = 417
function mp3Frame(): Uint8Array {
  return bytes(
    // 0xFF FB = sync, MPEG1, Layer III, no CRC.
    // 0x90    = bitrate index 9 (128k), rate index 0 (44100), no padding.
    // 0xC0    = mono.
    [0xff, 0xfb, 0x90, 0xc0],
    new Uint8Array(MP3_FRAME_BYTES - 4),
  )
}

/** An ID3v2 header declaring `size` bytes of tag body. */
function id3(size: number): Uint8Array {
  return bytes(
    'ID3',
    [3, 0], // version
    [0], // flags: no footer
    [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f],
    new Uint8Array(size),
  )
}

const box = (type: string, body: Uint8Array = new Uint8Array(0)): Uint8Array =>
  bytes(be32(body.length + 8), type, body)

const mp4 = (...boxes: Uint8Array[]): Uint8Array =>
  bytes(box('ftyp', bytes('isom')), ...boxes)

/** An EBML element with a one-byte id and a one-byte size. */
const ebml = (id: number[], body: Uint8Array): Uint8Array =>
  bytes(id, [0x80 | body.length], body)

const webm = (segmentBody: Uint8Array = new Uint8Array(2)): Uint8Array =>
  bytes(
    ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array(4)),
    ebml([0x18, 0x53, 0x80, 0x67], segmentBody),
  )

const pad4 = (n: number) => (4 - (n % 4)) % 4

/** A GLB whose JSON chunk is `json`, optionally with a BIN chunk. */
function glb(
  json: unknown,
  { binBytes = 0, version = 2, lie = 0, chunks = [] as Uint8Array[] } = {},
): Uint8Array {
  const jsonText = JSON.stringify(json)
  const jsonPad = pad4(jsonText.length)
  const jsonChunk = bytes(
    le32(jsonText.length),
    le32(0x4e4f534a),
    jsonText,
    new Uint8Array(jsonPad),
  )
  const binChunk =
    binBytes > 0
      ? bytes(le32(binBytes), le32(0x004e4942), new Uint8Array(binBytes + pad4(binBytes)))
      : new Uint8Array(0)

  const body = bytes(jsonChunk, binChunk, ...chunks)
  return bytes('glTF', le32(version), le32(body.length + 12 + lie), body)
}

const MINIMAL_GLTF = { asset: { version: '2.0' }, scenes: [], nodes: [] }

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

describe('paths', () => {
  test('an ordinary path is fine and reports its extension', () => {
    expect(checkPath('models/windmill.glb')).toEqual({ ok: true, ext: 'glb' })
    expect(checkPath('preview/01-cover.png')).toEqual({ ok: true, ext: 'png' })
  })

  test('the document is not read as having two extensions', () => {
    // `document.xp.json` splits on the LAST dot, so `xp` is part of the name.
    expect(checkPath('document.xp.json')).toEqual({ ok: true, ext: 'json' })
  })

  /**
   * The one that matters. Next decodes `%2e%2e%2f` before a route sees it, so
   * a path built by concatenation is a real traversal - and on Storage it is
   * not `/etc/passwd`, it is another tenant's prefix.
   */
  test('traversal is refused wherever the dots are', () => {
    for (const path of [
      '../secrets.json',
      'models/../../other/secrets.json',
      'a/../b.png',
      '..',
      'models/..',
      '/etc/passwd',
      'models//windmill.glb',
      'models\\windmill.glb',
    ]) {
      expect(checkPath(path).ok).toBe(false)
    }
  })

  test('a null byte is refused', () => {
    expect(checkPath('models/wind\0mill.glb').ok).toBe(false)
  })

  test('uppercase is refused, and the message says what to use', () => {
    const verdict = checkPath('Models/Windmill.glb')
    expect(verdict.ok).toBe(false)
    // The Hetzner box is case-sensitive and a Mac is not; two files that differ
    // only in case are one file in the editor and two in the bucket.
    if (!verdict.ok) expect(verdict.reason).toContain('models/windmill.glb')
  })

  test('deeper than the cap is refused', () => {
    expect(checkPath('a/b/c/d.png').ok).toBe(true)
    expect(checkPath('a/b/c/d/e.png').ok).toBe(false)
    expect(CAPS.pathDepth).toBe(4)
  })

  test('a file with no extension is refused', () => {
    expect(checkPath('models/windmill').ok).toBe(false)
    expect(checkPath('models/windmill.').ok).toBe(false)
    expect(checkPath('.gitignore').ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

describe('signatures', () => {
  test('a PNG whose bytes are an MP4 sniffs as an MP4', () => {
    // The rename attack, and the reason nothing here reads `file.type`.
    const disguised = mp4()
    expect(sniffXpType(disguised)?.ext).toBe('mp4')
  })

  test('the image table agrees with the uploads pipeline', () => {
    /**
     * The mechanism that holds the duplication in `xp-formats.ts` together.
     * Both files sniff PNG, JPEG, GIF and WebP and neither can import the
     * other - one is `server-only` and this one runs in the editor - so the
     * thing that stops them drifting is this test rather than a comment asking
     * nicely.
     */
    const samples: [string, Uint8Array][] = [
      ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], new Uint8Array(8))],
      ['jpg', bytes([0xff, 0xd8, 0xff], new Uint8Array(8))],
      ['gif', bytes('GIF89a', new Uint8Array(8))],
      ['webp', bytes('RIFF', le32(16), 'WEBP', new Uint8Array(8))],
    ]

    for (const [ext, sample] of samples) {
      const ours = sniffXpType(sample)
      const theirs = sniffImageType(Buffer.from(sample))
      expect(ours?.ext).toBe(ext)
      expect(theirs?.ext).toBe(ext)
      expect(ours?.mime).toBe(theirs?.mime as string)
    }
  })

  test('unknown bytes sniff as nothing', () => {
    expect(sniffXpType(bytes('not a file at all'))).toBeNull()
  })

  test('jpeg and jpg name the same type, and svg names none', () => {
    expect(typeForExtension('jpeg')?.ext).toBe('jpg')
    expect(typeForExtension('svg')).toBeNull()
    expect(typeForExtension('html')).toBeNull()
    expect(typeForExtension('js')).toBeNull()
    expect(typeForExtension('gltf')).toBeNull()
    expect(typeForExtension('zip')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

const OGG = { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' } as const
const WAV = { kind: 'audio', mime: 'audio/wav', ext: 'wav' } as const
const MP3 = { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' } as const
const MP4 = { kind: 'video', mime: 'video/mp4', ext: 'mp4' } as const
const WEBM = { kind: 'video', mime: 'video/webm', ext: 'webm' } as const
const GLB = { kind: 'model', mime: 'model/gltf-binary', ext: 'glb' } as const

describe('ogg', () => {
  test('pages that tile the file exactly', () => {
    expect(checkContainer(bytes(oggPage(), oggPage(8)), OGG).ok).toBe(true)
  })

  test('a payload after the last page is caught', () => {
    const poisoned = bytes(oggPage(), 'MZ this is a windows executable')
    expect(checkContainer(poisoned, OGG).ok).toBe(false)
  })

  test('a page claiming more than the file holds is caught', () => {
    const truncated = bytes(oggPage()).subarray(0, 30)
    expect(checkContainer(truncated, OGG).ok).toBe(false)
  })
})

describe('riff / wav', () => {
  test('a well-formed wav', () => {
    expect(checkContainer(wav(), WAV).ok).toBe(true)
  })

  test('odd-sized chunks are padded, and the pad is not a chunk id', () => {
    expect(checkContainer(wav(5), WAV).ok).toBe(true)
  })

  test('a payload after the declared size is caught', () => {
    expect(checkContainer(bytes(wav(), 'appended'), WAV).ok).toBe(false)
  })

  test('a RIFF size that disagrees with the file is caught', () => {
    expect(checkContainer(wav(4, { lie: 4 }), WAV).ok).toBe(false)
  })
})

describe('mp3', () => {
  test('frames that tile the file', () => {
    expect(checkContainer(bytes(mp3Frame(), mp3Frame()), MP3).ok).toBe(true)
  })

  test('an ID3v2 tag is skipped rather than walked', () => {
    expect(checkContainer(bytes(id3(64), mp3Frame()), MP3).ok).toBe(true)
  })

  test('an ID3v1 tag at the end is skipped', () => {
    expect(
      checkContainer(bytes(mp3Frame(), 'TAG', new Uint8Array(125)), MP3).ok,
    ).toBe(true)
  })

  test('a payload after the last frame is caught', () => {
    expect(checkContainer(bytes(mp3Frame(), 'MZ payload'), MP3).ok).toBe(false)
  })

  test('an ID3 tag claiming more than the file holds is caught', () => {
    expect(checkContainer(id3(64).subarray(0, 20), MP3).ok).toBe(false)
  })

  test('a truncated final frame is caught', () => {
    expect(checkContainer(bytes(mp3Frame()).subarray(0, 300), MP3).ok).toBe(false)
  })
})

describe('mp4', () => {
  test('boxes that tile the file', () => {
    expect(checkContainer(mp4(box('free'), box('mdat', new Uint8Array(16))), MP4).ok).toBe(true)
  })

  test('a payload after the last box is caught', () => {
    // The canonical polyglot: a valid MP4 with something stapled to the end.
    expect(checkContainer(bytes(mp4(box('free')), 'MZ payload'), MP4).ok).toBe(false)
  })

  test('a box claiming more than the file holds is caught', () => {
    const lying = bytes('ftyp'.length ? be32(999) : [], 'ftyp', 'isom')
    expect(checkContainer(lying, MP4).ok).toBe(false)
  })

  test('a file that does not start with ftyp is caught', () => {
    expect(checkContainer(box('mdat', new Uint8Array(8)), MP4).ok).toBe(false)
  })

  test('a box declaring a size smaller than its own header is caught', () => {
    expect(checkContainer(bytes(be32(4), 'ftyp'), MP4).ok).toBe(false)
  })

  test('the 64-bit size form is read', () => {
    const body = new Uint8Array(8)
    const large = bytes(be32(1), 'mdat', be32(0), be32(24), body)
    expect(checkContainer(bytes(mp4(), large), MP4).ok).toBe(true)
  })
})

describe('webm', () => {
  test('elements that tile the file', () => {
    expect(checkContainer(webm(), WEBM).ok).toBe(true)
  })

  test('an element claiming more than the file holds is caught', () => {
    const lying = bytes(ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array(4)), [0x18, 0x53, 0x80, 0x67], [0xff & 0x9f])
    expect(checkContainer(lying, WEBM).ok).toBe(false)
  })

  /**
   * Documented rather than fixed. A Segment written by a live encoder carries
   * the unknown-size vint because the length was not known when the header was
   * written, and refusing those refuses a large share of real WebM. The hole
   * this leaves is in `walkEbml`'s comment.
   */
  test('an unknown-size segment is accepted, and so is anything after it', () => {
    const streaming = bytes(
      ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array(4)),
      [0x18, 0x53, 0x80, 0x67],
      [0xff],
      'whatever follows',
    )
    expect(checkContainer(streaming, WEBM).ok).toBe(true)
  })
})

describe('glb', () => {
  test('a minimal model', () => {
    expect(checkContainer(glb(MINIMAL_GLTF), GLB).ok).toBe(true)
  })

  test('a model with a BIN chunk', () => {
    expect(checkContainer(glb(MINIMAL_GLTF, { binBytes: 16 }), GLB).ok).toBe(true)
  })

  test('a declared length that disagrees with the file is caught', () => {
    expect(checkContainer(glb(MINIMAL_GLTF, { lie: 8 }), GLB).ok).toBe(false)
  })

  test('a version other than 2 is refused', () => {
    expect(checkContainer(glb(MINIMAL_GLTF, { version: 1 }), GLB).ok).toBe(false)
  })

  test('a payload after the last chunk is caught', () => {
    expect(checkContainer(bytes(glb(MINIMAL_GLTF), 'MZ payload'), GLB).ok).toBe(false)
  })

  test('a truncated model is caught', () => {
    const whole = glb(MINIMAL_GLTF, { binBytes: 32 })
    expect(checkContainer(whole.subarray(0, whole.length - 8), GLB).ok).toBe(false)
  })

  test('two JSON chunks are refused', () => {
    const second = (() => {
      const text = JSON.stringify(MINIMAL_GLTF)
      return bytes(le32(text.length), le32(0x4e4f534a), text, new Uint8Array(pad4(text.length)))
    })()
    expect(checkContainer(glb(MINIMAL_GLTF, { chunks: [second] }), GLB).ok).toBe(false)
  })

  test('an unknown chunk type is skipped, as the spec requires', () => {
    const unknown = bytes(le32(4), le32(0x11223344), new Uint8Array(4))
    expect(checkContainer(glb(MINIMAL_GLTF, { chunks: [unknown] }), GLB).ok).toBe(true)
  })

  /**
   * The check that is not about bytes at all.
   *
   * A model that fetches from somewhere else when a level loads is a beacon
   * reporting every player's IP to whoever the author chose, and a way to
   * change what a reviewed XP does after it was reviewed.
   */
  test('a model that fetches from somewhere else is refused', () => {
    const remote = {
      asset: { version: '2.0' },
      buffers: [{ uri: 'https://someone.example/payload.bin', byteLength: 4 }],
    }
    const verdict = checkContainer(glb(remote), GLB)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('someone.example')
  })

  test('a relative uri is refused too, not only an absolute one', () => {
    // `windmill.bin` beside the file is still a second file, and the whole
    // reason `.gltf` is not accepted is that it names other files.
    const sidecar = { asset: { version: '2.0' }, buffers: [{ uri: 'windmill.bin' }] }
    expect(checkContainer(glb(sidecar), GLB).ok).toBe(false)
  })

  test('an embedded data uri is fine', () => {
    const embedded = {
      asset: { version: '2.0' },
      images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }],
    }
    expect(checkContainer(glb(embedded), GLB).ok).toBe(true)
  })

  test('a uri nested anywhere in the tree is found', () => {
    expect(
      externalUrisIn({ a: [{ b: { extensions: { thing: { uri: 'http://x.example/y' } } } }] }),
    ).toEqual(['http://x.example/y'])
  })

  test('a JSON chunk that does not parse is caught', () => {
    const broken = bytes('glTF', le32(2), le32(12 + 8 + 4), le32(4), le32(0x4e4f534a), '{{{{')
    const parsed = parseGlb(broken)
    expect(parsed.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

describe('json depth', () => {
  test('a flat object is one deep', () => {
    expect(jsonDepthOf({ a: 1, b: 2 })).toBe(2)
    expect(jsonDepthOf(1)).toBe(1)
  })

  test('nesting is counted through arrays as well as objects', () => {
    expect(jsonDepthOf({ a: [{ b: [1] }] })).toBe(5)
  })

  /**
   * Built as a string and parsed, because that is how it would arrive. The
   * function is iterative for this exact input: a recursive walk would take the
   * stack out on the way to reporting that the file is too deep.
   */
  test('a hostile nesting is reported rather than crashing', () => {
    const deep = JSON.parse(`${'['.repeat(4000)}1${']'.repeat(4000)}`)
    expect(jsonDepthOf(deep)).toBeGreaterThan(CAPS.jsonDepth)
  })

  test('forty deep is over the cap and thirty is not', () => {
    const nest = (n: number): unknown => (n === 0 ? 1 : { a: nest(n - 1) })
    expect(jsonDepthOf(nest(40))).toBeGreaterThan(CAPS.jsonDepth)
    expect(jsonDepthOf(nest(30))).toBeLessThanOrEqual(CAPS.jsonDepth)
  })
})
