import type { StreakCommand } from '@/domain/streaks/commands'
import { type StreakEvent, STREAK_STREAM_TYPE } from '@/domain/streaks/events'
import { dayNumber } from '@/domain/streaks/days'
import type { Decider } from '@/es/types'

/**
 * State is only what the decider needs to decide the next visit: the last day
 * seen, and the running counts. Everything a page draws lives in the read
 * model; this stays minimal so the write side cannot drift back into a row.
 */
export interface StreakState {
  /** The last UTC day recorded, or null for a member who has never shown up. */
  lastDay: string | null
  /** The consecutive-day run as of `lastDay`. */
  current: number
  /** The best run ever. */
  longest: number
  /** Distinct days ever recorded. */
  total: number
}

export const initialStreakState: StreakState = {
  lastDay: null,
  current: 0,
  longest: 0,
  total: 0,
}

/**
 * What one more day does to a run.
 *
 * The only rule of a streak: a day exactly one after the last extends the run;
 * any larger gap starts a new one at one. Pulled out of `decide` so it is the
 * single place the arithmetic lives - `decide` calls it to fill the event, and
 * nothing else reimplements it.
 *
 * Never called for a day that is not strictly after `lastDay`; `decide` refuses
 * a same-day repeat before it gets here, and the log only moves forward.
 */
function advance(state: StreakState, day: string): StreakState {
  const consecutive =
    state.lastDay !== null && dayNumber(day) - dayNumber(state.lastDay) === 1
  const current = consecutive ? state.current + 1 : 1

  return {
    lastDay: day,
    current,
    longest: Math.max(state.longest, current),
    total: state.total + 1,
  }
}

/**
 * Fold one event into state.
 *
 * Pure assignment from the snapshot the event carries - the decider already did
 * the counting when it wrote the event (see events.ts on why the numbers live
 * in the event). Total, and never throws, so it can replay anything in the log
 * including days written by older rules.
 */
export function evolve(state: StreakState, event: StreakEvent): StreakState {
  switch (event.type) {
    case 'DayVisited':
      return {
        lastDay: event.data.day,
        current: event.data.streak,
        longest: event.data.longest,
        total: event.data.total,
      }
    default:
      return state
  }
}

/**
 * Decide what a visit records.
 *
 *   - a new day       -> one `DayVisited`, carrying the run it reached
 *   - the same day     -> `[]`, already recorded; showing up twice is one day
 *   - an older day     -> `[]`, the clock only moves forward
 *
 * The empty returns are what make it safe to call on every page load: the first
 * visit of a day writes, the fiftieth is a no-op, and the log stays one event
 * per day rather than one per navigation.
 */
export function decide(state: StreakState, command: StreakCommand): StreakEvent[] {
  switch (command.type) {
    case 'RecordVisit': {
      if (state.lastDay !== null && dayNumber(command.day) <= dayNumber(state.lastDay)) {
        return []
      }
      const next = advance(state, command.day)
      return [
        {
          type: 'DayVisited',
          data: {
            day: next.lastDay as string,
            streak: next.current,
            longest: next.longest,
            total: next.total,
          },
        },
      ]
    }

    default: {
      const exhaustive: never = command.type
      throw new Error(`Unknown command: ${String(exhaustive)}`)
    }
  }
}

export const streakDecider: Decider<StreakState, StreakCommand, StreakEvent> = {
  streamType: STREAK_STREAM_TYPE,
  initialState: initialStreakState,
  evolve,
  decide,
}
