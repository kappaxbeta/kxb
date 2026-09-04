import { describe, expect, test } from 'bun:test'
import {
  capabilityOn,
  decide,
  evolve,
  initialTenantState,
  tenantDecider,
} from '@/domain/tenants/aggregate'
import { type TenantEvent, tokenInvitee, userInvitee } from '@/domain/tenants/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

/**
 * Authorization rules are domain rules, so they are testable the same way
 * everything else in the domain is: no database, no mocks, no async. That is
 * the argument for putting "only an owner can do this" in the decider rather
 * than in a policy or a route guard - here you can enumerate it.
 */

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'

function given(...events: TenantEvent[]) {
  return fold(tenantDecider, events)
}

const created: TenantEvent[] = [
  { type: 'TenantCreated', data: { name: 'Acme', slug: 'acme' } },
  { type: 'MemberJoined', data: { userId: ALICE, role: 'owner' } },
]

const bobIsMember: TenantEvent = {
  type: 'MemberJoined',
  data: { userId: BOB, role: 'member' },
}

const bobIsAdmin: TenantEvent = {
  type: 'MemberJoined',
  data: { userId: BOB, role: 'admin' },
}

/** Bob, addressed as an account rather than as a mailbox. */
const BOB_INVITEE = userInvitee(BOB)

describe('creating a workspace', () => {
  test('records the workspace and its first owner', () => {
    expect(
      decide(initialTenantState, {
        type: 'CreateTenant',
        actorId: ALICE,
        name: 'Acme',
        slug: 'acme',
      }),
    ).toEqual([
      { type: 'TenantCreated', data: { name: 'Acme', slug: 'acme' } },
      { type: 'MemberJoined', data: { userId: ALICE, role: 'owner' } },
    ])
  })

  test('the backoffice builds one for a customer and joins nobody', () => {
    expect(
      decide(initialTenantState, {
        type: 'CreateTenant',
        actorId: ALICE,
        name: 'Ludum Dare',
        slug: 'ludum-dare',
        owner: 'none',
      }),
    ).toEqual([
      { type: 'TenantCreated', data: { name: 'Ludum Dare', slug: 'ludum-dare' } },
    ])
  })

  test('creating one that already exists is rejected', () => {
    expect(() =>
      decide(given(...created), {
        type: 'CreateTenant',
        actorId: BOB,
        name: 'Acme',
        slug: 'acme',
      }),
    ).toThrow(DomainError)
  })
})

describe('permissions', () => {
  test('a plain member cannot rename the workspace', () => {
    const state = given(...created, bobIsMember)
    expect(() => decide(state, { type: 'RenameTenant', actorId: BOB, name: 'Nope' })).toThrow(
      /permission/i,
    )
  })

  test('an admin can rename the workspace', () => {
    const state = given(...created, bobIsAdmin)
    expect(decide(state, { type: 'RenameTenant', actorId: BOB, name: 'Acme Inc' })).toEqual([
      { type: 'TenantRenamed', data: { name: 'Acme Inc' } },
    ])
  })

  test('a stranger is told the same thing as someone with the wrong role', () => {
    const state = given(...created)
    expect(() => decide(state, { type: 'RenameTenant', actorId: CAROL, name: 'Nope' })).toThrow(
      /permission/i,
    )
  })

  test('only an owner can change roles', () => {
    const state = given(...created, bobIsAdmin)
    expect(() =>
      decide(state, { type: 'ChangeMemberRole', actorId: BOB, userId: ALICE, role: 'member' }),
    ).toThrow(/permission/i)
  })

  test('an admin cannot remove another admin', () => {
    const state = given(
      ...created,
      bobIsAdmin,
      { type: 'MemberJoined', data: { userId: CAROL, role: 'admin' } },
    )
    expect(() =>
      decide(state, { type: 'RemoveMember', actorId: BOB, userId: CAROL }),
    ).toThrow(/only an owner/i)
  })

  test('an admin can remove a plain member', () => {
    const state = given(...created, bobIsAdmin, {
      type: 'MemberJoined',
      data: { userId: CAROL, role: 'member' },
    })
    expect(decide(state, { type: 'RemoveMember', actorId: BOB, userId: CAROL })).toEqual([
      { type: 'MemberRemoved', data: { userId: CAROL, removedBy: BOB } },
    ])
  })
})

/**
 * The platform acting where it is not a member.
 *
 * Two halves worth pinning down, because the flag is the one thing in this
 * decider that skips a check: it satisfies the *role*, and it satisfies
 * nothing else. Everything about the shape of the space still applies, which
 * is what stops "operate somebody's event" from becoming "do anything to
 * somebody's event".
 */
describe('the platform actor', () => {
  test('operates a space it has no role in', () => {
    const state = given(...created)
    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: CAROL,
        invitee: BOB_INVITEE,
        role: 'admin',
        seatLimit: null,
        platform: true,
      }),
    ).toEqual([
      {
        type: 'MemberInvited',
        data: { invitee: BOB_INVITEE, role: 'admin', invitedBy: CAROL },
      },
    ])
  })

  test('without the flag the same command is refused', () => {
    const state = given(...created)
    expect(() =>
      decide(state, {
        type: 'InviteMember',
        actorId: CAROL,
        invitee: BOB_INVITEE,
        role: 'admin',
        seatLimit: null,
      }),
    ).toThrow(/permission/i)
  })

  test('still cannot remove the last owner', () => {
    const state = given(...created)
    expect(() =>
      decide(state, {
        type: 'RemoveMember',
        actorId: CAROL,
        userId: ALICE,
        platform: true,
      }),
    ).toThrow(/last owner/i)
  })

  test('still cannot write to an archived space', () => {
    const state = given(...created, { type: 'TenantArchived', data: {} })
    expect(() =>
      decide(state, {
        type: 'SetChatEnabled',
        actorId: CAROL,
        enabled: true,
        platform: true,
      }),
    ).toThrow(/archived/i)
  })

  test('leaves a space it was the only owner of, which a host may not do', () => {
    const state = given(
      { type: 'TenantCreated', data: { name: 'Ludum Dare', slug: 'ludum-dare' } },
      { type: 'MemberJoined', data: { userId: ALICE, role: 'owner' } },
    )

    expect(() => decide(state, { type: 'LeaveTenant', actorId: ALICE })).toThrow(/last owner/i)

    expect(decide(state, { type: 'LeaveTenant', actorId: ALICE, platform: true })).toEqual([
      { type: 'MemberLeft', data: { userId: ALICE } },
    ])
  })

  test('promotes an admin to owner, which is how a space is handed over', () => {
    const state = given(...created, bobIsAdmin)
    expect(
      decide(state, {
        type: 'ChangeMemberRole',
        actorId: CAROL,
        userId: BOB,
        role: 'owner',
        platform: true,
      }),
    ).toEqual([
      { type: 'MemberRoleChanged', data: { userId: BOB, role: 'owner' } },
    ])
  })
})

describe('the last owner', () => {
  test('cannot leave', () => {
    const state = given(...created, bobIsMember)
    expect(() => decide(state, { type: 'LeaveTenant', actorId: ALICE })).toThrow(/last owner/i)
  })

  test('cannot demote themselves', () => {
    const state = given(...created)
    expect(() =>
      decide(state, { type: 'ChangeMemberRole', actorId: ALICE, userId: ALICE, role: 'member' }),
    ).toThrow(/at least one/i)
  })

  test('cannot be removed', () => {
    const state = given(...created, bobIsAdmin)
    // Bob is an admin, so the "admin cannot remove an owner" rule fires first.
    // Promote him and the last-owner rule is what stops it.
    const withTwoOwners = given(...created, bobIsAdmin, {
      type: 'MemberRoleChanged',
      data: { userId: BOB, role: 'owner' },
    })
    expect(decide(withTwoOwners, { type: 'RemoveMember', actorId: BOB, userId: ALICE })).toEqual([
      { type: 'MemberRemoved', data: { userId: ALICE, removedBy: BOB } },
    ])
    expect(() => decide(state, { type: 'RemoveMember', actorId: BOB, userId: ALICE })).toThrow(
      /only an owner/i,
    )
  })

  test('can leave once someone else is an owner', () => {
    const state = given(...created, bobIsMember, {
      type: 'MemberRoleChanged',
      data: { userId: BOB, role: 'owner' },
    })
    expect(decide(state, { type: 'LeaveTenant', actorId: ALICE })).toEqual([
      { type: 'MemberLeft', data: { userId: ALICE } },
    ])
  })
})

describe('invitations', () => {
  const invited: TenantEvent = {
    type: 'MemberInvited',
    data: { invitee: BOB_INVITEE, role: 'member', invitedBy: ALICE },
  }

  test('an owner can invite', () => {
    expect(
      decide(given(...created), {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'member',
        seatLimit: null,
      }),
    ).toEqual([
      {
        type: 'MemberInvited',
        data: { invitee: BOB_INVITEE, role: 'member', invitedBy: ALICE },
      },
    ])
  })

  test('no invitation carries an email address', () => {
    const events = decide(given(...created), {
      type: 'InviteMember',
      actorId: ALICE,
      invitee: tokenInvitee('deadbeef'),
      role: 'member',
      seatLimit: null,
    })

    // The whole point of the invitee key. An address invited by somebody who
    // has no account yet is held in tenant_invitation_emails, beside the log -
    // if one ever leaks back into an event, every member of the workspace can
    // read it and no migration can take it out again.
    expect(JSON.stringify(events)).not.toContain('@')
  })

  test('re-inviting at the same role is a no-op', () => {
    const state = given(...created, invited)
    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'member',
        seatLimit: null,
      }),
    ).toEqual([])
  })

  test('re-inviting at a different role corrects the invitation', () => {
    const state = given(...created, invited)
    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'admin',
        seatLimit: null,
      }),
    ).toEqual([
      {
        type: 'MemberInvited',
        data: { invitee: BOB_INVITEE, role: 'admin', invitedBy: ALICE },
      },
    ])
  })

  test('inviting an existing member is rejected', () => {
    const state = given(...created, bobIsMember)
    expect(() =>
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'admin',
        seatLimit: null,
      }),
    ).toThrow(/already a member/i)
  })

  test('accepting joins at the invited role', () => {
    const state = given(...created, invited)
    expect(
      decide(state, {
        type: 'AcceptInvitation',
        actorId: BOB,
        invitee: BOB_INVITEE,
        seatLimit: null,
      }),
    ).toEqual([
      {
        type: 'InvitationAccepted',
        data: { invitee: BOB_INVITEE, userId: BOB, role: 'member' },
      },
    ])
  })

  test('an invitation addressed to one account cannot be redeemed by another', () => {
    const state = given(...created, invited)
    expect(() =>
      decide(state, { type: 'AcceptInvitation', actorId: CAROL, invitee: BOB_INVITEE , seatLimit: null }),
    ).toThrow(/somebody else/i)
  })

  test('accepting an invitation that was revoked is rejected', () => {
    const state = given(...created, invited, {
      type: 'InvitationRevoked',
      data: { invitee: BOB_INVITEE },
    })
    expect(() =>
      decide(state, { type: 'AcceptInvitation', actorId: BOB, invitee: BOB_INVITEE , seatLimit: null }),
    ).toThrow(/no longer valid/i)
  })

  test('declining an invitation you do not have is a no-op', () => {
    expect(
      decide(given(...created), {
        type: 'DeclineInvitation',
        actorId: CAROL,
        invitee: userInvitee(CAROL),
      }),
    ).toEqual([])
  })
})

/**
 * The seat limit.
 *
 * The rule is "a space holds at most N", and the reason it is testable here at
 * all is that the number arrives on the command instead of being looked up:
 * the flag lives in the database, the decision does not. Every case below is a
 * question about the set of members, which is the argument for modelling
 * membership as an aggregate rather than a join table.
 */
describe('seat limit', () => {
  const invited: TenantEvent = {
    type: 'MemberInvited',
    data: { invitee: BOB_INVITEE, role: 'member', invitedBy: ALICE },
  }

  const carolInvited: TenantEvent = {
    type: 'MemberInvited',
    data: { invitee: userInvitee(CAROL), role: 'member', invitedBy: ALICE },
  }

  test('null means no limit, however many are already in', () => {
    const state = given(...created, bobIsMember, carolInvited)
    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee('44444444-4444-4444-8444-444444444444'),
        role: 'member',
        seatLimit: null,
      }),
    ).toHaveLength(1)
  })

  test('inviting into the last seat is allowed', () => {
    // Alice is the only member, so one seat of two is taken.
    expect(
      decide(given(...created), {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'member',
        seatLimit: 2,
      }),
    ).toHaveLength(1)
  })

  test('a pending invitation occupies a seat', () => {
    // Alice is in and Bob is invited: two of two, though only one has joined.
    // This is the whole point of counting invitations - without it a space
    // could issue far more invitations than it has room for, and the refusal
    // would land on the guests instead of the admin.
    const state = given(...created, invited)

    expect(() =>
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee(CAROL),
        role: 'member',
        seatLimit: 2,
      }),
    ).toThrow(/full/i)
  })

  test('the refusal is a domain error, not a crash', () => {
    const state = given(...created, invited)
    try {
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee(CAROL),
        role: 'member',
        seatLimit: 2,
      })
      throw new Error('expected the invitation to be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('seat_limit_reached')
    }
  })

  test('correcting an invitation still works in a full space', () => {
    // The invitee is already counted, so changing their role cannot grow the
    // total - and an admin locked out of fixing a mistyped role because the
    // space is full would be a rule working against the person it serves.
    const state = given(...created, invited)

    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'admin',
        seatLimit: 2,
      }),
    ).toEqual([
      {
        type: 'MemberInvited',
        data: { invitee: BOB_INVITEE, role: 'admin', invitedBy: ALICE },
      },
    ])
  })

  test('accepting does not grow the total, so a full space still admits its invitee', () => {
    // Alice in, Bob invited, cap of two. Bob accepting moves him from one
    // column to the other; refusing here would strand somebody who was
    // correctly invited.
    const state = given(...created, invited)

    expect(
      decide(state, {
        type: 'AcceptInvitation',
        actorId: BOB,
        invitee: BOB_INVITEE,
        seatLimit: 2,
      }),
    ).toHaveLength(1)
  })

  test('a cap lowered under the membership stops the space growing', () => {
    // Two members already, cap since dropped to one. Nobody is ejected - but
    // the invitation issued before the change cannot be redeemed.
    const state = given(...created, bobIsMember, carolInvited)

    expect(() =>
      decide(state, {
        type: 'AcceptInvitation',
        actorId: CAROL,
        invitee: userInvitee(CAROL),
        seatLimit: 1,
      }),
    ).toThrow(/full/i)
  })

  test('leaving frees a seat', () => {
    const state = given(...created, bobIsMember, {
      type: 'MemberLeft',
      data: { userId: BOB },
    })

    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee(CAROL),
        role: 'member',
        seatLimit: 2,
      }),
    ).toHaveLength(1)
  })

  test('a revoked invitation frees a seat', () => {
    const state = given(...created, invited, {
      type: 'InvitationRevoked',
      data: { invitee: BOB_INVITEE },
    })

    expect(
      decide(state, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee(CAROL),
        role: 'member',
        seatLimit: 2,
      }),
    ).toHaveLength(1)
  })

  test('a cap of one leaves room for nobody but the owner', () => {
    expect(() =>
      decide(given(...created), {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: BOB_INVITEE,
        role: 'member',
        seatLimit: 1,
      }),
    ).toThrow(/full/i)
  })
})

/**
 * Events written before usernames existed are keyed by email address, and the
 * workspaces that hold them are still running. `evolve` has to fold both
 * shapes: a pending invitation from last week must still be revocable and
 * acceptable today, or the migration silently strands whoever was waiting on it.
 */
describe('history written before usernames', () => {
  const legacyInvite: TenantEvent = {
    type: 'MemberInvited',
    data: { invitee: '', email: 'bob@example.com', role: 'member', invitedBy: ALICE },
  }
  const LEGACY_KEY = 'email:bob@example.com'

  test('an old invitation is still pending', () => {
    expect(given(...created, legacyInvite).invitations).toEqual({
      [LEGACY_KEY]: 'member',
    })
  })

  test('an old invitation can still be revoked', () => {
    expect(
      decide(given(...created, legacyInvite), {
        type: 'RevokeInvitation',
        actorId: ALICE,
        invitee: LEGACY_KEY,
      }),
    ).toEqual([{ type: 'InvitationRevoked', data: { invitee: LEGACY_KEY } }])
  })

  test('an old invitation can still be accepted', () => {
    expect(
      decide(given(...created, legacyInvite), {
        type: 'AcceptInvitation',
        actorId: BOB,
        invitee: LEGACY_KEY,
        seatLimit: null,
      }),
    ).toEqual([
      {
        type: 'InvitationAccepted',
        data: { invitee: LEGACY_KEY, userId: BOB, role: 'member' },
      },
    ])
  })

  test('an old MemberJoined still makes somebody a member', () => {
    const state = given(...created, {
      type: 'MemberJoined',
      data: { userId: BOB, email: 'bob@example.com', role: 'admin' },
    })
    expect(state.members[BOB]).toEqual({ role: 'admin' })
  })
})

describe('archiving', () => {
  const archived = given(...created, { type: 'TenantArchived', data: {} })

  test('only an owner can archive', () => {
    const state = given(...created, bobIsAdmin)
    expect(() => decide(state, { type: 'ArchiveTenant', actorId: BOB })).toThrow(/permission/i)
  })

  test('archiving twice is a no-op', () => {
    expect(decide(archived, { type: 'ArchiveTenant', actorId: ALICE })).toEqual([])
  })

  test('an archived workspace rejects new invitations', () => {
    expect(() =>
      decide(archived, {
        type: 'InviteMember',
        actorId: ALICE,
        invitee: userInvitee(BOB),
        role: 'member',
        seatLimit: null,
      }),
    ).toThrow(/archived/i)
  })

  test('you can still leave an archived workspace', () => {
    const state = given(...created, bobIsMember, { type: 'TenantArchived', data: {} })
    expect(decide(state, { type: 'LeaveTenant', actorId: BOB })).toEqual([
      { type: 'MemberLeft', data: { userId: BOB } },
    ])
  })
})

describe('evolve', () => {
  test('replays history into current state', () => {
    const state = given(
      ...created,
      bobIsMember,
      { type: 'TenantRenamed', data: { name: 'Acme Inc' } },
      { type: 'MemberRoleChanged', data: { userId: BOB, role: 'admin' } },
    )

    expect(state).toEqual({
      status: 'active',
      name: 'Acme Inc',
      slug: 'acme',
      isPublicLounge: false,
      loungeMode: 'battle',
      chatEnabled: true,
      // Both off, which is where every space starts and stays until an owner
      // says otherwise - see `SpaceNeedsSet`. Asserted here rather than left
      // out, because this is the exhaustive shape test and a default that
      // drifted would otherwise be invisible.
      needs: { hunger: false, charged: false },
      // Empty rather than every capability at `true`: the record holds only
      // decisions somebody actually made, and `capabilityOn` supplies the
      // default. A history that never touched a switch must leave no trace.
      capabilities: {},
      members: {
        [ALICE]: { role: 'owner' },
        [BOB]: { role: 'admin' },
      },
      invitations: {},
    })
  })

  test('a role change for a non-member is ignored rather than fatal', () => {
    const state = given(...created, {
      type: 'MemberRoleChanged',
      data: { userId: CAROL, role: 'admin' },
    })
    expect(state.members[CAROL]).toBeUndefined()
  })

  test('lounge publicity can be toggled by owner', () => {
    const state = given(...created)
    expect(
      decide(state, {
        type: 'SetLoungePublicity',
        actorId: ALICE,
        isPublic: true,
      }),
    ).toEqual([
      {
        type: 'LoungePublicitySet',
        data: { isPublic: true },
      },
    ])
  })

  test('toggling lounge publicity to same value is a no-op', () => {
    const state = given(...created, {
      type: 'LoungePublicitySet',
      data: { isPublic: true },
    })
    expect(
      decide(state, {
        type: 'SetLoungePublicity',
        actorId: ALICE,
        isPublic: true,
      }),
    ).toEqual([])
  })

  /**
   * The lounge is a play area, so sparring is the resting state and creative is
   * the interruption - which is why the default is 'battle' and why turning it
   * off is a moderator's call rather than a personal preference.
   */
  test('the lounge starts in battle mode', () => {
    expect(given(...created).loungeMode).toBe('battle')
  })

  test('an admin can switch the lounge to creative', () => {
    const state = given(...created, bobIsAdmin)
    expect(decide(state, { type: 'SetLoungeMode', actorId: BOB, mode: 'creative' })).toEqual([
      { type: 'LoungeModeSet', data: { mode: 'creative' } },
    ])
  })

  test('a plain member cannot switch the lounge mode', () => {
    const state = given(...created, bobIsMember)
    expect(() =>
      decide(state, { type: 'SetLoungeMode', actorId: BOB, mode: 'creative' }),
    ).toThrow(DomainError)
  })

  test('switching to the mode already in force is a no-op', () => {
    const state = given(...created, { type: 'LoungeModeSet', data: { mode: 'creative' } })
    expect(
      decide(state, { type: 'SetLoungeMode', actorId: ALICE, mode: 'creative' }),
    ).toEqual([])
  })

  /**
   * The space's half of the chat gate. The other half is the `chat` feature
   * flag, which is not state of this stream and is checked in the action - so
   * these tests are only ever about "did this space ask for one".
   */
  test('a space arrives with a chat nobody had to switch on', () => {
    expect(given(...created).chatEnabled).toBe(true)
  })

  test('an admin can turn the chat off and on again', () => {
    const on = given(...created, bobIsAdmin)
    expect(decide(on, { type: 'SetChatEnabled', actorId: BOB, enabled: false })).toEqual([
      { type: 'ChatEnabledSet', data: { enabled: false } },
    ])

    const off = given(...created, bobIsAdmin, {
      type: 'ChatEnabledSet',
      data: { enabled: false },
    })
    expect(off.chatEnabled).toBe(false)
    expect(decide(off, { type: 'SetChatEnabled', actorId: BOB, enabled: true })).toEqual([
      { type: 'ChatEnabledSet', data: { enabled: true } },
    ])
  })

  test('a plain member cannot open or close the chat', () => {
    const state = given(...created, bobIsMember)
    expect(() =>
      decide(state, { type: 'SetChatEnabled', actorId: BOB, enabled: true }),
    ).toThrow(DomainError)
  })

  test('turning the chat on when it is already on is a no-op', () => {
    const state = given(...created, { type: 'ChatEnabledSet', data: { enabled: true } })
    expect(
      decide(state, { type: 'SetChatEnabled', actorId: ALICE, enabled: true }),
    ).toEqual([])
  })

  /**
   * The case the default flip creates: a space that has never touched the
   * switch is already on, so asking for it again must write nothing. Without
   * this, every new space would carry a `ChatEnabledSet { enabled: true }` that
   * says only "somebody pressed the button that was already down".
   */
  test('turning the chat on in a space that never touched it is a no-op', () => {
    expect(
      decide(given(...created), { type: 'SetChatEnabled', actorId: ALICE, enabled: true }),
    ).toEqual([])
  })

  test('ignores unknown event types instead of throwing', () => {
    const state = evolve(initialTenantState, {
      type: 'SomethingFromTheFuture',
      data: {},
    } as unknown as TenantEvent)

    expect(state).toEqual(initialTenantState)
  })
})

describe('the host switches', () => {
  /**
   * Absent means on, the same way `chatEnabled` defaults: these are surfaces
   * the platform has already sold a space. An event arriving with everything
   * the operator just enabled switched off again would make the console a
   * liar.
   */
  test('a capability nobody has touched is on', () => {
    const state = given(...created)

    expect(capabilityOn(state, 'tasks')).toBe(true)
    expect(state.capabilities).toEqual({})
  })

  test('an admin can turn one off, and it is remembered', () => {
    const state = given(...created, bobIsMember, {
      type: 'MemberRoleChanged',
      data: { userId: BOB, role: 'admin' },
    })

    const events = decide(state, {
      type: 'SetSpaceCapability',
      actorId: BOB,
      capability: 'board',
      enabled: false,
    })

    expect(events).toEqual([
      { type: 'SpaceCapabilitySet', data: { capability: 'board', enabled: false } },
    ])
    expect(capabilityOn(given(...created, ...events), 'board')).toBe(false)
  })

  /** One switch moving must not disturb the others. */
  test('switches are independent', () => {
    const state = given(
      ...created,
      { type: 'SpaceCapabilitySet', data: { capability: 'board', enabled: false } },
      { type: 'SpaceCapabilitySet', data: { capability: 'tasks', enabled: false } },
      { type: 'SpaceCapabilitySet', data: { capability: 'board', enabled: true } },
    )

    expect(capabilityOn(state, 'board')).toBe(true)
    expect(capabilityOn(state, 'tasks')).toBe(false)
  })

  test('a plain member cannot flip one', () => {
    const state = given(...created, bobIsMember)

    expect(() =>
      decide(state, {
        type: 'SetSpaceCapability',
        actorId: BOB,
        capability: 'build',
        enabled: false,
      }),
    ).toThrow(DomainError)
  })

  test('setting one to what it already is is not an event', () => {
    const state = given(...created)

    expect(
      decide(state, {
        type: 'SetSpaceCapability',
        actorId: ALICE,
        capability: 'build',
        enabled: true,
      }),
    ).toEqual([])
  })

  test('an archived space takes no more switches', () => {
    const state = given(...created, { type: 'TenantArchived', data: {} })

    expect(() =>
      decide(state, {
        type: 'SetSpaceCapability',
        actorId: ALICE,
        capability: 'build',
        enabled: false,
      }),
    ).toThrow(DomainError)
  })
})
