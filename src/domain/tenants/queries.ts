import 'server-only'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { TENANT_STREAM_TYPE, type TenantEvent } from '@/domain/tenants/events'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'
import { asTier, DEFAULT_TIER, type Tier } from '@/domain/billing/tiers'
import {
  asInvitableRole,
  asTenantRole,
  type TenantRoleName,
} from '@/lib/supabase/types'

/**
 * The read side.
 *
 * Membership queries read tenant_members and tenant_invitations directly -
 * those are the trigger-maintained tables from the migration. They are read
 * models like any other, just built somewhere else, so querying them here is
 * not a layering violation.
 */

export interface TenantSummary {
  id: string
  slug: string
  name: string
  archived: boolean
  role: TenantRoleName
  /** What the space is on, so the picker says which plan produced its limits. */
  tier: Tier
}

/**
 * Every workspace the signed-in user belongs to.
 *
 * Two round trips rather than a join: RLS on tenants_read_model is defined in
 * terms of membership already, so the second query is scoped for free, and
 * PostgREST embedding across two tables with no foreign key between them would
 * need a view anyway.
 */
export async function listMyTenants(
  supabase: Client,
  userId: string,
): Promise<TenantSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId)

  if (membershipError) {
    throw new Error(`Failed to list memberships: ${membershipError.message}`)
  }
  if (!memberships || memberships.length === 0) return []

  const roleByTenant = new Map(memberships.map((row) => [row.tenant_id, row.role]))

  /**
   * What each space is on, for the picker.
   *
   * One query for the set rather than `tenant_tier()` per space, which would be
   * a round trip per row on the one page that exists to list them all.
   *
   * A space with no live subscription row is `free`, which is the same answer
   * `tenant_tier()` gives by returning NULL - and unlike that function this
   * cannot see a promo grant, so a comped space reads as its underlying tier
   * here and as the granted one inside. That is a real inconsistency and the
   * cheap direction: this is a label on a switcher, and being one word out for
   * a comped account is worth more than a round trip per space on every load.
   */
  const { data: subs } = await supabase
    .from('subscriptions_read_model')
    .select('tenant_id, tier, status')
    .in(
      'tenant_id',
      memberships.map((row) => row.tenant_id),
    )

  const tierByTenant = new Map(
    (subs ?? [])
      .filter((row) => ['pending', 'active', 'past_due'].includes(row.status))
      .map((row) => [row.tenant_id, asTier(row.tier) ?? DEFAULT_TIER]),
  )

  const { data: tenants, error: tenantError } = await supabase
    .from('tenants_read_model')
    .select('id, slug, name, archived')
    .in(
      'id',
      memberships.map((row) => row.tenant_id),
    )
    .order('name', { ascending: true })

  if (tenantError) {
    throw new Error(`Failed to list spaces: ${tenantError.message}`)
  }

  return (tenants ?? []).flatMap((row) => {
    const role = roleByTenant.get(row.id)
    // A membership whose tenant row has not been projected yet. Skipping is
    // right: the projection catches up and it appears on the next load.
    if (!role) return []
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        archived: row.archived,
        role: asTenantRole(role),
        tier: tierByTenant.get(row.id) ?? DEFAULT_TIER,
      },
    ]
  })
}

export interface TenantMemberView {
  userId: string
  /** Their handle. There is no longer an address on this row to fall back to. */
  username: string
  role: TenantRoleName
  joinedAt: string
}

/**
 * Who is in this workspace.
 *
 * Two round trips, and the second one is the point of the whole usernames
 * change: tenant_members no longer carries anything you could call a person by,
 * so the name comes from user_profiles. Joining rather than denormalising means
 * somebody who changes their handle changes it everywhere at once, including in
 * workspaces they have belonged to for a year.
 */
export async function listMembers(
  supabase: Client,
  tenantId: string,
): Promise<TenantMemberView[]> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('user_id, role, joined_at')
    .eq('tenant_id', tenantId)
    .order('joined_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list members: ${error.message}`)
  }

  const rows = data ?? []
  const names = await readUsernames(supabase, rows.map((row) => row.user_id))

  return rows.map((row) => ({
    userId: row.user_id,
    username: displayNameFrom(names, row.user_id),
    role: asTenantRole(row.role),
    joinedAt: row.joined_at,
  }))
}

export interface InvitationView {
  tenantId: string
  /** The key the log knows this invitation by. What `revokeInvitation` takes. */
  invitee: string
  /**
   * Who it is for, as far as this reader may know.
   *
   * A handle when the invitation went to an existing account, the address when
   * it went to a mailbox with nobody behind it - and only owners and admins can
   * read those, so a plain member sees the placeholder instead.
   */
  label: string
  role: Exclude<TenantRoleName, 'owner'>
  invitedAt: string
}

/**
 * What is still pending in this workspace.
 *
 * Three round trips rather than a join, because the three sources have three
 * different visibilities and a join would quietly collapse that: the invitation
 * itself is readable by every member, the handle behind a `user:` key comes
 * from user_profiles, and the address behind a `token:` key is owner-and-admin
 * only. A member who cannot see an address gets 'someone invited by email'
 * rather than a blank - the invitation exists, and pretending otherwise would
 * make the list disagree with the count next to it.
 */
export async function listInvitations(
  supabase: Client,
  tenantId: string,
): Promise<InvitationView[]> {
  const { data, error } = await supabase
    .from('tenant_invitations')
    .select('tenant_id, invitee_key, invited_user_id, role, invited_at')
    .eq('tenant_id', tenantId)
    .order('invited_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list invitations: ${error.message}`)
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  const [names, addresses] = await Promise.all([
    readUsernames(
      supabase,
      rows.flatMap((row) => (row.invited_user_id ? [row.invited_user_id] : [])),
    ),
    readInvitationAddresses(supabase, tenantId),
  ])

  return rows.map((row) => ({
    tenantId: row.tenant_id,
    invitee: row.invitee_key,
    label: row.invited_user_id
      ? displayNameFrom(names, row.invited_user_id)
      : (addresses.get(row.invitee_key) ?? 'someone invited by email'),
    role: asInvitableRole(row.role),
    invitedAt: row.invited_at,
  }))
}

/**
 * The addresses behind this workspace's pending invitations, if you may see them.
 *
 * Returns an empty Map for a plain member rather than throwing. RLS answering
 * "no rows" is the intended outcome for them, not an error - see
 * tenant_invitation_emails_select_admin.
 */
async function readInvitationAddresses(
  supabase: Client,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('tenant_invitation_emails')
    .select('invitee_key, email')
    .eq('tenant_id', tenantId)

  if (error) {
    throw new Error(`Failed to read invitation addresses: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.invitee_key, row.email]))
}

export interface PendingInvitationView {
  tenantId: string
  invitee: string
  role: Exclude<TenantRoleName, 'owner'>
  invitedAt: string
  tenantName: string
  tenantSlug: string
}

/**
 * Invitations addressed to the signed-in user, across all workspaces.
 *
 * This is the one query that reaches into tenants the caller is not a member
 * of, and it used to be a plain select filtered by their own email - which
 * worked because the invitation *was* an email address.
 *
 * It is not any more. An invitation addressed to a mailbox now keeps that
 * address in tenant_invitation_emails, which the invitee deliberately cannot
 * read, so the matching moved into my_pending_invitations() where SECURITY
 * DEFINER can do it on their behalf without handing them the table.
 */
export async function listMyInvitations(
  supabase: Client,
): Promise<PendingInvitationView[]> {
  const { data: invitations, error } = await supabase.rpc('my_pending_invitations')

  if (error) {
    throw new Error(`Failed to list your invitations: ${error.message}`)
  }
  if (!invitations || invitations.length === 0) return []

  const { data: tenants, error: tenantError } = await supabase
    .from('tenants_read_model')
    .select('id, slug, name')
    .in(
      'id',
      invitations.map((row) => row.tenant_id),
    )

  if (tenantError) {
    throw new Error(`Failed to load invited spaces: ${tenantError.message}`)
  }

  const byId = new Map((tenants ?? []).map((row) => [row.id, row]))

  return invitations.flatMap((row) => {
    const tenant = byId.get(row.tenant_id)
    if (!tenant) return []
    return [
      {
        tenantId: row.tenant_id,
        invitee: row.invitee_key,
        role: asInvitableRole(row.role),
        invitedAt: row.invited_at,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
    ]
  })
}

/** Resolve a URL slug to a tenant id. Says nothing about whether you may enter. */
export async function findTenantIdBySlug(
  supabase: Client,
  slug: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('tenant_slugs')
    .select('tenant_id')
    .eq('slug', slug.toLowerCase())
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve space ${slug}: ${error.message}`)
  }

  return data?.tenant_id ?? null
}

/** History of one workspace's membership, oldest first. */
export async function listTenantHistory(
  supabase: Client,
  tenantId: string,
): Promise<StoredEvent<TenantEvent>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('stream_type', TENANT_STREAM_TYPE)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(`Failed to read space history: ${error.message}`)
  }

  return (data ?? []).map(
    (row) =>
      ({
        type: row.type,
        data: row.data,
        globalSeq: Number(row.global_seq),
        tenantId: row.tenant_id,
        streamId: row.stream_id,
        streamType: row.stream_type,
        version: row.version,
        actorId: row.actor_id,
        createdAt: row.created_at,
        metadata: row.metadata ?? {},
      }) as StoredEvent<TenantEvent>,
  )
}

export interface PublicTenantView {
  id: string
  slug: string
  name: string
  archived: boolean
  isPublicLounge: boolean
}

/**
 * Public lookup for a workspace by ID or slug without requiring user sign-in.
 */
export async function findPublicTenant(
  supabase: Client,
  slugOrId: string,
): Promise<PublicTenantView | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)

  const mapRow = (row: { id: string; slug: string; name: string; archived: boolean; is_public_lounge?: boolean }): PublicTenantView => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    archived: row.archived,
    // Defaults to true for public lounge showcase unless explicitly set to false
    isPublicLounge: row.is_public_lounge !== false,
  })

  if (isUuid) {
    const { data: byId } = await supabase
      .from('tenants_read_model')
      .select('id, slug, name, archived, is_public_lounge')
      .eq('id', slugOrId)
      .maybeSingle()

    if (byId) return mapRow(byId as never)
  }

  /**
   * 1. The claim table decides which space a slug names.
   *
   * This used to read `tenants_read_model.slug` first and fall back to here,
   * and the order was the bug. That column is a denormalised copy maintained by
   * a projection, its UPDATE policy is `is_tenant_member(id)`, and this
   * function is called by `/v/[slug]` - a public page - with the *service-role*
   * client, which bypasses RLS entirely. So the read model's copy was a slug
   * any member of any space could write, consulted ahead of the table whose
   * primary key is the slug.
   *
   * `tenant_slugs` is where a slug is claimed, one row per name, and where the
   * uniqueness is real. Asking it first means the read model is only ever the
   * row this lookup has already named, rather than the thing that names it.
   *
   * 20270101000000 adds the unique index the copy should always have had, so
   * the two can no longer disagree about how many spaces a slug names. Both are
   * worth having: the index stops the second row existing, and this order stops
   * the copy being authoritative even when it is the only row.
   */
  const tenantId = await findTenantIdBySlug(supabase, slugOrId)
  if (tenantId) {
    const { data: byResolvedId } = await supabase
      .from('tenants_read_model')
      .select('id, slug, name, archived, is_public_lounge')
      .eq('id', tenantId)
      .maybeSingle()
    if (byResolvedId) return mapRow(byResolvedId as never)
  }

  /**
   * 2. The read model's own copy, kept as a fallback rather than dropped.
   *
   * A space with no claim row is not a thing this deployment makes - the slug is
   * claimed before the first event, and locally nothing violates that - but it
   * is a thing an old space could be, and losing the ability to resolve one
   * would be a worse bug than the one being fixed. So the copy still answers,
   * second, once the table that owns the question has said no.
   */
  const { data: bySlug } = await supabase
    .from('tenants_read_model')
    .select('id, slug, name, archived, is_public_lounge')
    .eq('slug', slugOrId.toLowerCase())
    .maybeSingle()

  if (bySlug) return mapRow(bySlug as never)

  return null
}
