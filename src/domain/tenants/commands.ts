import { z } from 'zod'
import type {
  InvitableRole,
  InviteeKey,
  SpaceCapability,
} from '@/domain/tenants/events'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * Commands against the tenant aggregate.
 *
 * Every one carries `actorId`: who is asking. That is not decoration - it is
 * the input the decider needs to answer "are you allowed to do this", which is
 * a domain rule here rather than an infrastructure concern. RLS still enforces
 * tenant isolation underneath, but the difference between an admin and a member
 * is business logic and belongs in the decider where it can be unit-tested.
 *
 * The actor is filled in from the session by the Server Action, never from the
 * client. A command shape that let the browser name its own actor would be the
 * whole authorization system, undone.
 */

export const tenantNameSchema = z
  .string()
  .trim()
  .min(1, 'Space name cannot be empty')
  .max(80, 'Space name cannot exceed 80 characters')

/**
 * Slugs are lowercase, hyphen-separated, and cannot start or end with a hyphen.
 * The same rule is a CHECK constraint on tenant_slugs - this copy gives a
 * decent error message, that one is the guarantee.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'URL must be at least 2 characters')
  .max(40, 'URL cannot exceed 40 characters')
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    'Use lowercase letters, numbers and hyphens (not at the start or end)',
  )

export const invitableRoleSchema = z.enum(['admin', 'member'])
export const roleSchema = z.enum(['owner', 'admin', 'member'])

export const createTenantSchema = z.object({
  name: tenantNameSchema,
  slug: slugSchema,
})

export const renameTenantSchema = z.object({ name: tenantNameSchema })

/**
 * One field, two kinds of addressee.
 *
 * An invitation now goes to a username *or* an email address, and asking people
 * to pick the right box first is asking them to think about a distinction that
 * only matters to us. So it is one input, and the `@` decides - the same way
 * every sign-in form on the internet already works.
 *
 * The two branches are genuinely different downstream, not just cosmetically: a
 * username resolves to an account and is recorded as one, while an address that
 * belongs to nobody yet has to be kept somewhere the log cannot see. See
 * `inviteMember` in actions.ts.
 */
export const inviteeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a username or an email address')
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => (value.includes('@') ? z.email().safeParse(value).success : true),
    'Enter a valid email address',
  )
  .refine(
    (value) =>
      value.includes('@') || /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(value),
    'Enter a username, or an email address',
  )

export const inviteMemberSchema = z.object({
  invitee: inviteeSchema,
  role: invitableRoleSchema,
})

/**
 * An invitee key as it appears in the log: `user:<uuid>`, `token:<hex>` or the
 * legacy `email:<address>`. Bounded and pattern-checked because it arrives from
 * the browser on the revoke path, and it is about to be used to look up a row.
 */
export const inviteeKeySchema = z.object({
  invitee: z
    .string()
    .trim()
    .max(320)
    .regex(/^(user|token|email):.+$/, 'Invalid invitation'),
})

export const changeRoleSchema = z.object({
  userId: z.uuid(),
  role: roleSchema,
})

export const memberIdSchema = z.object({ userId: z.uuid() })

export type CreateTenant = {
  type: 'CreateTenant'
  actorId: string
  name: string
  slug: string
  /**
   * Does the creator become the owner?
   *
   * `'actor'` for every space somebody makes for themselves, which is the
   * default and what the product has always done. `'none'` is the backoffice
   * standing a space up *for a customer*: the operator builds it, invites the
   * people who will run it, and is not in it - see `createEvent`, and the
   * header of 20260903000000_backoffice_stream_writes.sql for what makes an
   * ownerless space administrable at all.
   */
  owner?: 'actor' | 'none'
}
export type RenameTenant = { type: 'RenameTenant'; actorId: string; name: string }
export type ArchiveTenant = { type: 'ArchiveTenant'; actorId: string }

/**
 * The invitee arrives here already resolved to a key.
 *
 * Whether the person typed a username or an address, and whether that address
 * belongs to an existing account, is settled in the action before the command
 * is built - it needs the database to answer, and a decider that needed the
 * database would not be a decider. What reaches the domain is the decided
 * addressee, which is all the rules are about.
 */
/**
 * `seatLimit` is resolved by the action and carried in, rather than looked up.
 *
 * Same discipline as `invitee` above: the decider does not get to ask the
 * database. The limit lives in the flags, which is I/O, so the action reads it
 * and the domain is handed a number - or null for "no limit" - and decides. That
 * is what keeps "a space holds at most N" testable without a database, and what
 * lets the rule live next to the other rules about the set of members instead of
 * as a check somewhere in the action.
 */
export type InviteMember = {
  type: 'InviteMember'
  actorId: string
  invitee: InviteeKey
  role: InvitableRole
  seatLimit: number | null
}
export type RevokeInvitation = {
  type: 'RevokeInvitation'
  actorId: string
  invitee: InviteeKey
}
/**
 * Accepting and declining name the invitation rather than the actor's mailbox.
 *
 * `invitee` is resolved by my_tenant_invitation() - a SECURITY DEFINER function
 * scoped to auth.uid() - and never taken from the request. Same trust model as
 * `actorId`: the session decides, the browser does not get a say.
 */
export type AcceptInvitation = {
  type: 'AcceptInvitation'
  actorId: string
  invitee: InviteeKey
  seatLimit: number | null
}
export type DeclineInvitation = {
  type: 'DeclineInvitation'
  actorId: string
  invitee: InviteeKey
}
export type ChangeMemberRole = {
  type: 'ChangeMemberRole'
  actorId: string
  userId: string
  role: TenantRoleName
}
export type RemoveMember = { type: 'RemoveMember'; actorId: string; userId: string }
export type LeaveTenant = { type: 'LeaveTenant'; actorId: string }
export type SetLoungePublicity = {
  type: 'SetLoungePublicity'
  actorId: string
  isPublic: boolean
}
export type SetLoungeMode = {
  type: 'SetLoungeMode'
  actorId: string
  mode: 'creative' | 'battle'
}
export type SetChatEnabled = {
  type: 'SetChatEnabled'
  actorId: string
  enabled: boolean
}
/**
 * The space's rules about needing things. See `SpaceNeedsSet` in events.ts.
 *
 * Both switches together rather than one each, because they are one decision
 * with two parts and setting them separately would let a space pass through a
 * state its owner never chose - hunger on and charging on, for the instant
 * between two writes, in a space that meant to have neither.
 */
export type SetSpaceNeeds = {
  type: 'SetSpaceNeeds'
  actorId: string
  hunger: boolean
  charged: boolean
}

/** One of the host's day-to-day switches. See SpaceCapabilitySet in events.ts. */
export type SetSpaceCapability = {
  type: 'SetSpaceCapability'
  actorId: string
  capability: SpaceCapability
  enabled: boolean
}

/**
 * The platform, acting in a space it is not a member of.
 *
 * Stamped by a backoffice action after `requireBackofficeAdmin()` and by
 * nothing else - it is the same trust model as `actorId`, one level up: the
 * session decides, and no argument the browser sends can reach this field.
 * A command shape the client could set `platform` on would be the whole
 * authorization system undone twice over.
 *
 * What it does is narrow: it satisfies `requireRole`, and only that. Every
 * other rule in the decider - the last owner cannot leave, an admin cannot
 * remove an admin, a space cannot be created twice - applies to an operator
 * exactly as it applies to a host, because those rules are about the space and
 * not about who is asking.
 */
export type PlatformActor = {
  platform?: true
}

export type TenantCommand = (
  | CreateTenant
  | RenameTenant
  | ArchiveTenant
  | InviteMember
  | RevokeInvitation
  | AcceptInvitation
  | DeclineInvitation
  | ChangeMemberRole
  | RemoveMember
  | LeaveTenant
  | SetLoungePublicity
  | SetLoungeMode
  | SetChatEnabled
  | SetSpaceNeeds
  | SetSpaceCapability
) &
  PlatformActor
