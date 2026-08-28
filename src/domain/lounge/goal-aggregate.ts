import { WORLD_HEIGHT } from '@/domain/lounge/events'
import type { LoungeGoalCommand } from '@/domain/lounge/goal-commands'
import {
  type GoalKind,
  isGoalKind,
  LOUNGE_GOAL_STREAM_TYPE,
  type LoungeGoalEvent,
  MAX_GOAL_SIZE,
  MIN_GOAL_SIZE,
} from '@/domain/lounge/goal-events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface LoungeGoalState {
  status: 'none' | 'placed' | 'removed'
  kind: GoalKind
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

export const initialGoalState: LoungeGoalState = {
  status: 'none',
  kind: 'red',
  x: 0,
  y: 0,
  z: 0,
  width: 5,
  height: 4,
  facing: 0,
}

export function evolve(
  state: LoungeGoalState,
  event: LoungeGoalEvent,
): LoungeGoalState {
  switch (event.type) {
    case 'GoalPlaced':
      /**
       * Listed field by field rather than spread.
       *
       * `worldId` rides along in the payload for the projection's benefit and is not
       * part of the goal's own state - a goal cannot change worlds, so nothing here
       * would ever read it back. Spreading the payload and deleting that one key
       * would work and would also quietly adopt any field added to the event later,
       * which is how state grows things nobody meant to put in it.
       */
      return {
        ...state,
        status: 'placed',
        // `team` is what `kind` was called before race marks existed, so every
        // goal placed up to then replays as the kind it always was.
        kind: event.data.kind ?? event.data.team ?? 'red',
        x: event.data.x,
        y: event.data.y,
        z: event.data.z,
        width: event.data.width,
        height: event.data.height,
        facing: event.data.facing,
      }

    case 'GoalMoved':
      return { ...state, x: event.data.x, y: event.data.y, z: event.data.z }

    case 'GoalResized':
      return { ...state, width: event.data.width, height: event.data.height }

    case 'GoalRotated':
      return { ...state, facing: event.data.facing }

    case 'GoalTeamChanged':
      return { ...state, kind: event.data.kind ?? event.data.team ?? state.kind }

    case 'GoalRemoved':
      return { ...state, status: 'removed' }

    default:
      return state
  }
}

/**
 * Decide what happened to one goal.
 *
 * Every branch that changes a value first checks it is actually a change, which
 * is the same filtering the block decider does and for the same reason: resizing
 * is done by holding a button, and a handler that fired on every repeat would
 * append a dozen identical events for one nudge. By the time a command reaches
 * the log it describes a difference or it describes nothing.
 *
 * Removal is soft, like an image's: `GoalRemoved` is recorded, the read model
 * hides the row, and where the goal used to stand stays in the log.
 */
export function decide(
  state: LoungeGoalState,
  command: LoungeGoalCommand,
): LoungeGoalEvent[] {
  switch (command.type) {
    case 'PlaceGoal': {
      if (state.status !== 'none') {
        throw new DomainError('That goal has already been placed', 'goal_exists')
      }
      assertCell(command)
      assertSize(command.width, command.height)
      assertKind(command.kind)

      return [
        {
          type: 'GoalPlaced',
          data: {
            worldId: command.worldId,
            kind: command.kind,
            x: command.x,
            y: command.y,
            z: command.z,
            width: command.width,
            height: command.height,
            facing: normalizeFacing(command.facing),
          },
        },
      ]
    }

    case 'MoveGoal': {
      assertPlaced(state)
      assertCell(command)

      if (state.x === command.x && state.y === command.y && state.z === command.z) {
        return []
      }

      return [{ type: 'GoalMoved', data: { x: command.x, y: command.y, z: command.z } }]
    }

    case 'ResizeGoal': {
      assertPlaced(state)
      assertSize(command.width, command.height)

      if (state.width === command.width && state.height === command.height) return []

      return [
        {
          type: 'GoalResized',
          data: { width: command.width, height: command.height },
        },
      ]
    }

    case 'RotateGoal': {
      assertPlaced(state)

      const facing = normalizeFacing(command.facing)
      if (state.facing === facing) return []

      return [{ type: 'GoalRotated', data: { facing } }]
    }

    case 'SetGoalTeam': {
      assertPlaced(state)
      assertKind(command.kind)

      if (state.kind === command.kind) return []

      return [{ type: 'GoalTeamChanged', data: { kind: command.kind } }]
    }

    case 'RemoveGoal': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'removed') return []
      return [{ type: 'GoalRemoved', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('That goal is not in the world', 'goal_not_found')
}

function assertPlaced(state: LoungeGoalState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'removed') {
    throw new DomainError('That goal was removed', 'goal_removed')
  }
}

/** The same lattice the blocks sit on, so a goal cannot land between cells. */
function assertCell(cell: { x: number; y: number; z: number }): void {
  if (
    !Number.isInteger(cell.x) ||
    !Number.isInteger(cell.y) ||
    !Number.isInteger(cell.z)
  ) {
    throw new DomainError('Goal position must be whole cells', 'goal_off_grid')
  }
  if (cell.y < 0 || cell.y >= WORLD_HEIGHT) {
    throw new DomainError(
      `Goals must sit between y=0 and y=${WORLD_HEIGHT - 1}`,
      'goal_out_of_bounds',
    )
  }
}

function assertSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new DomainError('Goal size must be whole cells', 'goal_bad_size')
  }
  if (
    width < MIN_GOAL_SIZE ||
    height < MIN_GOAL_SIZE ||
    width > MAX_GOAL_SIZE ||
    height > MAX_GOAL_SIZE
  ) {
    throw new DomainError(
      `Goals must be ${MIN_GOAL_SIZE}-${MAX_GOAL_SIZE} cells on a side`,
      'goal_bad_size',
    )
  }
}

/**
 * A mark that is none of the four things a mark can be.
 *
 * Checked in the decider as well as in the action's schema, because this value
 * decides who every point in a match goes to - or, for a race, where everybody
 * starts and what ends their run - and it is going into a log that cannot be
 * edited. The schema stops a bad request; this stops a bad *caller*.
 */
function assertKind(kind: string): void {
  if (!isGoalKind(kind)) {
    throw new DomainError(
      'A mark is red, blue, a start or a finish',
      'goal_bad_kind',
    )
  }
}

/** Wrap quarter turns, so turning past west comes back round to north. */
function normalizeFacing(facing: number): number {
  if (!Number.isInteger(facing)) return 0
  return ((facing % 4) + 4) % 4
}

export const loungeGoalDecider: Decider<
  LoungeGoalState,
  LoungeGoalCommand,
  LoungeGoalEvent
> = {
  streamType: LOUNGE_GOAL_STREAM_TYPE,
  initialState: initialGoalState,
  evolve,
  decide,
}
