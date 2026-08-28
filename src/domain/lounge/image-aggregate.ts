import { WORLD_HEIGHT } from '@/domain/lounge/events'
import type { LoungeImageCommand } from '@/domain/lounge/image-commands'
import {
  LOUNGE_IMAGE_STREAM_TYPE,
  type LoungeImageEvent,
  MAX_IMAGE_SIZE,
  MIN_IMAGE_SIZE,
} from '@/domain/lounge/image-events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface LoungeImageState {
  status: 'none' | 'placed' | 'removed'
  uploadSlug: string
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

export const initialImageState: LoungeImageState = {
  status: 'none',
  uploadSlug: '',
  x: 0,
  y: 0,
  z: 0,
  width: 4,
  height: 3,
  facing: 0,
}

export function evolve(
  state: LoungeImageState,
  event: LoungeImageEvent,
): LoungeImageState {
  switch (event.type) {
    case 'ImagePlaced':
      return { ...state, status: 'placed', ...event.data }

    case 'ImageMoved':
      return { ...state, x: event.data.x, y: event.data.y, z: event.data.z }

    case 'ImageRotated':
      return { ...state, facing: event.data.facing }

    case 'ImageResized':
      return { ...state, width: event.data.width, height: event.data.height }

    case 'ImageRemoved':
      return { ...state, status: 'removed' }

    default:
      return state
  }
}

/**
 * Decide what happened to one image.
 *
 * Removal is a soft fact, like a deleted task: `ImageRemoved` is recorded, the
 * read model hides the row, and the history of where the image used to hang is
 * still in the log. Nothing about "delete" needs to destroy anything.
 */
export function decide(
  state: LoungeImageState,
  command: LoungeImageCommand,
): LoungeImageEvent[] {
  switch (command.type) {
    case 'PlaceImage': {
      if (state.status !== 'none') {
        throw new DomainError('That image has already been placed', 'image_exists')
      }
      assertCell(command)
      assertSize(command.width, command.height)

      return [
        {
          type: 'ImagePlaced',
          data: {
            uploadSlug: command.uploadSlug,
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

    case 'MoveImage': {
      assertPlaced(state)
      assertCell(command)

      // Dropping something back where it started is not a move. Without this,
      // every mouse-up during a drag would append an event.
      if (state.x === command.x && state.y === command.y && state.z === command.z) {
        return []
      }

      return [
        { type: 'ImageMoved', data: { x: command.x, y: command.y, z: command.z } },
      ]
    }

    case 'RotateImage': {
      assertPlaced(state)

      const facing = normalizeFacing(command.facing)
      if (state.facing === facing) return []

      return [{ type: 'ImageRotated', data: { facing } }]
    }

    case 'ResizeImage': {
      assertPlaced(state)
      assertSize(command.width, command.height)

      if (state.width === command.width && state.height === command.height) return []

      return [
        { type: 'ImageResized', data: { width: command.width, height: command.height } },
      ]
    }

    case 'RemoveImage': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'removed') return []
      return [{ type: 'ImageRemoved', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('That image is not in the world', 'image_not_found')
}

function assertPlaced(state: LoungeImageState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'removed') {
    throw new DomainError('That image was removed', 'image_removed')
  }
}

/** The same lattice the blocks sit on, so images cannot land between cells. */
function assertCell(cell: { x: number; y: number; z: number }): void {
  if (
    !Number.isInteger(cell.x) ||
    !Number.isInteger(cell.y) ||
    !Number.isInteger(cell.z)
  ) {
    throw new DomainError('Image position must be whole cells', 'image_off_grid')
  }
  if (cell.y < 0 || cell.y >= WORLD_HEIGHT) {
    throw new DomainError(
      `Images must sit between y=0 and y=${WORLD_HEIGHT - 1}`,
      'image_out_of_bounds',
    )
  }
}

function assertSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new DomainError('Image size must be whole cells', 'image_bad_size')
  }
  if (
    width < MIN_IMAGE_SIZE ||
    height < MIN_IMAGE_SIZE ||
    width > MAX_IMAGE_SIZE ||
    height > MAX_IMAGE_SIZE
  ) {
    throw new DomainError(
      `Images must be ${MIN_IMAGE_SIZE}-${MAX_IMAGE_SIZE} cells on a side`,
      'image_bad_size',
    )
  }
}

/** Wrap quarter turns, so rotating past west comes back round to north. */
function normalizeFacing(facing: number): number {
  if (!Number.isInteger(facing)) return 0
  return ((facing % 4) + 4) % 4
}

export const loungeImageDecider: Decider<
  LoungeImageState,
  LoungeImageCommand,
  LoungeImageEvent
> = {
  streamType: LOUNGE_IMAGE_STREAM_TYPE,
  initialState: initialImageState,
  evolve,
  decide,
}
