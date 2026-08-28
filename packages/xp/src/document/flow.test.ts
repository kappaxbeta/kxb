import { describe, expect, test } from 'bun:test'
import { MODES } from './rules'
import {
  allowedFor,
  allowedIn,
  flowFor,
  flowProblems,
  MAX_PHASES,
  MAX_ROUNDS,
  MAX_SAYS,
  phaseCountdown,
  ROUND_AGAIN,
  RUN_OVER,
  stepFrom,
  type FlowPhase,
  type XpFlow,
} from './flow'
import { parseXp, XP_FORMAT } from './format'
import type { Condition } from '../rules/triggers'

/** A turn, which is the shape this block was built to be able to say. */
const turn: XpFlow = {
  start: 'roll',
  phases: {
    roll: { allow: ['roll'], next: [{ on: 'rolled', go: 'move' }] },
    move: {
      allow: ['use'],
      next: [
        { on: 'six', go: 'roll' },
        { on: 'moved', go: 'roll' },
      ],
    },
  },
}

describe('a flow that holds', () => {
  test('a turn is two phases and three arrows, and nothing objects', () => {
    expect(flowProblems(turn)).toEqual([])
  })

  test('a phase may loop back to itself without being unreachable', () => {
    expect(
      flowProblems({ start: 'one', phases: { one: { next: [{ on: 'again', go: 'one' }] } } }),
    ).toEqual([])
  })
})

describe('what a flow is refused for', () => {
  test('a start that names nothing', () => {
    expect(flowProblems({ ...turn, start: 'begin' })).toContain(
      '"start" names "begin", which is not one of the phases',
    )
  })

  test('a step pointing at a phase that is not there', () => {
    /**
     * The mistake that would otherwise be invisible: the run reaches that step,
     * goes nowhere, and the level appears to freeze with nothing anywhere
     * saying why.
     */
    const flow = { ...turn, phases: { ...turn.phases, roll: { next: [{ on: 'rolled', go: 'mv' }] } } }
    expect(flowProblems(flow)).toContain(
      '"roll" step 0 goes to "mv", which is not one of the phases',
    )
  })

  test('a phase nothing reaches', () => {
    // Not an error in any language and always a mistake here: a state somebody
    // drew, wired to nothing, and will spend an afternoon not seeing.
    const flow = { ...turn, phases: { ...turn.phases, orphan: {} } }
    expect(flowProblems(flow)).toContain('nothing reaches "orphan", so a run can never be in it')
  })

  test('a step with no reason to be taken', () => {
    // Same silent-forever failure as a rule matching a tag nothing carries.
    const flow: XpFlow = { start: 'a', phases: { a: { next: [{ go: 'a' }] } } }
    expect(flowProblems(flow)).toContain(
      '"a" step 0 has no "when", "on" or "after", so nothing can ever take it',
    )
  })

  test('a wait that is not a wait', () => {
    const flow: XpFlow = { start: 'a', phases: { a: { next: [{ after: 0, go: 'a' }] } } }
    expect(flowProblems(flow)).toContain('"a" step 0 waits 0 seconds, which is not a wait')
  })

  test('a flow with no phases at all', () => {
    expect(flowProblems({ start: 'a', phases: {} })).toEqual(['a flow with no phases is not a flow'])
  })

  test('more phases than a graph anybody can read', () => {
    const phases: Record<string, { next: { on: string; go: string }[] }> = {}
    for (let i = 0; i <= MAX_PHASES; i++) phases[`p${i}`] = { next: [{ on: 'go', go: 'p0' }] }
    expect(flowProblems({ start: 'p0', phases })).toContain(
      `too many phases: ${MAX_PHASES + 1}, and the limit is ${MAX_PHASES}`,
    )
  })

  test('every reason at once, not the first one', () => {
    // The same promise `cameraProblems` and `rulesProblems` make: an author with
    // two mistakes is told about two mistakes.
    const problems = flowProblems({ start: 'nowhere', phases: { a: { next: [{ on: 'x', go: 'b' }] } } })
    expect(problems.length).toBeGreaterThan(1)
  })
})

describe('a run that goes round', () => {
  /** Best of three, said the way the field means it to be said. */
  const best = (rounds: number | undefined): XpFlow => ({
    ...(rounds === undefined ? {} : { rounds }),
    start: 'play',
    phases: {
      play: { next: [{ after: 90, go: 'between' }] },
      between: { next: [{ after: 4, go: ROUND_AGAIN }] },
    },
  })

  test('a count and a seam hold together', () => {
    expect(flowProblems(best(3))).toEqual([])
  })

  test('a seam with no count is refused, because there is nothing to go round', () => {
    expect(flowProblems(best(undefined)).join(' ')).toContain('declares no "rounds"')
  })

  test('a count with no seam is refused, because the round would be played once', () => {
    /**
     * The half that would otherwise be silent: `rounds: 3` on a flow whose
     * phases never reach the seam is a best-of-three that plays exactly once
     * and says nothing about it. Same class as the phase nothing reaches.
     */
    const once: XpFlow = { rounds: 3, start: 'play', phases: { play: {} } }
    expect(flowProblems(once).join(' ')).toContain(`no step goes to "${ROUND_AGAIN}"`)
  })

  test('one round is not a number of rounds', () => {
    // Best of one is a run with no rounds at all, and saying it twice would be
    // two ways to write the same document.
    expect(flowProblems({ ...best(1), rounds: 1 }).join(' ')).toContain('two or more times')
    expect(flowProblems({ ...best(0), rounds: 0 }).join(' ')).toContain('two or more times')
  })

  test('and neither is two and a half', () => {
    expect(flowProblems({ ...best(2.5), rounds: 2.5 }).join(' ')).toContain('two or more times')
  })

  test('there is a limit, for the reason MAX_PHASES has one', () => {
    expect(flowProblems({ ...best(MAX_ROUNDS + 1), rounds: MAX_ROUNDS + 1 }).join(' ')).toContain(
      'too many rounds',
    )
  })

  test('the seam reaches the start, so the opening phase is not an orphan', () => {
    /**
     * The reachability walk has to know what the seam does or every
     * best-of-three would be told nothing reaches the phase it opens in -
     * which is the graph calling the one phase everybody plays unreachable.
     */
    const round: XpFlow = {
      rounds: 2,
      start: 'play',
      phases: { play: { next: [{ after: 30, go: ROUND_AGAIN }] } },
    }
    expect(flowProblems(round)).toEqual([])
  })

  test('the end is a destination and reaches nothing', () => {
    const stop: XpFlow = {
      start: 'play',
      phases: { play: { next: [{ after: 30, go: RUN_OVER }] } },
    }
    expect(flowProblems(stop)).toEqual([])
  })

  test('a phase may not take the reserved mark for itself', () => {
    // Two readings of one word, decided by whichever check ran first.
    const shady: XpFlow = { start: ROUND_AGAIN, phases: { [ROUND_AGAIN]: {} } }
    expect(flowProblems(shady).join(' ')).toContain('starts with "@"')
  })
})

describe('which keys a phase leaves live', () => {
  const bound = ['use', 'roll', 'attack']

  test('a phase that says nothing leaves them all', () => {
    expect(allowedIn(undefined, bound)).toEqual(bound)
    expect(allowedIn({}, bound)).toEqual(bound)
  })

  test('and one that names some leaves only those', () => {
    expect(allowedIn({ allow: ['use'] }, bound)).toEqual(['use'])
  })

  test('empty means none, which is how a phase says watch and do not touch', () => {
    expect(allowedIn({ allow: [] }, bound)).toEqual([])
  })

  test('a phase can only ever narrow, never add', () => {
    // A phase that could add a binding would be a second place bindings come
    // from, and the button a phone draws would stop matching the rule that fires.
    expect(allowedIn({ allow: ['fly'] }, bound)).toEqual([])
  })
})

describe('and what the role you were dealt leaves live', () => {
  const bound = ['use', 'roll', 'attack']

  test('nobody dealt anything is exactly the phase on its own', () => {
    // Which is every player for the first seconds of every round, and every
    // player forever in a level with no deck - so this is the ordinary path
    // rather than the fallback.
    expect(allowedFor(undefined, undefined, bound)).toEqual(bound)
    expect(allowedFor({ allow: ['use', 'roll'] }, undefined, bound)).toEqual(['use', 'roll'])
  })

  test('a role narrows what the phase left', () => {
    expect(allowedFor({ allow: ['use', 'roll'] }, ['roll'], bound)).toEqual(['roll'])
  })

  test('a role cannot hand back what the phase took away', () => {
    /**
     * The rule the whole of §3 rests on. A phase saying *watch, do not touch*
     * has to stay true for everybody at the table, whatever they were dealt -
     * otherwise answering "does this button do anything" needs two tables, one
     * of which is secret, so nobody watching could answer it at all.
     */
    expect(allowedFor({ allow: [] }, ['attack'], bound)).toEqual([])
    expect(allowedFor({ allow: ['use'] }, ['attack'], bound)).toEqual([])
  })

  test('and it cannot invent one the document never bound', () => {
    expect(allowedFor(undefined, ['fly'], bound)).toEqual([])
  })

  test('a role that says none is how a role says watch', () => {
    expect(allowedFor(undefined, [], bound)).toEqual([])
  })
})

describe("and whose go it is, when the phase is the turn-holder's", () => {
  const bound = ['use', 'roll', 'attack']
  const turnPhase = { allow: ['roll'], who: 'turn' as const }

  test("somebody else's go is no keys at all", () => {
    // The silence this field ends: four players saw a live die and one of
    // them was right. Now the other three see what the arbiter always knew.
    expect(allowedFor(turnPhase, undefined, bound, false)).toEqual([])
  })

  test('your go is exactly what the phase left', () => {
    expect(allowedFor(turnPhase, undefined, bound, true)).toEqual(['roll'])
  })

  test('nobody holding the turn opens the gate', () => {
    /**
     * Turns start on the first `turn_start`, and a level played alone has no
     * arbiter to start any - a table where nothing has begun must not be a
     * table where every key is dead. The arbiter still refuses out-of-turn
     * effects; this only decides what is drawn and dispatched locally.
     */
    expect(allowedFor(turnPhase, undefined, bound, null)).toEqual(['roll'])
    expect(allowedFor(turnPhase, undefined, bound)).toEqual(['roll'])
  })

  test('a phase that belongs to everybody never asks', () => {
    expect(allowedFor({ allow: ['roll'] }, undefined, bound, false)).toEqual(['roll'])
  })

  test('the role still narrows what a turn leaves', () => {
    expect(allowedFor(turnPhase, [], bound, true)).toEqual([])
  })
})

describe('reading one out of a document', () => {
  const document = (flow: unknown) => ({
    format: XP_FORMAT,
    id: 'x',
    name: 'x',
    packs: [{ id: 'proto' }],
    capabilities: ['freeplay'],
    blueprints: {},
    entities: [],
    world: {
      floorY: 0,
      placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
      marks: [],
    },
    spawn: { x: 0, y: 1, z: 0, facing: 0 },
    player: { keys: [{ key: 'KeyE', does: 'use' }] },
    ...(flow === undefined ? {} : { flow }),
  })

  test('a document without one parses and carries none', () => {
    const parsed = parseXp(document(undefined))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.flow).toBeUndefined()
  })

  test('a turn survives the round trip', () => {
    const parsed = parseXp(document(turn))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.flow).toEqual(turn)
  })

  test('an empty allow survives it too, because it is not the same as absent', () => {
    const parsed = parseXp(document({ start: 'a', phases: { a: { allow: [] } } }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.flow?.phases.a.allow).toEqual([])
  })

  test("a turn-holder's phase keeps its who", () => {
    const parsed = parseXp(document({ start: 'a', phases: { a: { who: 'turn' } } }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.flow?.phases.a.who).toBe('turn')
  })

  test('and any other who is refused rather than dropped', () => {
    // A phase that meant to be turn-scoped and silently was not is four live
    // buttons and one working one - the failure the field exists to end.
    const parsed = parseXp(document({ start: 'a', phases: { a: { who: 'me' } } }))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.problems.some((one) => one.at === 'flow.phases.a.who')).toBe(true)
    }
  })

  test('a bad destination is a refusal with the phase named', () => {
    const parsed = parseXp(document({ start: 'a', phases: { a: { next: [{ on: 'x', go: 'b' }] } } }))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.problems.some((one) => one.message.includes('not one of the phases'))).toBe(true)
    }
  })

  test('a verb the format does not have is refused where it was written', () => {
    const parsed = parseXp(
      document({ start: 'a', phases: { a: { does: [{ op: 'levitate' }] } } }),
    )
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.problems.some((one) => one.at.includes('flow.phases.a.does'))).toBe(true)
  })
})

/**
 * When a run is won, which is the field that makes a flow a game rather than a
 * loop — docs/xp/xp-flow.md §4.
 *
 * The parser's half, because `flowProblems` deliberately has nothing to say
 * about it: a `wins` naming a field nobody declared is caught by the walk over
 * the whole document, where the same typo in a rule is caught, and a second
 * check here would be a second one to keep in step.
 */
describe('when a run is won', () => {
  const document = (flow: unknown) => ({
    format: XP_FORMAT,
    id: 'x',
    name: 'x',
    packs: [{ id: 'proto' }],
    capabilities: ['freeplay'],
    blueprints: {},
    entities: [],
    data: {
      'mine-home': { scope: 'space', value: 0 },
      wanted: { scope: 'space', value: 0 },
      'this-game': { scope: 'run', value: 0 },
    },
    world: {
      floorY: 0,
      placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
      marks: [],
    },
    spawn: { x: 0, y: 1, z: 0, facing: 0 },
    player: { keys: [{ key: 'KeyE', does: 'use' }] },
    flow,
  })

  const one = { start: 'play', phases: { play: {} } }

  test('a condition on the level’s own data survives the round trip', () => {
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'this-game', is: '>=', value: 4 } }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.flow?.wins).toEqual({
      of: 'world',
      prop: 'this-game',
      is: '>=',
      value: 4,
    })
  })

  test('absent stays absent, so a flow that never ends round-trips unchanged', () => {
    const parsed = parseXp(document(one))
    expect(parsed.ok && 'wins' in (parsed.document.flow ?? {})).toBe(false)
  })

  test('a broken one is refused where it was written', () => {
    const parsed = parseXp(document({ ...one, wins: { prop: 'mine-home', is: 'about' } }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((problem) => problem.at === 'flow.wins')).toBe(true)
  })

  test('and one about a field nobody declared is caught by the document’s own walk', () => {
    // The same check that catches the typo in a rule. A flow left out of it
    // would be the one part of a document allowed to misspell a field quietly.
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'mine-hom', is: '>=', value: 4 } }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((problem) => problem.message).join('\n')).toContain('mine-hom')
  })

  test('a wins compared against something the level is keeping is counted too', () => {
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'mine-home', is: '>=', value: '@world.wnated' } }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((problem) => problem.message).join('\n')).toContain('wnated')
  })

  /**
   * The trap `wins` opens, and it opens quietly: `blue-home >= 4` is the obvious
   * way to write *first player home wins*, and it is correct exactly once.
   */
  test('an ending counting a field that outlives the run is refused', () => {
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'mine-home', is: '>=', value: 4 } }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    const said = parsed.problems.map((problem) => problem.message).join('\n')
    expect(said).toContain('mine-home')
    expect(said).toContain('run')
  })

  test('and one counting something that starts over is fine', () => {
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'this-game', is: '>=', value: 4 } }),
    )
    expect(parsed.ok).toBe(true)
  })

  test('a *transition* may read a saved number, which is the whole asymmetry', () => {
    /**
     * "If you have ten coins, go to the shop phase" is a persistent unlock
     * deciding which way a round goes, and refusing it would take away most of
     * what `when` is for. An ending is different in kind: it is asked on every
     * frame from the first, so a number that arrives already true answers it
     * before the run exists.
     */
    const parsed = parseXp(
      document({
        start: 'play',
        phases: {
          play: { next: [{ when: { of: 'world', prop: 'mine-home', is: '>=', value: 4 }, go: 'over' } ] },
          over: {},
        },
      }),
    )
    expect(parsed.ok).toBe(true)
  })

  test('and the right-hand side is a target rather than a tally, so it is not checked', () => {
    // "First to whatever this space decided" is a perfectly good sentence.
    const parsed = parseXp(
      document({
        ...one,
        wins: { of: 'world', prop: 'this-game', is: '>=', value: '@world.mine-home' },
      }),
    )
    expect(parsed.ok).toBe(true)
  })

  test('an ending about a player’s own properties is not a scope question', () => {
    // Props are rebuilt when a body spawns, so nothing here outlives anything.
    const parsed = parseXp(document({ ...one, wins: { prop: 'lives', is: '<=', value: 0 } }))
    expect(parsed.ok).toBe(true)
  })

  test('and a field nobody declared is reported once, as the typo it is', () => {
    const parsed = parseXp(
      document({ ...one, wins: { of: 'world', prop: 'mine-hom', is: '>=', value: 4 } }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.filter((problem) => problem.message.includes('mine-hom'))).toHaveLength(1)
  })

  test('and a phase’s own verbs name fields the same way a rule’s do', () => {
    const parsed = parseXp(
      document({
        start: 'play',
        phases: { play: { does: [{ op: 'roll', key: 'wnated', sides: 6 }] } },
      }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((problem) => problem.message).join('\n')).toContain('wnated')
  })
})

describe('what a phase says it is', () => {
  /**
   * The only part of a flow a *player* ever reads. `allow` decides which keys
   * are live and tells nobody - the key quietly does nothing - so every person
   * who has played one of these without writing it has asked the same question:
   * *what do I do now?*
   */
  const said = (says: unknown) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'x',
      packs: [{ id: 'proto' }],
      capabilities: ['freeplay'],
      blueprints: {},
      entities: [],
      world: {
        floorY: 0,
        placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
        marks: [],
      },
      spawn: { x: 0, y: 1, z: 0, facing: 0 },
      player: { keys: [{ key: 'KeyE', does: 'use' }] },
      flow: { start: 'a', phases: { a: { says } } },
    })

  test('a line survives the round trip', () => {
    const parsed = said('Press R to roll.')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.flow?.phases.a.says).toBe('Press R to roll.')
  })

  test('and is trimmed, because trailing space is not a sentence', () => {
    const parsed = said('  hold E  ')
    expect(parsed.ok && parsed.document.flow?.phases.a.says).toBe('hold E')
  })

  test('empty is absent rather than an empty string', () => {
    // A phase saying nothing and a phase carrying "" are the same phase, and
    // only one of them should be a document.
    const parsed = said('   ')
    expect(parsed.ok && parsed.document.flow?.phases.a.says).toBeUndefined()
  })

  test('and a paragraph is refused, because it is drawn over a running game', () => {
    const parsed = said('x'.repeat(MAX_SAYS + 1))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.problems.some((one) => one.at.endsWith('.says'))).toBe(true)
  })

  test('and something that is not text is refused rather than stringified', () => {
    expect(said(7).ok).toBe(false)
  })
})

/**
 * The two decisions a phase makes each frame.
 *
 * Both lived inside the 1,706-line `useFrame` in the host's simulation.tsx
 * until now, which meant the only way to check that a countdown reads 3, 2, 1 -
 * or that two steps whose conditions both hold pick the one written first - was
 * to author a level and watch it. Neither is a hard rule; both are the kind
 * that is quietly wrong for a year.
 */

const never = (): boolean => {
  throw new Error('holds() should not have been reached')
}

/** Any real condition; what it says does not matter, only that it is asked. */
const SCORED: Condition = { of: 'world', prop: 'mine-home', is: '>=', value: 4 }

describe('phaseCountdown', () => {
  test('a phase with no clock has no countdown', () => {
    expect(phaseCountdown({ next: [{ on: 'rolled', go: 'move' }] }, 0)).toBeNull()
    expect(phaseCountdown({ next: [] }, 0)).toBeNull()
    expect(phaseCountdown(undefined, 0)).toBeNull()
  })

  /** Rounded up, so the last second is visible rather than spent showing zero. */
  test('reads 3, 2, 1 across a three-second phase', () => {
    const phase: FlowPhase = { next: [{ after: 3, go: 'over' }] }
    expect(phaseCountdown(phase, 0)).toBe(3)
    expect(phaseCountdown(phase, 0.5)).toBe(3)
    expect(phaseCountdown(phase, 1)).toBe(2)
    expect(phaseCountdown(phase, 2.01)).toBe(1)
    expect(phaseCountdown(phase, 2.99)).toBe(1)
  })

  test('never goes below zero, however long the phase overruns', () => {
    const phase: FlowPhase = { next: [{ after: 3, go: 'over' }] }
    expect(phaseCountdown(phase, 3)).toBe(0)
    expect(phaseCountdown(phase, 90)).toBe(0)
  })

  /** The earlier clock is the one that will actually fire, so it is the one shown. */
  test('two clocks count down the shorter, whichever order they are written', () => {
    expect(phaseCountdown({ next: [{ after: 10, go: 'a' }, { after: 4, go: 'b' }] }, 0)).toBe(4)
    expect(phaseCountdown({ next: [{ after: 4, go: 'b' }, { after: 10, go: 'a' }] }, 0)).toBe(4)
  })

  test('steps without a clock are ignored by the countdown', () => {
    const phase: FlowPhase = { next: [{ on: 'rolled', go: 'a' }, { after: 5, go: 'b' }] }
    expect(phaseCountdown(phase, 1)).toBe(4)
  })
})

describe('stepFrom', () => {
  const still = { age: 0, said: [] as readonly string[], holds: () => false }

  test('a phase with nowhere to go stays put', () => {
    expect(stepFrom(undefined, still)).toBeNull()
    expect(stepFrom({ next: [] }, still)).toBeNull()
  })

  test('nothing true means nothing taken', () => {
    const phase: FlowPhase = { next: [{ on: 'rolled', go: 'move' }, { after: 5, go: 'over' }] }
    expect(stepFrom(phase, still)).toBeNull()
  })

  test('an event heard this frame is taken', () => {
    const phase: FlowPhase = { next: [{ on: 'rolled', go: 'move' }] }
    expect(stepFrom(phase, { ...still, said: ['rolled'] })?.go).toBe('move')
  })

  test('an event heard on some other frame is not', () => {
    const phase: FlowPhase = { next: [{ on: 'rolled', go: 'move' }] }
    expect(stepFrom(phase, { ...still, said: ['scored', 'hit'] })).toBeNull()
  })

  test('a clock is taken at its second, not before', () => {
    const phase: FlowPhase = { next: [{ after: 5, go: 'over' }] }
    expect(stepFrom(phase, { ...still, age: 4.99 })).toBeNull()
    expect(stepFrom(phase, { ...still, age: 5 })?.go).toBe('over')
    expect(stepFrom(phase, { ...still, age: 500 })?.go).toBe('over')
  })

  test('a condition is asked, and taken when it holds', () => {
    const phase: FlowPhase = { next: [{ when: SCORED, go: 'out' }] }
    expect(stepFrom(phase, { ...still, holds: () => false })).toBeNull()
    expect(stepFrom(phase, { ...still, holds: () => true })?.go).toBe('out')
  })

  /**
   * Two true at once is a priority, not an error - and the author's order is
   * the priority. A set would have made this arbitrary.
   */
  test('the first step that holds is the one taken', () => {
    const phase: FlowPhase = {
      next: [
        { on: 'rolled', go: 'first' },
        { after: 0, go: 'second' },
      ],
    }
    expect(stepFrom(phase, { ...still, said: ['rolled'], age: 10 })?.go).toBe('first')
  })

  test('and order is what decides it, not which kind of step it is', () => {
    const phase: FlowPhase = {
      next: [
        { after: 0, go: 'second' },
        { on: 'rolled', go: 'first' },
      ],
    }
    expect(stepFrom(phase, { ...still, said: ['rolled'], age: 10 })?.go).toBe('second')
  })

  /**
   * `when` walks a condition against the live world; the other two do not. So a
   * step that already leaves on its event must never pay for it.
   */
  test('a step that leaves on its event never evaluates its own condition', () => {
    const phase: FlowPhase = {
      next: [{ on: 'rolled', when: SCORED, go: 'move' }],
    }
    expect(stepFrom(phase, { ...still, said: ['rolled'], holds: never })?.go).toBe('move')
  })

  test('nor does a step whose clock is already up', () => {
    const phase: FlowPhase = {
      next: [{ after: 1, when: SCORED, go: 'over' }],
    }
    expect(stepFrom(phase, { ...still, age: 2, holds: never })?.go).toBe('over')
  })

  /** A later step is never reached once an earlier one has been taken. */
  test('conditions past the taken step are not asked either', () => {
    const phase: FlowPhase = {
      next: [
        { on: 'rolled', go: 'first' },
        { when: SCORED, go: 'second' },
      ],
    }
    expect(stepFrom(phase, { ...still, said: ['rolled'], holds: never })?.go).toBe('first')
  })
})

/**
 * Which round a session plays, when a level carries more than one.
 *
 * A document can keep a round per mode, and `flowFor` is the one place that
 * chooses, so that the thirty readers downstream go on reading a single flow.
 */
describe('a round per mode', () => {
  const room: XpFlow = { start: 'idle', phases: { idle: { allow: [], next: [] } } }
  const fight: XpFlow = { start: 'warmup', phases: { warmup: { allow: [], next: [] } } }
  const foyer: XpFlow = { start: 'waiting', phases: { waiting: { allow: [], next: [] } } }

  test('a mode with a round of its own plays it', () => {
    const document = { flow: room, flows: { battle: fight, lobby: foyer } }
    expect(flowFor(document, 'battle')).toBe(fight)
    expect(flowFor(document, 'lobby')).toBe(foyer)
  })

  /**
   * The fallback, and it only goes one way.
   *
   * A level with one round that happens to be scheduled as a match is the
   * ordinary case; making it write the same phases under every mode would be a
   * format that punishes the common document for the sake of the rare one.
   */
  test('and one with none plays the level’s own', () => {
    const document = { flow: room, flows: { battle: fight } }
    expect(flowFor(document, 'space')).toBe(room)
    expect(flowFor(document, 'lobby')).toBe(room)
  })

  test('nothing falls back the other way, which would be a whistle nobody asked for', () => {
    expect(flowFor({ flows: { battle: fight } }, 'space')).toBeUndefined()
    expect(flowFor({ flows: { battle: fight } }, 'lobby')).toBeUndefined()
  })

  test('a level with no rounds at all has none, which has to stay possible', () => {
    // `steal-a-plant` is the document that proves it: plants persist, anybody
    // walking in sees them, and there are no rounds and nothing to win.
    for (const mode of MODES) expect(flowFor({}, mode)).toBeUndefined()
  })

  test('every mode is answerable, so a fourth one arrives with somewhere to go', () => {
    // The correction this shape came from: two blocks was the case in front of
    // us rather than the shape of the problem.
    const document = { flow: room }
    for (const mode of MODES) expect(flowFor(document, mode)).toBe(room)
  })
})
