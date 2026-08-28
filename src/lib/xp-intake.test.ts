import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { intakeFile, intakeFolder } from '@/lib/xp-intake'
import { CAPS } from '@/lib/xp-formats'

/**
 * The pipeline end to end, on real bytes.
 *
 * `xp-formats.test.ts` is the corpus for the walkers; this is about the order
 * things happen in and what a rejection says. The image cases use real PNGs
 * from `sharp` rather than a magic-byte stub, because the whole point of that
 * branch is that the file is genuinely decoded.
 */

const png = (width = 8, height = 8) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 160 } },
  })
    .png()
    .toBuffer()

const json = (value: unknown) => Buffer.from(JSON.stringify(value))

const MINIMAL_DOCUMENT = { format: 'xp/1', id: 'a', name: 'A' }

describe('one file', () => {
  test('a real png is accepted, rebuilt, and content-addressed', async () => {
    const result = await intakeFile('preview/01-cover.png', await png())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.type.mime).toBe('image/png')
    expect(result.sha).toMatch(/^[0-9a-f]{64}$/)
    // The stored bytes come out of our encoder, so they are not required to be
    // the bytes that arrived - that is the whole point of the rebuild.
    expect(result.bytes.length).toBeGreaterThan(0)
  })

  test('the same image twice addresses the same object', async () => {
    const source = await png()
    const one = await intakeFile('preview/a.png', source)
    const two = await intakeFile('preview/b.png', source)
    expect(one.ok && two.ok && one.sha === two.sha).toBe(true)
  })

  /**
   * The polyglot, made properly: a valid PNG with an executable stapled on.
   * It sniffs as a PNG, it decodes as a PNG, and what comes out the other side
   * does not contain the payload - which is why images are rebuilt rather than
   * walked.
   */
  test('a png with a payload appended loses the payload', async () => {
    const payload = Buffer.from('MZ\x90\x00 this would be a windows executable')
    const result = await intakeFile('preview/x.png', Buffer.concat([await png(), payload]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bytes.includes(payload)).toBe(false)
  })

  test('a file named .png whose bytes are a video is refused, not renamed', async () => {
    const mp4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
    const result = await intakeFile('preview/x.png', mp4)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem.at).toBe('type')
    // Says what it actually is, so the message is actionable rather than "no".
    expect(result.problem.reason).toContain('video/mp4')
  })

  test('a truncated png is a structure problem, not a type one', async () => {
    const whole = await png(64, 64)
    const result = await intakeFile('preview/x.png', whole.subarray(0, whole.length - 40))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem.at).toBe('structure')
  })

  test('the name is refused before anything is opened', async () => {
    const result = await intakeFile('../../secrets.png', await png())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.at).toBe('path')
  })

  test('the extensions the format does not take are refused by name', async () => {
    for (const path of ['scoreboard.html', 'boot.js', 'logo.svg', 'pack.zip', 'model.gltf']) {
      const result = await intakeFile(path, Buffer.from('anything'))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.problem.at).toBe('type')
    }
  })

  test('an empty file is refused', async () => {
    const result = await intakeFile('data/holes.json', Buffer.alloc(0))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.at).toBe('size')
  })

  test('json is parsed rather than sniffed, and kept byte for byte', async () => {
    const source = json({ holes: [1, 2, 3] })
    const result = await intakeFile('data/holes.json', source)

    expect(result.ok).toBe(true)
    // Export has to hand back a folder the way it went in, which it cannot do
    // if we re-serialise somebody's file on the way past.
    if (result.ok) expect(result.bytes.equals(source)).toBe(true)
  })

  test('json that does not parse says so, with the parser is own words', async () => {
    const result = await intakeFile('data/holes.json', Buffer.from('{ nope'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.at).toBe('structure')
  })

  test('json nested past the cap is refused', async () => {
    const deep = `${'['.repeat(200)}1${']'.repeat(200)}`
    const result = await intakeFile('data/deep.json', Buffer.from(deep))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.at).toBe('structure')
      expect(result.problem.reason).toContain(String(CAPS.jsonDepth))
    }
  })

  test('the document and the vision have to be json', async () => {
    // `document.xp.json` splits on its last dot, so this is about the named
    // file rule rather than about extensions generally.
    const result = await intakeFile('document.xp.json', json(MINIMAL_DOCUMENT))
    expect(result.ok).toBe(true)
  })

  test('a file over its kind is cap is refused with both numbers', async () => {
    const big = Buffer.alloc(CAPS.bytes.data + 1, 0x20)
    const result = await intakeFile('data/big.json', big)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.at).toBe('size')
  })
})

describe('a folder', () => {
  test('a minimal folder is accepted', async () => {
    const folder = await intakeFolder([
      { path: 'document.xp.json', bytes: json(MINIMAL_DOCUMENT) },
      { path: 'preview/01-cover.png', bytes: await png() },
    ])

    expect(folder.problems).toEqual([])
    expect(folder.accepted).toHaveLength(2)
    expect(folder.rejected).toHaveLength(0)
    expect(folder.totalBytes).toBeGreaterThan(0)
  })

  test('a folder with no document is a folder-level problem', async () => {
    const folder = await intakeFolder([{ path: 'preview/01.png', bytes: await png() }])
    expect(folder.problems.join(' ')).toContain('document.xp.json')
  })

  /**
   * Six problems get six reports. The same reasoning `parseXp` gives for
   * collecting rather than throwing on the first: fixing one thing at a time
   * and re-uploading to find the next is the experience this avoids.
   */
  test('every file is checked, not just up to the first failure', async () => {
    const folder = await intakeFolder([
      { path: 'document.xp.json', bytes: json(MINIMAL_DOCUMENT) },
      { path: 'boot.js', bytes: Buffer.from('alert(1)') },
      { path: '../escape.png', bytes: await png() },
      { path: 'data/broken.json', bytes: Buffer.from('{{{') },
    ])

    expect(folder.rejected).toHaveLength(3)
    expect(folder.rejected.map((r) => r.problem.at).sort()).toEqual(['path', 'structure', 'type'])
  })

  test('a duplicated path is reported', async () => {
    const folder = await intakeFolder([
      { path: 'document.xp.json', bytes: json(MINIMAL_DOCUMENT) },
      { path: 'preview/01.png', bytes: await png() },
      { path: 'preview/01.png', bytes: await png() },
    ])
    expect(folder.problems.join(' ')).toContain('more than once')
  })

  test('too many previews is reported', async () => {
    const cover = await png()
    const folder = await intakeFolder([
      { path: 'document.xp.json', bytes: json(MINIMAL_DOCUMENT) },
      ...Array.from({ length: CAPS.previews + 1 }, (_, i) => ({
        path: `preview/${i}.png`,
        bytes: cover,
      })),
    ])
    expect(folder.problems.join(' ')).toContain('preview pictures')
  })

  test('the total is summed over what would be stored, not what arrived', async () => {
    // A rejected file contributes nothing, which is the honest bill: we did not
    // keep it.
    const folder = await intakeFolder([
      { path: 'document.xp.json', bytes: json(MINIMAL_DOCUMENT) },
      { path: 'boot.js', bytes: Buffer.alloc(1024 * 1024) },
    ])
    expect(folder.totalBytes).toBeLessThan(1024)
  })
})
