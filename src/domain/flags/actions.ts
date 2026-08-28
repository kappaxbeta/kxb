'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import {
  FEATURES,
  featureValueSpec,
  isFeatureKey,
  type FeatureKey,
  type FeatureScope,
} from '@/domain/flags/keys'
import type { Client } from '@/es/store'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Changing flags.
 *
 * Every action here goes through `requireBackofficeSection`, and the policies on
 * both flag tables demand the same thing independently - a Server Action is a
 * public POST endpoint, and the guard in front of it should not be the only
 * thing standing there. That matters more here than anywhere else in the app:
 * an unguarded write to `feature_flag_overrides` is a self-service exemption
 * from paying.
 */

export type FlagResult = { ok: true } | { ok: false; error: string }

/**
 * Make sure the flag has a row, without touching one that already does.
 *
 * Every write below used to be an `update`, which is silently nothing when the
 * key has no row - and a key with no row is the normal state of a new flag,
 * because the code that branches on it lands before anybody writes the
 * migration that inserts it. So the backoffice offered a switch that did
 * nothing and said it had worked.
 *
 * It matters most for the *override*, which is the whole point of the screen:
 * `feature_flag_overrides.flag_key` is a foreign key onto this table, so
 * "turn it on for one space" could not be written at all until the parent row
 * existed. That is a refusal from the database rather than a quiet no-op, but
 * it arrives as a constraint error in front of somebody who did nothing wrong.
 *
 * `ignoreDuplicates` is what makes this safe to call on every write: an
 * existing row is left exactly as it is, so this can never reset a flag
 * somebody has already set. The value it inserts is the registry's own
 * fallback, which is what `resolveFeatures` was answering with anyway - so
 * creating the row changes nothing about what is in force, it only gives the
 * backoffice something to write to.
 */
async function ensureFlagRow(supabase: Client, key: FeatureKey): Promise<string | null> {
  const { error } = await supabase
    .from('feature_flags')
    .upsert(
      { key, label: FEATURES[key].label, enabled: FEATURES[key].fallback },
      { onConflict: 'key', ignoreDuplicates: true },
    )
  return error ? error.message : null
}

const flagKeySchema = z.string().refine(isFeatureKey, 'Unknown feature flag')
const scopeSchema = z.enum(['tenant', 'user'])
/** Free text an admin types: an email address, or a workspace slug. */
const subjectSchema = z.string().trim().min(1, 'Enter an email address or space slug')

/**
 * Flip the global default.
 *
 * This is the one that changes the answer for everybody who has no override -
 * turning `billing` off here makes the whole product free. Deliberately not
 * behind a confirmation in the action: the backoffice UI asks, and an action
 * that second-guesses its caller is an action people learn to route around.
 */
export async function setGlobalFlag(key: string, enabled: boolean): Promise<FlagResult> {
  const parsed = flagKeySchema.safeParse(key)
  if (!parsed.success) return { ok: false, error: 'Unknown feature flag' }

  const { supabase, user } = await requireBackofficeSection('feature-flags', 'write')

  const missing = await ensureFlagRow(supabase, parsed.data)
  if (missing) return { ok: false, error: `Could not update the flag: ${missing}` }

  const { error } = await supabase
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('key', parsed.data)

  if (error) return { ok: false, error: `Could not update the flag: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'feature-flags',
    action: 'flag.set',
    summary: `Turned the ${parsed.data} flag ${enabled ? 'on' : 'off'} globally`,
    detail: { key: parsed.data, enabled },
  })

  revalidatePath('/ovaloffice')
  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/**
 * Set the number a valued flag carries.
 *
 * Separate from `setGlobalFlag` because the switch and the number are separate
 * decisions with separate blast radii: turning `seat_limit` on is what starts
 * refusing people, and changing 10 to 20 afterwards is routine. Folding both
 * into one action would mean every toggle had to restate the number, and a
 * toggle that forgot would silently reset the cap.
 *
 * Refuses a key that carries no number at all, rather than writing one that
 * nothing will ever read.
 */
export async function setFlagValue(key: string, value: number): Promise<FlagResult> {
  const parsed = flagKeySchema.safeParse(key)
  if (!parsed.success) return { ok: false, error: 'Unknown feature flag' }

  const spec = featureValueSpec(parsed.data)
  if (!spec) return { ok: false, error: `${parsed.data} does not carry a number` }

  const amount = z.number().int().min(spec.min).max(spec.max).safeParse(value)
  if (!amount.success) {
    return { ok: false, error: `Pick a whole number between ${spec.min} and ${spec.max}` }
  }

  const { supabase, user } = await requireBackofficeSection('feature-flags', 'write')

  const missing = await ensureFlagRow(supabase, parsed.data)
  if (missing) return { ok: false, error: `Could not update the flag: ${missing}` }

  const { error } = await supabase
    .from('feature_flags')
    .update({ value_int: amount.data, updated_at: new Date().toISOString() })
    .eq('key', parsed.data)

  if (error) return { ok: false, error: `Could not update the flag: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'feature-flags',
    action: 'flag.value',
    summary: `Set the ${parsed.data} flag to ${amount.data} globally`,
    detail: { key: parsed.data, value: amount.data },
  })

  revalidatePath('/ovaloffice')
  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/**
 * Pin a flag on or off for one workspace or one person.
 *
 * The admin names the subject the way they think of it - an email, or a
 * workspace slug - and it is resolved to an id here. Storing the id rather than
 * the address is what makes an override survive someone changing their email.
 */
export async function setFeatureOverride(input: {
  key: string
  scope: FeatureScope
  /** Email address for `user`, workspace slug for `tenant`. */
  subject: string
  enabled: boolean
  /**
   * This subject's own number, for a valued flag.
   *
   * Left null to inherit the global one, which is the difference between "cap
   * this space at 50" and "cap this space at whatever everyone else gets".
   * Both are things an admin means, and only a nullable column can say which.
   */
  value?: number | null
  note: string
}): Promise<FlagResult> {
  const key = flagKeySchema.safeParse(input.key)
  const scope = scopeSchema.safeParse(input.scope)
  const subject = subjectSchema.safeParse(input.subject)

  if (!key.success) return { ok: false, error: 'Unknown feature flag' }
  if (!scope.success) return { ok: false, error: 'Unknown scope' }
  if (!subject.success) {
    return { ok: false, error: subject.error.issues[0]?.message ?? 'Invalid subject' }
  }

  const spec = featureValueSpec(key.data)
  let value: number | null = null

  if (typeof input.value === 'number') {
    if (!spec) return { ok: false, error: `${key.data} does not carry a number` }

    const amount = z.number().int().min(spec.min).max(spec.max).safeParse(input.value)
    if (!amount.success) {
      return { ok: false, error: `Pick a whole number between ${spec.min} and ${spec.max}` }
    }
    value = amount.data
  }

  const { supabase, admin, user } = await requireBackofficeSection('feature-flags', 'write')

  const resolved =
    scope.data === 'user'
      ? await findUserId(admin, subject.data)
      : await findTenantId(supabase, subject.data)

  if (!resolved.ok) return resolved

  /*
   * The parent row first, because `flag_key` is a foreign key onto it. Turning
   * a brand-new flag on for one space is the most likely thing anybody does
   * with it, and until this it was the one thing that could not be done at all.
   */
  const missing = await ensureFlagRow(supabase, key.data)
  if (missing) return { ok: false, error: `Could not save the override: ${missing}` }

  const { error } = await supabase.from('feature_flag_overrides').upsert(
    {
      flag_key: key.data,
      scope: scope.data,
      scope_id: resolved.id,
      enabled: input.enabled,
      value_int: value,
      granted_by: user.id,
      note: input.note.trim() || null,
    },
    { onConflict: 'flag_key,scope,scope_id' },
  )

  if (error) return { ok: false, error: `Could not save the override: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'feature-flags',
    action: 'override.set',
    summary: `Pinned ${key.data} ${input.enabled ? 'on' : 'off'} for ${scope.data} ${subject.data}`,
    detail: {
      key: key.data,
      scope: scope.data,
      subject: subject.data,
      scopeId: resolved.id,
      enabled: input.enabled,
      value,
    },
  })

  revalidatePath('/ovaloffice')
  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/**
 * Drop an override, so the subject falls back to the next layer.
 *
 * Deleted rather than set to match the default. An override that agrees with
 * the global default is invisible until the default changes, at which point it
 * silently holds someone back - "no override" and "an override that happens to
 * agree" are different states and only one of them is what the admin meant.
 */
export async function clearFeatureOverride(
  key: string,
  scope: FeatureScope,
  scopeId: string,
): Promise<FlagResult> {
  const parsedKey = flagKeySchema.safeParse(key)
  const parsedScope = scopeSchema.safeParse(scope)
  const parsedId = z.uuid().safeParse(scopeId)

  if (!parsedKey.success || !parsedScope.success || !parsedId.success) {
    return { ok: false, error: 'Invalid override' }
  }

  const { supabase, user } = await requireBackofficeSection('feature-flags', 'write')

  const { error } = await supabase
    .from('feature_flag_overrides')
    .delete()
    .eq('flag_key', parsedKey.data)
    .eq('scope', parsedScope.data)
    .eq('scope_id', parsedId.data)

  if (error) return { ok: false, error: `Could not remove the override: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'feature-flags',
    action: 'override.clear',
    summary: `Cleared the ${parsedKey.data} override for ${parsedScope.data} ${parsedId.data}`,
    detail: { key: parsedKey.data, scope: parsedScope.data, scopeId: parsedId.data },
  })

  revalidatePath('/ovaloffice')
  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

type Resolved = { ok: true; id: string } | { ok: false; error: string }

/**
 * An email to an account id.
 *
 * Needs the admin API - `auth.users` is not reachable through PostgREST at all.
 * Unlike backoffice access, which is granted by email precisely so it can be
 * handed out before someone signs up, an override has to name an existing
 * account: the resolver matches on `auth.uid()`, and there is nothing to match
 * until they have one.
 */
async function findUserId(admin: Client, email: string): Promise<Resolved> {
  const needle = email.toLowerCase()
  const perPage = 200

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return { ok: false, error: `Could not look up the account: ${error.message}` }

    const batch = data?.users ?? []
    const match = batch.find((u) => u.email?.toLowerCase() === needle)
    if (match) return { ok: true, id: match.id }
    if (batch.length < perPage) break
  }

  return {
    ok: false,
    error: `No account for ${email}. They have to sign up before they can be given an override.`,
  }
}

async function findTenantId(supabase: Client, slug: string): Promise<Resolved> {
  const { data, error } = await supabase
    .from('tenants_read_model')
    .select('id')
    .eq('slug', slug.toLowerCase())
    .maybeSingle()

  if (error) return { ok: false, error: `Could not look up the space: ${error.message}` }
  if (!data) return { ok: false, error: `No space with the slug ${slug}` }

  return { ok: true, id: data.id }
}
