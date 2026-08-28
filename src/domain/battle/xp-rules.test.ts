import { describe, expect, test } from 'bun:test'
import { parseXp, XP_FORMAT, type XpDocument } from '@kxb/xp'
import {
  applyMatchRules,
  defaultMatchRules,
  fightable,
  matchRulesFrom,
  matchRulesProblems,
  offerablePresets,
} from '@/domain/battle/xp-rules'

/**
 * The document's rules are a suggestion, and this is the arguing.
 *
 * Mostly about what a host may *not* say, which is the same shape
 * `capabilities.test.ts` has in the package and for the same reason: the value
 * of a match being able to override a mode is that the override is checked.
 */

function level(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'a-level',
    name: 'A level',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join(', '))
  return parsed.document
}

const goals = [
  { kind: 'red' as const, x: -10, y: 0, z: 0, facing: 0, width: 5, height: 4 },
  { kind: 'blue' as const, x: 10, y: 0, z: 0, facing: 0, width: 5, height: 4 },
]

describe('which modes a level can be played as', () => {
  test('a bare room still offers the three that need nothing placed in it', () => {
    expect(offerablePresets([])).toEqual(['freestyle', 'deathmatch', 'shooter'])
  })

  test('goals unlock football, and nothing else does', () => {
    expect(offerablePresets(['football'])).toContain('football')
    expect(offerablePresets(['freeplay', 'match'])).not.toContain('football')
  })

  test('a start and a finish unlock parkour', () => {
    expect(offerablePresets(['competition'])).toContain('parkour')
  })
})

describe('what the wizard opens with', () => {
  test('the level’s own rules, with both halves of the cap filled in', () => {
    expect(
      matchRulesFrom(
        level({ rules: { preset: 'deathmatch', scoreLimit: 10, players: { min: 3 } } }),
      ),
    ).toEqual({ preset: 'deathmatch', scoreLimit: 10, players: { min: 3, max: 16 } })
  })

  test('a level with no rules block opens as freestyle with no limits', () => {
    expect(matchRulesFrom(level())).toEqual({
      preset: 'freestyle',
      players: { min: 1, max: 16 },
    })
  })

  /**
   * A level may declare it is for twenty-five - the transport's ceiling - and a
   * battle holds sixteen, so offering the larger number would be offering seats
   * `JoinBattle` refuses.
   */
  test('a cap wider than a battle holds is narrowed to what a battle holds', () => {
    expect(
      defaultMatchRules({
        preset: 'freestyle',
        scoreLimit: null,
        timeLimit: null,
        players: { min: 20, max: 25 },
      }),
    ).toEqual({ preset: 'freestyle', players: { min: 16, max: 16 } })
  })
})

describe('the document the runtime is handed', () => {
  test('no override hands back the same object, untouched', () => {
    const document = level({ rules: { preset: 'deathmatch' } })
    expect(applyMatchRules(document, null)).toBe(document)
  })

  test('the mode a host chose wins over the one the author wrote', () => {
    const document = level({ rules: { preset: 'freestyle' } })
    const played = applyMatchRules(document, {
      preset: 'deathmatch',
      scoreLimit: 20,
      players: { min: 2, max: 8 },
    })
    expect(played.rules).toEqual({
      preset: 'deathmatch',
      scoreLimit: 20,
      players: { min: 2, max: 8 },
    })
  })

  /**
   * The reason the block is whole rather than a patch: "no target" has to be
   * expressible, and it is the absence of the field inside a present block.
   */
  test('a limit the host removed is gone rather than inherited', () => {
    const document = level({ rules: { preset: 'deathmatch', scoreLimit: 10, timeLimit: 300 } })
    const played = applyMatchRules(document, {
      preset: 'deathmatch',
      players: { min: 2, max: 4 },
    })
    expect(played.rules?.scoreLimit).toBeUndefined()
    expect(played.rules?.timeLimit).toBeUndefined()
  })

  test('the fields a host has no control for stay the author’s', () => {
    const document = level({
      rules: { preset: 'deathmatch', assign: 'host', respawn: 4 },
      capabilities: ['freeplay'],
    })
    const played = applyMatchRules(document, {
      preset: 'shooter',
      players: { min: 2, max: 4 },
    })
    expect(played.rules?.assign).toBe('host')
    expect(played.rules?.respawn).toBe(4)
  })

  test('the document itself is not written to', () => {
    const document = level({ rules: { preset: 'freestyle', scoreLimit: 3 } })
    applyMatchRules(document, { preset: 'deathmatch', players: { min: 2, max: 4 } })
    expect(document.rules).toEqual({ preset: 'freestyle', scoreLimit: 3 })
  })
})

describe('an override the level cannot back up', () => {
  test('football on a level with no goals is refused, by name', () => {
    const problems = matchRulesProblems(
      { preset: 'football', players: { min: 2, max: 4 } },
      level(),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('football')
  })

  test('and allowed once the goals are there', () => {
    expect(
      matchRulesProblems(
        { preset: 'football', players: { min: 2, max: 4 } },
        level({ world: { floorY: 0, placements: [], marks: goals }, capabilities: ['football'] }),
      ),
    ).toEqual([])
  })

  /**
   * `players.max` is a fact about the *level* - a board game for four has four
   * seats wherever it is opened - so a host may narrow it and never widen it.
   */
  test('a host may not seat more people than the level is built for', () => {
    const document = level({ rules: { preset: 'freestyle', players: { max: 4 } } })
    expect(
      matchRulesProblems({ preset: 'freestyle', players: { min: 2, max: 8 } }, document),
    ).toHaveLength(1)
    expect(
      matchRulesProblems({ preset: 'freestyle', players: { min: 2, max: 3 } }, document),
    ).toEqual([])
  })

  test('a crossed pair is refused here too, not only at the log', () => {
    expect(
      matchRulesProblems({ preset: 'freestyle', players: { min: 4, max: 2 } }, level()),
    ).toHaveLength(1)
  })

  /**
   * The join asserted rather than assumed: everything the picker offers has to
   * be something this accepts, or the wizard offers a mode the server refuses.
   */
  test('everything offerable is accepted', () => {
    const document = level({
      world: { floorY: 0, placements: [], marks: goals },
      capabilities: ['football'],
    })
    for (const preset of offerablePresets(document.capabilities)) {
      expect(matchRulesProblems({ preset, players: { min: 2, max: 4 } }, document)).toEqual([])
    }
  })
})

/**
 * What may be fought in, which is the one question a cartridge and a level
 * answer differently. See `fightable` for the argument in full.
 */
describe('what a match can be fought in', () => {
  test('a level with no match capability still can be, because most of the shelf is one', () => {
    // `mensch`, `peepz`, `steal-a-plant` - all freeplay-only, all opened as a
    // match by the Play rail, because a match is the room mechanism there is.
    expect(fightable({ framed: false, capabilities: ['freeplay'] })).toBe(true)
    expect(fightable({ framed: false, capabilities: [] })).toBe(true)
  })

  test('a cartridge with no match capability cannot be', () => {
    // The café and the house: a purse, a kitchen, and nothing to fight over.
    expect(fightable({ framed: true, capabilities: ['freeplay'] })).toBe(false)
  })

  test('a cartridge that claims one can be', () => {
    // Boxing and Mau-Mau, which is why the rule is about the claim rather than
    // about being a cartridge.
    expect(fightable({ framed: true, capabilities: ['match'] })).toBe(true)
  })
})
