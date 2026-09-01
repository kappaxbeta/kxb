import 'server-only'
import { DEFAULT_AVATAR, isKnownAvatar } from '@/domain/lounge/avatars'
import type { Client } from '@/es/store'

/**
 * Which animal you are, everywhere.
 *
 * Replaces the per-workspace lookup this used to be. The roster still lives
 * under `domain/lounge` because that is where the model pack is - the animals
 * are the lounge's; the *choice* is yours.
 *
 * Returns the default rather than null for somebody who has never chosen, and
 * for anyone not signed in at all. Every caller is about to draw *something*,
 * and pushing "no row yet" out to a renderer would mean each of them re-deciding
 * what a new player looks like.
 *
 * An id that is no longer on the roster also degrades to the default. The row
 * keeps whatever was chosen - that stays true - but a model file we no longer
 * ship must not become a 404 in the middle of a scene.
 */
export async function readProfileAvatar(
  supabase: Client,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return DEFAULT_AVATAR

  const { data, error } = await supabase
    .from('profile_avatars')
    .select('model')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load avatar: ${error.message}`)
  }

  const model = data?.model
  return model && isKnownAvatar(model) ? model : DEFAULT_AVATAR
}

/**
 * Has this person asked to stand in the dummy rather than their animal?
 *
 * Its own read rather than a second column on `readProfileAvatar`, and
 * deliberately as forgiving as `readProfileSkin`: any failure is "no", because
 * every caller is about to draw a body and the animal is always drawable. That
 * also means a box that has not run the migration yet answers "no" and keeps
 * rendering rooms, rather than turning a missing column into a 500 on the
 * lounge - which selecting it alongside `model` would have done.
 *
 * The flag is a fact about the account, not about a space: the dummy is who you
 * are rather than who you are here, exactly like the skin. A space's animal
 * override still applies underneath it, for when you take the dummy off.
 */
export async function readAsDummy(
  supabase: Client,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await supabase
    .from('profile_avatars')
    .select('as_dummy')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return false
  return data.as_dummy === true
}

/**
 * The animal this account wears **in one space**, or null for "the usual".
 *
 * Null is the overwhelmingly common answer and it means *no opinion* rather
 * than a default - a caller resolves it against `readProfileAvatar`. Keeping
 * "unset" distinct from "penguin" is what makes turning the override off a
 * thing that can be expressed at all.
 */
export async function readSpaceAvatar(
  supabase: Client,
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<string | null> {
  if (!userId || !tenantId) return null

  const { data, error } = await supabase
    .from('space_avatars')
    .select('model')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load space avatar: ${error.message}`)
  }

  const model = data?.model
  return model && isKnownAvatar(model) ? model : null
}

/**
 * Who you are here: the space's answer if you gave one, otherwise your own.
 *
 * The one function anything drawing a body should call, so the precedence is
 * written down once. Two round trips rather than one on purpose - they are
 * independent rows and `Promise.all` costs a single wait, and a view or a join
 * would put the rule in the database where it is harder to read than this
 * sentence.
 */
export async function readAvatarHere(
  supabase: Client,
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<string> {
  const [profile, here] = await Promise.all([
    readProfileAvatar(supabase, userId),
    readSpaceAvatar(supabase, userId, tenantId),
  ])
  return here ?? profile
}

/**
 * The same answer for a roomful of people, in one round trip.
 *
 * For surfaces that draw a crowd rather than a person - the board hangs every
 * notice off its author's animal, and the roster beside it draws the space.
 * Calling `readProfileAvatar` per member would be a query per face, which on a
 * forty-person space is forty round trips to render a strip of thumbnails.
 *
 * Unlike the singular version this does *not* fill in the default for everybody
 * asked about: it returns what was actually read, so a caller can tell "has
 * never chosen" from "chose the penguin" if it ever matters. Callers that only
 * want something to draw reach for `avatarOf` below.
 */
export async function readProfileAvatars(
  supabase: Client,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(userIds)]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profile_avatars')
    .select('user_id, model')
    .in('user_id', wanted)

  if (error) {
    throw new Error(`Failed to load avatars: ${error.message}`)
  }

  return new Map(
    (data ?? [])
      // Same degradation the singular read makes, for the same reason: a model
      // we no longer ship must not become a 404 in the middle of a roster.
      .map((row) => [row.user_id, isKnownAvatar(row.model) ? row.model : DEFAULT_AVATAR] as const),
  )
}

/** What to draw for one person, given the map above. */
export function avatarOf(
  avatars: ReadonlyMap<string, string>,
  userId: string | null | undefined,
): string {
  return (userId && avatars.get(userId)) || DEFAULT_AVATAR
}
