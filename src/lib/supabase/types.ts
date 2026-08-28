/**
 * The stable face of the database schema.
 *
 * `./database.types.ts` next door is *generated* - `bun run db:types` overwrites
 * it wholesale from the live schema - so nothing hand-written may live there.
 * It used to, and the result was a recurring build break: every regeneration
 * silently deleted the aliases a dozen files import, and the failure surfaced as
 * fourteen unrelated "has no exported member" errors in modules nobody had
 * touched.
 *
 * So this file is the seam. It re-exports the generated types and adds the few
 * hand-maintained names on top, which means `db:types` can be run as often as
 * you like without anything else noticing.
 *
 * Add derived aliases here, never there.
 */

import type { Database } from '@/lib/supabase/database.types'

export type { Database, Json } from '@/lib/supabase/database.types'

/**
 * One row of the event log.
 *
 * Derived rather than restated, so a migration that adds a column to `events`
 * reaches the store without anybody editing this file. It was a hand-written
 * shape before, which meant the generated schema and this declaration could
 * disagree and only the runtime would know.
 */
export type EventRow = Database['public']['Tables']['events']['Row']

/**
 * A member's standing in one workspace.
 *
 * Still a hand-written union, unlike `EventRow`, because it is not a Postgres
 * enum - `tenant_members.role` is a text column with a check constraint, and a
 * generated `string` would let any typo through at every call site. The
 * constraint in supabase/migrations/20260725130000_tenants.sql is the thing
 * this has to be kept in step with.
 *
 * `guest` is the exception, and is deliberately *not* in that constraint. A
 * guest is not a member and has no row in `tenant_members` - they hold a
 * `tenant_guests` row instead, and `tenant_role()` returns 'guest' when it
 * finds one. See supabase/migrations/20260813000000_guest_links.sql. So this
 * union is the set of things `tenant_role()` can return, which is one wider
 * than the set of things that column can hold.
 */
export type TenantRoleName = 'owner' | 'admin' | 'member' | 'guest'

/**
 * Billing statuses.
 *
 * Hand-written unions for the same reason as `TenantRoleName`: both are text
 * columns with check constraints rather than Postgres enums, so the generated
 * types call them `string`. The check constraints they mirror are in
 * supabase/migrations/20260725150000_billing.sql and
 * supabase/migrations/20260726000000_user_entitlements.sql.
 *
 * Turning these into real enums in Postgres would let both be derived, and is
 * the change that would make this block unnecessary.
 */
export type SubscriptionStatusName =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'

export type EntitlementStatusName =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'

/**
 * Narrowing helpers for the check-constrained text columns above.
 *
 * Postgres enforces these values; TypeScript cannot see that, so a read has to
 * assert them somewhere. Doing it here - once, with a fallback - beats a cast
 * at each call site: a cast would let a value the constraint was later widened
 * to accept flow through as a lie, whereas this degrades to the safest option
 * and keeps going.
 */
const TENANT_ROLES: readonly string[] = ['owner', 'admin', 'member', 'guest']
const SUBSCRIPTION_STATUSES: readonly string[] = [
  'pending',
  'active',
  'past_due',
  'suspended',
  'canceled',
]
const ENTITLEMENT_STATUSES: readonly string[] = [
  'none',
  'active',
  'trialing',
  'past_due',
  'canceled',
  'expired',
]

/**
 * Unknown roles fall back to `guest`, the least privileged.
 *
 * It used to be `member`, which was the least privileged until guests existed.
 * Leaving it there would have quietly inverted the intent: an unrecognised role
 * would grant *more* than the bottom of the ladder rather than less. A database
 * hiccup that demotes a member to a guest for one request is a member briefly
 * unable to edit; the other direction is a stranger who can.
 */
export function asTenantRole(value: string | null | undefined): TenantRoleName {
  return TENANT_ROLES.includes(value ?? '') ? (value as TenantRoleName) : 'guest'
}

/** Unknown statuses fall back to `pending`, which grants nothing. */
export function asSubscriptionStatus(
  value: string | null | undefined,
): SubscriptionStatusName {
  return SUBSCRIPTION_STATUSES.includes(value ?? '')
    ? (value as SubscriptionStatusName)
    : 'pending'
}

/** Unknown statuses fall back to `none`, which grants nothing. */
export function asEntitlementStatus(
  value: string | null | undefined,
): EntitlementStatusName {
  return ENTITLEMENT_STATUSES.includes(value ?? '')
    ? (value as EntitlementStatusName)
    : 'none'
}

/**
 * The roles an invitation may carry.
 *
 * Narrower than `TenantRoleName` on purpose: ownership is transferred, never
 * handed out by email, so `owner` is not an invitable role. Anything else -
 * including a row that somehow says `owner` - reads as `member`, which is the
 * failure that grants least.
 */
export type InvitableRoleName = Exclude<TenantRoleName, 'owner'>

export function asInvitableRole(
  value: string | null | undefined,
): InvitableRoleName {
  return value === 'admin' ? 'admin' : 'member'
}
