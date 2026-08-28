import type { DomainEvent } from '@/es/types'

/**
 * Lounge chat: one stream per message.
 *
 * A message is not an aggregate with a life of its own - it is said once, and
 * at most it is later taken down. So the stream is short by construction, which
 * is the whole reason for the shape: a room where everybody's sentences shared
 * one stream would replay the entire conversation to append the next line, and
 * the busiest room would be the slowest to speak in.
 *
 * The comparison worth drawing is with the emotes standing next to this in the
 * HUD. A face is broadcast over Realtime, lives three seconds and is never
 * written down, and that is right for it - a dropped emote packet is a face
 * nobody saw, which costs nothing. Chat is written down, and not for the
 * scrollback: it is written down because it can be reported. A moderator cannot
 * act on a sentence that only ever existed in six browser tabs, so the message
 * needs an id, and an id is a row.
 */

/**
 * Somebody said something.
 *
 * The author is `actorId` in the event's metadata rather than a field here,
 * following the rest of the log: it is stamped from the session by the store
 * and cannot be forged by a caller.
 *
 * `authorName` is a field, and is the exception worth explaining. It is the
 * handle as it stood at the moment of speaking, copied in deliberately rather
 * than resolved at read time. A message is a thing somebody said then;
 * re-labelling a week-old conversation because a person has since changed their
 * username would make the record tidier than the truth. It also means the
 * message survives the account - which is precisely the case a moderator
 * reading the queue is most likely to have in front of them.
 */
export type MessagePosted = DomainEvent<
  'MessagePosted',
  {
    body: string
    authorName: string
    /**
     * Which room it was said in. Absent means the lounge.
     *
     * Optional rather than required, and that is the whole migration: every
     * message written before rooms had conversations was said in the lounge, so
     * the absence of a value already means the right thing and no event in the
     * log has to be rewritten. Exactly the shape `GoalPlaced` uses for
     * `worldId`, read through `roomOf` below the way that one is read through
     * `worldOf`.
     */
    roomId?: string
  }
>

/**
 * Which room a message belongs to, with the default applied.
 *
 * Null for the lounge, because that is what the column holds - the read model
 * stores the absence rather than substituting the tenant id, so "said in the
 * lounge" and "said in a room that happens to share the tenant's id" cannot be
 * confused. That is the one place this differs from `worldOf`, which folds the
 * default in: a world *is* identified by the tenant id when it is the lounge,
 * and a room is not.
 */
export function roomOf(data: { roomId?: string }): string | null {
  return data.roomId ?? null
}

/**
 * One event, and no takedown beside it.
 *
 * A moderator hiding a message does not append here, and that is deliberate
 * rather than missing. This stream belongs to the space being moderated - its
 * members can write to it, and a backoffice admin cannot, because they hold the
 * service role and `append_events` refuses a caller with no session. So a
 * takedown is a row in `hidden_chat_messages`, owned by the platform, outside
 * anything a replay can rebuild or a member can overwrite. Same argument, same
 * shape as `banned_worlds`; see the migration.
 */
export type ChatEvent = MessagePosted

export const CHAT_STREAM_TYPE = 'chat_message'

export const CHAT_EVENT_LABELS: Record<ChatEvent['type'], string> = {
  MessagePosted: 'message sent',
}

/**
 * Longest thing anybody may say in one go.
 *
 * Well short of the pinboard's 2000. The two surfaces want opposite things: a
 * notice is read once and carefully, a chat line is read over somebody's
 * shoulder while they are being charged at. It also has to fit in a speech
 * bubble over a head without becoming the room's weather, which is the real
 * constraint - see CHAT_BUBBLE_LINES in chat-bubble.tsx.
 */
export const MAX_MESSAGE_LENGTH = 400

/**
 * How many messages the panel is handed on load.
 *
 * Enough that somebody arriving mid-conversation can scroll back and find out
 * what everyone is laughing at, few enough that it is one small query on a page
 * that is already fetching a voxel world.
 */
export const CHAT_HISTORY_LIMIT = 100
