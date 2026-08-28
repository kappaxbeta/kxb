import { describe, expect, test } from 'bun:test'
import {
  decide,
  initialGoalState,
  loungeGoalDecider,
} from '@/domain/lounge/goal-aggregate'
import {
  DEFAULT_GOAL_HEIGHT,
  DEFAULT_GOAL_WIDTH,
  type LoungeGoalEvent,
  MAX_GOAL_SIZE,
} from '@/domain/lounge/goal-events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: LoungeGoalEvent[]) {
  return fold(loungeGoalDecider, events)
}

const placed: LoungeGoalEvent = {
  type: 'GoalPlaced',
  data: {
    worldId: undefined,
    kind: 'red',
    x: 0,
    y: 1,
    z: -15,
    width: DEFAULT_GOAL_WIDTH,
    height: DEFAULT_GOAL_HEIGHT,
    facing: 0,
  },
}

function place(overrides: Record<string, unknown> = {}) {
  return {
    type: 'PlaceGoal' as const,
    kind: 'red' as const,
    x: 0,
    y: 1,
    z: -15,
    width: DEFAULT_GOAL_WIDTH,
    height: DEFAULT_GOAL_HEIGHT,
    facing: 0,
    ...overrides,
  }
}

describe('placing', () => {
  test('records the side, cell, size and facing', () => {
    expect(decide(initialGoalState, place())).toEqual([placed])
  })

  test('placing the same goal twice is rejected', () => {
    expect(() => decide(given(placed), place())).toThrow(DomainError)
  })

  test('a goal off the lattice is rejected', () => {
    expect(() => decide(initialGoalState, place({ x: 0.5 }))).toThrow(DomainError)
  })

  test('a goal outside the world height is rejected', () => {
    expect(() => decide(initialGoalState, place({ y: -1 }))).toThrow(DomainError)
  })

  test('a mark that is none of the four kinds is rejected', () => {
    // The schema stops a bad request; this stops a bad caller. Every point in a
    // match is decided by this value and it goes into a log nobody can edit.
    expect(() => decide(initialGoalState, place({ kind: 'green' }))).toThrow(DomainError)
  })

  test('a start line is a mark like any other', () => {
    expect(decide(initialGoalState, place({ kind: 'start' }))).toEqual([
      { ...placed, data: { ...placed.data, kind: 'start' } },
    ])
  })

  test('a goal placed before race marks existed replays as its team', () => {
    // The old event shape: `team` and no `kind`. It always meant the same thing.
    const old: LoungeGoalEvent = {
      type: 'GoalPlaced',
      data: { ...placed.data, kind: undefined, team: 'blue' },
    }
    expect(given(old).kind).toBe('blue')
  })

  test('a goal with no width is rejected', () => {
    expect(() => decide(initialGoalState, place({ width: 0 }))).toThrow(DomainError)
  })

  test('a goal wider than the limit is rejected', () => {
    expect(() =>
      decide(initialGoalState, place({ width: MAX_GOAL_SIZE + 1 })),
    ).toThrow(DomainError)
  })

  test('facing wraps rather than being rejected', () => {
    const [event] = decide(initialGoalState, place({ facing: 6 }))
    expect(event).toMatchObject({ type: 'GoalPlaced', data: { facing: 2 } })
  })
})

describe('resizing', () => {
  test('a new size is recorded', () => {
    expect(decide(given(placed), { type: 'ResizeGoal', width: 8, height: 6 })).toEqual([
      { type: 'GoalResized', data: { width: 8, height: 6 } },
    ])
  })

  test('resizing to the size it already is records nothing', () => {
    // Resizing is done by holding a button down, and a repeat that appended an
    // event each time would put a dozen identical facts in the log per nudge.
    expect(
      decide(given(placed), {
        type: 'ResizeGoal',
        width: DEFAULT_GOAL_WIDTH,
        height: DEFAULT_GOAL_HEIGHT,
      }),
    ).toEqual([])
  })

  test('resizing past the limit is rejected', () => {
    expect(() =>
      decide(given(placed), { type: 'ResizeGoal', width: MAX_GOAL_SIZE + 1, height: 4 }),
    ).toThrow(DomainError)
  })

  test('a goal that was removed cannot be resized', () => {
    expect(() =>
      decide(given(placed, { type: 'GoalRemoved', data: {} }), {
        type: 'ResizeGoal',
        width: 8,
        height: 8,
      }),
    ).toThrow(DomainError)
  })

  test('a goal that was never placed cannot be resized', () => {
    expect(() =>
      decide(initialGoalState, { type: 'ResizeGoal', width: 8, height: 8 }),
    ).toThrow(DomainError)
  })
})

describe('moving and turning', () => {
  test('a move is recorded', () => {
    expect(decide(given(placed), { type: 'MoveGoal', x: 2, y: 1, z: -10 })).toEqual([
      { type: 'GoalMoved', data: { x: 2, y: 1, z: -10 } },
    ])
  })

  test('dropping it back where it started records nothing', () => {
    expect(decide(given(placed), { type: 'MoveGoal', x: 0, y: 1, z: -15 })).toEqual([])
  })

  test('a turn is recorded, wrapped', () => {
    expect(decide(given(placed), { type: 'RotateGoal', facing: 5 })).toEqual([
      { type: 'GoalRotated', data: { facing: 1 } },
    ])
  })

  test('turning it to the way it already faces records nothing', () => {
    expect(decide(given(placed), { type: 'RotateGoal', facing: 4 })).toEqual([])
  })
})

describe('handing it to the other side', () => {
  test('the change of side is recorded', () => {
    expect(decide(given(placed), { type: 'SetGoalTeam', kind: 'blue' })).toEqual([
      { type: 'GoalTeamChanged', data: { kind: 'blue' } },
    ])
  })

  test('reassigning it to the side it is already on records nothing', () => {
    expect(decide(given(placed), { type: 'SetGoalTeam', kind: 'red' })).toEqual([])
  })

  test('the state follows the reassignment', () => {
    const state = given(placed, { type: 'GoalTeamChanged', data: { kind: 'blue' } })
    expect(state.kind).toBe('blue')
  })
})

describe('removing', () => {
  test('removal is recorded', () => {
    expect(decide(given(placed), { type: 'RemoveGoal' })).toEqual([
      { type: 'GoalRemoved', data: {} },
    ])
  })

  test('removing twice records nothing the second time', () => {
    expect(
      decide(given(placed, { type: 'GoalRemoved', data: {} }), { type: 'RemoveGoal' }),
    ).toEqual([])
  })

  test('removing a goal that was never placed is rejected', () => {
    expect(() => decide(initialGoalState, { type: 'RemoveGoal' })).toThrow(DomainError)
  })
})

describe('replay', () => {
  test('the state is the sum of the events, in order', () => {
    const state = given(
      placed,
      { type: 'GoalMoved', data: { x: 4, y: 2, z: 9 } },
      { type: 'GoalResized', data: { width: 7, height: 5 } },
      { type: 'GoalRotated', data: { facing: 1 } },
      { type: 'GoalTeamChanged', data: { kind: 'blue' } },
    )

    expect(state).toEqual({
      status: 'placed',
      kind: 'blue',
      x: 4,
      y: 2,
      z: 9,
      width: 7,
      height: 5,
      facing: 1,
    })
  })

  test('the world an event names is not part of the goal state', () => {
    // A goal cannot change worlds, so `worldId` rides along for the projection
    // and nothing ever reads it back off the state.
    const state = given({ ...placed, data: { ...placed.data, worldId: 'w' } })
    expect(state).not.toHaveProperty('worldId')
  })
})
