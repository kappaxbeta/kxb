import { describe, expect, test } from 'bun:test'
import { isLayer, MAX_STATES } from './animation'
import { parseXp, XP_FORMAT } from './format'

/**
 * The animation graph, as data.
 *
 * docs/xp/backlog.md §2b, step one of four: the data first, the runtime second,
 * a list panel third, a node editor last. Nothing runs this yet, so everything
 * here is about what a document may *say* - which is exactly the half a test
 * can hold, and the half that has to be right before anything reads it.
 */

const graph = (animations: unknown, blueprints?: unknown) =>
  parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, placements: [], marks: [] },
    animations,
    ...(blueprints ? { blueprints } : {}),
  })

const HUMANOID = {
  entry: 'idle',
  states: {
    idle: { clip: 'Idle_A', loop: true },
    walk: { clip: 'Walking_A', loop: true },
    wave: { clip: 'Wave', parts: ['arms'] },
  },
  transitions: [
    { from: 'idle', to: 'walk', when: { prop: 'moving', is: '>', value: 0 } },
    { from: 'walk', to: 'idle', when: { prop: 'moving', is: '==', value: 0 } },
  ],
}

describe('a graph a document can hold', () => {
  test('states, arrows and an entry survive the round trip', () => {
    const parsed = graph({ humanoid: HUMANOID })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const held = parsed.document.animations!.humanoid!
    expect(held.entry).toBe('idle')
    expect(Object.keys(held.states).sort()).toEqual(['idle', 'walk', 'wave'])
    expect(held.transitions).toHaveLength(2)
    expect(held.transitions[0]).toEqual({
      from: 'idle',
      to: 'walk',
      when: { prop: 'moving', is: '>', value: 0 },
    })
  })

  test('loop is dropped when it is off, so a one-shot is the fields it always was', () => {
    // The same round-trip rule every optional in this format keeps: absent is
    // the default, and writing the default back is a diff that means nothing.
    const parsed = graph({ humanoid: { entry: 'a', states: { a: { clip: 'Idle_A', loop: false } } } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations!.humanoid!.states.a).toEqual({ clip: 'Idle_A' })
  })

  test('a document with no animations block carries none', () => {
    const parsed = graph(undefined)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations).toBeUndefined()
  })

  test('the transitions list is optional, because a one-state graph is a pose', () => {
    /**
     * `pose` becomes sugar for exactly this, which is the point §2b makes about
     * it not being a second mechanism.
     */
    const parsed = graph({ statue: { entry: 'a', states: { a: { clip: 'Idle_A', loop: true } } } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations!.statue!.transitions).toEqual([])
  })
})

describe('a state that names parts is a layer', () => {
  test('and the format says which is which', () => {
    expect(isLayer({ clip: 'Wave', parts: ['arms'] })).toBe(true)
    expect(isLayer({ clip: 'Idle_A', loop: true })).toBe(false)
  })

  test('an empty parts list is refused rather than read as "all of them"', () => {
    // `"parts": []` reads as *no parts* to whoever wrote it, and silently
    // turning that into *every part* is the widest possible disagreement
    // between a document and its author.
    const parsed = graph({ h: { entry: 'a', states: { a: { clip: 'Idle_A' }, b: { clip: 'Wave', parts: [] } } } })
    expect(parsed.ok).toBe(false)
  })

  test('a body cannot start life as an overlay', () => {
    /**
     * A body whose entry is an arms-only layer is a body with nothing driving
     * its legs, which is the bind pose with extra steps - and the bind pose is
     * the failure this format keeps arranging to make loud.
     */
    const parsed = graph({ h: { entry: 'wave', states: { wave: { clip: 'Wave', parts: ['arms'] } } } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((one) => one.at.endsWith('.entry'))).toBe(true)
  })

  test('and no arrow joins a stance to a layer, in either direction', () => {
    /**
     * The rule that keeps **one owner of what is playing**. A stance moving to
     * a layer hands its legs to an arms-only overlay; a layer moving to a
     * stance is a wave that decided to take over walking. Both are the fold
     * that produced the walking-punch bug, arriving as data.
     */
    const both = (from: string, to: string) =>
      graph({
        h: {
          entry: 'idle',
          states: { idle: { clip: 'Idle_A', loop: true }, wave: { clip: 'Wave', parts: ['arms'] } },
          transitions: [{ from, to }],
        },
      })
    expect(both('idle', 'wave').ok).toBe(false)
    expect(both('wave', 'idle').ok).toBe(false)
    // Two layers may be joined, and so may two stances.
    expect(both('idle', 'idle').ok).toBe(true)
    expect(both('wave', 'wave').ok).toBe(true)
  })
})

describe('what a graph is refused for', () => {
  test('no states at all', () => {
    expect(graph({ h: { entry: 'a', states: {} } }).ok).toBe(false)
  })

  test('an entry naming nothing', () => {
    const parsed = graph({ h: { entry: 'nowhere', states: { a: { clip: 'Idle_A' } } } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    // The message lists what there *is*, because the most likely cause is a
    // typo and the fix is on screen.
    expect(parsed.problems.some((one) => one.message.includes('a'))).toBe(true)
  })

  test('an arrow to a state that is not there', () => {
    const parsed = graph({
      h: { entry: 'a', states: { a: { clip: 'Idle_A' } }, transitions: [{ from: 'a', to: 'b' }] },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((one) => one.at.endsWith('.to'))).toBe(true)
  })

  test('a state with no clip, because a state is a clip', () => {
    expect(graph({ h: { entry: 'a', states: { a: { loop: true } } } }).ok).toBe(false)
  })

  test('a condition that is not one', () => {
    const parsed = graph({
      h: {
        entry: 'a',
        states: { a: { clip: 'Idle_A' } },
        transitions: [{ from: 'a', to: 'a', when: { prop: 'x', is: 'sort of', value: 1 } }],
      },
    })
    expect(parsed.ok).toBe(false)
  })

  test('and a name outside the alphabet', () => {
    expect(graph({ 'not a name': HUMANOID }).ok).toBe(false)
    expect(graph({ h: { entry: 'a b', states: { 'a b': { clip: 'Idle_A' } } } }).ok).toBe(false)
  })

  test('more states than a graph may hold', () => {
    const states: Record<string, unknown> = {}
    for (let n = 0; n <= MAX_STATES; n++) states[`s${n}`] = { clip: 'Idle_A' }
    expect(graph({ h: { entry: 's0', states } }).ok).toBe(false)
  })
})

describe('the condition, shared with a rule', () => {
  test('an arrow reads `of` the same way a trigger does', () => {
    /**
     * The reason `readCondition` was extracted rather than copied: `of` is the
     * field most recently added to a condition, and therefore the one a second
     * hand-written parser would most likely be missing.
     */
    const parsed = graph({
      h: {
        entry: 'a',
        states: { a: { clip: 'Idle_A' } },
        transitions: [{ from: 'a', to: 'a', when: { of: 'world', prop: 'round', is: '>=', value: 2 } }],
      },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations!.h!.transitions[0]!.when).toEqual({
      of: 'world',
      prop: 'round',
      is: '>=',
      value: 2,
    })
  })

  test('an arrow with no condition is one that is always taken', () => {
    // How a one-shot returns to the state after it: `land` into `idle` in the
    // built-in machine fires when the clip ends rather than on a condition.
    const parsed = graph({
      h: { entry: 'a', states: { a: { clip: 'Idle_A' } }, transitions: [{ from: 'a', to: 'a' }] },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations!.h!.transitions[0]).toEqual({ from: 'a', to: 'a' })
  })
})

describe('a blueprint pointing at one', () => {
  const withAnimator = (animator: string) =>
    graph({ humanoid: HUMANOID }, { guard: { model: 'dummy/Dummy', animator } })

  test('carries the name', () => {
    const parsed = withAnimator('humanoid')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.guard!.animator).toBe('humanoid')
  })

  test('and one pointing at a graph nobody wrote is refused', () => {
    /**
     * The same refusal `script` gets and for the same reason: the symptom
     * otherwise is a body that stands there, everything renders, nothing
     * errors, and the only evidence is that the level is boring.
     */
    const parsed = withAnimator('nobody')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((one) => one.at.endsWith('.animator'))).toBe(true)
  })
})

/**
 * Which rig a graph is for, and the one thing that fact is *for*.
 *
 * A graph is a list of clip names and part names, and the two rigs share not one
 * of either - `Walking_A` and `arms` on the dummy, `walk` and `wing-left` on a
 * peep. So a body pointed at the other one's graph does not animate wrongly, it
 * does not animate at all: every state names a clip the file does not hold, the
 * body keeps its bind pose, and nothing anywhere says why. `rig` exists so the
 * parser can say why, before anybody plays the level.
 */
describe('which rig a graph is for', () => {
  const FOX = {
    entry: 'idle',
    rig: 'peepz',
    states: { idle: { clip: 'idle', loop: true }, walk: { clip: 'walk', loop: true } },
    transitions: [{ from: 'idle', to: 'walk' }],
  }

  test('a graph carries it through the round trip', () => {
    const parsed = graph({ fox: FOX })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.animations!.fox!.rig).toBe('peepz')
  })

  test('leaving it out is the dummy, which is what every graph written before this is', () => {
    const parsed = graph({ humanoid: HUMANOID })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // Absent rather than filled in: the format writes back what it was given,
    // and a document that gained a field it never declared would no longer
    // round-trip byte for byte.
    expect(parsed.document.animations!.humanoid!.rig).toBeUndefined()
  })

  test('a rig nobody ships is refused rather than read as the dummy', () => {
    // The editor's own `rigFor` falls back, and is right to: there, a bad name
    // means a body on screen you can switch. Here it means a saved level whose
    // every clip binds to nothing, and calling that "the dummy" would be the
    // format inventing an answer the author got wrong.
    const parsed = graph({ gerbil: { ...FOX, rig: 'gerbil' } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((problem) => problem.at)).toContain('animations.gerbil.rig')
  })

  test('a body wearing one rig cannot point at the other one s graph', () => {
    const parsed = graph(
      { fox: FOX },
      { guard: { model: 'dummy/Dummy', animator: 'fox' } },
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    const problem = parsed.problems.find((entry) => entry.at === 'blueprints.guard.animator')
    expect(problem?.message).toContain('peepz')
    expect(problem?.message).toContain('dummy')
  })

  test('and the matching pair is fine', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }, { id: 'peepz' }],
      world: { floorY: 0, placements: [], marks: [] },
      animations: { fox: FOX },
      blueprints: { critter: { model: 'peepz/fox', animator: 'fox' } },
    })
    expect(parsed.ok).toBe(true)
  })

  test('a graph that says nothing is compared with nothing', () => {
    // Every graph written before the field existed. Refusing on an absence
    // would break documents that are fine.
    const parsed = graph(
      { quiet: { entry: 'a', states: { a: { clip: 'Idle_A' } }, transitions: [] } },
      { guard: { model: 'dummy/Dummy', animator: 'quiet' } },
    )
    expect(parsed.ok).toBe(true)
  })

  test('and neither is a model from a pack we do not ship', () => {
    // The unknown model has its own complaint and that is the *only* one here:
    // `skeletonOf` has no rig to report for a pack nobody ships, so there is
    // nothing to compare and nothing to refuse. Guessing "not a peep, therefore
    // a mismatch" would put a second, wrong error under the first, true one.
    const parsed = graph({ fox: FOX }, { guard: { model: 'elsewhere/Hero', animator: 'fox' } })
    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? [] : parsed.problems.map((problem) => problem.at)).toEqual([
      'blueprints.guard.model',
    ])
  })
})
