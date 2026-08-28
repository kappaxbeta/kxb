import type { BoardCommand } from '@/domain/board/commands'
import { BOARD_STREAM_TYPE, type BoardEvent } from '@/domain/board/events'
import type { EmoteId } from '@/domain/world/emotes'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * Who reacted with what, keyed by emote index.
 *
 * A map of arrays rather than a flat list of pairs because every question asked
 * of it is "who is on this face" - the chip row renders one entry per key, and
 * the toggle checks one array. Keys are the emote index stringified, because
 * that is what an object key is and what `jsonb` will hand back.
 */
export type Reactions = Record<string, string[]>

/**
 * No author field. Who posted is `actorId` on the event, which the projection
 * reads directly - and nothing here decides anything by it, because posting,
 * editing and taking down are all admin-only and that is checked in the action
 * against the caller's role rather than against the author.
 */
export interface BoardPostState {
  status: 'none' | 'active' | 'deleted'
  body: string
  pinned: boolean
  reactions: Reactions
  /**
   * The scene pinned with it, if any.
   *
   * In the state even though no decision reads it, because a decider's state is
   * what the stream means and leaving a published field out of it would make
   * `evolve` a partial account of the events. The cost is one line; the version
   * where it is only in the projection is the version where the read model
   * knows something the aggregate does not.
   */
  sceneId: string | null
  /** The picture pinned with it, if any. In the state for the reason above. */
  imageSlug: string | null
}

export const initialBoardPostState: BoardPostState = {
  status: 'none',
  body: '',
  pinned: false,
  reactions: {},
  sceneId: null,
  imageSlug: null,
}

function reactorsOf(reactions: Reactions, emote: EmoteId): string[] {
  return reactions[String(emote)] ?? []
}

export function evolve(state: BoardPostState, event: BoardEvent): BoardPostState {
  switch (event.type) {
    case 'PostPublished':
      return {
        status: 'active',
        body: event.data.body,
        pinned: event.data.pinned,
        reactions: {},
        // Absent on every notice written before scenes existed, which reads as
        // the same thing as one posted without a scene since. Same for the
        // picture, which arrived later still.
        sceneId: event.data.sceneId ?? null,
        imageSlug: event.data.imageSlug ?? null,
      }

    case 'PostEdited':
      return { ...state, body: event.data.body }

    case 'PostPinUpdated':
      return { ...state, pinned: event.data.pinned }

    case 'PostReacted': {
      const key = String(event.data.emote)
      const current = reactorsOf(state.reactions, event.data.emote)
      if (current.includes(event.data.userId)) return state
      return {
        ...state,
        reactions: { ...state.reactions, [key]: [...current, event.data.userId] },
      }
    }

    case 'PostUnreacted': {
      const key = String(event.data.emote)
      const left = reactorsOf(state.reactions, event.data.emote).filter(
        (userId) => userId !== event.data.userId,
      )
      const next = { ...state.reactions }
      // Dropped rather than left empty, so "which faces are on this post" is
      // just the key set and the chip row does not have to filter zeroes out.
      if (left.length === 0) delete next[key]
      else next[key] = left
      return { ...state, reactions: next }
    }

    case 'PostDeleted':
      return { ...state, status: 'deleted' }

    default:
      return state
  }
}

export function decide(state: BoardPostState, command: BoardCommand): BoardEvent[] {
  switch (command.type) {
    case 'PublishPost': {
      // The stream id is minted by the action, so a second PublishPost on the
      // same stream is a collision rather than a retry, and overwriting somebody
      // else's notice is the one outcome worth refusing outright.
      if (state.status !== 'none') {
        throw new DomainError('This notice already exists', 'post_exists')
      }
      return [
        {
          type: 'PostPublished',
          data: {
            body: command.body,
            pinned: command.pinned,
            sceneId: command.sceneId,
            imageSlug: command.imageSlug,
          },
        },
      ]
    }

    case 'EditPost': {
      assertActive(state)
      if (state.body === command.body) return []
      return [{ type: 'PostEdited', data: { body: command.body } }]
    }

    case 'PinPost': {
      assertActive(state)
      if (state.pinned === command.pinned) return []
      return [{ type: 'PostPinUpdated', data: { pinned: command.pinned } }]
    }

    case 'ToggleReaction': {
      // Reacting to a deleted notice is not an error worth showing anybody -
      // it means the post went away between the render and the click, and the
      // next revalidate removes it from the screen anyway.
      if (state.status !== 'active') return []

      const already = reactorsOf(state.reactions, command.emote).includes(
        command.actorId,
      )
      return [
        {
          type: already ? 'PostUnreacted' : 'PostReacted',
          data: { emote: command.emote, userId: command.actorId },
        },
      ]
    }

    case 'DeletePost': {
      if (state.status === 'none') {
        throw new DomainError('Notice not found', 'post_not_found')
      }
      if (state.status === 'deleted') return []
      return [{ type: 'PostDeleted', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function assertActive(state: BoardPostState): void {
  if (state.status === 'none') {
    throw new DomainError('Notice not found', 'post_not_found')
  }
  if (state.status === 'deleted') {
    throw new DomainError('This notice has been taken down', 'post_deleted')
  }
}

export const boardDecider: Decider<BoardPostState, BoardCommand, BoardEvent> = {
  streamType: BOARD_STREAM_TYPE,
  initialState: initialBoardPostState,
  evolve,
  decide,
}
