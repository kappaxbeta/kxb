import type { EmoteId } from '@/domain/world/emotes'
import type { DomainEvent } from '@/es/types'

/**
 * The pinboard: notices an admin puts up, and the faces everyone else puts on
 * them.
 *
 * One stream per post. Reactions live in the *post's* stream rather than in one
 * of their own, because a reaction is not a thing on its own - it is a fact
 * about a notice, and it is meaningless once that notice is gone. Keeping them
 * together is what lets the decider answer "has this person already reacted
 * with this face" without reading anything else.
 *
 * The cost is that a popular post has a long stream and every reaction replays
 * it. For a board where the busy case is a dozen people and three faces each
 * that is nothing; a post that outgrows it wants snapshotting, which is the
 * same answer `loadStream` already gives for every other aggregate here.
 */

/**
 * `sceneId` is optional in the type as well as in practice, and that is not
 * laziness - it is what makes the field readable against history. Every notice
 * written before scenes existed is a stored event with no such key, and a
 * required field would mean either a migration over the log (which is not a
 * thing an append-only log does) or an `evolve` that lies about what it read.
 *
 * It is set once, at publication, and there is no event that changes it. A
 * scene is *what the notice is*, in the way the body is not: people react to
 * the thing they were shown, and swapping the picture under a row of faces
 * would silently change what those faces meant. Attaching a different scene is
 * a different notice.
 */
/**
 * `imageSlug` is the same shape of field for the same reasons, and it is a
 * *slug* rather than a row id: an upload is addressed by its opaque slug
 * everywhere in this product, and the route of that name is what decides
 * whether the reader may have the bytes. Set once at publication, like the
 * scene, because a picture is what the notice is.
 */
export type PostPublished = DomainEvent<
  'PostPublished',
  { body: string; pinned: boolean; sceneId?: string | null; imageSlug?: string | null }
>

export type PostEdited = DomainEvent<'PostEdited', { body: string }>

export type PostPinUpdated = DomainEvent<'PostPinUpdated', { pinned: boolean }>

/**
 * Somebody put a face on a post.
 *
 * The reactor is `actorId` in the event's metadata, not a field here, for the
 * same reason the rest of the log leaves it there: it is stamped from the
 * session by the store and cannot be forged by a caller. The decider does need
 * it, so it travels *in the command* - see the note in commands.ts.
 */
export type PostReacted = DomainEvent<
  'PostReacted',
  { emote: EmoteId; userId: string }
>

export type PostUnreacted = DomainEvent<
  'PostUnreacted',
  { emote: EmoteId; userId: string }
>

export type PostDeleted = DomainEvent<'PostDeleted', Record<string, never>>

export type BoardEvent =
  | PostPublished
  | PostEdited
  | PostPinUpdated
  | PostReacted
  | PostUnreacted
  | PostDeleted

export const BOARD_STREAM_TYPE = 'board_post'

export const BOARD_EVENT_LABELS: Record<BoardEvent['type'], string> = {
  PostPublished: 'posted',
  PostEdited: 'edited',
  PostPinUpdated: 'pinned',
  PostReacted: 'reacted',
  PostUnreacted: 'un-reacted',
  PostDeleted: 'deleted',
}
