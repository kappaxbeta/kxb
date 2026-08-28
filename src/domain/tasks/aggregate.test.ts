import { describe, expect, test } from 'bun:test'
import { decide, evolve, initialTaskState, taskDecider } from '@/domain/tasks/aggregate'
import type { TaskEvent } from '@/domain/tasks/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

/**
 * The payoff of keeping the domain pure: these tests need no database, no
 * mocks, and no async. Given past events and a command, assert on the events
 * that come out.
 */

function given(...events: TaskEvent[]) {
  return fold(taskDecider, events)
}

const created: TaskEvent = { type: 'TaskCreated', data: { title: 'Write docs' } }

describe('evolve', () => {
  test('replays history into current state', () => {
    const state = given(
      created,
      { type: 'TaskRenamed', data: { title: 'Write better docs' } },
      { type: 'TaskCompleted', data: {} },
    )

    expect(state).toEqual({
      status: 'active',
      title: 'Write better docs',
      completed: true,
    })
  })

  test('ignores unknown event types instead of throwing', () => {
    const state = evolve(initialTaskState, {
      type: 'SomethingFromTheFuture',
      data: {},
    } as unknown as TaskEvent)

    expect(state).toEqual(initialTaskState)
  })
})

describe('decide', () => {
  test('creating a new task emits TaskCreated', () => {
    expect(decide(initialTaskState, { type: 'CreateTask', title: 'Write docs' })).toEqual([
      { type: 'TaskCreated', data: { title: 'Write docs' } },
    ])
  })

  test('creating a task that already exists is rejected', () => {
    expect(() =>
      decide(given(created), { type: 'CreateTask', title: 'Write docs' }),
    ).toThrow(DomainError)
  })

  test('renaming to the same title is a no-op, not an event', () => {
    expect(decide(given(created), { type: 'RenameTask', title: 'Write docs' })).toEqual([])
  })

  test('completing an already-completed task is a no-op', () => {
    const state = given(created, { type: 'TaskCompleted', data: {} })
    expect(decide(state, { type: 'CompleteTask' })).toEqual([])
  })

  test('reopening a completed task emits TaskReopened', () => {
    const state = given(created, { type: 'TaskCompleted', data: {} })
    expect(decide(state, { type: 'ReopenTask' })).toEqual([{ type: 'TaskReopened', data: {} }])
  })

  test('commands against a missing task are rejected', () => {
    expect(() => decide(initialTaskState, { type: 'CompleteTask' })).toThrow(
      /not found/i,
    )
  })

  test('a deleted task cannot be renamed', () => {
    const state = given(created, { type: 'TaskDeleted', data: {} })
    expect(() => decide(state, { type: 'RenameTask', title: 'nope' })).toThrow(
      /deleted/i,
    )
  })

  test('deleting twice is a no-op', () => {
    const state = given(created, { type: 'TaskDeleted', data: {} })
    expect(decide(state, { type: 'DeleteTask' })).toEqual([])
  })
})
