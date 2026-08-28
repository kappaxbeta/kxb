import type { BattlefieldCommand } from '@/domain/battlefields/commands'
import {
  BATTLEFIELD_STREAM_TYPE,
  type BattlefieldEvent,
  type BattlefieldVisibility,
} from '@/domain/battlefields/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface BattlefieldState {
  status: 'none' | 'active' | 'archived'
  name: string
  visibility: BattlefieldVisibility
  /** The member who created it. Kept for the read model, not for permission. */
  createdBy: string
}

export const initialBattlefieldState: BattlefieldState = {
  status: 'none',
  name: '',
  visibility: 'space',
  createdBy: '',
}

export function evolve(
  state: BattlefieldState,
  event: BattlefieldEvent,
): BattlefieldState {
  switch (event.type) {
    case 'BattlefieldCreated':
      return {
        ...state,
        status: 'active',
        name: event.data.name,
        visibility: event.data.visibility,
        createdBy: event.data.createdBy,
      }

    case 'BattlefieldRenamed':
      return { ...state, name: event.data.name }

    case 'BattlefieldVisibilitySet':
      return { ...state, visibility: event.data.visibility }

    case 'BattlefieldArchived':
      return { ...state, status: 'archived' }

    default:
      return state
  }
}

export function decide(
  state: BattlefieldState,
  command: BattlefieldCommand,
): BattlefieldEvent[] {
  switch (command.type) {
    case 'CreateBattlefield': {
      // The stream id is minted fresh by the action, so a second CreateBattlefield
      // on the same stream is not a user retrying - it is a collision that should
      // never happen. Refusing is how it stays that way.
      if (state.status !== 'none') {
        throw new DomainError('That battlefield already exists', 'battlefield_exists')
      }
      return [
        {
          type: 'BattlefieldCreated',
          data: {
            name: command.name,
            createdBy: command.actorId,
            visibility: command.visibility,
          },
        },
      ]
    }

    case 'RenameBattlefield': {
      assertActive(state)
      if (state.name === command.name) return []
      return [{ type: 'BattlefieldRenamed', data: { name: command.name } }]
    }

    case 'SetBattlefieldVisibility': {
      assertActive(state)
      if (state.visibility === command.visibility) return []
      return [
        {
          type: 'BattlefieldVisibilitySet',
          data: { visibility: command.visibility },
        },
      ]
    }

    case 'ArchiveBattlefield': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'archived') return []
      return [{ type: 'BattlefieldArchived', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('Battlefield not found', 'battlefield_not_found')
}

function assertActive(state: BattlefieldState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'archived') {
    throw new DomainError('That battlefield has been archived', 'battlefield_archived')
  }
}

export const battlefieldDecider: Decider<
  BattlefieldState,
  BattlefieldCommand,
  BattlefieldEvent
> = {
  streamType: BATTLEFIELD_STREAM_TYPE,
  initialState: initialBattlefieldState,
  evolve,
  decide,
}
