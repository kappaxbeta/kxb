import 'server-only'
import { fallbackUsername } from '@/domain/profile/username-commands'
import type { Client } from '@/es/store'

/**
 * Who somebody is, by name.
 *
 * This is the read side of the change that took email addresses out of the
 * members list. Everywhere the app used to render `member.email` it renders one
 * of these instead, and the lookup is a join rather than a denormalised column
 * on purpose: a handle can change, and a copy of it on every membership row in
 * every workspace is a copy that goes stale the moment it does.
 *
 * RLS decides who may be named at all - see user_profiles_select_self_or_shared
 * in the usernames migration. A user id you cannot see resolves to its fallback
 * rather than to an error, because these are called from renderers that are
 * about to draw *something* either way.
 */

/** One person's handle. */
export async function readUsername(
  supabase: Client,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load username: ${error.message}`)
  }

  return data?.username ?? null
}

/** One person's handle, or something stable to call them if they have none. */
export async function readDisplayName(
  supabase: Client,
  userId: string,
): Promise<string> {
  return (await readUsername(supabase, userId)) ?? fallbackUsername(userId)
}

/**
 * Has this account ever said "yes, call me that"?
 *
 * The handle itself cannot answer it: the signup trigger derives one from the
 * email address, so everybody has a name from their first millisecond and a
 * derived one is indistinguishable from a chosen one by looking at it. The
 * `chosen_at` stamp is the whole difference - see the migration.
 *
 * False for a row that is not there at all, which is the same answer for the
 * same reason: nobody has confirmed anything, so the welcome wizard is owed.
 * It writes the row on its way out.
 */
export async function hasChosenUsername(
  supabase: Client,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('chosen_at')
    .eq('user_id', userId)
    .maybeSingle()

  /**
   * A failed read means "not owed", not "owed".
   *
   * This is called from landingPath(), on the way into the app, for every
   * sign-in there is. Answering false when the database is having a bad moment
   * would park somebody on a welcome wizard instead of letting them into the
   * workspace they came for - a strictly worse failure than showing the wizard
   * one time too few.
   */
  if (error) return true

  return Boolean(data?.chosen_at)
}

/**
 * Handles for a batch of people, keyed by user id.
 *
 * One round trip for a whole members list. Callers get a Map rather than an
 * array because every one of them is about to do a lookup by id, and building
 * that index at each call site is how the café ended up with three slightly
 * different versions of it.
 *
 * Ids with no row are simply absent from the Map - use `displayNameFrom` to
 * turn that into something renderable.
 */
export async function readUsernames(
  supabase: Client,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean)
  if (unique.length === 0) return new Map()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username')
    .in('user_id', unique)

  if (error) {
    throw new Error(`Failed to load usernames: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.user_id, row.username]))
}

/** Read one name out of a batch, falling back for anyone who was not in it. */
export function displayNameFrom(
  names: ReadonlyMap<string, string>,
  userId: string,
): string {
  return names.get(userId) ?? fallbackUsername(userId)
}
