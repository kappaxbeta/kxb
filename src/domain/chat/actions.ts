'use server'

import { randomUUID } from 'node:crypto'
import { chatDecider } from '@/domain/chat/aggregate'
import { authorNameSchema, chatRoomSchema, postMessageSchema } from '@/domain/chat/commands'
import { chatProjection } from '@/domain/chat/projection'
import { listChatMessages, type ChatMessageView } from '@/domain/chat/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { chatOpen, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Saying something in the lounge.
 *
 * One action, and the interesting part is what it deliberately does *not* do:
 * it does not broadcast. The scene sends the message to the room over Realtime
 * only once this has returned, which costs a round trip before anybody else
 * sees the line and buys the thing that makes the feature work - every client
 * in the room learns the message under the id it was actually stored with, so
 * the report button beside it names a row that exists.
 *
 * The sender does not wait for any of that. Their own line goes into the panel
 * and their own bubble goes up the moment they press return, and is rolled back
 * if this refuses - the same shape as every other write in the scene, and for
 * the same reason: at conversational distance a round trip reads as the key
 * not having worked.
 *
 * No `revalidatePath`. The caller is standing inside a live WebGL canvas, and
 * the layout re-render would tear the scene down mid-sentence - see the note on
 * `setLoungeMode`, which learned this first.
 */

export type ChatResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export async function postChatMessage(
  slug: string,
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
): Promise<ChatResult<{ id: string; authorName: string; createdAt: string }>> {
  const parsed = postMessageSchema.safeParse({ body, roomId })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message' }
  }

  const context = await requireTenant(slug, { guests: true })
  const { user, supabase, tenant } = context

  /**
   * Both gates, re-asked here.
   *
   * The page already checked them before it rendered a panel to type into, and
   * that is not the boundary: a Server Action is a public POST endpoint, and the
   * check in front of the UI is a courtesy to whoever is clicking. Asked as a
   * refusal rather than through `requireFeature`, which is notFound() - a 404 in
   * response to pressing return in a text box is not something a panel can show.
   */
  if (!chatOpen(context)) {
    return { ok: false, error: 'Chat is off in this space' }
  }

  /**
   * Guests are refused, and this is the one product decision in the file worth
   * arguing rather than asserting.
   *
   * A guest is somebody on a link, under a name they chose at the door, holding
   * a row that expires. They can walk around the lounge and pull faces at it,
   * because a face lives three seconds and is never written down. A message is
   * written down, is attributed, and is the thing a moderator will later be
   * asked to judge - and the account behind it may not exist by then. So the
   * line the guest-links migration drew through the event log is the line drawn
   * here: a guest takes part in matches and does nothing else durable.
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
 * One room's scrollback, fetched from the client.
 *
 * The layout seeds the lounge's conversation, because that is the one the dock
 * opens on and it can be read server-side while the page is already rendering.
 * Every other room is a switch somebody makes afterwards, and a switch cannot
 * go back through the layout: the rail is a client component sitting over a live
 * WebGL canvas, and re-rendering the route to change which conversation is on
 * screen would tear the scene down - the thing the whole file avoids.
 *
 * So: an action. Same membership check as posting, and the same reason it is a
 * refusal rather than `requireFeature`'s notFound - a 404 in answer to tapping a
 * room name is not something a rail can draw.
 *
 * Guests may read. That is the rule the panel already runs on: a guest sees what
 * has been said and is told in a sentence why they cannot add to it, and
 * narrowing it here would mean a guest who switched rooms got an empty panel
 * with no explanation instead.
 */
export async function readRoomChat(
  slug: string,
  roomId: string | null,
): Promise<ChatResult<ChatMessageView[]>> {
  const parsed = chatRoomSchema.safeParse(roomId)
  if (!parsed.success) return { ok: false, error: 'No such room' }

  const context = await requireTenant(slug, { guests: true })
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
    data: await listChatMessages(supabase, tenant.id, parsed.data ?? null),
  }
}

/*
  The head count per room was a Server Action here.

  It is `GET /api/t/[slug]/heads` now, over `roomHeads` in ./queries.ts, and the
  route handler carries the reason: the rail polls it, and a polled Server
  Action re-renders the page it is polled from.
*/
