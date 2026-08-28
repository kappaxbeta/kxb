'use server'

import { revalidatePath } from 'next/cache'
import { setUsernameSchema } from '@/domain/profile/username-commands'
import { createClient } from '@/lib/supabase/server'

export type UsernameResult =
  | { ok: true; username: string }
  /**
   * `suggestion` is present only when the handle was taken, and is a free one
   * at or after what was asked for: `jane` -> `jane-1`. Offered rather than
   * applied, because renaming somebody to something they did not type is worse
   * than telling them no - see `freeHandleNear`.
   */
  | { ok: false; error: string; suggestion?: string }

/** Postgres unique violation - somebody else got the handle first. */
const UNIQUE_VIOLATION = '23505'

/**
 * Change your handle.
 *
 * A direct write rather than a command through the event store, for the same
 * reasons as chooseAvatar next door: it belongs to the person rather than to
 * any workspace, and events.tenant_id is `not null`, so an account-level
 * aggregate cannot live in that log without making the tenant optional on every
 * event. "Was called bob in March" is not a fact anybody will query.
 *
 * The row is keyed by the session's user id and nothing in the input names a
 * user, which is the part worth keeping from the aggregate this never was: you
 * cannot rename somebody else.
 */
export async function setUsername(username: string): Promise<UsernameResult> {
  const parsed = setUsernameSchema.safeParse({ username })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid username' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to choose a username.' }

  /**
   * Upsert, so an account whose signup trigger never ran can still set one.
   *
   * Taken-ness is discovered from the constraint rather than checked first.
   * Checking first is a race - two people can both see `jane` free - and the
   * constraint has to be there regardless, so the check would only ever be a
   * second, weaker copy of it.
   */
  const now = new Date().toISOString()

  const { error } = await supabase.from('user_profiles').upsert(
    {
      user_id: user.id,
      username: parsed.data.username,
      updated_at: now,
      /**
       * Saying a name out loud is what makes it chosen.
       *
       * Stamped on every save rather than only the first, because there is no
       * first to detect from here and no cost to writing it again. What it
       * settles is whether the welcome wizard is still owed - see
       * hasChosenUsername() - so re-submitting the derived name unchanged, as
       * the wizard's Continue button does, counts. That is the point: a person
       * who looked at `jane-doe` and kept it has chosen it.
       */
      chosen_at: now,
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: `"${parsed.data.username}" is already taken`,
        suggestion: await freeHandleNear(supabase, parsed.data.username),
      }
    }
    return { ok: false, error: 'That change did not save. Try again.' }
  }

  /**
   * Every page that names you, not just the one the form is on.
   *
   * The handle is what members see each other by in the members list, on task
   * authors, in the event log and over an avatar's head in the lounge - all
   * separate routes with their own caches.
   */
  revalidatePath('/', 'layout')

  return { ok: true, username: parsed.data.username }
}

/**
 * A handle near the one that was taken, that nobody holds.
 *
 * Computed in Postgres rather than here, because the answer has to be true and
 * this client cannot see far enough to make it so: `user_profiles` is readable
 * only for yourself and people you share a workspace with, so probing from
 * here would report a stranger's handle as free and send somebody back into
 * the same wall. `suggest_username` is SECURITY DEFINER for exactly that
 * reason - see 20260819000000_username_suggestions.sql.
 *
 * Advisory, not a reservation. Between suggesting `jane-1` and somebody
 * accepting it, `jane-1` can go - and then the constraint refuses that too and
 * offers `jane-2`. The unique index stays the only thing that decides.
 *
 * Returns undefined rather than throwing on failure: the caller is already
 * reporting a refusal, and "taken, and also the suggestion machinery broke" is
 * not a better message than "taken".
 */
async function freeHandleNear(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taken: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.rpc('suggest_username', { p_seed: taken })
  if (error || typeof data !== 'string') return undefined
  // Never suggest back what was just refused, whatever the function says.
  return data === taken ? undefined : data
}
