import { WORLD_HEIGHT } from '@/domain/lounge/events'
import { MAX_THING_SCALE, MIN_THING_SCALE } from '@/domain/thingiverse/blueprint'
import type { ThingCommand } from '@/domain/thingiverse/thing-commands'
import {
  MAX_THINGS_PER_WORLD,
  THING_STREAM_TYPE,
  type ThingEvent,
  type ThingTuning,
} from '@/domain/thingiverse/thing-events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface ThingState {
  status: 'none' | 'standing' | 'gone'
  blueprintId: string
  worldId?: string
  x: number
  y: number
  z: number
  facing: number
  scale: number
  tuning: ThingTuning
  /** Whether it outlives whoever put it there. See `ThingSummoned.keep`. */
  keep: boolean
}

export const initialThingState: ThingState = {
  status: 'none',
  blueprintId: '',
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  scale: 1,
  tuning: {},
  keep: true,
}

export function evolve(state: ThingState, event: ThingEvent): ThingState {
  switch (event.type) {
    case 'ThingSummoned':
      // `keep` is optional on the event so that everything summoned before it
      // existed replays as what it was - furniture. Absent is true.
      return { ...state, status: 'standing', ...event.data, keep: event.data.keep ?? true }

    case 'ThingMoved':
      return { ...state, x: event.data.x, y: event.data.y, z: event.data.z }

    case 'ThingTurned':
      return { ...state, facing: event.data.facing }

    case 'ThingScaled':
      return { ...state, scale: event.data.scale }

    case 'ThingTuned':
      return { ...state, tuning: event.data.tuning }

    case 'ThingKeepSet':
      return { ...state, keep: event.data.keep }

    case 'ThingDismissed':
      return { ...state, status: 'gone' }

    default:
      return state
  }
}

/**
 * Decide what happens to one thing.
 *
 * Shaped after the lounge's image decider, which is the closest relative: place
 * once, then move/turn/resize/remove, with every no-op returning no events so
 * that dragging something back where it started does not append to the log.
 *
 * What is *not* here is any question of who. A thing in a room belongs to the
 * room - anybody who may build there may move the furniture - so the check that
 * matters is the write check the action already makes, and adding an owner here
 * would mean a member could leave a crate in a doorway that nobody else can
 * shift. Who summoned it is still recorded, on the event's actor and in the
 * read model's `placed_by`, because "who put this here" is a question people
 * ask; it is just not a permission.
 */
export function decide(state: ThingState, command: ThingCommand): ThingEvent[] {
  switch (command.type) {
    case 'SummonThing': {
      if (state.status !== 'none') {
        throw new DomainError('That thing has already been summoned', 'thing_exists')
      }
      if (command.standing >= MAX_THINGS_PER_WORLD) {
        throw new DomainError(
          `A world may hold ${MAX_THINGS_PER_WORLD} things. Dismiss one first.`,
          'thing_world_full',
        )
      }
      assertCell(command)
      assertScale(command.scale)

      return [
        {
          type: 'ThingSummoned',
          data: {
            ...(command.worldId ? { worldId: command.worldId } : {}),
            blueprintId: command.blueprintId,
            x: command.x,
            y: command.y,
            z: command.z,
            facing: normalizeFacing(command.facing),
            scale: command.scale,
            keep: command.keep,
          },
        },
      ]
    }

    case 'MoveThing': {
      assertStanding(state)
      assertCell(command)

      if (state.x === command.x && state.y === command.y && state.z === command.z) {
        return []
      }

      return [
        { type: 'ThingMoved', data: { x: command.x, y: command.y, z: command.z } },
      ]
    }

    case 'TurnThing': {
      assertStanding(state)

      const facing = normalizeFacing(command.facing)
      if (state.facing === facing) return []

      return [{ type: 'ThingTurned', data: { facing } }]
    }

    case 'ScaleThing': {
      assertStanding(state)
      assertScale(command.scale)

      if (state.scale === command.scale) return []

      return [{ type: 'ThingScaled', data: { scale: command.scale } }]
    }

    case 'TuneThing': {
      assertStanding(state)

      if (sameTuning(state.tuning, command.tuning)) return []

      return [{ type: 'ThingTuned', data: { tuning: command.tuning } }]
    }

    case 'SetThingKeep': {
      assertStanding(state)
      if (state.keep === command.keep) return []

      return [{ type: 'ThingKeepSet', data: { keep: command.keep } }]
    }

    case 'DismissThing': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'gone') return []
      return [{ type: 'ThingDismissed', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('That thing is not in the world', 'thing_not_found')
}

function assertStanding(state: ThingState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'gone') {
    throw new DomainError('That thing was dismissed', 'thing_dismissed')
  }
}

/**
 * The lattice, and the tenths between its lines.
 *
 * The blocks, the images and the goals all sit on whole cells and always will -
 * they are cubes, and a cube between two cells is a cube in neither. A *thing*
 * is not a cube: a bench is 2.4 across, and putting one against a wall on a
 * one-metre lattice leaves it either buried in the wall or a hand's width off
 * it. So this one lattice has tenths in it.
 *
 * Quantised rather than free, because the log is immutable and a position that
 * arrived as 3.0000000000000004 is in the history forever - see `STEP` in
 * ./thing-commands, which is the same rule written where the schema needs it.
 * Checked here as well as there for the reason every rule in this aggregate is:
 * the schema guards a browser's request, and this guards the log.
 */
const STEP = 0.1

function onGrid(value: number): boolean {
  return (
    Number.isFinite(value) && Math.abs(value / STEP - Math.round(value / STEP)) < 1e-6
  )
}

function assertCell(cell: { x: number; y: number; z: number }): void {
  if (!onGrid(cell.x) || !onGrid(cell.y) || !onGrid(cell.z)) {
    throw new DomainError(
      `A thing stands on a tenth of a cell, not between them`,
      'thing_off_grid',
    )
  }
  if (cell.y < 0 || cell.y >= WORLD_HEIGHT) {
    throw new DomainError(
      `Things stand between y=0 and y=${WORLD_HEIGHT - 1}`,
      'thing_out_of_bounds',
    )
  }
}

function assertScale(scale: number): void {
  if (!Number.isFinite(scale) || scale < MIN_THING_SCALE || scale > MAX_THING_SCALE) {
    throw new DomainError(
      `A thing may be ${MIN_THING_SCALE}x to ${MAX_THING_SCALE}x`,
      'thing_bad_scale',
    )
  }
}

/** Wrap quarter turns, so turning past west comes back round to north. */
function normalizeFacing(facing: number): number {
  if (!Number.isInteger(facing)) return 0
  return ((facing % 4) + 4) % 4
}

/**
 * Whether two tunings say the same thing.
 *
 * Field by field rather than by stringifying, unlike `sameSpec` next door, and
 * the difference is which failure each can afford. A spec that compares unequal
 * for key order costs one redundant event in a panel somebody pressed Save on.
 * A tuning is written by a switch that fires on every toggle, so the same slip
 * would append an event per flick - and `body` is the field most likely to
 * arrive with its keys in a different order, since it is assembled from
 * whichever sliders the panel is showing.
 */
function sameTuning(a: ThingTuning, b: ThingTuning): boolean {
  if (a.blocking !== b.blocking) return false
  if ((a.body === undefined) !== (b.body === undefined)) return false
  if ((a.body === null) !== (b.body === null)) return false
  if (!a.body || !b.body) return true

  const fields = ['gravity', 'bounce', 'drag', 'friction', 'mass', 'roll'] as const
  return fields.every((field) => a.body?.[field] === b.body?.[field])
}

export const thingDecider: Decider<ThingState, ThingCommand, ThingEvent> = {
  streamType: THING_STREAM_TYPE,
  initialState: initialThingState,
  evolve,
  decide,
}
