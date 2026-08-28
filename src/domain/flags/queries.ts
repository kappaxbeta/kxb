import 'server-only'
import type { Client } from '@/es/store'
import {
  FEATURE_KEYS,
  FEATURES,
  fallbackFeatures,
  isFeatureKey,
  type FeatureKey,
  type Features,
  type FeatureScope,
} from '@/domain/flags/keys'

/**
 * Read side of the flags.
 *
 * `resolveFeatures` is the one every request runs. The rest is backoffice
 * reporting, and reads the tables directly - which only works for an admin,
 * because that is the only thing the policies on those tables allow.
 */

/**
 * Every flag, resolved for the signed-in caller in this workspace.
 *
 * One RPC, not one query per flag: this sits on the critical path of every page
 * behind a workspace, next to the membership check.
 *
 * Pass `null` outside a workspace - the workspace picker, the marketing pages -
 * and only the user override and the global default take part.
 *
 * A failure here returns the fallbacks rather than throwing. A flag lookup is
 * infrastructure for deciding what to render; if it takes the page down with it
 * then adding a flag has made the app less reliable than not having flags at
 * all. The direction of each fallback is argued in keys.ts.
 */
export async function resolveFeatures(
  supabase: Client,
  tenantId: string | null = null,
): Promise<Features> {
  const features = fallbackFeatures()

  // `null` and "absent" mean the same thing to the function - its parameter
  // defaults to NULL - but the generated Args type spells it `p_tenant_id?:
  // string`, so the outside-a-workspace case has to be undefined rather than
  // null to satisfy it.
  const { data, error } = await supabase.rpc('resolve_features', {
    p_tenant_id: tenantId ?? undefined,
  })

  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return features
  }

  // Merged over the fallbacks rather than trusted wholesale, so a key added in
  // code but not yet in the database resolves to its fallback instead of
  // `undefined`, and a key left in the database after its flag was deleted from
  // the code is ignored.
  for (const [key, value] of Object.entries(data)) {
    if (isFeatureKey(key) && typeof value === 'boolean') features[key] = value
  }

  return features
}

/**
 * Is the front door open?
 *
 * Asked from the sign-up path, the waiting-list page and the landing page, all
 * of which run for somebody with no session at all - which is why
 * `resolve_features` is granted to `anon`. No tenant takes part: registration
 * is a property of the installation, not of any workspace.
 */
export async function isRegistrationOpen(supabase: Client): Promise<boolean> {
  const features = await resolveFeatures(supabase, null)
  return features.open_registration
}

/**
 * How many people fit in this space, or null for no limit.
 *
 * Goes through its own RPC rather than `resolveFeatures` for the reason argued
 * at length in the migration: the caller who most needs this answer is a
 * pending invitee, who is not a member yet, and `resolve_features` refuses to
 * apply a tenant override for a workspace the caller does not belong to. Asking
 * it here would quietly hand back the global default and walk past a per-space
 * cap.
 *
 * A failure returns null - no limit. Same posture as `resolveFeatures`: a flag
 * lookup that broke must not be the thing that stops somebody joining a space
 * they were invited to.
 */
export async function resolveSeatLimit(
  supabase: Client,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('tenant_seat_limit', {
    p_tenant_id: tenantId,
  })

  if (error || typeof data !== 'number' || data <= 0) return null
  return data
}

/**
 * The cap that applies to a space with no override of its own.
 *
 * The same function asked about nobody in particular. The landing page needs
 * this and cannot read `feature_flags` directly - the table is admin-only, and
 * the visitor being quoted the terms is signed out.
 */
export async function globalSeatLimit(supabase: Client): Promise<number | null> {
  const { data, error } = await supabase.rpc('tenant_seat_limit', {})

  if (error || typeof data !== 'number' || data <= 0) return null
  return data
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

export interface FeatureOverrideRow {
  flagKey: FeatureKey
  scope: FeatureScope
  scopeId: string
  enabled: boolean
  /** This subject's own number, for a valued flag. NULL inherits the global. */
  valueInt: number | null
  note: string | null
  createdAt: string
  /** Workspace name or account email, when the subject still exists. */
  subject: string | null
}

export interface FeatureFlagRow {
  key: FeatureKey
  label: string
  description: string | null
  /** The global default - the answer when no override applies. */
  enabled: boolean
  /**
   * The number this flag carries, for the flags that carry one.
   *
   * Read straight off the table rather than through `resolveFeatures`, because
   * the resolver deliberately deals only in booleans - see the note on
   * `value_int` in the migration. NULL for every plain on/off flag.
   */
  valueInt: number | null
  overrides: FeatureOverrideRow[]
}

/**
 * Every flag with its overrides, for the backoffice.
 *
 * Takes an admin client because resolving a `user` override's subject means
 * reading `auth.users`, which no policy can reach. The caller is expected to
 * have passed requireBackofficeAdmin() first - it is the guard, not this.
 */
export async function listFeatureFlags(
  supabase: Client,
  admin: Client,
): Promise<FeatureFlagRow[]> {
  const [flags, overrides] = await Promise.all([
    supabase
      .from('feature_flags')
      .select('key, label, description, enabled, value_int')
      .order('key'),
    supabase
      .from('feature_flag_overrides')
      .select('flag_key, scope, scope_id, enabled, value_int, note, created_at')
      .order('created_at', { ascending: false }),
  ])

  if (flags.error) throw new Error(`Failed to load feature flags: ${flags.error.message}`)
  if (overrides.error) {
    throw new Error(`Failed to load flag overrides: ${overrides.error.message}`)
  }

  const subjects = await resolveSubjects(admin, overrides.data ?? [])

  const byKey = new Map<FeatureKey, FeatureFlagRow>()

  for (const row of flags.data ?? []) {
    if (!isFeatureKey(row.key)) continue
    byKey.set(row.key, {
      key: row.key,
      label: row.label,
      description: row.description,
      enabled: row.enabled,
      valueInt: row.value_int,
      overrides: [],
    })
  }

  for (const row of overrides.data ?? []) {
    const flag = isFeatureKey(row.flag_key) ? byKey.get(row.flag_key) : undefined
    if (!flag) continue
    flag.overrides.push({
      flagKey: flag.key,
      scope: row.scope === 'user' ? 'user' : 'tenant',
      scopeId: row.scope_id,
      enabled: row.enabled,
      valueInt: row.value_int,
      note: row.note,
      createdAt: row.created_at,
      subject: subjects.get(`${row.scope}:${row.scope_id}`) ?? null,
    })
  }

  /**
   * Registry order, and a card for every key whether or not it has a row.
   *
   * A flag in the database that code no longer knows about is dropped by the
   * `isFeatureKey` filter above. The other direction used to be dropped too,
   * and that was the bug: a key added to `keys.ts` without a migration to
   * insert its row simply **did not appear in the backoffice**, so the one
   * screen for turning a feature on for a space had nothing to turn. It is the
   * normal state of a brand-new flag, because the code that branches on it
   * lands before anybody writes the migration - and the symptom is a missing
   * control rather than an error, which reads as the backoffice being broken.
   *
   * Shown as its **fallback**, not as off, because that is what is actually in
   * force: `resolveFeatures` answers with the registry's fallback when there is
   * no row, so a card claiming `off` for a flag that is on everywhere would be
   * the screen lying about the thing it exists to report.
   *
   * The same argument the limits section of the access page already makes out
   * loud: a backoffice that silently omits a control is harder to diagnose than
   * one showing a control that has not been written to yet. Writing to one is
   * what creates the row - see `ensureFlagRow` in ./actions.
   */
  return FEATURE_KEYS.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: FEATURES[key].label,
        description: null,
        enabled: FEATURES[key].fallback,
        valueInt: null,
        overrides: [],
      },
  )
}

/**
 * Turn override subject ids into something a human recognises.
 *
 * Two lookups for the whole list rather than one per row - a page that grows a
 * query per override is the shape that made the workspace list slow.
 */
async function resolveSubjects(
  admin: Client,
  overrides: { scope: string; scope_id: string }[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (overrides.length === 0) return names

  const tenantIds = overrides.filter((o) => o.scope === 'tenant').map((o) => o.scope_id)
  const userIds = overrides.filter((o) => o.scope === 'user').map((o) => o.scope_id)

  if (tenantIds.length > 0) {
    const { data } = await admin
      .from('tenants_read_model')
      .select('id, name')
      .in('id', tenantIds)

    for (const tenant of data ?? []) names.set(`tenant:${tenant.id}`, tenant.name)
  }

  // No admin API for "these ids", so this asks per id. Fine for a handful of
  // comped accounts; if the override list ever runs to hundreds, project
  // auth.users into the public schema and join instead.
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      if (data?.user?.email) names.set(`user:${id}`, data.user.email)
    }),
  )

  return names
}
