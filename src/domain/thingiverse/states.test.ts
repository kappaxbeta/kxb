import { describe, expect, test } from 'bun:test'

import { THING_DEEDS, THING_WHENS } from '@/domain/thingiverse/blueprint'
import {
  CHANGE_WHENS,
  filling,
  freshRespawn,
  freshStates,
  lookOf,
  MAX_STATES,
  standing,
  startOf,
  stateNamed,
  statesProblems,
  step,
  type Happened,
  type States,
} from '@/domain/thingiverse/states'

/** A cooker: raw, five seconds on the heat, cooked - and it rings when it is. */
function cooker(): States {
  return {
    start: 'raw',
    states: [
      { name: 'raw', changes: [{ when: 'filled', to: 'cooking' }] },
      {
        name: 'cooking',
        changes: [{ when: 'after', to: 'cooked', seconds: 5, fill: true }],
      },
      { name: 'cooked', emit: 'ding', changes: [] },
    ],
  }
}

const quiet: Happened = { dt: 0 }

describe('where a thing is', () => {
  test('a fresh thing is in the machine\'s starting state', () => {
    expect(standing(cooker()).state).toBe('raw')
    expect(standing(cooker()).since).toBe(0)
  })

  test('a start nobody wrote falls back to the first state', () => {
    const machine: States = { ...cooker(), start: 'nonsense' }
    expect(startOf(machine)).toBe('raw')
  })

  test('an empty machine has nowhere to start and does not throw', () => {
    expect(startOf({ start: 'raw', states: [] })).toBe('')
  })
})

describe('the clock', () => {
  test('a timed change waits, and then fires', () => {
    const machine = cooker()
    let now = { state: 'cooking', since: 0 }

    now = step(machine, now, { dt: 4.9 }).standing
    expect(now.state).toBe('cooking')

    now = step(machine, now, { dt: 0.2 }).standing
    expect(now.state).toBe('cooked')
  })

  test('and the clock restarts on the way in, whatever the frame rate did', () => {
    const machine = cooker()
    const after = step(machine, { state: 'cooking', since: 4.9 }, { dt: 5 })
    // Not 4.9: a burger that carried its overshoot into the next state would
    // cook at a speed that depended on where the frame boundary fell.
    expect(after.standing.since).toBe(0)
  })

  test('a bar fills over the wait it is actually waiting on', () => {
    const machine = cooker()
    expect(filling(machine, { state: 'raw', since: 3 })).toBeNull()
    expect(filling(machine, { state: 'cooking', since: 0 })).toBe(0)
    expect(filling(machine, { state: 'cooking', since: 2.5 })).toBe(0.5)
    // Never past full, however long the frame was.
    expect(filling(machine, { state: 'cooking', since: 900 })).toBe(1)
  })

  test('a wait nobody asked to see draws nothing', () => {
    const machine: States = {
      start: 'gone',
      states: [{ name: 'gone', changes: [{ when: 'after', to: 'gone', seconds: 8 }] }],
    }
    expect(filling(machine, { state: 'gone', since: 4 })).toBeNull()
  })
})

describe('signals', () => {
  test('a state shouts on the way in, not on the way out', () => {
    const machine = cooker()
    const arriving = step(machine, { state: 'cooking', since: 5 }, quiet)
    expect(arriving.emit).toEqual(['ding'])

    // And not again, standing there.
    expect(step(machine, arriving.standing, { dt: 1 }).emit).toEqual([])
  })

  test('a word moves a thing that is listening for it', () => {
    const machine: States = {
      start: 'shut',
      states: [
        { name: 'shut', changes: [{ when: 'signal', to: 'open', value: 'unlock' }] },
        { name: 'open', changes: [] },
      ],
    }
    expect(step(machine, standing(machine), { dt: 0.1 }).standing.state).toBe('shut')
    expect(
      step(machine, standing(machine), { dt: 0.1, signals: ['unlock'] }).standing.state,
    ).toBe('open')
  })

  test('and a chain of states hears the same word in one frame', () => {
    // The cost of hearing yourself, made deliberate: `heard` says everything in
    // the world gets the word, including the thing that sent it.
    const machine: States = {
      start: 'a',
      states: [
        { name: 'a', changes: [{ when: 'signal', to: 'b', value: 'go' }] },
        { name: 'b', changes: [{ when: 'signal', to: 'c', value: 'go' }] },
        { name: 'c', changes: [] },
      ],
    }
    expect(step(machine, standing(machine), { dt: 0, signals: ['go'] }).standing.state).toBe('c')
  })

  test('but one press only moves it once', () => {
    const machine: States = {
      start: 'a',
      states: [
        { name: 'a', changes: [{ when: 'use', to: 'b' }] },
        { name: 'b', changes: [{ when: 'use', to: 'c' }] },
        { name: 'c', changes: [] },
      ],
    }
    expect(step(machine, standing(machine), { dt: 0, used: true }).standing.state).toBe('b')
  })
})

describe('breaking and coming back', () => {
  test('a target goes away at zero and returns whole', () => {
    const machine = freshRespawn(8)
    const hit = step(machine, standing(machine), { dt: 0.1, broken: true })
    expect(hit.standing.state).toBe('gone')
    expect(stateNamed(machine, 'gone')?.hidden).toBe(true)
    // Not healed on the way out: a thing spending its eight seconds of being
    // broken at full health answers "is this broken?" wrongly for the whole
    // time the question matters.
    expect(hit.restore).toBe(false)

    const waiting = step(machine, hit.standing, { dt: 7 })
    expect(waiting.standing.state).toBe('gone')

    const back = step(machine, waiting.standing, { dt: 2 })
    expect(back.standing.state).toBe('whole')
    expect(back.restore).toBe(true)
  })

  test('a hidden thing is never solid, whatever it says', () => {
    const base = { model: 'park/crate', clip: null, blocking: true }
    const look = lookOf(base, { name: 'gone', hidden: true, blocking: true, changes: [] })
    expect(look.hidden).toBe(true)
    expect(look.blocking).toBe(false)
  })

  test('a state without an opinion keeps the blueprint\'s', () => {
    const base = { model: 'park/crate', clip: 'idle', blocking: true }
    expect(lookOf(base, { name: 'whole', changes: [] })).toEqual({
      model: 'park/crate',
      clip: 'idle',
      blocking: true,
      hidden: false,
    })
    // Null is not absent: it is "play nothing".
    expect(lookOf(base, { name: 'broken', clip: null, changes: [] }).clip).toBeNull()
    // And no state at all is the blueprint, untouched.
    expect(lookOf(base, undefined).clip).toBe('idle')
  })
})

describe('a change that may happen once', () => {
  test('fires, and then never again', () => {
    const machine: States = {
      start: 'shut',
      states: [
        {
          name: 'shut',
          changes: [{ when: 'use', to: 'open', once: true }],
        },
        { name: 'open', changes: [{ when: 'use', to: 'shut' }] },
      ],
    }

    let now = standing(machine)
    now = step(machine, now, { dt: 0, used: true }).standing
    expect(now.state).toBe('open')

    now = step(machine, now, { dt: 0, used: true }).standing
    expect(now.state).toBe('shut')

    // Back where it started, and the chest stays shut this time.
    now = step(machine, now, { dt: 0, used: true }).standing
    expect(now.state).toBe('shut')
  })

  test('and a spent change stops filling its bar', () => {
    const machine: States = {
      start: 'a',
      states: [
        { name: 'a', changes: [{ when: 'after', to: 'a', seconds: 5, fill: true, once: true }] },
      ],
    }
    expect(filling(machine, { state: 'a', since: 1 })).toBe(0.2)
    expect(filling(machine, { state: 'a', since: 1, spent: ['a/0'] })).toBeNull()
  })
})

describe('the ways a machine can be wrong', () => {
  test('a change into nothing is refused, because nothing happening is invisible', () => {
    const problems = statesProblems({
      start: 'whole',
      states: [{ name: 'whole', changes: [{ when: 'touch', to: 'smashed' }] }],
    })
    expect(problems).toContain('whole changes into smashed, which is not a state')
  })

  test('so is a start nobody wrote', () => {
    expect(
      statesProblems({ start: 'nope', states: [{ name: 'whole', changes: [] }] }),
    ).toContain('nope is not one of the states')
  })

  test('two states with one name are a coin toss', () => {
    const problems = statesProblems({
      start: 'a',
      states: [
        { name: 'a', changes: [] },
        { name: 'a', changes: [] },
      ],
    })
    expect(problems).toContain('two states are called a')
  })

  test('a wait needs a length, and a signal needs a word', () => {
    const problems = statesProblems({
      start: 'a',
      states: [
        {
          name: 'a',
          changes: [
            { when: 'after', to: 'a' },
            { when: 'signal', to: 'a' },
          ],
        },
      ],
    })
    expect(problems.some((one) => one.includes('a wait is'))).toBe(true)
    expect(problems).toContain('a waits for a signal nobody named')
  })

  test('and a machine may not be a crowd', () => {
    const many: States = {
      start: 's0',
      states: Array.from({ length: MAX_STATES + 1 }, (_, index) => ({
        name: `s${index}`,
        changes: [],
      })),
    }
    expect(statesProblems(many)).toContain(`a thing may be in at most ${MAX_STATES} states`)
  })

  test('a fresh machine and a fresh respawn are both sound', () => {
    expect(statesProblems(freshStates())).toEqual([])
    expect(statesProblems(freshRespawn())).toEqual([])
  })
})

describe('a loop cannot hang the frame', () => {
  test('two states that fall into each other settle instead of spinning', () => {
    const machine: States = {
      start: 'a',
      states: [
        { name: 'a', changes: [{ when: 'after', to: 'b', seconds: 0.1 }] },
        { name: 'b', changes: [{ when: 'after', to: 'a', seconds: 0.1 }] },
      ],
    }
    // Every hop resets the clock to zero, so only the first change can fire on
    // a frame this long - but a machine authored with a zero wait would hop,
    // and the bound is what stops that being forever.
    const after = step(machine, standing(machine), { dt: 60 })
    expect(['a', 'b']).toContain(after.standing.state)
  })
})

describe('the vocabularies still line up', () => {
  test('every word a change waits for is one a person can answer for', () => {
    expect([...CHANGE_WHENS].sort()).toEqual(
      (['after', 'broken', 'emptied', 'filled', 'signal', 'touch', 'use'] as const)
        .slice()
        .sort(),
    )
  })

  test('the machine\'s doors and the room\'s triggers overlap where they should', () => {
    // `use` and `touch` mean the same thing in both lists, which is what lets
    // somebody read one panel having learned the other.
    for (const shared of ['use', 'touch'] as const) {
      expect(THING_WHENS).toContain(shared)
      expect(CHANGE_WHENS).toContain(shared)
    }
    // And `become` is how an action reaches the machine at all.
    expect(THING_DEEDS).toContain('become')
  })
})
