import { z } from 'zod'
import { MAX_MESSAGE_LENGTH } from '@/domain/chat/events'

/**
 * `actorId` is stamped from the session in the action and never accepted from
 * the client, exactly as in board and tenants. The decider does not read it -
 * nothing about saying a sentence depends on who is saying it, because the
 * checks that do depend on that (membership, the two gates, billing) are all
 * resolved by requireTenant on the way in and cannot be re-derived from one
 * message's stream. It is carried anyway so that the command is self-describing
 * and so the metadata the store stamps has one source.
 */

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, 'Say something first')
  .max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters`)

/**
 * The name recorded beside the message.
 *
 * Resolved on the server from the caller's profile, not accepted from the
 * client - a name field a browser could fill in is a way to sign somebody
 * else's sentence. Bounded here anyway, because it is written into a row that a
 * moderator will read and a bubble that has to fit over a head.
 */
export const authorNameSchema = z.string().trim().min(1).max(64)

/**
 * The room a message is addressed to.
 *
 * Optional, and null and undefined both mean the lounge - the panel sends null
 * for it, because "the lounge" is a value somebody picked in a switcher rather
 * than a field they left blank, and a client that had to omit a key to say
 * something is a client waiting to send `"null"`.
 */
export const chatRoomSchema = z.string().uuid().nullish()

export const postMessageSchema = z.object({
  body: messageBodySchema,
  roomId: chatRoomSchema,
})

export type PostMessage = {
  type: 'PostMessage'
  actorId: string
  body: string
  authorName: string
  /** Absent for the lounge. See `roomOf`. */
  roomId?: string
}

/**
 * One command, because a message has one thing that can happen to it.
 *
 * Hiding is not here: it is a platform verb rather than a domain one, and lives
 * in src/domain/moderation/actions.ts against a table this space cannot write
 * to. See the note on `ChatEvent`.
 */
export type ChatCommand = PostMessage
