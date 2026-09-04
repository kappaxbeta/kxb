import 'server-only'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import type { Client } from '@/es/store'

/**
 * Who this person has decided not to hear.
 *
 * ---------------------------------------------------------------------------
 * Why this is read at all, when the policy already filters
 * ---------------------------------------------------------------------------
 * `chat_messages_select_tenant` refuses a blocked author's rows at the
 * database, so nothing that *selects* needs this list. What needs it is the
 * half of the chat that never goes near a select: a message said in the room
 * right now arrives over Realtime as four fields on a broadcast, and the only
 * thing standing between it and the panel is the client.
 *
 * So the set is read once where the session is assembled and handed down, in
 * the same shape and from the same source as the rule the database is applying
 * a layer below. Two enforcement points, one list.
 *
 * It is also what the settings panel draws: "who have I blocked" is a question
 * only this table can answer, and a list you cannot see is a list you cannot
 * undo.
 */
export async function listBlockedIds(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .order('created_at', { ascending: false })

  /*
   * A failure here must not take the chat down with it. The policy is the
   * enforcement and it is still in force; this list is the client's copy of it,
   * and the worst case of an empty copy is one live message appearing that a
   * refresh then removes. A workspace that refuses to load its rail because the
   * block list was briefly unavailable would be the larger failure.
   */
  if (error) return []

  return (data ?? []).map((row) => row.blocked_id)
}

/**
 * The same list, as the thing every caller actually does with it.
 *
 * Callers ask "is this author blocked" per message, at message rate. A `Set`
 * says that is what it is for; an array invites `includes` inside a render.
 */
export async function readBlockedSet(supabase: Client): Promise<Set<string>> {
  return new Set(await listBlockedIds(supabase))
}

/**
 * The list as the settings panel draws it: a name to recognise, and the id to
 * undo it with.
 *
 * The name is best-effort and that is a property of the policy on
 * `user_profiles`, not an oversight here: a handle is readable to people who
 * share a space with you, so somebody blocked in a space you have both since
 * left resolves to `user-a1b2c3`. That is worse than a name and much better
 * than a row you cannot identify at all, and it is still the row that gets
 * unblocked - the id is what the button carries.
 *
 * Ordered newest first by the query above, because the entry somebody is
 * looking for is almost always the one they made most recently.
 */
export async function listBlockedPeople(
  supabase: Client,
): Promise<{ userId: string; name: string }[]> {
  const ids = await listBlockedIds(supabase)
  if (ids.length === 0) return []

  const names = await readUsernames(supabase, ids).catch(() => new Map<string, string>())

  return ids.map((userId) => ({ userId, name: displayNameFrom(names, userId) }))
}
