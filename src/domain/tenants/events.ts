import type { DomainEvent } from '@/es/types'
import type { TenantRoleName } from '@/lib/supabase/types'

export type TenantCreated = DomainEvent<'TenantCreated', { name: string; slug: string }>
export type TenantRenamed = DomainEvent<'TenantRenamed', { name: string }>
export type TenantArchived = DomainEvent<'TenantArchived', Record<string, never>>

/**
 * No email address appears in any event in this file, and that is a constraint
 * rather than an oversight.
 *
 * Every member of a workspace can read its whole event stream - they have to,
 * because executeCommand() takes its expected version from the last event it
 * loaded, so a member who could not see part of the log could never append to
 * it. There is no way to hide a field from some readers and still let them
 * write. So the only place an address can be kept out of their reach is outside
 * the log entirely: see public.tenant_invitation_emails in the usernames
 * migration.
 *
 * Events written before that migration still carry `email`, and `evolve` still
 * understands them. Nothing writes one any more, which is why every one of
 * those fields is optional and marked deprecated.
 */

export type MemberJoined = DomainEvent<
  'MemberJoined',
  {
    userId: string
    role: TenantRoleName
    /** @deprecated pre-usernames history */
    email?: string
  }
>

/**
 * Who an invitation is for, as the log records it.
 *
 * `user:<uuid>`  - they already have an account, so nothing about their mailbox
 *                  needs recording: they find the invitation by being signed in.
 * `token:<hex>`  - they do not. The token stands in for the address, which
 *                  lives in tenant_invitation_emails beside the log.
 * `email:<addr>` - written before this was a concern. Still folded, never
 *                  emitted.
 */
export type InviteeKey = string

export type MemberInvited = DomainEvent<
  'MemberInvited',
  {
    invitee: InviteeKey
    role: InvitableRole
    invitedBy: string
    /** @deprecated pre-usernames history; `invitee` supersedes it */
    email?: string
  }
>
export type InvitationRevoked = DomainEvent<
  'InvitationRevoked',
  {
    invitee: InviteeKey
    /** @deprecated pre-usernames history */
    email?: string
  }
>
export type InvitationAccepted = DomainEvent<
  'InvitationAccepted',
  {
    invitee: InviteeKey
    userId: string
    role: InvitableRole
    /** @deprecated pre-usernames history */
    email?: string
  }
>
export type InvitationDeclined = DomainEvent<
  'InvitationDeclined',
  {
    invitee: InviteeKey
    /** @deprecated pre-usernames history */
    email?: string
  }
>
export type MemberRoleChanged = DomainEvent<
  'MemberRoleChanged',
  { userId: string; role: TenantRoleName }
>
export type MemberRemoved = DomainEvent<
  'MemberRemoved',
  { userId: string; removedBy: string }
>
export type MemberLeft = DomainEvent<'MemberLeft', { userId: string }>

export type LoungePublicitySet = DomainEvent<'LoungePublicitySet', { isPublic: boolean }>

export type LoungeMode = 'creative' | 'battle'

export type LoungeModeSet = DomainEvent<'LoungeModeSet', { mode: LoungeMode }>

/**
 * The space turning its own chat on or off.
 *
 * Here rather than in `feature_flags` because the two switches answer different
 * questions and belong to different people. The flag is ours - "may this
 * installation have chat at all" - and lives beside billing and open
 * registration in a table only the backoffice can write. This is theirs, set by
 * an owner or admin in Space Settings, and it is a setting you expect to still
 * hold tomorrow, which is what makes it an event on the space's own stream
 * rather than a preference in somebody's browser.
 *
 * Both have to be on. Turning the flag on for a workspace must not put a text
 * channel in a room that never asked for one.
 */
export type ChatEnabledSet = DomainEvent<'ChatEnabledSet', { enabled: boolean }>

/**
 * Whether this space's levels may make you hungry, and what that costs.
 *
 * `docs/product/economy.md` §11. **Off by default**, and the default is the
 * important half: a space that has never thought about needs is a space where
 * nothing starves and nothing costs anything, and it stays that way until an
 * owner decides otherwise.
 *
 * ---------------------------------------------------------------------------
 * Why it is a space rule and not a level's
 * ---------------------------------------------------------------------------
 * Because it is a decision about what *playing here* is like, and a level that
 * could switch it on for itself would mean one cartridge changing the rules of
 * the console it was slotted into. The level designer's half is the other one:
 * with needs on, they place something to eat and price it. Without needs on,
 * that thing is scenery.
 *
 * ---------------------------------------------------------------------------
 * The switch that matters most is the one that turns it off
 * ---------------------------------------------------------------------------
 * A hungry player who cannot afford food is a player who cannot play, and the
 * first space to discover that should be able to fix it in one click. That is
 * why this is a single event rather than a per-level setting somebody would
 * have to go and find in eleven places.
 *
 * ---------------------------------------------------------------------------
 * Two switches, not one
 * ---------------------------------------------------------------------------
 * `hunger` is whether the mechanic exists at all. `charged` is whether the
 * things that answer it cost coins. They come apart in a way that is worth
 * having: a space can run hunger as a pure survival mechanic with free food -
 * a pressure on attention rather than on a purse - and that is a real thing to
 * want, especially for a space whose players have no coins yet.
 *
 * The reverse combination is not expressible and should not be: charging for
 * food in a space where nobody gets hungry is a shop selling nothing.
 */
export type SpaceNeedsSet = DomainEvent<
  'SpaceNeedsSet',
  {
    /** Does anybody get hungry here? */
    hunger: boolean
    /**
     * Do the things that answer a need cost coins?
     *
     * Ignored while `hunger` is off - there is nothing to buy - but recorded as
     * given rather than normalised, so switching hunger back on restores the
     * space to the arrangement its owner last chose instead of to a default.
     */
    charged: boolean
  }
>

/**
 * The switches a host reaches for during the day.
 *
 * Deliberately the *second* half of an answer, never the whole of one. What a
 * guest may actually do is:
 *
 *   the platform allows it here      (event_spaces.guest_writes)
 *   AND the staff have it on         (this)
 *   AND the event's window is open   (event_spaces.opens_at/closes_at)
 *
 * That is the same shape as the `chat` flag versus `ChatEnabledSet` above, and
 * it is reused rather than reinvented for the reason given there: collapsing
 * the two loses the distinction a host needs most at 09:00, which is "this
 * event never had tasks" against "somebody turned tasks off ten minutes ago".
 *
 * One event with a `capability` field rather than six near-identical event
 * types, which is a departure from how the rest of this file is written. The
 * justification is that these are not six decisions - they are one decision
 * applied to a list that is expected to grow with the surfaces, and six types
 * would mean six more every time a surface is added. `ChatEnabledSet` is
 * deliberately *not* folded into it: it already has a settings UI, a feature
 * flag beside it and history in the log, and rewriting all three to make the
 * shapes match would be churn bought with a migration.
 */
export type SpaceCapability =
  | 'build'
  | 'rooms'
  | 'board'
  | 'tasks'
  | 'pages'
  | 'battle'
  | 'agents'
  /**
   * The performance readout, in the room.
   *
   * The odd one out in this list, and worth saying why it belongs here anyway.
   * Every other capability answers "may somebody do this in this space"; this
   * one answers "does this space want to see something". It is here because the
   * mechanism is exactly right - a per-space switch, written to the tenant's own
   * stream, already projected, already reachable from Space Settings - and
   * inventing a second `chat_enabled`-shaped column for one boolean would be a
   * migration and a projection change to say the same thing.
   *
   * What follows from it being different is `GUEST_WRITE_CAPABILITIES` below:
   * it is deliberately not offered on the event desk, because "may guests use
   * the performance readout" is not a question about writing and the desk is a
   * list of writes.
   *
   * It is also the only capability that defaults *off* - see `perfDisplayOn` in
   * src/lib/tenant.ts, which is where that exception is argued.
   */
  | 'perf_display'
  /**
   * Whether running costs anything.
   *
   * The second capability in this list that is not a permission - `perf_display`
   * is the first, and the argument is the same one: it is a per-space switch,
   * written to the tenant's own stream, already projected, and inventing a
   * column for one boolean would be a migration to say what this already says.
   *
   * Off is what every world has always been: hold shift and go, for as long as
   * you like. On makes distance cost something, which is what turns a course
   * into a course - so it defaults *off*, like `perf_display` and unlike the
   * permissions above, because a space that has never asked for it has not
   * asked for it.
   */
  | 'stamina'

export const SPACE_CAPABILITIES: SpaceCapability[] = [
  'build',
  'rooms',
  'board',
  'tasks',
  'pages',
  'battle',
  'agents',
  'perf_display',
  'stamina',
]

/**
 * The ones an event's guests can be granted, which is not all of them.
 *
 * The event desk asks "what may a guest do here" and pairs each answer against
 * `guestWrites`, so a capability that is not a *write* has no meaning on that
 * screen. Split out rather than filtered at each of the two call sites, so
 * adding a capability makes somebody decide which list it is on.
 */
export type GuestWriteCapability = Exclude<SpaceCapability, 'perf_display' | 'stamina'>

export const GUEST_WRITE_CAPABILITIES: GuestWriteCapability[] = SPACE_CAPABILITIES.filter(
  (capability): capability is GuestWriteCapability =>
    capability !== 'perf_display' && capability !== 'stamina',
)

/** Human labels, for the console and the event desk. */
export const SPACE_CAPABILITY_LABELS: Record<SpaceCapability, string> = {
  build: 'Build',
  rooms: 'Create rooms',
  board: 'Pinboard',
  tasks: 'Tasks',
  pages: 'Pages',
  battle: 'Matches',
  agents: 'Creatures',
  perf_display: 'Performance readout',
  stamina: 'Stamina',
}

export function isSpaceCapability(value: string): value is SpaceCapability {
  return (SPACE_CAPABILITIES as string[]).includes(value)
}

export type SpaceCapabilitySet = DomainEvent<
  'SpaceCapabilitySet',
  { capability: SpaceCapability; enabled: boolean }
>

/** Ownership is transferred, never handed out by invitation. */
export type InvitableRole = Exclude<TenantRoleName, 'owner'>

export type TenantEvent =
  | TenantCreated
  | TenantRenamed
  | TenantArchived
  | MemberJoined
  | MemberInvited
  | InvitationRevoked
  | InvitationAccepted
  | InvitationDeclined
  | MemberRoleChanged
  | MemberRemoved
  | MemberLeft
  | LoungePublicitySet
  | LoungeModeSet
  | ChatEnabledSet
  | SpaceNeedsSet
  | SpaceCapabilitySet

export const TENANT_STREAM_TYPE = 'tenant'

/** Address an account you can already name. */
export function userInvitee(userId: string): InviteeKey {
  return `user:${userId}`
}

/** Address a mailbox, by the token that stands in for it. */
export function tokenInvitee(token: string): InviteeKey {
  return `token:${token}`
}

/** The account an invitee key names, if it names one at all. */
export function inviteeUserId(invitee: InviteeKey): string | null {
  return invitee.startsWith('user:') ? invitee.slice('user:'.length) : null
}

/** Human-readable labels for the event log viewer. */
export const TENANT_EVENT_LABELS: Record<TenantEvent['type'], string> = {
  TenantCreated: 'space created',
  TenantRenamed: 'space renamed',
  TenantArchived: 'space archived',
  MemberJoined: 'member joined',
  MemberInvited: 'member invited',
  InvitationRevoked: 'invitation revoked',
  InvitationAccepted: 'invitation accepted',
  InvitationDeclined: 'invitation declined',
  MemberRoleChanged: 'role changed',
  MemberRemoved: 'member removed',
  MemberLeft: 'member left',
  LoungePublicitySet: 'lounge publicity changed',
  LoungeModeSet: 'lounge mode changed',
  ChatEnabledSet: 'chat turned on or off',
  SpaceNeedsSet: 'space needs changed',
  SpaceCapabilitySet: 'capability turned on or off',
}
