import 'server-only'
import { randomUUID } from 'node:crypto'
import { chatDecider } from '@/domain/chat/aggregate'
import { authorNameSchema, chatRoomSchema, postMessageSchema } from '@/domain/chat/commands'
import { chatProjection } from '@/domain/chat/projection'
import { listChatMessages, type ChatMessageView } from '@/domain/chat/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { chatOpen, writeBlockedReason, type TenantContext } from '@/lib/tenant'

/**
 * Saying something, and reading what has been said, with the door already open.
 *
 * These two used to be the whole of `actions.ts`, and every line of the
 * argument for how they behave is still there. What moved here is only the part
 * that runs *after* somebody has been let into the space, because there are two
 * ways of being let in now: a browser arrives with a session cookie and goes
 * through `requireTenant`, and the native app arrives with a bearer token and
 * goes through `requireBearerTenant`. Both hand back the same `TenantContext`.
 *
 * So the context is a parameter rather than something these fetch. The gates
 * below - chat being on, a guest being refused - are asked here rather than at
 * either door, which is the point: they are chat's rules, they have to be right
 * for both callers, and a second copy under `/api/m` would be correct only
 * until one of the two was edited.
 *
 * Not a `'use server'` file, deliberately. That directive turns every export
 * into a public POST endpoint, and these take a context object that a client
 * must never be able to supply.
 */

export type ChatResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface PostedMessage {
  id: string
  authorName: string
  createdAt: string
}

export async function sayInSpace(
  context: TenantContext,
  body: string,
  /**
   * Which room it is being said in. Null, or absent, is the lounge.
   *
   * Not checked against the room's admission rules, and that is the same
   * decision the migration's policy note makes: membership of the space governs
   * chat, a room is somewhere to hold a conversation rather than a permission
   * boundary, and putting a second copy of the admission logic here is how the
   * two drift. The id is validated as a uuid so it cannot be anything else.
   */
  roomId: string | null = null,
): Promise<ChatResult<PostedMessage>> {
  const parsed = postMessageSchema.safeParse({ body, roomId })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message' }
  }

  const { user, supabase, tenant } = context

  /**
   * Both gates, re-asked after the door.
   *
   * The page already checked them before it rendered a panel to type into, and
   * that is not the boundary: a Server Action is a public POST endpoint and so
   * is a route handler, and the check in front of the UI is a courtesy to
   * whoever is clicking. Asked as a refusal rather than through
   * `requireFeature`, which is notFound() - a 404 in response to pressing
   * return in a text box is not something a panel can show.
   */
  if (!chatOpen(context)) {
    return { ok: false, error: 'Chat is off in this space' }
  }

  /**
   * Guests are refused, and this is the one product decision here worth
   * arguing rather than asserting.
   *
   * A guest is somebody on a link, under a name they chose at the door, holding
   * a row that expires. They can walk around the lounge and pull faces at it,
   * because a face lives three seconds and is never written down. A message is
   * written down, is attributed, and is the thing a moderator will later be
   * asked to judge - and the account behind it may not exist by then.
   *
   * `writeBlockedReason` already says exactly this in a sentence a visitor can
   * read, so it is not restated. The database refuses it again underneath, in
   * `chat_messages_insert_member` and in `events_insert_tenant`.
   */
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  /**
   * The name is resolved here, never accepted from the client.
   *
   * A name the browser could supply is a way to sign somebody else's sentence,
   * and this one is copied into a durable row that a moderator reads. Bounded
   * anyway, because a handle long enough to break the bubble is a handle worth
   * truncating rather than trusting.
   */
  const resolved = await readDisplayName(supabase, user.id)
  const authorName = authorNameSchema.safeParse(resolved)
  const name = authorName.success ? authorName.data : 'Someone'

  const id = randomUUID()

  try {
    await executeCommand({
      supabase,
      decider: chatDecider,
      tenantId: tenant.id,
      streamId: id,
      command: {
        type: 'PostMessage',
        actorId: user.id,
        body: parsed.data.body,
        authorName: name,
        // Only when there is one, so a lounge message writes an event with no
        // room key - identical to every message written before rooms had
        // conversations. See the note in `decide`.
        ...(parsed.data.roomId ? { roomId: parsed.data.roomId } : {}),
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      return { ok: false, error: 'That did not go through. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, chatProjection, tenant.id)

  /**
   * The id the room will be told about, and the timestamp the panel sorts by.
   *
   * Minted here rather than read back out of the read model: the projection has
   * just run, but making the reply depend on that read would make saying
   * something fail whenever the projector was momentarily behind, which is
   * exactly the case a projection is allowed to be in.
   */
  return {
    ok: true,
    data: { id, authorName: name, createdAt: new Date().toISOString() },
  }
}

/**
 * One room's scrollback.
 *
 * Guests may read. That is the rule the panel already runs on: a guest sees what
 * has been said and is told in a sentence why they cannot add to it, and
 * narrowing it here would mean a guest who switched rooms got an empty panel
 * with no explanation instead.
 */
export async function readSpaceChat(
  context: TenantContext,
  roomId: string | null,
  /**
   * How far back, for a caller that knows it wants less.
   *
   * The panel takes the default, which is `CHAT_HISTORY_LIMIT`. A phone opening
   * a conversation over mobile data asks for fewer, and the number is its
   * decision rather than this file's - clamped on the wire by the contract, so
   * an unreasonable one never reaches the query.
   */
  limit?: number,
): Promise<ChatResult<ChatMessageView[]>> {
  const parsed = chatRoomSchema.safeParse(roomId)
  if (!parsed.success) return { ok: false, error: 'No such room' }

  if (!chatOpen(context)) return { ok: false, error: 'Chat is off in this space' }

  const { supabase, tenant } = context

  /**
   * Caught up first, unlike the radio's reader.
   *
   * A message is written by whoever said it and projected by their request, so
   * somebody switching into a room a moment after a line landed can genuinely be
   * ahead of the projector. The layout does the same before seeding the lounge.
   */
  await runProjection(supabase, chatProjection, tenant.id)

  return {
    ok: true,
    data: await listChatMessages(supabase, tenant.id, parsed.data ?? null, limit),
  }
}
