'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { boardDecider } from '@/domain/board/aggregate'
import {
  type BoardCommand,
  editPostSchema,
  pinPostSchema,
  postIdSchema,
  publishPostSchema,
  reactSchema,
} from '@/domain/board/commands'
import { boardProjection } from '@/domain/board/projection'
import { findScene } from '@/domain/scenes/queries'
import { encodeShot } from '@/domain/studio/shot'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { hasRole, requireTenant, writeBlockedReason } from '@/lib/tenant'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function toResult<T = void>(error: unknown): ActionResult<T> {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return {
      ok: false,
      error: 'That notice changed while you were writing. Please try again.',
    }
  }
  throw error
}

/**
 * Every board command, through one door.
 *
 * `guard` names the four authorities this surface has, because "admin or not"
 * stopped being the whole story once a scene could be pinned from the studio.
 * Announcing something to the space is still admin work, and so is deciding
 * what sits at the top of the board. Showing the room what you just made is
 * not - that is the same act as reacting, one size up. All four still go
 * through the same membership and billing checks, so a lapsed space is as
 * read-only for a face as it is for a notice.
 *
 *   admin         - an announcement, and pinning anything to the top.
 *   member        - anybody who may write here at all: a scene or a picture,
 *                   from one of the studios.
 *   authorOrAdmin - taking your own notice back down, or an admin taking down
 *                   anybody's.
 *   anyone        - a face on somebody else's notice.
 *
 * The role check lives here rather than in the decider because the decider has
 * no way to know it. Roles are state of the *tenant* stream, and a board post
 * is its own stream; asking the decider to enforce it would mean loading a
 * second aggregate on every reaction to re-derive something `requireTenant`
 * already resolved on the way in.
 *
 * Authorship is the one exception, and it is read from the read model rather
 * than from the aggregate: the decider has no author field on purpose - see the
 * note on `BoardPostState` - and giving it one to answer a permission question
 * would put a role decision inside a stream that cannot see roles.
 */
type Guard = 'admin' | 'member' | 'authorOrAdmin' | 'anyone'

async function dispatch(
  slug: string,
  streamId: string,
  /**
   * Built from the actor rather than passed in, because every command here
   * carries `actorId` and resolving it means another `requireTenant` - which is
   * half a dozen round trips for something this call already has in hand.
   */
  build: (actorId: string, admin: boolean) => BoardCommand,
  { guard }: { guard: Guard },
): Promise<ActionResult<void>> {
  const context = await requireTenant(slug)
  const { user, supabase, tenant } = context

  const blocked = writeBlockedReason(context)
  if (blocked) {
    return { ok: false, error: blocked }
  }

  const admin = hasRole(context, ['owner', 'admin'])

  if (guard === 'admin' && !admin) {
    return { ok: false, error: 'Only admins can post to the board' }
  }

  if (guard === 'member' && !hasRole(context, ['owner', 'admin', 'member'])) {
    return { ok: false, error: 'You cannot post to this board' }
  }

  if (guard === 'authorOrAdmin' && !admin) {
    const { data } = await supabase
      .from('board_posts_read_model')
      .select('created_by')
      .eq('tenant_id', tenant.id)
      .eq('id', streamId)
      .maybeSingle()

    // A notice nobody can find and one somebody else wrote get the same
    // answer, for the reason every other lookup here gives: a refusal that
    // distinguishes them tells a stranger which ids exist.
    if (!data || data.created_by !== user.id) {
      return { ok: false, error: 'That notice is not yours' }
    }
  }

  const command = build(user.id, admin)

  try {
    await executeCommand({
      supabase,
      decider: boardDecider,
      tenantId: tenant.id,
      streamId,
      command,
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, boardProjection, tenant.id)
  // The board moved to the workspace root; /dashboard is only a redirect now,
  // so revalidating it would refresh nothing anyone is looking at.
  revalidatePath(`/t/${slug}`)
  return { ok: true, data: undefined }
}

export async function publishPost(
  slug: string,
  body: string,
  pinned = false,
  sceneId: string | null = null,
  imageSlug: string | null = null,
): Promise<ActionResult<{ id: string }>> {
  const parsed = publishPostSchema.safeParse({ body, pinned, sceneId, imageSlug })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid notice' }
  }

  /**
   * The scene is checked before the event, not after.
   *
   * An id that survives the schema is only well-formed; it is not necessarily a
   * scene, and it is certainly not necessarily one this poster may see. The
   * check is a plain read, which the row-level policy answers - if it comes
   * back empty the id is dropped and the notice goes up as words, because the
   * alternatives are both worse: refusing loses what somebody wrote, and
   * writing the id anyway puts an unreadable reference into an immutable log.
   *
   * Dropped rather than refused is also the honest reading of what happened.
   * The only ways to get here with an unreadable id are a scene deleted between
   * picking it and pressing post, and a hand-made request - and the second one
   * has no business getting a better error than the first.
   */
  let attached: string | null = null
  let picture: string | null = null
  if (parsed.data.sceneId || parsed.data.imageSlug) {
    const { supabase, tenant } = await requireTenant(slug)

    if (parsed.data.sceneId) {
      const scene = await findScene(supabase, parsed.data.sceneId)
      attached = scene ? scene.id : null
    }

    /**
     * The same check for the picture, one table over.
     *
     * Tenant-scoped as well as policy-checked, which the scene lookup is not
     * and does not need to be: a scene may be another space's public one, and
     * pinning somebody else's shared work is the feature. A picture is a file
     * this space uploaded, so a slug from elsewhere is not a thing to show -
     * the policy would already refuse it, and the `eq` says so out loud.
     */
    if (parsed.data.imageSlug) {
      const { data } = await supabase
        .from('uploads')
        .select('slug')
        .eq('slug', parsed.data.imageSlug)
        .eq('tenant_id', tenant.id)
        .maybeSingle()
      picture = data?.slug ?? null
    }
  }

  // Dropping what was attached is only survivable when there is a notice left.
  // A captionless post from a studio whose scene or picture has gone is a blank
  // card, so that one is refused rather than published empty.
  if (!attached && !picture && parsed.data.body.length === 0) {
    return { ok: false, error: 'That is no longer here' }
  }

  /**
   * Something made in a studio opens the board to everybody who may write in
   * the space.
   *
   * The admin-only rule was about announcements - one voice writes, the room
   * answers - and a scene or a picture somebody made in a studio is not an
   * announcement. It is the room answering, with a thing they made. Words on
   * their own are still admin work, which is why the guard is decided by what
   * is attached rather than by which surface the call came from: a surface is a
   * claim the client makes, and an attachment is a fact this action has
   * checked.
   *
   * Pinning to the top stays admin work whoever posts, because it is a claim on
   * everyone else's attention rather than a post. A member asking for it is
   * quietly given an unpinned notice rather than a refusal - the studio does
   * not offer them the checkbox, so the only way here is a hand-made request.
   */
  const id = randomUUID()
  const result = await dispatch(
    slug,
    id,
    (actorId, admin) => ({
      type: 'PublishPost',
      actorId,
      body: parsed.data.body,
      pinned: admin ? (parsed.data.pinned ?? false) : false,
      sceneId: attached,
      imageSlug: picture,
    }),
    { guard: attached || picture ? 'member' : 'admin' },
  )

  if (!result.ok) return result
  return { ok: true, data: { id } }
}

/**
 * One pinned scene's document, fetched when somebody presses play.
 *
 * The whole reason the board is cheap to open. A card shows the poster that
 * came down with the row; the shot itself - a few kilobytes of JSON, and then a
 * WebGL canvas and every glTF in it - arrives only for the scene somebody
 * actually chose to watch. Ten scenes on a board is ten pictures, not ten
 * renderers.
 *
 * Returns the studio's own encoding rather than the parsed object, so the
 * player decodes it with exactly the parser the studio writes with and there is
 * no second shape in between.
 */
export async function loadPinnedScene(
  slug: string,
  sceneId: string,
): Promise<ActionResult<{ document: string }>> {
  const { supabase } = await requireTenant(slug)
  const scene = await findScene(supabase, sceneId)
  if (!scene) return { ok: false, error: 'That scene is no longer here' }
  return { ok: true, data: { document: encodeShot(scene.document) } }
}

export async function editPost(
  slug: string,
  id: string,
  body: string,
): Promise<ActionResult<void>> {
  const parsed = editPostSchema.safeParse({ id, body })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid notice' }
  }

  return dispatch(
    slug,
    parsed.data.id,
    (actorId) => ({ type: 'EditPost', actorId, body: parsed.data.body }),
    // Your own words, or an admin's hand on anybody's.
    { guard: 'authorOrAdmin' },
  )
}

export async function pinPost(
  slug: string,
  id: string,
  pinned: boolean,
): Promise<ActionResult<void>> {
  const parsed = pinPostSchema.safeParse({ id, pinned })
  if (!parsed.success) {
    return { ok: false, error: 'Invalid notice' }
  }

  return dispatch(
    slug,
    parsed.data.id,
    (actorId) => ({ type: 'PinPost', actorId, pinned: parsed.data.pinned }),
    // What sits at the top of the board is a claim on everyone's attention, so
    // it stays with the people who answer for the space - including on a
    // notice they did not write.
    { guard: 'admin' },
  )
}

export async function deletePost(slug: string, id: string): Promise<ActionResult<void>> {
  const parsed = postIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid notice' }

  return dispatch(
    slug,
    parsed.data.id,
    (actorId) => ({ type: 'DeletePost', actorId }),
    // Taking your own scene back down needs no admin; an admin can still take
    // down anybody's.
    { guard: 'authorOrAdmin' },
  )
}

/**
 * Put a face on a notice, or take it back off.
 *
 * Open to every member, including the one who cannot post. The toggle is
 * decided server-side from the log rather than from what the button thought it
 * was showing, so two fast clicks - or the same click arriving twice - settle
 * on one answer instead of leaving a stuck face.
 */
export async function toggleReaction(
  slug: string,
  id: string,
  emote: number,
): Promise<ActionResult<void>> {
  const parsed = reactSchema.safeParse({ id, emote })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Unknown emote' }
  }

  return dispatch(
    slug,
    parsed.data.id,
    (actorId) => ({ type: 'ToggleReaction', actorId, emote: parsed.data.emote }),
    { guard: 'anyone' },
  )
}
