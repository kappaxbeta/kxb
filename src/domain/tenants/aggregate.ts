import type { TenantCommand } from '@/domain/tenants/commands'
import {
  type InvitableRole,
  inviteeUserId,
  type SpaceCapability,
  TENANT_STREAM_TYPE,
  type TenantEvent,
} from '@/domain/tenants/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * State is only what the decider needs to decide.
 *
 * For a tenant that turns out to be almost entirely membership: who is in, at
 * what role, and who has been invited. The name and slug are here because
 * renaming needs to detect a no-op, not because the UI wants them - the UI
 * reads those from tenants_read_model.
 *
 * This is the payoff of modelling membership as an aggregate rather than a join
 * table. "The last owner cannot leave" is a rule about the *set* of members,
 * and here the whole set is in front of us, in memory, already consistent. As a
 * table you would be writing it as a trigger, or a transaction with the right
 * isolation level, or - most likely - a check-then-write race.
 */
export interface TenantMember {
  role: TenantRoleName
}

export interface TenantState {
  status: 'none' | 'active' | 'archived'
  name: string
  slug: string
  isPublicLounge: boolean
  /**
   * `'battle'` is the default: the lounge is a play area where sparring is
   * always on, no queue, no formal match - see combat.ts. `'creative'` is an
   * admin-gated pause on that, for building without getting dashed mid-block.
   * Nobody flies in either - see the doc comment on `fly` in lounge-scene.tsx.
   */
  loungeMode: 'creative' | 'battle'
  /**
   * Does this space want a text channel in its lounge?
   *
   * `true` until somebody says otherwise, and it did not start that way. The
   * old default was off, on the argument that us shipping chat to a workspace
   * is not the same as that workspace asking for one. That held while chat was
   * new surface behind a flag almost nobody had; it stopped holding once a
   * lounge was expected to have one, because the cost of the caution is a room
   * where nobody can say hello until an owner has found a settings page.
   *
   * Turning it *off* is still a recorded decision, which is what keeps the
   * switch meaningful in both directions - see `SetChatEnabled` in decide.
   */
  chatEnabled: boolean
  /**
   * Which of the day-to-day switches the staff have turned *off*.
   *
   * An absent key means on, the same way `chatEnabled` above now defaults.
   * These are surfaces the platform has already sold a space, and arriving
   * with everything the operator just enabled switched off again would make
   * the console a liar. So the record only ever holds a decision somebody
   * actually made.
   */
  capabilities: Readonly<Partial<Record<SpaceCapability, boolean>>>
  /** userId -> member */
  members: Readonly<Record<string, TenantMember>>
  /**
   * invitee key -> role. See InviteeKey in events.ts for the three shapes.
   *
   * Keyed by addressee rather than by a generated id, which is what lets a
   * re-invitation correct a pending one instead of stacking a second row next
   * to it - the same behaviour email keys used to give, now that the key can
   * also be an account.
   */
  invitations: Readonly<Record<string, InvitableRole>>
}

export const initialTenantState: TenantState = {
  status: 'none',
  name: '',
  slug: '',
  isPublicLounge: false,
  loungeMode: 'battle',
  chatEnabled: true,
  capabilities: {},
  members: {},
  invitations: {},
}

/**
 * Is a capability on for this space?
 *
 * The one place the "absent means on" rule is written, so that the aggregate,
 * the UI and `space_capability_on()` in
 * supabase/migrations/20260826000000_event_spaces.sql cannot drift into three
 * answers. The SQL is what enforcement actually runs; this is the same rule
 * for anything already holding the state.
 */
export function capabilityOn(
  state: TenantState,
  capability: SpaceCapability,
): boolean {
  return state.capabilities[capability] ?? true
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

/**
 * How many seats this space has taken: everyone in it, plus everyone on their
 * way in.
 *
 * Exported because the members page wants to show it, and a second count
 * written in the UI is a second answer waiting to disagree with this one.
 */
export function seatsTaken(state: TenantState): number {
  return Object.keys(state.members).length + Object.keys(state.invitations).length
}

/**
 * Is the space full?
 *
 * `null` means no limit, and it is the common case - the flag is off by
 * default - so it is checked first and answered cheaply.
 */
function atCapacity(state: TenantState, limit: number | null): boolean {
  return limit !== null && seatsTaken(state) >= limit
}

/**
 * The invitee key an event is about.
 *
 * Two shapes reach this: what is written now, which carries `invitee`, and what
 * was written before usernames existed, which carried a plain `email`. Folding
 * the old one into `email:<address>` is what keeps a workspace's pending
 * invitations answerable after the migration - and it is the whole reason
 * `email:` is one of the key shapes at all. Nothing emits one.
 *
 * Returns null for an event too malformed to be about anybody, because evolve
 * must survive any history rather than throw on it.
 */
function inviteeOf(data: { invitee?: string; email?: string }): string | null {
  if (data.invitee) return data.invitee
  if (data.email) return `email:${data.email.trim().toLowerCase()}`
  return null
}

/**
 * Fold one event into state. Pure, total, and never throws - it must be able to
 * replay anything already in the log, including events written by older code.
 */
export function evolve(state: TenantState, event: TenantEvent): TenantState {
  switch (event.type) {
    case 'TenantCreated':
      return {
        ...state,
        status: 'active',
        name: event.data.name,
        slug: event.data.slug,
      }

    case 'TenantRenamed':
      return { ...state, name: event.data.name }

    case 'TenantArchived':
      return { ...state, status: 'archived' }

    case 'MemberJoined':
      return {
        ...state,
        members: {
          ...state.members,
          [event.data.userId]: { role: event.data.role },
        },
      }

    case 'MemberInvited': {
      const invitee = inviteeOf(event.data)
      if (!invitee) return state
      return {
        ...state,
        invitations: { ...state.invitations, [invitee]: event.data.role },
      }
    }

    case 'InvitationRevoked':
    case 'InvitationDeclined': {
      const invitee = inviteeOf(event.data)
      if (!invitee) return state
      return { ...state, invitations: withoutKey(state.invitations, invitee) }
    }

    case 'InvitationAccepted': {
      const invitee = inviteeOf(event.data)
      return {
        ...state,
        invitations: invitee
          ? withoutKey(state.invitations, invitee)
          : state.invitations,
        members: {
          ...state.members,
          [event.data.userId]: { role: event.data.role },
        },
      }
    }

    case 'MemberRoleChanged': {
      const existing = state.members[event.data.userId]
      // A role change for someone who is not here is not a crash - evolve must
      // survive any history, including one where the events were reordered by
      // an older bug.
      if (!existing) return state
      return {
        ...state,
        members: {
          ...state.members,
          [event.data.userId]: { ...existing, role: event.data.role },
        },
      }
    }

    case 'MemberRemoved':
    case 'MemberLeft':
      return { ...state, members: withoutKey(state.members, event.data.userId) }

    case 'LoungePublicitySet':
      return { ...state, isPublicLounge: event.data.isPublic }

    case 'LoungeModeSet':
      return { ...state, loungeMode: event.data.mode }

    case 'ChatEnabledSet':
      return { ...state, chatEnabled: event.data.enabled }

    case 'SpaceCapabilitySet':
      return {
        ...state,
        capabilities: {
          ...state.capabilities,
          [event.data.capability]: event.data.enabled,
        },
      }

    default:
      // An event type this version does not know about. Ignore it rather than
      // crash, so a rolled-back deploy can still replay newer history.
      return state
  }
}

/**
 * Decide what happened, given where we are and what was asked.
 *
 * Same three outcomes as any other decider: events, `[]` for an
 * already-satisfied request, or a throw for one that cannot be satisfied.
 */
export function decide(state: TenantState, command: TenantCommand): TenantEvent[] {
  switch (command.type) {
    case 'CreateTenant': {
      if (state.status !== 'none') {
        throw new DomainError('This space already exists', 'tenant_exists')
      }
      // Two facts, one command: the workspace came into being, and its creator
      // became its owner. Collapsing them into a single event would make
      // "someone became an owner" unqueryable without special-casing creation.
      //
      // ...and one case where only the first fact is true. A space the
      // backoffice builds for a customer has no owner until the customer
      // accepts their invitation, and that is the honest log: nobody joined,
      // so no MemberJoined. The operator administers it as the platform in the
      // meantime, which is a fact about *them* and not about this space.
      const created: TenantEvent = {
        type: 'TenantCreated',
        data: { name: command.name, slug: command.slug },
      }

      if (command.owner === 'none') return [created]

      return [
        created,
        {
          type: 'MemberJoined',
          data: { userId: command.actorId, role: 'owner' },
        },
      ]
    }

    case 'RenameTenant': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])
      if (state.name === command.name) return []
      return [{ type: 'TenantRenamed', data: { name: command.name } }]
    }

    case 'ArchiveTenant': {
      if (state.status === 'none') throw notFound()
      requireRole(state, command, ['owner'])
      if (state.status === 'archived') return []
      return [{ type: 'TenantArchived', data: {} }]
    }

    case 'InviteMember': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])

      /**
       * "Already a member" is only answerable when the key names an account.
       *
       * It used to be answerable for every invitation, because state carried
       * each member's email and the invitation was an email. Now a `token:` key
       * stands for a mailbox nobody here has an id for, so the decider cannot
       * tell whether it belongs to someone already in the room. That check moved
       * to the action, which can ask the database - and when the address does
       * belong to an account, the action resolves it to a `user:` key and this
       * branch catches it after all.
       */
      const invitedUserId = inviteeUserId(command.invitee)
      if (invitedUserId && state.members[invitedUserId]) {
        throw new DomainError('That person is already a member', 'already_member')
      }

      // Re-inviting at the same role is a no-op; at a different role it is a
      // correction, and the trigger's upsert makes it land.
      if (state.invitations[command.invitee] === command.role) return []

      /**
       * The seat cap, checked before a new invitation is issued.
       *
       * Pending invitations count towards it, which is the whole reason this
       * check is here and not only on acceptance. A cap that counted members
       * alone would let a space with three seats issue thirty invitations and
       * then refuse twenty-seven people one at a time, at the moment they
       * clicked accept - turning the space's own admin error into a rejection
       * aimed at their guests. Refusing the invitation is the same rule
       * enforced against the person who can actually do something about it.
       *
       * Correcting an existing invitation's role is exempt: the invitee is
       * already counted, so it cannot grow the total.
       */
      const alreadyInvited = command.invitee in state.invitations
      if (!alreadyInvited && atCapacity(state, command.seatLimit)) {
        throw new DomainError(
          `This space is full — it holds ${command.seatLimit}, counting people already invited.`,
          'seat_limit_reached',
        )
      }

      return [
        {
          type: 'MemberInvited',
          data: {
            invitee: command.invitee,
            role: command.role,
            invitedBy: command.actorId,
          },
        },
      ]
    }

    case 'RevokeInvitation': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])

      if (!(command.invitee in state.invitations)) return []

      return [{ type: 'InvitationRevoked', data: { invitee: command.invitee } }]
    }

    case 'AcceptInvitation': {
      assertActive(state)

      const role = state.invitations[command.invitee]

      if (!role) {
        throw new DomainError('That invitation is no longer valid', 'invitation_missing')
      }
      // Already in, by some other route. Nothing left to record.
      if (state.members[command.actorId]) return []

      /**
       * The key has to name the accepter, when it names anybody.
       *
       * `invitee` is resolved from the session by my_tenant_invitation(), so in
       * practice it always does. This is the decider refusing to take that on
       * faith: without it, an invitation addressed to one account could be
       * redeemed into another by whoever managed to pass the wrong key.
       */
      const invitedUserId = inviteeUserId(command.invitee)
      if (invitedUserId && invitedUserId !== command.actorId) {
        throw new DomainError('That invitation is for somebody else', 'invitation_mismatch')
      }

      /**
       * The backstop, and it counts *members* rather than members plus
       * invitations.
       *
       * Accepting does not grow the total - it moves one person from the
       * invited column to the member column - so checking the total here would
       * refuse nobody the invite branch had not already refused. What this
       * catches is the case that branch cannot: invitations issued before the
       * cap existed, or before it was lowered. Then the members alone can reach
       * the limit, and somebody has to be the one told the room is full.
       *
       * It is deliberately the weaker of the two checks. An admin who lowers
       * the cap below the current membership does not eject anybody; the space
       * simply stops growing until it is back under.
       */
      if (command.seatLimit !== null) {
        const members = Object.keys(state.members).length
        if (members >= command.seatLimit) {
          throw new DomainError(
            `That space is full — it holds ${command.seatLimit}.`,
            'seat_limit_reached',
          )
        }
      }

      return [
        {
          type: 'InvitationAccepted',
          data: { invitee: command.invitee, userId: command.actorId, role },
        },
      ]
    }

    case 'DeclineInvitation': {
      if (!(command.invitee in state.invitations)) return []

      const invitedUserId = inviteeUserId(command.invitee)
      if (invitedUserId && invitedUserId !== command.actorId) {
        throw new DomainError('That invitation is for somebody else', 'invitation_mismatch')
      }

      return [{ type: 'InvitationDeclined', data: { invitee: command.invitee } }]
    }

    case 'ChangeMemberRole': {
      assertActive(state)
      // Only an owner may hand out or take away ownership and admin rights.
      // Letting admins promote each other makes the distinction meaningless.
      requireRole(state, command, ['owner'])

      const target = state.members[command.userId]
      if (!target) {
        throw new DomainError('That person is not a member', 'not_a_member')
      }
      if (target.role === command.role) return []

      // Stepping down is allowed - unless you are the only owner, which would
      // leave the workspace with nobody who can administer it.
      if (target.role === 'owner' && countOwners(state) === 1) {
        throw new DomainError(
          'Promote another owner first - a space needs at least one',
          'last_owner',
        )
      }

      return [
        { type: 'MemberRoleChanged', data: { userId: command.userId, role: command.role } },
      ]
    }

    case 'RemoveMember': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])

      const target = state.members[command.userId]
      if (!target) return []

      if (command.userId === command.actorId) {
        throw new DomainError('Use "leave space" to remove yourself', 'remove_self')
      }
      // An admin can clear out members but not their peers or their superiors.
      if (state.members[command.actorId]?.role === 'admin' && target.role !== 'member') {
        throw new DomainError(
          'Only an owner can remove an admin or another owner',
          'insufficient_role',
        )
      }
      if (target.role === 'owner' && countOwners(state) === 1) {
        throw new DomainError('The last owner cannot be removed', 'last_owner')
      }

      return [
        {
          type: 'MemberRemoved',
          data: { userId: command.userId, removedBy: command.actorId },
        },
      ]
    }

    case 'LeaveTenant': {
      if (state.status === 'none') throw notFound()

      const member = state.members[command.actorId]
      if (!member) return []

      /**
       * ...unless the one leaving is the platform.
       *
       * The rule protects a customer from stranding their own space, and it is
       * the one place `platform` skips something other than a role check -
       * which needs an argument rather than an exception. It is this: an
       * ownerless space is now a supported state, because that is how the
       * backoffice builds every event, and the platform can administer one.
       * So an operator stepping out of a space they were made the owner of
       * before 20260903000000 is not stranding anybody; it is finishing the
       * job that migration started.
       *
       * A host in the same position is still refused, and that is the point:
       * for them there is no platform behind the space, and "the last owner
       * left" would mean a room nobody can administer.
       */
      if (member.role === 'owner' && countOwners(state) === 1 && !command.platform) {
        throw new DomainError(
          'You are the last owner - promote someone else, or archive the space',
          'last_owner',
        )
      }

      return [{ type: 'MemberLeft', data: { userId: command.actorId } }]
    }

    case 'SetLoungePublicity': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])
      if (state.isPublicLounge === command.isPublic) return []
      return [{ type: 'LoungePublicitySet', data: { isPublic: command.isPublic } }]
    }

    case 'SetLoungeMode': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])
      if (state.loungeMode === command.mode) return []
      return [{ type: 'LoungeModeSet', data: { mode: command.mode } }]
    }

    /**
     * Owners and admins, same as the publicity and mode switches beside it.
     *
     * Opening a text channel in the space, and closing one people are talking
     * in, are both administrative acts - the second more than the first. The
     * `chat` feature flag is checked in the action rather than here: a flag is
     * not state of this stream, and a decider that could not see one would have
     * to be told by something that can.
     */
    case 'SetChatEnabled': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])
      if (state.chatEnabled === command.enabled) return []
      return [{ type: 'ChatEnabledSet', data: { enabled: command.enabled } }]
    }

    /**
     * Owners and admins only, like every other switch on this stream - and
     * that is what makes the event console work without a service-role hole:
     * the operator who created the event is its owner, so this is an ordinary
     * member action for them.
     *
     * The *ceiling* is not checked here. Whether the platform sold this space
     * tasks at all lives in `event_spaces`, which is not state of this stream,
     * and a decider that could not see it would have to be told by something
     * that can - the same argument the chat case makes about its flag. The
     * consequence is benign: a host may switch on something the ceiling
     * forbids, and it stays off, because the database ANDs the two.
     */
    case 'SetSpaceCapability': {
      assertActive(state)
      requireRole(state, command, ['owner', 'admin'])
      if (capabilityOn(state, command.capability) === command.enabled) return []
      return [
        {
          type: 'SpaceCapabilitySet',
          data: { capability: command.capability, enabled: command.enabled },
        },
      ]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function countOwners(state: TenantState): number {
  return Object.values(state.members).filter((member) => member.role === 'owner').length
}

function notFound(): DomainError {
  return new DomainError('Space not found', 'tenant_not_found')
}

function assertActive(state: TenantState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'archived') {
    throw new DomainError('This space has been archived', 'tenant_archived')
  }
}

/**
 * Is the asker allowed to do this?
 *
 * Takes the whole command rather than the actor's id, because there are two
 * ways to be allowed: hold the role in this space, or be the platform acting
 * on a space it does not belong to. The second is `command.platform`, which
 * only a backoffice action can set - see `PlatformActor` in commands.ts.
 *
 * Deliberately the *only* check that platform satisfies. An operator handing
 * ownership to a customer still cannot leave a space without an owner behind
 * them, and cannot create a space that already exists, because those rules are
 * about the space rather than about who is asking.
 */
function requireRole(
  state: TenantState,
  command: { actorId: string; platform?: true },
  allowed: readonly TenantRoleName[],
): void {
  if (command.platform) return

  const role = state.members[command.actorId]?.role

  // "Not a member" and "wrong role" give the same answer on purpose: telling a
  // stranger that a workspace exists but they lack the role is more than they
  // need to know.
  if (!role || !allowed.includes(role)) {
    throw new DomainError(
      'You do not have permission to do that in this space',
      'insufficient_role',
    )
  }
}

export const tenantDecider: Decider<TenantState, TenantCommand, TenantEvent> = {
  streamType: TENANT_STREAM_TYPE,
  initialState: initialTenantState,
  evolve,
  decide,
}
