import { describe, expect, test } from 'bun:test'
import {
  CAPABILITIES,
  capabilityProblems,
  describeCapability,
  isCapability,
  supports,
} from './capabilities'
import { parseXp, XP_FORMAT, type Mark, type XpWorld } from './format'

/**
 * The claim that gets checked.
 *
 * Most of these are about *refusal*, because that is the entire value of the
 * idea: a tag nobody verifies is a level the match lobby offers, loads, starts,
 * and then cannot score - failing at kickoff in front of everybody, looking
 * like a broken game rather than an unfinished level.
 */

function world(marks: Mark[] = []): XpWorld {
  return { floorY: 0, ground: false, restart: false,
  fatal: false, placements: [], marks }
}

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
  test('every capability has a line explaining it', () => {
    for (const capability of CAPABILITIES) {
      expect(describeCapability(capability).length).toBeGreaterThan(10)
    }
  })

  test('an invented capability is not one', () => {
    expect(isCapability('football')).toBe(true)
    expect(isCapability('battle-royale')).toBe(false)
  })

  test('supports is the read side a lobby filters on', () => {
    expect(supports(['freeplay', 'match'], 'match')).toBe(true)
    expect(supports(['freeplay'], 'football')).toBe(false)
  })
})

describe('what each capability demands of the world', () => {
  test('freeplay is the one claim that is never a lie', () => {
    expect(capabilityProblems('freeplay', world())).toEqual([])
  })

  test('football needs a goal at each end', () => {
    expect(capabilityProblems('football', world())).toEqual([
      'no red goal to score in',
      'no blue goal to score in',
    ])
    // Both reasons, not the first: an author who forgot both should hear about
    // both rather than fixing one and being told off again.
    expect(capabilityProblems('football', world([mark('red')]))).toEqual([
      'no blue goal to score in',
    ])
    expect(capabilityProblems('football', world([mark('red'), mark('blue')]))).toEqual([])
  })

  test('a match needs somewhere for each side to start', () => {
    // One shared spawn is not a match, it is a scrum: everybody arrives inside
    // everybody else and the first ten seconds go on untangling.
    expect(capabilityProblems('match', world([mark('spawn', 'red')]))).toHaveLength(1)
    expect(
      capabilityProblems('match', world([mark('spawn', 'red'), mark('spawn', 'blue')])),
    ).toEqual([])
  })

  test('a competition needs a beginning and an end', () => {
    expect(capabilityProblems('competition', world([mark('start')]))).toEqual([
      'no finish, so a run never ends and cannot be timed',
    ])
    expect(capabilityProblems('competition', world([mark('start'), mark('finish')]))).toEqual([])
  })
})

describe('the parser refuses a claim the world does not back up', () => {
  test('football with no goals is refused, by name', () => {
    const problems = problemsOf(doc({ capabilities: ['football'] }))
    expect(problems).toContain('capabilities: claims "football" but no red goal to score in')
    expect(problems).toContain('capabilities: claims "football" but no blue goal to score in')
  })

  test('a claim the world does back up parses', () => {
    const result = parseXp(
      doc({
        capabilities: ['football'],
        world: { floorY: 0, placements: [], marks: [mark('red'), mark('blue')] },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.capabilities).toEqual(['football'])
  })

  test('an invented capability is refused', () => {
    expect(problemsOf(doc({ capabilities: ['battle-royale'] }))).toContain(
      'capabilities[0]: not a capability: "battle-royale"',
    )
  })

  test('the same capability twice is refused rather than deduplicated', () => {
    // Quietly collapsing it would hide a copy-paste in a hand-written document,
    // which is the only way it can happen.
    expect(problemsOf(doc({ capabilities: ['freeplay', 'freeplay'] }))).toContain(
      'capabilities[1]: listed twice: freeplay',
    )
  })

  test('a document that declares none is freeplay, not nothing', () => {
    // Nothing at all would be a level no flow can ever schedule - a level
    // nobody can open.
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.capabilities).toEqual(['freeplay'])
  })
})

describe('marks', () => {
  test('an unknown kind is refused', () => {
    const problems = problemsOf(
      doc({ world: { floorY: 0, placements: [], marks: [{ kind: 'goal', x: 0, y: 0, z: 0 }] } }),
    )
    expect(problems.some((p) => p.includes('must be one of'))).toBe(true)
  })

  test('a frame the size of the world is refused', () => {
    const problems = problemsOf(
      doc({
        world: {
          floorY: 0,
          placements: [],
          marks: [{ kind: 'red', x: 0, y: 0, z: 0, width: 900, height: 4 }],
        },
      }),
    )
    expect(problems.some((p) => p.includes('between 1 and'))).toBe(true)
  })

  test('size and facing default, so a spawn is a kind and three numbers', () => {
    const result = parseXp(
      doc({ world: { floorY: 0, placements: [], marks: [{ kind: 'spawn', x: 1, y: 2, z: 3 }] } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.marks[0]).toMatchObject({ facing: 0, x: 1, y: 2, z: 3 })
  })

  test('a world with no marks at all is fine', () => {
    const result = parseXp(doc({ world: { floorY: 0, placements: [] } }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.world.marks).toEqual([])
  })
})
