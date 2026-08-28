import { z } from 'zod'
import { WORLD_HEIGHT } from '@/domain/lounge/events'
import {
  GOAL_KINDS,
  type GoalKind,
  MAX_GOAL_SIZE,
  MIN_GOAL_SIZE,
} from '@/domain/lounge/goal-events'

/**
 * Commands against one goal.
 *
 * Goal-scoped rather than world-scoped, because the stream is one goal - the
 * same arrangement images use, and the opposite of the blocks', where the stream
 * is a chunk and the caller has to split an edit across several. A goal is
 * placed, dragged and resized one at a time by a person looking at it, so there
 * is nothing to batch.
 *
 * `worldId` is optional on every one for the same reason it is optional on the
 * events: omitting it means the workspace's own lounge. The action fills it in.
 */

const coordinate = z.number().int().min(-100_000).max(100_000)

const size = z.number().int().min(MIN_GOAL_SIZE).max(MAX_GOAL_SIZE)

export const goalKindSchema = z.enum(GOAL_KINDS)

/** Quarter turns. Bounded here and wrapped in the decider, which is the one
 * place that arithmetic should live. */
const facing = z.number().int()

export const placeGoalSchema = z.object({
  kind: goalKindSchema,
  x: coordinate,
  y: z.number().int().min(0).max(WORLD_HEIGHT - 1),
  z: coordinate,
  width: size,
  height: size,
  facing: facing.default(0),
})

export const goalPositionSchema = z.object({
  x: coordinate,
  y: z.number().int().min(0).max(WORLD_HEIGHT - 1),
  z: coordinate,
})

export const goalSizeSchema = z.object({ width: size, height: size })

export type PlaceGoal = {
  type: 'PlaceGoal'
  worldId?: string
  kind: GoalKind
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

export type MoveGoal = {
  type: 'MoveGoal'
  x: number
  y: number
  z: number
}

export type ResizeGoal = {
  type: 'ResizeGoal'
  width: number
  height: number
}

export type RotateGoal = {
  type: 'RotateGoal'
  facing: number
}

export type SetGoalTeam = {
  type: 'SetGoalTeam'
  kind: GoalKind
}

export type RemoveGoal = {
  type: 'RemoveGoal'
}

export type LoungeGoalCommand =
  | PlaceGoal
  | MoveGoal
  | ResizeGoal
  | RotateGoal
  | SetGoalTeam
  | RemoveGoal
