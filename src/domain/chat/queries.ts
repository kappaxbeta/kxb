import 'server-only'
import { CHAT_HISTORY_LIMIT } from '@/domain/chat/events'
import type { Client } from '@/es/store'

/**
 * A message, as the panel draws it.
 *
 * `authorId` is here and `authorName` is here, and they are not redundant: the
 * name is what the room reads, the id is what the panel compares against the
 * viewer to decide whether a line is their own - and what a moderator ends up
 * following. Hidden messages never reach this shape at all; see below.
 */
export interface ChatMessageView {
  id: string
  body: string
  authorId: string | null
  authorName: string
  createdAt: string
}

/**
 * The scrollback for one space's lounge, oldest last.
 *
 * Read newest-first and reversed here rather than ordered ascending in the
 * database, because "the last hundred" and "the first hundred" are different
 * questions and only one of them is the one being asked. The index is on
 * (tenant_id, created_at desc) for the same reason.
 *
 * Nothing here filters out a message a moderator took down, and that is not an
 * omission: the select policy on the table does it, so every reader gets the
 * same answer whether they come through this function, a future one, or
 * PostgREST by hand. See `chat_messages_select_tenant` in the migration, which
 * carries the check the same way `battlefields_select` carries its ban check
 * and for the same reason - a filter that lives in one query is a filter the
 * next query forgets.
 *
 * It does mean this returns fewer than `limit` rows when the most recent
 * hundred include a hidden one. That is the right trade: the alternative is
 * over-fetching to refill the gap, which tells anybody counting exactly where a
 * message was removed.
 */
export async function listChatMessages(
  supabase: Client,
  tenantId: string,
  /**
   * Which room's conversation. Null is the lounge, which is what the column
   * holds for every message said before rooms had one - see `roomOf`.
   *
   * Required rather than defaulted, because "all of this space's messages" and
   * "the lounge's messages" are different questions and defaulting would make
   * the wrong one easy to ask by accident. The moderation queue wants the first
   * and does not come through here.
   */
  roomId: string | null,
  limit = CHAT_HISTORY_LIMIT,
): Promise<ChatMessageView[]> {
  const scoped = supabase
    .from('chat_messages_read_model')
    .select('id, body, author_id, author_name, created_at')
    .eq('tenant_id', tenantId)

  const { data, error } = await (roomId === null
    ? // `is` and not `eq`: SQL equality against null is null, so `eq` would
      // match no rows at all and the lounge would read as an empty room.
      scoped.is('room_id', null)
    : scoped.eq('room_id', roomId))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load the chat: ${error.message}`)

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      body: row.body,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
    }))
    .reverse()
}

/**
 * How many people are standing in each room right now, for the switcher.
 *
 * Head counts rather than names, and that is the honest limit of what this can
 * answer cheaply: `world_occupancy` is heartbeat rows keyed by world, so a count
 * is one query for the whole space while a roster would be a join per room. A
 * number is also the thing the question is actually asking - "is anyone in
 * there" before you switch - and it is what the rail draws.
 *
 * The lounge is counted under the tenant's own id, which is what a lounge's
 * world id is everywhere else in the app.
 *
 * Never throws. A switcher with no numbers on it is a switcher; a rail that
 * failed to render because a count query blipped is not.
 *
 * This used to be a Server Action called straight from the rail. It is a query
 * behind a route handler now, and `src/app/api/t/[slug]/heads/route.ts` is
 * where the reason is written down.
 */
export async function roomHeads(
  supabase: Client,
  tenantId: string,
): Promise<Record<string, number>> {
  // Twenty seconds, matching `occupancy_ttl()` and `roomOccupancy` - "in the
  // room" has to mean the same thing to this as it does to the door.
  const since = new Date(Date.now() - 20_000).toISOString()

  const { data, error } = await supabase
    .from('world_occupancy')
    .select('world_id')
    .eq('tenant_id', tenantId)
    .gt('seen_at', since)

  if (error) return {}

  const heads: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = (row as { world_id: string }).world_id
    heads[id] = (heads[id] ?? 0) + 1
  }
  return heads
}
