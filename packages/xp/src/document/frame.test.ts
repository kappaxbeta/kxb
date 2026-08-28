import { describe, expect, test } from 'bun:test'
import { parseXp } from './format'
import { backgroundOf } from './frame'

/**
 * A cartridge: a document that names a game instead of describing a world.
 *
 * The half of this worth testing is not that the block parses - it is that
 * making it optional did not quietly make *everything else* optional. A parser
 * that stopped requiring a world would accept every half-written level in the
 * repo, and the way that failure shows up is a blank canvas weeks later.
 */

const CARTRIDGE = {
  format: 'xp/1',
  id: 'boxing',
  name: 'Boxing',
  capabilities: ['match'],
  frame: { game: 'boxing' },
}

const parse = (extra: Record<string, unknown> = {}) => parseXp({ ...CARTRIDGE, ...extra })

describe('a cartridge', () => {
  test('parses with no world, no packs and no blueprints', () => {
    const result = parse()
    expect(result.ok).toBe(true)
  })

  test('gets an empty world rather than none, so every reader still works', () => {
    const result = parse()
    if (!result.ok) throw new Error('should have parsed')
    // The whole reason `world` is materialised: the battle's mode, the store's
    // counts and the editor all reach for it, and an optional would put a
    // branch in each of them for a case none can act on.
    expect(result.document.world.placements).toEqual([])
    expect(result.document.world.marks).toEqual([])
  })

  test('keeps the game name it was given', () => {
    const result = parse()
    if (!result.ok) throw new Error('should have parsed')
    expect(result.document.frame?.game).toBe('boxing')
  })

  test('is transparent unless it says otherwise', () => {
    const result = parse()
    if (!result.ok) throw new Error('should have parsed')
    expect(backgroundOf(result.document.frame!)).toBe('transparent')
  })

  test('can ask to own its pixels', () => {
    const result = parse({ frame: { game: 'boxing', background: 'own' } })
    if (!result.ok) throw new Error('should have parsed')
    expect(backgroundOf(result.document.frame!)).toBe('own')
  })

  test('carries its settings through untouched', () => {
    const settings = { rounds: 5, nested: { anything: [1, 2] } }
    const result = parse({ frame: { game: 'boxing', settings } })
    if (!result.ok) throw new Error('should have parsed')
    expect(result.document.frame?.settings).toEqual(settings)
  })

  /**
   * The claim a cartridge makes about itself and nobody can check.
   *
   * `capabilityProblems` refuses a *level* claiming `match` with fewer than two
   * spawns. A framed game's spawns are inside code this package cannot see, so
   * the check is skipped - which is a real gap, is documented in ./frame, and is
   * asserted here so that nobody re-enables it by accident and refuses every
   * cartridge in the store.
   */
  test('its capabilities are believed, because there is no world to check them against', () => {
    expect(parse({ capabilities: ['football'] }).ok).toBe(true)
  })
})

describe('what a cartridge still has to say', () => {
  test('a frame with no game is refused', () => {
    const result = parseXp({ ...CARTRIDGE, frame: {} })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.problems[0]?.at).toBe('frame.game')
  })

  test('a game name that could become a path is refused', () => {
    for (const game of ['../boxing', 'Boxing', 'box ing', 'box/ing', '']) {
      expect(parseXp({ ...CARTRIDGE, frame: { game } }).ok).toBe(false)
    }
  })

  test('an unknown background is refused rather than defaulted', () => {
    // Defaulting would mean a typo silently choosing the opposite of what was
    // meant, and the two look very different on a page.
    expect(parseXp({ ...CARTRIDGE, frame: { game: 'boxing', background: 'clear' } }).ok).toBe(false)
  })

  test('it still needs a name and an id, like anything else in the store', () => {
    expect(parseXp({ ...CARTRIDGE, name: undefined }).ok).toBe(false)
    expect(parseXp({ ...CARTRIDGE, id: undefined }).ok).toBe(false)
  })
})

describe('an ordinary level is unchanged', () => {
  /**
   * The check that matters most in this file.
   *
   * `world` and `packs` became conditional, and a mistake in that condition is
   * a parser that accepts a level with nothing in it - which is not refused
   * anywhere later and shows up as an empty room.
   */
  test('a level with no frame still has to bring a world and packs', () => {
    const result = parseXp({
      format: 'xp/1',
      id: 'empty',
      name: 'Empty',
      capabilities: ['freeplay'],
    })
    expect(result.ok).toBe(false)
    const at = result.ok === false ? result.problems.map((one) => one.at) : []
    expect(at).toContain('packs')
  })

  test('and a level claiming a match still needs two spawns', () => {
    const result = parseXp({
      format: 'xp/1',
      id: 'one-spawn',
      name: 'One spawn',
      packs: [{ id: 'proto' }],
      capabilities: ['match'],
      blueprints: {},
      world: { placements: [], marks: [] },
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.problems.some((one) => one.at === 'capabilities')).toBe(true)
  })
})
