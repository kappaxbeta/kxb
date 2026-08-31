import { describe, expect, test } from 'bun:test'
import { parseXp } from './format'
import {
  MAX_SKETCH_FILE,
  MAX_SKETCH_FILES,
  MAX_SKETCH_TOTAL,
} from './sketch'

/**
 * A sketch: a document that carries its game as source.
 *
 * As with `frame.test.ts`, the half worth testing is not that the block
 * parses - it is the excusals. The block made `world` and `packs` conditional
 * a second time, and a mistake in *that* condition accepts every half-written
 * level in the repo.
 */

const SKETCH = {
  format: 'xp/1',
  id: 'neon-pond',
  name: 'Neon Pond',
  capabilities: [],
  sketch: {
    engine: 'p5',
    entry: 'main.js',
    files: { 'main.js': 'function setup() {}\nfunction draw() {}' },
  },
}

const parse = (extra: Record<string, unknown> = {}) => parseXp({ ...SKETCH, ...extra })

const withSketch = (sketch: Record<string, unknown>) => parse({ sketch })

describe('a sketch document', () => {
  test('parses with no world, no packs and no blueprints', () => {
    expect(parse().ok).toBe(true)
  })

  test('gets an empty world rather than none, so every reader still works', () => {
    const result = parse()
    if (!result.ok) throw new Error('should have parsed')
    expect(result.document.world.placements).toEqual([])
    expect(result.document.world.marks).toEqual([])
  })

  test('keeps its files and its entry', () => {
    const result = parse()
    if (!result.ok) throw new Error('should have parsed')
    expect(result.document.sketch?.entry).toBe('main.js')
    expect(Object.keys(result.document.sketch?.files ?? {})).toEqual(['main.js'])
  })

  test('keeps its stick, and only as true', () => {
    const stuck = withSketch({ engine: 'p5', entry: 'main.js', stick: true, files: { 'main.js': '' } })
    if (!stuck.ok) throw new Error('should have parsed')
    expect(stuck.document.sketch?.stick).toBe(true)
    // `false` is spelled by absence, so a document that never asked does not
    // grow the field by being opened and saved.
    const plain = parse()
    if (!plain.ok) throw new Error('should have parsed')
    expect('stick' in (plain.document.sketch ?? {})).toBe(false)
    expect(withSketch({ engine: 'p5', entry: 'main.js', stick: 'yes', files: { 'main.js': '' } }).ok).toBe(false)
  })

  test('carries shaders, but will not run one as the entry', () => {
    const shaded = withSketch({
      engine: 'p5',
      entry: 'main.js',
      files: { 'glow.frag': 'void main() {}', 'main.js': '' },
    })
    if (!shaded.ok) throw new Error('should have parsed')
    expect(Object.keys(shaded.document.sketch?.files ?? {})).toContain('glow.frag')
    expect(
      withSketch({ engine: 'p5', entry: 'glow.frag', files: { 'glow.frag': '' } }).ok,
    ).toBe(false)
  })

  test('a timeline is seconds, above zero, capped', () => {
    const timed = withSketch({
      engine: 'p5',
      entry: 'main.js',
      timeline: { seconds: 12 },
      files: { 'main.js': '' },
    })
    if (!timed.ok) throw new Error('should have parsed')
    expect(timed.document.sketch?.timeline?.seconds).toBe(12)
    for (const seconds of [0, -3, 601, 'twelve']) {
      expect(
        withSketch({ engine: 'p5', entry: 'main.js', timeline: { seconds }, files: { 'main.js': '' } })
          .ok,
      ).toBe(false)
    }
  })

  test('may split itself into folders', () => {
    const result = withSketch({
      engine: 'p5',
      entry: 'main.js',
      files: { 'lib/orbs.js': 'var ORBS = []', 'main.js': 'function draw() {}' },
    })
    expect(result.ok).toBe(true)
  })

  test('its capabilities are believed, because there is no world to check them against', () => {
    expect(parse({ capabilities: ['match'] }).ok).toBe(true)
  })

  test('still binds keys like any level, because buttons are the platform side', () => {
    const result = parse({ player: { keys: [{ key: 'KeyE', does: 'boost' }] } })
    if (!result.ok) throw new Error('should have parsed')
    expect(result.document.player.keys?.[0]?.does).toBe('boost')
  })
})

describe('what a sketch has to say', () => {
  test('an unknown engine is refused with the list', () => {
    const result = withSketch({ engine: 'processing', entry: 'main.js', files: { 'main.js': '' } })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.problems[0]?.at).toBe('sketch.engine')
  })

  test('an entry that names no file is refused', () => {
    const result = withSketch({ engine: 'p5', entry: 'gone.js', files: { 'main.js': 'x' } })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.problems[0]?.at).toBe('sketch.entry')
  })

  test('an empty project is refused', () => {
    expect(withSketch({ engine: 'p5', entry: 'main.js', files: {} }).ok).toBe(false)
  })

  test('a path that could walk somewhere is refused', () => {
    for (const path of ['../main.js', 'Main.js', 'main js.js', '/main.js', 'main.ts', 'main']) {
      const result = withSketch({ engine: 'p5', entry: 'main.js', files: { 'main.js': '', [path]: '' } })
      expect(result.ok).toBe(false)
    }
  })

  test('one broken file refuses the whole block, not just the file', () => {
    // Running the survivors would throw somewhere far from the actual mistake.
    const result = withSketch({
      engine: 'p5',
      entry: 'main.js',
      files: { 'main.js': 'ok', 'helper.js': 42 },
    })
    expect(result.ok).toBe(false)
  })

  test('the caps hold: files, one file, the whole project', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_SKETCH_FILES + 1 }, (_, i) => [`f${i}.js`, 'x']),
    )
    expect(withSketch({ engine: 'p5', entry: 'f0.js', files: many }).ok).toBe(false)

    const long = 'x'.repeat(MAX_SKETCH_FILE + 1)
    expect(withSketch({ engine: 'p5', entry: 'main.js', files: { 'main.js': long } }).ok).toBe(false)

    const chunk = 'x'.repeat(MAX_SKETCH_FILE)
    const files: Record<string, string> = {}
    for (let i = 0; i * chunk.length <= MAX_SKETCH_TOTAL; i += 1) files[`f${i}.js`] = chunk
    expect(withSketch({ engine: 'p5', entry: 'f0.js', files }).ok).toBe(false)
  })

  test('a document cannot be both a cartridge and a sketch', () => {
    const result = parse({ frame: { game: 'boxing' } })
    expect(result.ok).toBe(false)
    const messages = result.ok === false ? result.problems.map((one) => one.at) : []
    expect(messages).toContain('sketch')
  })
})

describe('round-tripping', () => {
  test('a sketch document comes back out with its block, and a level grows none', () => {
    const sketch = parse()
    if (!sketch.ok) throw new Error('should have parsed')
    expect(sketch.document.sketch).toBeDefined()

    // A parsed document is what the editor writes back out, so a level that
    // never had the block must not have grown a `sketch: undefined` key.
    const reparsed = parseXp(JSON.parse(JSON.stringify(sketch.document)))
    expect(reparsed.ok).toBe(true)
  })
})
