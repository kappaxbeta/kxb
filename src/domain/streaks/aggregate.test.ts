import { describe, expect, test } from 'bun:test'
import { decide, initialStreakState, streakDecider } from '@/domain/streaks/aggregate'
import type { StreakEvent } from '@/domain/streaks/events'
import { fold } from '@/es/types'

/**
 * The streak math, with no database in sight: given the days already recorded
 * and a visit, assert on the event that comes out.
 */

function given(...events: StreakEvent[]) {
  return fold(streakDecider, events)
}

/** A `DayVisited` carrying the run it reached, the way `decide` writes them. */
function visited(day: string, streak: number, longest: number, total: number): StreakEvent {
  return { type: 'DayVisited', data: { day, streak, longest, total } }
}

describe('decide', () => {
  test('the first day ever is a run of one', () => {
    const events = decide(initialStreakState, { type: 'RecordVisit', day: '2026-08-05' })
    expect(events).toEqual([visited('2026-08-05', 1, 1, 1)])
  })

  test('a consecutive day extends the run', () => {
    const state = given(visited('2026-08-05', 1, 1, 1))
    const events = decide(state, { type: 'RecordVisit', day: '2026-08-06' })
    expect(events).toEqual([visited('2026-08-06', 2, 2, 2)])
  })

  test('a gap resets the run to one but keeps the best and the total', () => {
    const state = given(
      visited('2026-08-05', 1, 1, 1),
      visited('2026-08-06', 2, 2, 2),
      visited('2026-08-07', 3, 3, 3),
    )
    // Two days skipped: the run breaks, longest stays 3, total climbs to 4.
    const events = decide(state, { type: 'RecordVisit', day: '2026-08-10' })
    expect(events).toEqual([visited('2026-08-10', 1, 3, 4)])
  })

  test('the same day again records nothing', () => {
    const state = given(visited('2026-08-06', 2, 2, 2))
    expect(decide(state, { type: 'RecordVisit', day: '2026-08-06' })).toEqual([])
  })

  test('a day older than the last records nothing - the clock only moves forward', () => {
    const state = given(visited('2026-08-06', 2, 2, 2))
    expect(decide(state, { type: 'RecordVisit', day: '2026-08-04' })).toEqual([])
  })

  test('the best is only overtaken by a longer run, not a later one', () => {
    // A 3-run, a gap, then a climb. Feeding each decided event back into the
    // log is what the store does for real; here it lets one assertion watch the
    // best hold at 3 until the fourth consecutive day genuinely beats it.
    const log: StreakEvent[] = [
      visited('2026-08-01', 1, 1, 1),
      visited('2026-08-02', 2, 2, 2),
      visited('2026-08-03', 3, 3, 3),
    ]

    const expected = [
      visited('2026-08-10', 1, 3, 4), // new run starts, best still 3
      visited('2026-08-11', 2, 3, 5), // best still 3
      visited('2026-08-12', 3, 3, 6), // tied, not beaten - best still 3
      visited('2026-08-13', 4, 4, 7), // now overtaken
    ]

    for (const want of expected) {
      const events = decide(fold(streakDecider, log), {
        type: 'RecordVisit',
        day: want.data.day,
      })
      expect(events).toEqual([want])
      log.push(...events)
    }
  })
})

describe('evolve', () => {
  test('replays a stream straight off the recorded snapshots', () => {
    const state = given(
      visited('2026-08-05', 1, 1, 1),
      visited('2026-08-06', 2, 2, 2),
      visited('2026-08-10', 1, 2, 3),
    )
    expect(state).toEqual({ lastDay: '2026-08-10', current: 1, longest: 2, total: 3 })
  })

  test('ignores an event type from the future instead of throwing', () => {
    const state = streakDecider.evolve(initialStreakState, {
      type: 'SomethingNew',
      data: {},
    } as unknown as StreakEvent)
    expect(state).toEqual(initialStreakState)
  })
})
