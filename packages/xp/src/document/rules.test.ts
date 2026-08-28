import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  ASSIGNS,
  DEFAULT_RULES,
  describeAssign,
  describePreset,
  describeSides,
  isAssign,
  isDefaultRules,
  isMode,
  isPreset,
  isSides,
  MAX_DECLARED_PLAYERS,
  MODES,
  modeOf,
  playersOf,
  presetNeeds,
  PRESETS,
  roleRule,
  rulesOf,
  rulesProblems,
  SIDES,
  seenAs,
  sidesOf,
  teamColour,
  TEAM_COLOURS,
  teamsOf,
  viewsOf,
  type XpRules,
  takesTurns,
} from './rules'
import { parseXp, XP_FORMAT, type Mark } from './format'

/**
 * The mode, and what a document is allowed to say about it.
 *
 * Mostly about refusal, like ./capabilities.test.ts and for the same reason: the
 * value of naming a mode at all is that the naming is checked. A `football`
 * preset in a world with no goals that loads anyway is a match that fails at
 * kickoff in front of everybody rather than in the editor in front of its
 * author.
 */

function mark(kind: Mark['kind'], team?: string): Mark {
  return { kind, x: 0, y: 0, z: 0, facing: 0, width: 5, height: 4, ...(team ? { team } : {}) }
}

function doc(overrides: Record<string, unknown> = {}) {
  return {
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  }
}

const problemsOf = (raw: unknown) => {
  const result = parseXp(raw)
  return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
}

describe('the vocabulary', () => {
  test('every preset has a line explaining it', () => {
    for (const preset of PRESETS) {
      expect(describePreset(preset).length).toBeGreaterThan(10)
    }
  })

  test('an invented preset is not one', () => {
    expect(isPreset('parkour')).toBe(true)
    expect(isPreset('battle-royale')).toBe(false)
  })

  test('the default is exactly the block an absent one stands for', () => {
    // What decides whether a save writes the field at all, so it has to mean
    // "says nothing its absence does not" rather than "mentions freestyle".
    expect(isDefaultRules(DEFAULT_RULES)).toBe(true)
    expect(isDefaultRules({ preset: 'freestyle' })).toBe(true)
    expect(isDefaultRules({ preset: 'parkour' })).toBe(false)
    expect(isDefaultRules({ preset: 'freestyle', timeLimit: 60 })).toBe(false)
  })

  test('only the two modes built out of marks demand a capability', () => {
    expect(presetNeeds('football')).toBe('football')
    expect(presetNeeds('parkour')).toBe('competition')
    // The three that need nothing placed in the world are the three that will
    // run in a bare room, which is the point of them requiring nothing.
    expect(presetNeeds('deathmatch')).toBeNull()
    expect(presetNeeds('shooter')).toBeNull()
    expect(presetNeeds('freestyle')).toBeNull()
  })
})

describe('how somebody ends up on a side', () => {
  test('four values, and the plan’s remaining two are still deliberately absent', () => {
    /**
     * §9 sketches `fixed | balanced | first-come | pick`, and this test used to
     * hold two values with the reason the other two were missing: `pick` means a
     * lobby screen and a lobby is a host, so an XP declaring it would be
     * declaring a screen it does not own; `balanced` and `first-come` both need
     * a roster, and there is none to have when a side has to be known on the
     * first frame.
     *
     * **`order` is `first-come`, and it arrived the way that sentence said it
     * would** - "with the mechanism that can hold a roster". The mechanism is
     * that a side is allowed to answer *late*: `sideOf` returns undefined until
     * presence has landed, and ../../../src/app/xp/_runtime/simulation.tsx
     * re-seats the body, the camera and the team property together when it does.
     * Giving up "known on the first frame" is the price, and a table is the one
     * shape where being moved to your own chair as the room fills reads as the
     * game starting rather than as a glitch.
     *
     * **And `claim` is the one the sketch never had**, because it is the only
     * value where the *player* decides. It arrived the same way `order` did and
     * for a sharper version of the same reason: one person to a chair is a race
     * between two clients pressing in the same moment, so it needed somewhere
     * authoritative to answer it once. The arbiter is that.
     *
     * `balanced` still needs somebody authoritative counting heads, and `pick`
     * still needs a screen this format does not own.
     */
    expect([...ASSIGNS]).toEqual(['spread', 'order', 'host', 'claim'])
    expect(isAssign('order')).toBe(true)
    expect(isAssign('balanced')).toBe(false)
    expect(isAssign('first-come')).toBe(false)
  })

  test('every way onto a side has a line explaining it', () => {
    // The same sweep the presets get: a value somebody can pick in the editor
    // with no sentence beside it is a setting nobody can choose between.
    for (const assign of ASSIGNS) expect(describeAssign(assign).length).toBeGreaterThan(0)
  })

  test('every assignment has a line explaining it', () => {
    for (const assign of ASSIGNS) expect(describeAssign(assign).length).toBeGreaterThan(10)
  })

  test('it round-trips, and a value we do not have is refused', () => {
    const parsed = parseXp(doc({ rules: { preset: 'deathmatch', assign: 'host' } }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.rules?.assign).toBe('host')

    expect(problemsOf(doc({ rules: { preset: 'deathmatch', assign: 'balanced' } }))).toEqual([
      `rules.assign: must be one of ${ASSIGNS.join(', ')}`,
    ])
  })

  test('a block that only sets it is not the default, and survives a save', () => {
    /**
     * The bug this caught while it was being written: `isDefaultRules` decides
     * whether the field is written at all, so an optional field missing from it
     * is an author's setting silently deleted on the next save. Nobody notices
     * until the level behaves differently a week later.
     */
    expect(isDefaultRules({ preset: 'freestyle', assign: 'host' })).toBe(false)
    const parsed = parseXp(doc({ rules: { preset: 'freestyle', assign: 'host' } }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.rules).toEqual({ preset: 'freestyle', assign: 'host' })
  })

  test('and every optional field is accounted for, so the next one is not forgotten', () => {
    /**
     * The general form of the bug above. Set every optional field to something
     * non-default and the block must not be droppable; if somebody adds a field
     * to `XpRules` and not to `isDefaultRules`, this is what fails.
     *
     * It has now done that once, for real: `respawn` arrived a day after this
     * was written and `Required<XpRules>` refused to compile until it was
     * listed - which is the point of typing the fixture rather than writing out
     * three field names.
     */
    const everything: Required<XpRules> = {
      preset: 'freestyle',
      mode: 'battle',
      sides: 'ffa',
      scoreLimit: 5,
      timeLimit: 60,
      assign: 'host',
      respawn: 3,
      players: { min: 2, max: 4 },
      roles: ['impostor', 'crew', 'crew', 'crew'],
      lethal: 'impostor',
      perRole: { impostor: { allow: ['use'], seen: 'nobody' } },
    }
    for (const key of Object.keys(everything) as (keyof XpRules)[]) {
      if (key === 'preset') continue
      expect(isDefaultRules({ preset: 'freestyle', [key]: everything[key] })).toBe(false)
    }
  })
})

describe('the sides a document has', () => {
  test('read off the spawn marks, in the order it names them', () => {
    expect(teamsOf([mark('spawn', 'red'), mark('spawn', 'blue')])).toEqual(['red', 'blue'])
  })

  test('a spawn with no team is not a side, and a goal is not a spawn', () => {
    // Here rather than only in the runtime because the editor asks the same
    // question to grey out the assignment picker, and two answers would drift.
    expect(teamsOf([mark('spawn'), mark('red'), mark('finish')])).toEqual([])
  })

  test('two marks for one side is one side', () => {
    expect(teamsOf([mark('spawn', 'red'), mark('spawn', 'red')])).toEqual(['red'])
  })

  /**
   * The compatibility test for the whole field, and the reason it is derived.
   *
   * Every `.xp.json` on disk was written before `sides` existed, so whatever
   * absent means has to be what those documents already did — which is "the
   * marks decide". A constant here would have silently reclassified all of
   * them in one direction or the other.
   */
  test('a document that never said is read off its own world', () => {
    expect(sidesOf({ preset: 'deathmatch' }, [mark('spawn', 'red'), mark('spawn', 'blue')])).toBe(
      'team',
    )
    expect(sidesOf({ preset: 'deathmatch' }, [mark('spawn')])).toBe('ffa')
    expect(sidesOf({ preset: 'deathmatch' }, [])).toBe('ffa')
  })

  test('one team spawn is not two sides', () => {
    // Half-finished rather than one-sided, which is the same reading `sideOf`
    // takes: there is nothing to divide a room into.
    expect(sidesOf({ preset: 'deathmatch' }, [mark('spawn', 'red')])).toBe('ffa')
  })

  test('what the document says beats what the marks imply, in both directions', () => {
    const teamed = [mark('spawn', 'red'), mark('spawn', 'blue')]
    // An author who put two team spawns in a level and wants a free-for-all in
    // it can have one. That is the whole point of being able to say it.
    expect(sidesOf({ preset: 'deathmatch', sides: 'ffa' }, teamed)).toBe('ffa')
    expect(sidesOf({ preset: 'deathmatch', sides: 'one-vs-all' }, teamed)).toBe('one-vs-all')
  })

  test('one-vs-all is never derived, because nothing in a world means it', () => {
    for (const marks of [[], [mark('spawn')], [mark('spawn', 'red'), mark('spawn', 'blue')]]) {
      expect(sidesOf({ preset: 'deathmatch' }, marks)).not.toBe('one-vs-all')
    }
  })

  test('every shape has a line a picker can print', () => {
    for (const sides of SIDES) {
      expect(describeSides(sides).length).toBeGreaterThan(10)
      expect(isSides(sides)).toBe(true)
    }
    expect(isSides('one_vs_all')).toBe(false)
  })

  test('one colour table, because two is how red stops matching red', () => {
    // The ring under a player and the team field on a mark form are in different
    // lanes and have to agree.
    expect(teamColour('red')).toBe('#f0abfc')
    expect(teamColour('blue')).toBe('#67e8f9')
    expect(teamColour('green')).toBe('#86efac')
    expect(teamColour('yellow')).toBe('#fcd34d')
  })

  test('four of them are distinct, because a side you cannot tell apart is not one', () => {
    const drawn = TEAM_COLOURS.map(teamColour)
    expect(new Set(drawn).size).toBe(TEAM_COLOURS.length)
    // And none of them is the fallback, which would make a named side look
    // exactly like a player on no side at all.
    expect(drawn).not.toContain('#ffffff')
  })

  test('and a side nobody named still gets one', () => {
    // A ring that vanishes is indistinguishable from a player with no side.
    expect(teamColour('home')).toBe('#ffffff')
    expect(teamColour(undefined)).toBe('#ffffff')
  })
})

describe('what a preset demands', () => {
  test('a mode built out of marks needs the capability that checks them', () => {
    expect(rulesProblems({ preset: 'football' }, ['freeplay'], [])).toEqual([
      'the "football" preset needs the "football" capability, which this does not declare',
    ])
    expect(rulesProblems({ preset: 'parkour' }, ['freeplay'], [])).toEqual([
      'the "parkour" preset needs the "competition" capability, which this does not declare',
    ])
  })

  test('and is happy once it is declared', () => {
    expect(rulesProblems({ preset: 'football' }, ['freeplay', 'football'], [])).toEqual([])
    expect(rulesProblems({ preset: 'parkour' }, ['competition'], [])).toEqual([])
  })

  test('freestyle asks for nothing, which is what makes it the default', () => {
    expect(rulesProblems(DEFAULT_RULES, [], [])).toEqual([])
  })

  test('a respawn delay of zero is allowed, which is not an inconsistency', () => {
    /**
     * Zero is refused for the *limits* and allowed here, and the difference is
     * real rather than sloppy: a zero respawn is a genuine setting - it is what
     * every level does today - whereas a zero score limit is a match nobody can
     * play. What is refused is negative, and anything long enough to read as the
     * game having frozen rather than as a penalty.
     */
    expect(rulesProblems({ preset: 'deathmatch', respawn: 0 }, [], [])).toEqual([])
    expect(rulesProblems({ preset: 'deathmatch', respawn: 3 }, [], [])).toEqual([])
    expect(rulesProblems({ preset: 'deathmatch', respawn: -1 }, [], [])).toHaveLength(1)
    expect(rulesProblems({ preset: 'deathmatch', respawn: 90 }, [], [])).toHaveLength(1)
  })

  test('a limit of zero is refused rather than read as "no limit"', () => {
    /**
     * The two are different intentions and an author who typed a zero meant one
     * of them. Absent is how you say there is no limit; treating zero as absent
     * would silently discard the other reading.
     */
    expect(rulesProblems({ preset: 'deathmatch', scoreLimit: 0 }, [], [])).toEqual([
      'a score limit of zero or less is a match nobody can play',
    ])
    expect(rulesProblems({ preset: 'deathmatch', timeLimit: -5 }, [], [])).toEqual([
      'a time limit of zero or less is a match that is over on the first frame',
    ])
  })

  test('a sided shape with nothing to divide is refused, not quietly ignored', () => {
    /**
     * The failure this check exists for is the silent one: the document says
     * teams, nothing hands anybody a side, everybody arrives on the level's own
     * spawn, and it reads as teams being broken rather than as undeclared.
     */
    const none = rulesProblems({ preset: 'deathmatch', sides: 'team' }, [], [])
    expect(none).toEqual(['"team" needs a spawn for each side; this has none with a team on it'])

    const one = rulesProblems({ preset: 'deathmatch', sides: 'one-vs-all' }, [], [
      mark('spawn', 'red'),
    ])
    expect(one).toEqual(['"one-vs-all" needs a spawn for each side; this has one'])
  })

  test('and holds once the marks are there', () => {
    const marks = [mark('spawn', 'red'), mark('spawn', 'blue')]
    expect(rulesProblems({ preset: 'deathmatch', sides: 'team' }, [], marks)).toEqual([])
    expect(rulesProblems({ preset: 'deathmatch', sides: 'one-vs-all' }, [], marks)).toEqual([])
  })

  test('ffa asks nothing of the world, however many team spawns are in it', () => {
    // A level with sides in it that declares a free-for-all is an author using
    // the field, not an author contradicting themselves.
    expect(rulesProblems({ preset: 'deathmatch', sides: 'ffa' }, [], [])).toEqual([])
    expect(
      rulesProblems({ preset: 'deathmatch', sides: 'ffa' }, [], [mark('spawn', 'red')]),
    ).toEqual([])
  })

  test('splitting a room with one champion in it is refused where it was typed', () => {
    const marks = [mark('spawn', 'red'), mark('spawn', 'blue')]
    expect(
      rulesProblems({ preset: 'deathmatch', sides: 'one-vs-all', assign: 'spread' }, [], marks),
    ).toEqual([
      'one against everyone is handed out by a match; nothing here can pick which player is the one',
    ])
    // Absent is not the same as written. Refusing the default would make the
    // shape unwritable at all.
    expect(rulesProblems({ preset: 'deathmatch', sides: 'one-vs-all' }, [], marks)).toEqual([])
    expect(
      rulesProblems({ preset: 'deathmatch', sides: 'one-vs-all', assign: 'host' }, [], marks),
    ).toEqual([])
  })

  test('every reason, not the first', () => {
    // An author who has got two things wrong should be told about both, which is
    // the rule parseXp already follows for everything else.
    expect(
      rulesProblems({ preset: 'football', scoreLimit: 0, timeLimit: 0 }, ['freeplay'], []),
    ).toHaveLength(3)
  })
})

describe('reading it off a document', () => {
  test('a document with no rules block is freestyle, not broken', () => {
    /**
     * The compatibility test, and the one that matters most: every `.xp.json`
     * in the repo was written before this block existed. A parser that demanded
     * one would have made a format change into a migration.
     */
    const parsed = parseXp(doc())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(rulesOf(parsed.document)).toEqual({ preset: 'freestyle' })
  })

  test('and stays without one, so opening a level does not grow a block in it', () => {
    /**
     * The other half, and the one that keeps this a format change rather than a
     * format change everybody notices. The editor writes the *parsed* document
     * straight back out (`_editor/editor.tsx`), so a parser that materialised
     * the default would put a `rules` block into every file anybody opened and
     * into every diff after that. Same trade `scripts` already makes.
     */
    const parsed = parseXp(doc())
    if (!parsed.ok) return
    expect(parsed.document.rules).toBeUndefined()
    expect('rules' in parsed.document).toBe(false)
  })

  test('an explicit freestyle says nothing its absence does not, and is dropped', () => {
    // As `"scripts": {}` is. Somebody who types the default gets the default.
    const parsed = parseXp(doc({ rules: { preset: 'freestyle' } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules).toBeUndefined()
  })

  test('but a freestyle with a limit on it is a thing somebody meant', () => {
    // Not the default, so it is kept - and reading it back is how an author
    // finds out the mode ignores it, rather than the field silently vanishing.
    const parsed = parseXp(doc({ rules: { preset: 'freestyle', timeLimit: 60 } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules).toEqual({ preset: 'freestyle', timeLimit: 60 })
  })

  test('what it says is what comes back', () => {
    const parsed = parseXp(
      doc({ rules: { preset: 'deathmatch', scoreLimit: 20, timeLimit: 300 } }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules).toEqual({
      preset: 'deathmatch',
      scoreLimit: 20,
      timeLimit: 300,
    })
  })

  test('every optional field survives the parser, not just the type', () => {
    /**
     * The bug this caught, on the day it was written: `respawn` was added to
     * `XpRules`, validated by `rulesProblems`, accepted by the editor - and
     * **silently dropped by `readRules`**, which read the other two numbers by
     * hand and had never heard of it. An author sets a field, everything says
     * yes, and the level behaves as though they had not.
     *
     * The `Required<XpRules>` sweep above guards the *write* side - whether a
     * field survives a save. Nothing guarded the read side until this. They are
     * two different ways for one field to vanish and both are silent.
     */
    const everything: Required<XpRules> = {
      preset: 'deathmatch',
      mode: 'battle',
      // `ffa` rather than `team`, so the fixture does not have to grow a world
      // with two team spawns in it to satisfy a check about the marks.
      sides: 'ffa',
      scoreLimit: 5,
      timeLimit: 60,
      assign: 'host',
      respawn: 3,
      players: { min: 2, max: 4 },
      roles: ['impostor', 'crew', 'crew', 'crew'],
      lethal: 'impostor',
      perRole: { impostor: { allow: ['use'], seen: 'nobody' } },
    }
    // `backend.needs` because the deck is in there: a document that deals is
    // refused without an arbiter to deal it (format.ts, and §4.2 of
    // docs/xp/server-authority.md).
    const parsed = parseXp(doc({ rules: everything, backend: { needs: ['arbiter'] } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules).toEqual(everything)
  })

  test('a mode this build has never heard of is refused, not ignored', () => {
    // Ignoring it would load a document that looks finished and has no rules at
    // all, which is indistinguishable from a level nobody finished.
    expect(problemsOf(doc({ rules: { preset: 'capture-the-flag' } }))).toEqual([
      `rules.preset: must be one of ${PRESETS.join(', ')}`,
    ])
  })

  test('a limit that is not a number says which one', () => {
    expect(problemsOf(doc({ rules: { preset: 'deathmatch', timeLimit: '5m' } }))).toEqual([
      'rules.timeLimit: not a number',
    ])
  })

  test('a football preset without the goals to back it is refused by the author', () => {
    // Two failures, one mistake: the capability is unclaimed *and* would not
    // hold if it were. Reported as the capability, which is where the goals are.
    expect(problemsOf(doc({ rules: { preset: 'football' } }))).toEqual([
      'rules: the "football" preset needs the "football" capability, which this does not declare',
    ])
  })

  test('every document we ship reads as a mode, block or no block', () => {
    /**
     * The assertion Lane A asked for, and the gap it names was real: two of the
     * four `.xp.json` we ship have no `rules` block, and nothing read `rules` on
     * either of them - so the freestyle path was exercised only by fixtures.
     *
     * It is written as a sweep of the directory rather than four named cases on
     * purpose. The failure it is guarding against is *a document nobody thought
     * about* - the fifth one somebody adds - and a test naming the four we have
     * today would pass while that one crashed.
     */
    const dir = path.join(import.meta.dir, '..', '..', '..', '..', 'public', 'xp', 'xps')
    const files = readdirSync(dir).filter((name) => name.endsWith('.xp.json'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const parsed = parseXp(JSON.parse(readFileSync(path.join(dir, file), 'utf8')))
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) continue

      // Never throws and always names a mode, which is the whole contract.
      const rules = rulesOf(parsed.document)
      expect(isPreset(rules.preset)).toBe(true)
      // And a document that declares nothing is freestyle rather than undefined.
      if (parsed.document.rules === undefined) expect(rules).toEqual(DEFAULT_RULES)
    }
  })

  test('and accepted once the goals are actually there', () => {
    const parsed = parseXp(
      doc({
        capabilities: ['freeplay', 'football'],
        rules: { preset: 'football', scoreLimit: 5 },
        world: { floorY: 0, placements: [], marks: [mark('red'), mark('blue')] },
      }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(rulesOf(parsed.document).preset).toBe('football')
  })

  test('a parkour preset inherits the start-and-finish check for free', () => {
    /**
     * The join earning its keep: nothing in ./rules knows what a `start` mark
     * is, and a parkour document with no finish is still refused - by
     * `capabilityProblems`, in the vocabulary where the marks live.
     */
    expect(
      problemsOf(
        doc({
          capabilities: ['competition'],
          rules: { preset: 'parkour' },
          world: { floorY: 0, placements: [], marks: [mark('start')] },
        }),
      ),
    ).toEqual(['capabilities: claims "competition" but no finish, so a run never ends and cannot be timed'])
  })
})

/**
 * How many people a level is for.
 *
 * A fact about the document rather than a setting on the room, which is what
 * makes it worth carrying at all: a board game for four is for four wherever
 * somebody opens it, and a door that reads this turns the fifth person away
 * with a sentence instead of seating them at a board with no seat.
 */
describe('how many players a level is for', () => {
  test('a level that says nothing is for as many as the transport carries', () => {
    expect(playersOf({ preset: 'freestyle' })).toEqual({ min: 1, max: MAX_DECLARED_PLAYERS })
  })

  test('a board game for four says four', () => {
    expect(playersOf({ preset: 'freestyle', players: { min: 2, max: 4 } })).toEqual({
      min: 2,
      max: 4,
    })
  })

  test('half a pair leaves the other half at its default', () => {
    expect(playersOf({ preset: 'freestyle', players: { max: 4 } })).toEqual({ min: 1, max: 4 })
    expect(playersOf({ preset: 'freestyle', players: { min: 3 } })).toEqual({
      min: 3,
      max: MAX_DECLARED_PLAYERS,
    })
  })

  /**
   * `parseXp` refuses a crossed pair, so this is only reachable from rules
   * built by hand - and a `min` above `max` would leave a room that can never
   * be started rather than one that says why.
   */
  test('a crossed pair is clamped rather than left un-startable', () => {
    expect(playersOf({ preset: 'freestyle', players: { min: 9, max: 4 } })).toEqual({
      min: 4,
      max: 4,
    })
  })

  test('the refusals an author reads', () => {
    const of = (players: { min?: number; max?: number }) =>
      rulesProblems({ preset: 'freestyle', players }, [], [])

    expect(of({ max: 0 })).toHaveLength(1)
    expect(of({ max: 1.5 })).toHaveLength(1)
    expect(of({ max: MAX_DECLARED_PLAYERS + 1 })).toHaveLength(1)
    expect(of({ min: 4, max: 2 })).toHaveLength(1)
    expect(of({ min: 2, max: 4 })).toHaveLength(0)
  })
})

/**
 * What a document deals, and the one refusal that is worth making early.
 *
 * The arbiter refuses a short deck too, and its refusal arrives at the worst
 * possible moment — a round that will not start, in front of everybody. This
 * one arrives in the editor.
 */
describe('roles', () => {
  test('a level that deals nothing is every level so far', () => {
    expect(rulesProblems({ preset: 'freestyle' }, ['freeplay'], [])).toEqual([])
  })

  test('one role per player is enough', () => {
    expect(
      rulesProblems(
        { preset: 'freestyle', players: { max: 3 }, roles: ['impostor', 'crew', 'crew'] },
        ['freeplay'],
        [],
      ),
    ).toEqual([])
  })

  test('duplicates are the point rather than a mistake', () => {
    // Three of four being crew *is* three entries. A deck of one repeated value
    // is a legal, if dull, game.
    expect(
      rulesProblems(
        { preset: 'freestyle', players: { max: 2 }, roles: ['crew', 'crew'] },
        ['freeplay'],
        [],
      ),
    ).toEqual([])
  })

  test('a deck that cannot cover the room is refused, with both numbers', () => {
    const problems = rulesProblems(
      { preset: 'freestyle', players: { max: 5 }, roles: ['impostor', 'crew'] },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('2 roles')
    expect(problems[0]).toContain('up to 5')
  })

  /**
   * A level that never said how many it is for is for as many as the transport
   * carries, so that is what the deck is measured against — otherwise a
   * document with four roles and no `players` block would pass here and fail
   * the moment a fifth person walked in.
   */
  test('a level with no player cap is measured against the transport ceiling', () => {
    const problems = rulesProblems(
      { preset: 'freestyle', roles: ['impostor', 'crew'] },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`up to ${MAX_DECLARED_PLAYERS}`)
  })
})

/**
 * Whose shots count, which is a rule about two fields agreeing.
 *
 * The refusals matter more than the acceptance, because the failure they
 * prevent is silent in the worst way: a `lethal` value nobody is dealt refuses
 * *every* shot in the room, so the level looks like a game in which guns do
 * nothing and the arbiter is keeping the rule perfectly, about a role that does
 * not exist.
 */
describe('a lethal role', () => {
  test('one of the dealt values is fine', () => {
    expect(
      rulesProblems(
        { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'], lethal: 'bug' },
        ['freeplay'],
        [],
      ),
    ).toEqual([])
  })

  test('a value nobody is dealt is refused, and named', () => {
    const problems = rulesProblems(
      { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'], lethal: 'imposter' },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('imposter')
  })

  test('a lethal role with no deck to deal from is refused', () => {
    const problems = rulesProblems({ preset: 'freestyle', lethal: 'bug' }, ['freeplay'], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('deck')
  })
})

/**
 * What a dealt value *means*, which is the generalisation `lethal` is one
 * hard-coded instance of — docs/xp/xp-flow.md §3.
 *
 * The checks are the same shape as the lethal ones above and for the same
 * reason: a rule keyed on a role nobody is dealt is not an error anywhere, it is
 * a block that looks set and never once applies. There is no gun going off and
 * doing nothing to notice it by, either, so the parser is the only thing that
 * can say.
 */
describe('what a role means', () => {
  const four = ['hidden', 'seeker', 'seeker', 'seeker']

  test('a rule for a value in the deck is fine', () => {
    expect(
      rulesProblems(
        {
          preset: 'freestyle',
          players: { max: 4 },
          roles: four,
          perRole: { hidden: { allow: ['use'], seen: 'nobody' } },
        },
        ['freeplay'],
        [],
      ),
    ).toEqual([])
  })

  test('a rule for a value nobody is dealt is refused, and named', () => {
    const problems = rulesProblems(
      {
        preset: 'freestyle',
        players: { max: 4 },
        roles: four,
        perRole: { hider: { seen: 'nobody' } },
      },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('hider')
  })

  test('every mistyped key is named, not just the first', () => {
    // An author with two of them counting on their fingers is the case
    // `readRoles` reports by index for, one field along.
    const problems = rulesProblems(
      {
        preset: 'freestyle',
        players: { max: 4 },
        roles: four,
        perRole: { hider: { seen: 'nobody' }, seekers: { allow: [] } },
      },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(2)
  })

  test('rules for a deck that is not there are refused', () => {
    const problems = rulesProblems(
      { preset: 'freestyle', perRole: { hidden: { seen: 'nobody' } } },
      ['freeplay'],
      [],
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('deck')
  })
})

/**
 * Reading the block back, which is what the runtime and the arbiter do.
 *
 * Both readers are total on purpose — a draw loop and a press gate are the two
 * places a third "there is no answer" case would become a branch that means the
 * same as the first one.
 */
describe('reading what a role means', () => {
  const rules: XpRules = {
    preset: 'freestyle',
    roles: ['hidden', 'seeker'],
    perRole: { hidden: { allow: ['use'], seen: 'nobody' } },
  }

  test('nothing dealt is the ordinary answer, not a missing one', () => {
    expect(roleRule(rules, null)).toBeUndefined()
    expect(seenAs(rules, null)).toBe('normal')
  })

  test('a value with no rule is drawn the way everybody is', () => {
    expect(seenAs(rules, 'seeker')).toBe('normal')
  })

  test('and one with a rule is what it says', () => {
    expect(seenAs(rules, 'hidden')).toBe('nobody')
    expect(roleRule(rules, 'hidden')?.allow).toEqual(['use'])
  })

  test('a level with no block at all answers for every role', () => {
    expect(seenAs({ preset: 'freestyle' }, 'hidden')).toBe('normal')
  })

  /**
   * What goes to the arbiter with the deck, and the reason it is a *map of
   * looks* rather than the block itself: the arbiter is the only party that has
   * seen the whole deal, so it is the only one that can publish who is drawn how
   * without publishing who was dealt what.
   */
  test('only what is hidden is worth telling the arbiter', () => {
    expect(viewsOf(rules)).toEqual({ hidden: 'nobody' })
  })

  test('an ordinary deck sends nothing at all', () => {
    expect(viewsOf({ preset: 'freestyle', roles: ['bug', 'crew'] })).toEqual({})
    // Written-out `normal` is the same as saying nothing, and must not become a
    // row in the arbiter's state that says somebody is special.
    expect(
      viewsOf({ preset: 'freestyle', roles: ['bug'], perRole: { bug: { seen: 'normal' } } }),
    ).toEqual({})
  })

  test('an allow-only rule is invisible to the arbiter', () => {
    // Which keys are live is decided on the client that holds the secret. The
    // arbiter is told only what it alone can answer.
    expect(
      viewsOf({ preset: 'freestyle', roles: ['bug'], perRole: { bug: { allow: [] } } }),
    ).toEqual({})
  })
})

describe('whether a document takes turns', () => {
  /**
   * The arbiter refuses an out-of-turn roll only once there *is* a turn, and
   * turns used to begin on the first `pass` - so from the moment a board opened
   * until somebody first said *I am done*, everybody could roll. The opening
   * round of every game was the one round with no rule, which is the round where
   * nobody knows whose go it is yet.
   */
  const level = (blueprints: Record<string, unknown>, flow?: unknown) =>
    ({ blueprints, ...(flow === undefined ? {} : { flow }) }) as never

  test('a document with a pass anywhere in its rules does', () => {
    expect(takesTurns(level({ die: { triggers: [{ do: [{ op: 'pass' }] }] } }))).toBe(true)
  })

  test('and one that only passes on entering a phase does too', () => {
    expect(
      takesTurns(level({}, { phases: { over: { does: [{ op: 'sound' }, { op: 'pass' }] } } })),
    ).toBe(true)
  })

  test('and one with no pass at all does not, which is most levels', () => {
    // The half that matters: a level with no turns must never have a roll
    // refused for being out of one, because there is no order to be out of.
    expect(takesTurns(level({ die: { triggers: [{ do: [{ op: 'roll' }] }] } }))).toBe(false)
    expect(takesTurns(level({}))).toBe(false)
  })
})

/**
 * The second axis, and why there are two.
 *
 * `preset` answers what you do - shoot, score, run a course - and had been
 * quietly answering whether a round is happening at all, which is why its list
 * read as four styles and an absence. `mode` is that second question on its own.
 */
describe('what a level is, beside what you do in it', () => {
  test('a document that says nothing is a space', () => {
    // Every level on disk, and the reason the field is absent rather than
    // defaulted into the block.
    expect(modeOf({ preset: 'freestyle' })).toBe('space')
    expect(modeOf({ preset: 'shooter' })).toBe('space')
  })

  test('and one that says something says it', () => {
    expect(modeOf({ preset: 'freestyle', mode: 'lobby' })).toBe('lobby')
  })

  test('the two are independent, which is the whole point of splitting them', () => {
    // The pair one list could not hold: a shooting game that is a lobby rather
    // than a round. Under one vocabulary this is a `lobby-shooter` beside
    // `shooter`, and then a `lobby-football`, which is a product not a list.
    const rules: XpRules = { preset: 'shooter', mode: 'lobby' }
    expect(modeOf(rules)).toBe('lobby')
    expect(rules.preset).toBe('shooter')
  })

  test('only the three words are a mode', () => {
    for (const one of MODES) expect(isMode(one)).toBe(true)
    // The guard `PRESETS` has and for the same reason: a mode the runtime has
    // never heard of is a document that loads, looks finished, and is not.
    expect(isMode('lobbies')).toBe(false)
    expect(isMode('')).toBe(false)
  })

  test('a level that is only a lobby still keeps the rest of its rules', () => {
    // The ask this field arrived with, in a sentence: a lobby is not a mode
    // *instead of* the block, it is a mode the block is written under. A
    // scoreLimit in a lobby is a counter that keeps going; the same number in a
    // battle is how the round ends.
    const rules: XpRules = { preset: 'deathmatch', mode: 'lobby', scoreLimit: 20, sides: 'ffa' }
    expect(isDefaultRules(rules)).toBe(false)
    expect(rules.scoreLimit).toBe(20)
  })
})
