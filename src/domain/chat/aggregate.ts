import type { ChatCommand } from '@/domain/chat/commands'
import { CHAT_STREAM_TYPE, type ChatEvent } from '@/domain/chat/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * One message's whole life, which is one event long.
 *
 * That makes this the smallest decider in the codebase, and it is worth being
 * clear about what it is still for. `status` is doing real work rather than
 * being boilerplate: the stream id is minted by the action, so a second
 * PostMessage on the same stream is not a retry - it is a collision, and
 * overwriting a sentence somebody else said is the one outcome worth refusing
 * outright. Same argument as `PublishPost` in the board decider, and the same
 * shape.
 *
 * Taking a message down is deliberately not modelled here. It is a platform
 * verb against a table this space cannot write to; see the note on `ChatEvent`.
 */
export interface ChatMessageState {
  status: 'none' | 'said'
  body: string
  authorName: string
}

export const initialChatMessageState: ChatMessageState = {
  status: 'none',
  body: '',
  authorName: '',
}

export function evolve(state: ChatMessageState, event: ChatEvent): ChatMessageState {
  switch (event.type) {
    case 'MessagePosted':
      return {
        status: 'said',
        body: event.data.body,
        authorName: event.data.authorName,
      }

    default:
      // An event type this version does not know about. Ignore it rather than
      // crash, so a rolled-back deploy can still replay newer history.
      return state
  }
}

export function decide(state: ChatMessageState, command: ChatCommand): ChatEvent[] {
  switch (command.type) {
    case 'PostMessage': {
      if (state.status !== 'none') {
        throw new DomainError('That message already exists', 'message_exists')
      }
      return [
        {
          type: 'MessagePosted',
          data: {
            body: command.body,
            authorName: command.authorName,
            // Spread rather than written as `roomId: command.roomId`, so a
            // message said in the lounge carries no key at all - which is what
            // makes every event written before rooms existed identical to one
            // written now. See `roomOf`.
            ...(command.roomId ? { roomId: command.roomId } : {}),
          },
        },
      ]
    }

    default: {
      /**
       * No `never` assertion here, unlike every other decider in the codebase.
       *
       * `ChatCommand` is a union of one, so TypeScript narrows it to `never` in
       * the case above and the assertion becomes an error rather than a check -
       * the exhaustiveness trick only works from two members up. The moment a
       * second command joins the union this branch stops being unreachable, and
       * that is the point at which the assertion should come back.
       */
      throw new DomainError(`Unknown command: ${JSON.stringify(command)}`)
    }
  }
}

export const chatDecider: Decider<ChatMessageState, ChatCommand, ChatEvent> = {
  streamType: CHAT_STREAM_TYPE,
  initialState: initialChatMessageState,
  evolve,
  decide,
}
