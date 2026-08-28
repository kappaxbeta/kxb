import { z } from 'zod'
import { EMOTE_COUNT, type EmoteId } from '@/domain/world/emotes'

/**
 * `actorId` is stamped from the session in the action and never accepted from
 * the client, exactly as in tenants and battle. The decider needs it because
 * "have you already reacted with this face" is a question about *you*, and a
 * decider that could not see who was asking would have to be told by the read
 * model - which is the one place a lost race would let a double reaction
 * through.
 */

export const postBodySchema = z
  .string()
  .trim()
  .min(1, 'A notice needs some words')
  // Long enough for an announcement with a couple of paragraphs, short enough
  // that the board stays scannable. A wall of text belongs in Pages.
  .max(2000, 'A notice cannot exceed 2000 characters')

/** Any index the current sheet can draw. Mirrors `isEmote`, as a schema. */
export const emoteIdSchema = z
  .number()
  .int()
  .min(0)
  .max(EMOTE_COUNT - 1, 'That is not an emote on this sheet')

/**
 * An upload's public name.
 *
 * Base64url, because that is what `newUploadSlug` mints - which is also why the
 * character class carries `_` and `-` and no `/` or `+`. Stated as a schema so
 * a hand-made request cannot put a path, a URL or a traversal into the log; the
 * 64 is the same ceiling /api/uploads/[slug] refuses above.
 *
 * What it deliberately does not check is whether the slug resolves, or whether
 * this poster may read it - both are the row-level policy's to answer, and the
 * action asks by reading the row before it dispatches.
 */
const uploadSlugSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'That is not a picture this space has')

/**
 * A notice needs *something* - words, a scene, a picture, or any of them
 * together.
 *
 * The body is no longer required on its own, because a notice is now written
 * in three places and only one of them is a text box. From either studio the
 * thing being posted is what was made, and a caption is a caption: making
 * people invent a sentence to show what they just made is a toll on the common
 * case.
 *
 * The rule is a `refine` rather than a looser `body` field so the emptiness is
 * still refused when there is nothing else to look at - an empty notice with
 * nothing attached is a blank card on the board, not a post.
 */
export const publishPostSchema = z
  .object({
    body: z.string().trim().max(2000, 'A notice cannot exceed 2000 characters'),
    pinned: z.boolean().optional(),
    /**
     * A scene to pin with it.
     *
     * Only ever an id. Whether the poster may actually see that scene is not a
     * question this schema can answer - it is the row-level policy's, and the
     * action asks it by trying to read the row before it dispatches.
     */
    sceneId: z.uuid().nullish(),
    /** A picture to pin with it, as the slug /api/uploads serves it under. */
    imageSlug: uploadSlugSchema.nullish(),
  })
  .refine(
    (input) => input.body.length > 0 || Boolean(input.sceneId) || Boolean(input.imageSlug),
    {
      message: 'A notice needs some words',
      path: ['body'],
    },
  )

export const editPostSchema = z.object({
  id: z.string().uuid(),
  body: postBodySchema,
})

export const pinPostSchema = z.object({
  id: z.string().uuid(),
  pinned: z.boolean(),
})

export const reactSchema = z.object({
  id: z.string().uuid(),
  emote: emoteIdSchema,
})

export const postIdSchema = z.object({
  id: z.string().uuid(),
})

export type PublishPost = {
  type: 'PublishPost'
  actorId: string
  body: string
  pinned: boolean
  sceneId: string | null
  imageSlug: string | null
}

export type EditPost = { type: 'EditPost'; actorId: string; body: string }

export type PinPost = { type: 'PinPost'; actorId: string; pinned: boolean }

/**
 * One command for both directions, because the button is a toggle and the
 * client should not have to know which way it is about to go. The decider reads
 * current state and emits the reaction or its removal - which also means a
 * double-click that arrives twice settles on one answer instead of racing.
 */
export type ToggleReaction = {
  type: 'ToggleReaction'
  actorId: string
  emote: EmoteId
}

export type DeletePost = { type: 'DeletePost'; actorId: string }

export type BoardCommand =
  | PublishPost
  | EditPost
  | PinPost
  | ToggleReaction
  | DeletePost
