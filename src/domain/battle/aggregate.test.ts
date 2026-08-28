import { describe, expect, test } from 'bun:test'
import {
  battleDecider,
  decide,
  evolve,
  initialBattleState,
} from '@/domain/battle/aggregate'
import type { BattleEvent, BattleMode, Side } from '@/domain/battle/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'
const DAVE = '44444444-4444-4444-8444-444444444444'
const ARENA = '99999999-9999-4999-8999-999999999999'

/** A fixed kickoff, so the football clock is something a test can reason about. */
const KICKOFF = '2026-08-04T12:00:00.000Z'

function given(...events: BattleEvent[]) {
  return fold(battleDecider, events)
}

function created(mode: BattleMode): BattleEvent {
  return {
    type: 'BattleCreated',
    data: {
      name: 'Friday scrap',
      mode,
      worldId: ARENA,
      hostTenantId: HOST,
      createdBy: ALICE,
    },
  }
}

function joined(userId: string, side?: Side): BattleEvent {
  return { type: 'PlayerJoined', data: { userId, tenantId: HOST, side } }
}

/** Said they are at the line. See `PlayerReady` - the whistle counts these. */
function atTheLine(userId: string): BattleEvent {
  return { type: 'PlayerReady', data: { userId, ready: true } }
}

const STARTED: BattleEvent = { type: 'BattleStarted', data: {} }

describe('joining', () => {
  test('a free-for-all takes no sides', () => {
    expect(
      decide(given(created('ffa')), { type: 'JoinBattle', actorId: BOB, tenantId: HOST }),
    ).toEqual([{ type: 'PlayerJoined', data: { userId: BOB, tenantId: HOST, side: undefined } }])
  })

  test('picking a side in a free-for-all is refused', () => {
    expect(() =>
      decide(given(created('ffa')), {
        type: 'JoinBattle',
        actorId: BOB,
        tenantId: HOST,
        side: 'red',
      }),
    ).toThrow(DomainError)
  })

  test('a team match requires a side', () => {
    expect(() =>
      decide(given(created('team')), { type: 'JoinBattle', actorId: BOB, tenantId: HOST }),
    ).toThrow(DomainError)
  })

  test('joining the side you are already on is a no-op', () => {
    const state = given(created('team'), joined(BOB, 'red'))
    expect(
      decide(state, { type: 'JoinBattle', actorId: BOB, tenantId: HOST, side: 'red' }),
    ).toEqual([])
  })

  test('switching sides before the start is allowed', () => {
    const state = given(created('team'), joined(BOB, 'red'))
    expect(
      decide(state, { type: 'JoinBattle', actorId: BOB, tenantId: HOST, side: 'blue' }),
    ).toEqual([
      { type: 'PlayerJoined', data: { userId: BOB, tenantId: HOST, side: 'blue' } },
    ])
  })

  test('only one champion in a one-vs-everyone match', () => {
    const state = given(created('one_vs_all'), joined(ALICE, 'champion'))
    expect(() =>
      decide(state, {
        type: 'JoinBattle',
        actorId: BOB,
        tenantId: HOST,
        side: 'champion',
      }),
    ).toThrow(DomainError)
  })

  test('challengers are unlimited', () => {
    const state = given(
      created('one_vs_all'),
      joined(ALICE, 'champion'),
      joined(BOB, 'challengers'),
    )
    expect(
      decide(state, {
        type: 'JoinBattle',
        actorId: CAROL,
        tenantId: HOST,
        side: 'challengers',
      }),
    ).toHaveLength(1)
  })

  test('nobody joins a battle that has started', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
    expect(() =>
      decide(state, { type: 'JoinBattle', actorId: CAROL, tenantId: HOST }),
    ).toThrow(DomainError)
  })

  /** A roster spanning two spaces is the whole point of a cross-space challenge. */
  test('a player from another space can join', () => {
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    expect(
      decide(given(created('ffa')), {
        type: 'JoinBattle',
        actorId: BOB,
        tenantId: other,
      }),
    ).toEqual([
      { type: 'PlayerJoined', data: { userId: BOB, tenantId: other, side: undefined } },
    ])
  })
})

describe('starting', () => {
  test('only the host may start it', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(() => decide(state, { type: 'StartBattle', actorId: BOB, at: KICKOFF })).toThrow(DomainError)
  })

  test('one fighter is not a match', () => {
    const state = given(created('ffa'), joined(ALICE))
    expect(() => decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toThrow(
      DomainError,
    )
  })

  test('a team match with everybody on one side will not start', () => {
    const state = given(created('team'), joined(ALICE, 'red'), joined(BOB, 'red'))
    expect(() => decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toThrow(
      DomainError,
    )
  })

  test('a champion with no challengers will not start', () => {
    const state = given(
      created('one_vs_all'),
      joined(ALICE, 'champion'),
      joined(BOB, 'champion'),
    )
    // Only one champion is allowed, so this state is unreachable through the
    // decider - but evolve must survive it, and start must refuse it.
    expect(() => decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toThrow(
      DomainError,
    )
  })

  test('two fighters on two sides starts', () => {
    const state = given(
      created('team'),
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      atTheLine(ALICE),
      atTheLine(BOB),
    )
    expect(decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toEqual([
      { type: 'BattleStarted', data: {} },
    ])
  })
})

describe('the win condition', () => {
  test('a free-for-all ends when one fighter is left', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: CAROL } },
    )

    expect(
      decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB, by: ALICE }),
    ).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB, by: ALICE } },
      { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
    ])
  })

  test('a free-for-all does not end while two are standing', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      STARTED,
    )

    expect(
      decide(state, { type: 'ReportDefeat', actorId: CAROL, userId: CAROL }),
    ).toEqual([{ type: 'PlayerDefeated', data: { userId: CAROL, by: undefined } }])
  })

  /**
   * The reason a team match is not just "count the players": red can be down to
   * one fighter against three and still be very much in it.
   */
  test('a team match ends only when a whole side is down', () => {
    const state = given(
      created('team'),
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      joined(CAROL, 'blue'),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: CAROL } },
    )

    expect(decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB, by: undefined } },
      { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
    ])
  })

  test('the champion beating everyone wins as a side', () => {
    const state = given(
      created('one_vs_all'),
      joined(ALICE, 'champion'),
      joined(BOB, 'challengers'),
      STARTED,
    )

    expect(decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB, by: undefined } },
      { type: 'BattleEnded', data: { winner: { type: 'side', id: 'champion' } } },
    ])
  })

  test('the champion going down hands it to the challengers', () => {
    const state = given(
      created('one_vs_all'),
      joined(ALICE, 'champion'),
      joined(BOB, 'challengers'),
      joined(CAROL, 'challengers'),
      STARTED,
    )

    expect(
      decide(state, { type: 'ReportDefeat', actorId: ALICE, userId: ALICE }),
    ).toEqual([
      { type: 'PlayerDefeated', data: { userId: ALICE, by: undefined } },
      { type: 'BattleEnded', data: { winner: { type: 'side', id: 'challengers' } } },
    ])
  })

  /**
   * Nobody standing is a draw. Awarding it to whoever fell last would be
   * inventing a result the fight did not produce.
   */
  test('everybody going down is a draw, not a win for the last to fall', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: ALICE } },
    )

    expect(decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB, by: undefined } },
      { type: 'BattleEnded', data: { winner: null } },
    ])
  })

  test('being defeated twice records nothing the second time', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: CAROL } },
    )

    expect(
      decide(state, { type: 'ReportDefeat', actorId: CAROL, userId: CAROL }),
    ).toEqual([])
  })

  test('a defeat reported before the start records nothing', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(
      decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB }),
    ).toEqual([])
  })
})

describe('leaving', () => {
  test('leaving before the start just removes you', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
      { type: 'PlayerLeft', data: { userId: BOB } },
    ])
  })

  /**
   * Quitting a live match cannot be a way to deny somebody their win, so it is
   * recorded as going down rather than as leaving.
   */
  test('walking out of a live match counts as a defeat and can end it', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)

    expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB } },
      { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
    ])
  })

  test('a team losing its last member by walkout loses the match', () => {
    const state = given(
      created('team'),
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      STARTED,
    )

    expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB } },
      { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
    ])
  })

  test('leaving a battle you are not in is a no-op', () => {
    const state = given(created('ffa'), joined(ALICE))
    expect(decide(state, { type: 'LeaveBattle', actorId: DAVE })).toEqual([])
  })

  /**
   * An empty lobby has no host standing in it and nothing will ever start it,
   * so leaving it "open" fills the list of what is on with things that are not.
   */
  test('the last one out of a lobby closes it', () => {
    const state = given(created('ffa'), joined(ALICE))
    expect(decide(state, { type: 'LeaveBattle', actorId: ALICE })).toEqual([
      { type: 'PlayerLeft', data: { userId: ALICE } },
      { type: 'BattleCancelled', data: {} },
    ])
  })

  test('leaving a lobby that still has somebody in it does not close it', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
      { type: 'PlayerLeft', data: { userId: BOB } },
    ])
  })

  /** A live match emptying is a draw, which is a truer answer than "cancelled". */
  test('the last one out of a live match ends it as a draw, not cancelled', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), STARTED, {
      type: 'PlayerDefeated',
      data: { userId: ALICE },
    })

    expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
      { type: 'PlayerDefeated', data: { userId: BOB } },
      { type: 'BattleEnded', data: { winner: null } },
    ])
  })
})

describe('rematches', () => {
  const finished = [
    created('ffa'),
    joined(ALICE),
    joined(BOB),
    joined(CAROL),
    STARTED,
    { type: 'PlayerDefeated', data: { userId: CAROL } } as BattleEvent,
    { type: 'PlayerDefeated', data: { userId: BOB } } as BattleEvent,
    { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } } as BattleEvent,
  ]

  const REMATCH = '55555555-5555-4555-8555-555555555555'

  test('a fighter can ask for another go', () => {
    expect(decide(given(...finished), { type: 'WantRematch', actorId: BOB })).toEqual([
      { type: 'RematchWanted', data: { userId: BOB } },
    ])
  })

  test('asking twice is a no-op', () => {
    const state = given(...finished, { type: 'RematchWanted', data: { userId: BOB } })
    expect(decide(state, { type: 'WantRematch', actorId: BOB })).toEqual([])
  })

  /** Deciding before you know how it went is not the question being asked. */
  test('nobody can ask while it is still being fought', () => {
    const live = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
    expect(() => decide(live, { type: 'WantRematch', actorId: BOB })).toThrow(DomainError)
  })

  test('somebody who was not in it cannot opt in', () => {
    expect(() =>
      decide(given(...finished), { type: 'WantRematch', actorId: DAVE }),
    ).toThrow(DomainError)
  })

  test('one person wanting a rematch is not enough to start one', () => {
    const state = given(...finished, { type: 'RematchWanted', data: { userId: BOB } })
    expect(() =>
      decide(state, { type: 'StartRematch', actorId: BOB, battleId: REMATCH }),
    ).toThrow(DomainError)
  })

  test('two who opted in can start it', () => {
    const state = given(
      ...finished,
      { type: 'RematchWanted', data: { userId: BOB } },
      { type: 'RematchWanted', data: { userId: ALICE } },
    )
    expect(
      decide(state, { type: 'StartRematch', actorId: BOB, battleId: REMATCH }),
    ).toEqual([{ type: 'RematchStarted', data: { battleId: REMATCH } }])
  })

  /**
   * Not "the host": whoever set the match up may have lost and left, and a
   * rematch only they could call is one that usually cannot be called.
   */
  test('somebody who did not opt in cannot start it', () => {
    const state = given(
      ...finished,
      { type: 'RematchWanted', data: { userId: BOB } },
      { type: 'RematchWanted', data: { userId: CAROL } },
    )
    expect(() =>
      decide(state, { type: 'StartRematch', actorId: ALICE, battleId: REMATCH }),
    ).toThrow(DomainError)
  })

  test('starting it twice is a no-op, so nobody is stranded on the first one', () => {
    const state = given(
      ...finished,
      { type: 'RematchWanted', data: { userId: BOB } },
      { type: 'RematchWanted', data: { userId: ALICE } },
      { type: 'RematchStarted', data: { battleId: REMATCH } },
    )
    expect(
      decide(state, { type: 'StartRematch', actorId: BOB, battleId: 'another' }),
    ).toEqual([])
  })

  test('once it has started, latecomers cannot opt into the old one', () => {
    const state = given(
      ...finished,
      { type: 'RematchWanted', data: { userId: BOB } },
      { type: 'RematchWanted', data: { userId: ALICE } },
      { type: 'RematchStarted', data: { battleId: REMATCH } },
    )
    expect(() => decide(state, { type: 'WantRematch', actorId: CAROL })).toThrow(
      DomainError,
    )
  })

  test('replay carries the roster and the thread to the next match', () => {
    const state = given(
      ...finished,
      { type: 'RematchWanted', data: { userId: BOB } },
      { type: 'RematchWanted', data: { userId: ALICE } },
      { type: 'RematchStarted', data: { battleId: REMATCH } },
    )
    expect(state.rematchWanted).toEqual([BOB, ALICE])
    expect(state.rematchBattleId).toBe(REMATCH)
  })
})

describe('cancelling', () => {
  test('the host can call it off', () => {
    const state = given(created('ffa'), joined(ALICE))
    expect(decide(state, { type: 'CancelBattle', actorId: ALICE })).toEqual([
      { type: 'BattleCancelled', data: {} },
    ])
  })

  test('nobody else can', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(() => decide(state, { type: 'CancelBattle', actorId: BOB })).toThrow(
      DomainError,
    )
  })

  test('a finished battle cannot be called off', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: BOB } },
      { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
    )
    expect(() => decide(state, { type: 'CancelBattle', actorId: ALICE })).toThrow(
      DomainError,
    )
  })

  test('but whoever runs the space can, without being in it', () => {
    /*
     * The second authority, and the reason it exists: the host is not always
     * there. A match opened by somebody who has since left the space sat in the
     * active list until the day-later sweep found it, and the only person who
     * could see the problem was an owner with no button.
     */
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(decide(state, { type: 'CancelBattle', actorId: BOB, asStaff: true })).toEqual([
      { type: 'BattleCancelled', data: {} },
    ])
  })

  test('and can end one that has already started', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
    expect(decide(state, { type: 'CancelBattle', actorId: BOB, asStaff: true })).toEqual([
      { type: 'BattleCancelled', data: {} },
    ])
  })

  test('cancelled and not ended, so it is nobody\'s win', () => {
    // The read model keeps the two apart: an ended match has a result and goes
    // in everybody's tally. A live game an owner closed is not a game anybody
    // won, and calling it one would put a result nobody played into the record.
    const state = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
    const events = decide(state, { type: 'CancelBattle', actorId: ALICE })
    expect(events.map((event) => event.type)).toEqual(['BattleCancelled'])
  })

  test('twice is once, so two owners pressing at the same moment is not a failure', () => {
    const state = given(created('ffa'), joined(ALICE), { type: 'BattleCancelled', data: {} })
    expect(decide(state, { type: 'CancelBattle', actorId: BOB, asStaff: true })).toEqual([])
  })

  test('a cancelled battle is one nobody can join', () => {
    const state = given(created('ffa'), joined(ALICE), { type: 'BattleCancelled', data: {} })
    expect(() =>
      decide(state, { type: 'JoinBattle', actorId: BOB, tenantId: HOST }),
    ).toThrow(DomainError)
  })
})

describe('evolve', () => {
  test('replays a whole match into its result', () => {
    const state = given(
      created('team'),
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      STARTED,
      { type: 'PlayerDefeated', data: { userId: BOB, by: ALICE } },
      { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
    )

    expect(state.status).toBe('ended')
    expect(state.winner).toEqual({ type: 'side', id: 'red' })
    expect(state.participants[BOB]?.defeated).toBe(true)
    expect(state.participants[ALICE]?.defeated).toBe(false)
  })

  test('a defeat for somebody not in the battle is ignored rather than fatal', () => {
    const state = given(created('ffa'), joined(ALICE), STARTED, {
      type: 'PlayerDefeated',
      data: { userId: DAVE },
    })
    expect(state.participants[DAVE]).toBeUndefined()
  })

  test('ignores unknown event types instead of throwing', () => {
    expect(
      evolve(initialBattleState, {
        type: 'SomethingFromTheFuture',
        data: {},
      } as unknown as BattleEvent),
    ).toEqual(initialBattleState)
  })
})

/**
 * Football, which is the one mode not decided by who is left standing.
 *
 * The tests worth having here are all about that difference: a knockout must not
 * end a match, the clock must not be jumpable, and a level scoreline has to come
 * out as a draw rather than being forced onto somebody.
 */
describe('football', () => {
  const SETTINGS = { durationMinutes: 5, damage: true, respawn: true }
  const GOAL_ONE = 'aaaaaaa1-0000-4000-8000-000000000001'
  const GOAL_TWO = 'aaaaaaa2-0000-4000-8000-000000000002'

  function footballCreated(
    settings: Partial<typeof SETTINGS> & { scoreLimit?: number } = {},
  ): BattleEvent {
    return {
      type: 'BattleCreated',
      data: {
        name: 'Friday five-a-side',
        mode: 'football',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: ALICE,
        football: { ...SETTINGS, ...settings },
      },
    }
  }

  const KICKED_OFF: BattleEvent = { type: 'BattleStarted', data: { at: KICKOFF } }

  /** A live match with one player on each side. */
  function live(settings: Parameters<typeof footballCreated>[0] = {}) {
    return given(
      footballCreated(settings),
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      KICKED_OFF,
    )
  }

  function goal(id: string, side: 'red' | 'blue'): BattleEvent {
    return { type: 'GoalScored', data: { id, side } }
  }

  describe('setting it up', () => {
    test('a football match records its settings', () => {
      const state = given(footballCreated({ scoreLimit: 3 }))
      expect(state.football).toEqual({ ...SETTINGS, scoreLimit: 3 })
    })

    test('a football match without a clock is refused', () => {
      expect(() =>
        decide(initialBattleState, {
          type: 'CreateBattle',
          actorId: ALICE,
          name: 'No clock',
          mode: 'football',
          worldId: ARENA,
          hostTenantId: HOST,
        }),
      ).toThrow(DomainError)
    })

    test('settings on a mode that has none are refused', () => {
      // A fact in the log that nothing will ever read is worse than an error,
      // because it looks like it means something.
      expect(() =>
        decide(initialBattleState, {
          type: 'CreateBattle',
          actorId: ALICE,
          name: 'Scrap with a clock',
          mode: 'ffa',
          worldId: ARENA,
          hostTenantId: HOST,
          football: SETTINGS,
        }),
      ).toThrow(DomainError)
    })

    test('a clock outside the three-to-ten range is refused', () => {
      for (const durationMinutes of [0, 2, 11, 90, 5.5]) {
        expect(() =>
          decide(initialBattleState, {
            type: 'CreateBattle',
            actorId: ALICE,
            name: 'Marathon',
            mode: 'football',
            worldId: ARENA,
            hostTenantId: HOST,
            football: { ...SETTINGS, durationMinutes },
          }),
        ).toThrow(DomainError)
      }
    })

    test('it needs two people, on two sides', () => {
      const alone = given(footballCreated(), joined(ALICE, 'red'))
      expect(() =>
        decide(alone, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
      ).toThrow(DomainError)

      const oneSided = given(footballCreated(), joined(ALICE, 'red'), joined(BOB, 'red'))
      expect(() =>
        decide(oneSided, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
      ).toThrow(DomainError)
    })

    test('starting it records the kickoff, so the clock can be derived', () => {
      const ready = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        atTheLine(ALICE),
        atTheLine(BOB),
      )
      expect(decide(ready, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toEqual([
        { type: 'BattleStarted', data: { at: KICKOFF } },
      ])
    })
  })

  describe('scoring', () => {
    test('a goal is recorded against the side that got it', () => {
      expect(
        decide(live(), { type: 'ReportGoal', actorId: ALICE, id: GOAL_ONE, side: 'red' }),
      ).toEqual([{ type: 'GoalScored', data: { id: GOAL_ONE, side: 'red' } }])
    })

    test('the scorer and an own goal are recorded when claimed', () => {
      expect(
        decide(live(), {
          type: 'ReportGoal',
          actorId: BOB,
          id: GOAL_ONE,
          side: 'red',
          by: BOB,
          ownGoal: true,
        }),
      ).toEqual([
        { type: 'GoalScored', data: { id: GOAL_ONE, side: 'red', by: BOB, ownGoal: true } },
      ])
    })

    test('somebody who is not in the match cannot report a goal in it', () => {
      expect(() =>
        decide(live(), { type: 'ReportGoal', actorId: DAVE, id: GOAL_ONE, side: 'red' }),
      ).toThrow(DomainError)
    })

    test('a losing player cannot score for the other side by minting fresh ids', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
      )
      // The dedup guard only stops a *redelivered* id, so it was never what kept
      // a spectator out - the roster check is.
      expect(() =>
        decide(state, { type: 'ReportGoal', actorId: DAVE, id: GOAL_TWO, side: 'red' }),
      ).toThrow(DomainError)
    })

    test('the score follows the goals', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        goal(GOAL_ONE, 'red'),
        goal(GOAL_TWO, 'blue'),
      )
      expect(state.score).toEqual({ red: 1, blue: 1 })
    })

    test('the same goal reported twice is only counted once', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        goal(GOAL_ONE, 'red'),
      )

      expect(
        decide(state, { type: 'ReportGoal', actorId: ALICE, id: GOAL_ONE, side: 'red' }),
      ).toEqual([])

      // And a duplicate already in the log does not move the score on replay,
      // which is the case the decider's guard cannot cover.
      expect(
        fold(battleDecider, [
          footballCreated(),
          joined(ALICE, 'red'),
          KICKED_OFF,
          goal(GOAL_ONE, 'red'),
          goal(GOAL_ONE, 'red'),
        ]).score,
      ).toEqual({ red: 1, blue: 0 })
    })

    test('a goal in a match with no ball is refused', () => {
      const scrap = given(created('team'), joined(ALICE, 'red'), joined(BOB, 'blue'), STARTED)
      expect(() =>
        decide(scrap, { type: 'ReportGoal', actorId: ALICE, id: GOAL_ONE, side: 'red' }),
      ).toThrow(DomainError)
    })

    test('a goal after the whistle is dropped rather than rejected', () => {
      // The reporter was mid-frame when the match ended; there is nothing for them
      // to correct.
      const over = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        { type: 'BattleEnded', data: { winner: null } },
      )
      expect(
        decide(over, { type: 'ReportGoal', actorId: ALICE, id: GOAL_ONE, side: 'red' }),
      ).toEqual([])
    })

    test('reaching the score target ends it in the same append', () => {
      const state = given(
        footballCreated({ scoreLimit: 2 }),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        goal(GOAL_ONE, 'red'),
      )

      expect(
        decide(state, { type: 'ReportGoal', actorId: ALICE, id: GOAL_TWO, side: 'red' }),
      ).toEqual([
        { type: 'GoalScored', data: { id: GOAL_TWO, side: 'red' } },
        { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
      ])
    })

    test('without a target, a goal never ends it', () => {
      const state = live()
      expect(
        decide(state, { type: 'ReportGoal', actorId: ALICE, id: GOAL_ONE, side: 'red' }),
      ).toHaveLength(1)
    })
  })

  describe('being knocked out', () => {
    test('a knockout is not recorded at all', () => {
      // The whole difference between football and the other three modes. Nothing
      // about being down is durable here - the goals already say how it went.
      expect(
        decide(live(), { type: 'ReportDefeat', actorId: ALICE, userId: ALICE }),
      ).toEqual([])
    })

    test('a knockout does not end the match', () => {
      // In a team match this exact sequence ends it, because blue would have
      // nobody standing. Here it must not.
      const state = live()
      const events = decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB })
      expect(events).toEqual([])
      expect(state.status).toBe('live')
    })

    test('the same sequence does end a team match, for contrast', () => {
      const team = given(created('team'), joined(ALICE, 'red'), joined(BOB, 'blue'), STARTED)
      expect(decide(team, { type: 'ReportDefeat', actorId: BOB, userId: BOB })).toEqual([
        { type: 'PlayerDefeated', data: { userId: BOB, by: undefined } },
        { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
      ])
    })
  })

  describe('walking out', () => {
    test('leaving is a departure, not a defeat', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        joined(CAROL, 'blue'),
        KICKED_OFF,
      )
      expect(decide(state, { type: 'LeaveBattle', actorId: CAROL })).toEqual([
        { type: 'PlayerLeft', data: { userId: CAROL } },
      ])
    })

    test('the last one out ends it on the score as it stands', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        KICKED_OFF,
        goal(GOAL_ONE, 'red'),
      )
      expect(decide(state, { type: 'LeaveBattle', actorId: ALICE })).toEqual([
        { type: 'PlayerLeft', data: { userId: ALICE } },
        { type: 'BattleEnded', data: { winner: { type: 'side', id: 'red' } } },
      ])
    })
  })

  describe('full time', () => {
    /** `now`, as an ISO string, this many seconds after the fixed kickoff. */
    function at(seconds: number): string {
      return new Date(Date.parse(KICKOFF) + seconds * 1000).toISOString()
    }

    test('cannot be called while there is time on the clock', () => {
      expect(() =>
        decide(live(), { type: 'CallFullTime', actorId: ALICE, now: at(60) }),
      ).toThrow(DomainError)
    })

    test('the side ahead wins when the clock runs out', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        goal(GOAL_ONE, 'blue'),
      )
      // Five minutes is 300 seconds.
      expect(
        decide(state, { type: 'CallFullTime', actorId: ALICE, now: at(300) }),
      ).toEqual([{ type: 'BattleEnded', data: { winner: { type: 'side', id: 'blue' } } }])
    })

    test('a level scoreline is a draw, not a win for somebody', () => {
      const state = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        goal(GOAL_ONE, 'red'),
        goal(GOAL_TWO, 'blue'),
      )
      expect(
        decide(state, { type: 'CallFullTime', actorId: BOB, now: at(301) }),
      ).toEqual([{ type: 'BattleEnded', data: { winner: null } }])
    })

    test('goalless at full time is a draw too', () => {
      expect(
        decide(live(), { type: 'CallFullTime', actorId: ALICE, now: at(400) }),
      ).toEqual([{ type: 'BattleEnded', data: { winner: null } }])
    })

    test('anybody in the match may call it, not just the host', () => {
      // The host may well have wandered off, and a match only they could end is one
      // that usually cannot be ended.
      expect(
        decide(live(), { type: 'CallFullTime', actorId: BOB, now: at(300) }),
      ).toEqual([{ type: 'BattleEnded', data: { winner: null } }])
    })

    test('calling it twice does nothing the second time', () => {
      const over = given(
        footballCreated(),
        joined(ALICE, 'red'),
        joined(BOB, 'blue'),
        KICKED_OFF,
        { type: 'BattleEnded', data: { winner: null } },
      )
      expect(
        decide(over, { type: 'CallFullTime', actorId: ALICE, now: at(600) }),
      ).toEqual([])
    })

    test('a mode with no clock cannot be brought to full time', () => {
      const scrap = given(created('team'), joined(ALICE, 'red'), joined(BOB, 'blue'), STARTED)
      expect(() =>
        decide(scrap, { type: 'CallFullTime', actorId: ALICE, now: at(600) }),
      ).toThrow(DomainError)
    })
  })
})

/**
 * A race.
 *
 * The mode where the result is an *order*, so most of what is worth pinning down
 * here is about the order: that it comes from the log rather than from a claim,
 * that it survives replay, and that the two ways a race ends - everybody home,
 * or the clock - both produce the same answer about who won.
 */
describe('race', () => {
  const SETTINGS = { durationMinutes: 5, damage: true }

  function raceCreated(settings: Partial<typeof SETTINGS> = {}): BattleEvent {
    return {
      type: 'BattleCreated',
      data: {
        name: 'Round the roof',
        mode: 'race',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: ALICE,
        race: { ...SETTINGS, ...settings },
      },
    }
  }

  const OFF: BattleEvent = { type: 'BattleStarted', data: { at: KICKOFF } }

  /** `now`, this many seconds after the fixed start. */
  function at(seconds: number): string {
    return new Date(Date.parse(KICKOFF) + seconds * 1000).toISOString()
  }

  /** A running race with three on the course. */
  function running() {
    return given(raceCreated(), joined(ALICE), joined(BOB), joined(CAROL), OFF)
  }

  function finish(userId: string, seconds: number) {
    return { type: 'ReportFinish' as const, actorId: userId, userId, now: at(seconds) }
  }

  describe('setting it up', () => {
    test('a race records its settings', () => {
      expect(given(raceCreated()).race).toEqual(SETTINGS)
    })

    test('a race without a time limit is refused', () => {
      expect(() =>
        decide(initialBattleState, {
          type: 'CreateBattle',
          actorId: ALICE,
          name: 'Round the roof',
          mode: 'race',
          worldId: ARENA,
          hostTenantId: HOST,
        }),
      ).toThrow(DomainError)
    })

    test('an unfinishable time limit is refused', () => {
      expect(() =>
        decide(initialBattleState, {
          type: 'CreateBattle',
          actorId: ALICE,
          name: 'Round the roof',
          mode: 'race',
          worldId: ARENA,
          hostTenantId: HOST,
          race: { durationMinutes: 90, damage: true },
        }),
      ).toThrow(DomainError)
    })

    test('race settings on a free-for-all are refused', () => {
      expect(() =>
        decide(initialBattleState, {
          type: 'CreateBattle',
          actorId: ALICE,
          name: 'Scrap',
          mode: 'ffa',
          worldId: ARENA,
          hostTenantId: HOST,
          race: SETTINGS,
        }),
      ).toThrow(DomainError)
    })

    test('there are no sides to pick', () => {
      expect(() =>
        decide(given(raceCreated()), {
          type: 'JoinBattle',
          actorId: BOB,
          tenantId: HOST,
          side: 'red',
        }),
      ).toThrow(DomainError)
    })

    test('the start is recorded, because every time is measured from it', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        atTheLine(ALICE),
        atTheLine(BOB),
      )
      expect(
        decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
      ).toEqual([{ type: 'BattleStarted', data: { at: KICKOFF } }])
    })
  })

  describe('getting home', () => {
    test('the first one home is first, and the time comes from the server', () => {
      expect(decide(running(), finish(BOB, 42))).toEqual([
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
      ])
    })

    test('the next one home is second', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        joined(CAROL),
        OFF,
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
      )
      expect(decide(state, finish(ALICE, 55))).toEqual([
        { type: 'RacerFinished', data: { userId: ALICE, place: 2, seconds: 55 } },
      ])
    })

    test('crossing again records nothing', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        joined(CAROL),
        OFF,
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
      )
      expect(decide(state, finish(BOB, 44))).toEqual([])
    })

    test('somebody who is not in the race cannot finish it', () => {
      expect(() => decide(running(), finish(DAVE, 30))).toThrow(DomainError)
    })

    test('a finish reported after the flag is dropped, not rejected', () => {
      const over = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
      )
      expect(decide(over, finish(BOB, 90))).toEqual([])
    })

    test('there is nothing to run to in a free-for-all', () => {
      const scrap = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
      expect(() => decide(scrap, finish(BOB, 30))).toThrow(DomainError)
    })

    test('the last one home ends it, in the same append', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
      )

      expect(decide(state, finish(ALICE, 61))).toEqual([
        { type: 'RacerFinished', data: { userId: ALICE, place: 2, seconds: 61 } },
        { type: 'BattleEnded', data: { winner: { type: 'player', id: BOB } } },
      ])
    })

    test('the field is not held on the line by somebody who is still running', () => {
      const state = given(raceCreated(), joined(ALICE), joined(BOB), joined(CAROL), OFF)
      expect(decide(state, finish(BOB, 42))).toHaveLength(1)
    })
  })

  describe('being knocked out', () => {
    test('is not recorded - you restart, and that is the cost', () => {
      const state = running()
      expect(decide(state, { type: 'ReportDefeat', actorId: BOB, userId: BOB })).toEqual([])
    })

    test('so the first knockout cannot end the race', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        // Even if a defeat somehow reached the log, it decides nothing here.
        { type: 'PlayerDefeated', data: { userId: BOB } },
      )
      expect(state.status).toBe('live')
    })
  })

  describe('giving up', () => {
    test('is a departure, not a defeat', () => {
      expect(decide(running(), { type: 'LeaveBattle', actorId: BOB })).toEqual([
        { type: 'PlayerLeft', data: { userId: BOB } },
      ])
    })

    test('stops holding up everybody who is already home', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        { type: 'RacerFinished', data: { userId: ALICE, place: 1, seconds: 30 } },
      )

      expect(decide(state, { type: 'LeaveBattle', actorId: BOB })).toEqual([
        { type: 'PlayerLeft', data: { userId: BOB } },
        { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
      ])
    })

    test('the last one out ends it on the places so far', () => {
      // Nobody got home, so nobody won - which is a truer answer than handing it
      // to whoever was furthest along, a thing this stream does not know anyway.
      const alone = given(raceCreated(), joined(ALICE), OFF)
      expect(decide(alone, { type: 'LeaveBattle', actorId: ALICE })).toEqual([
        { type: 'PlayerLeft', data: { userId: ALICE } },
        { type: 'BattleEnded', data: { winner: null } },
      ])
    })
  })

  describe('the time limit', () => {
    test('cannot be called while there is time left', () => {
      expect(() =>
        decide(running(), { type: 'CallFullTime', actorId: ALICE, now: at(60) }),
      ).toThrow(DomainError)
    })

    test('ends it on the places, with the leader taking it', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        joined(CAROL),
        OFF,
        { type: 'RacerFinished', data: { userId: CAROL, place: 1, seconds: 120 } },
      )

      expect(
        decide(state, { type: 'CallFullTime', actorId: ALICE, now: at(300) }),
      ).toEqual([
        { type: 'BattleEnded', data: { winner: { type: 'player', id: CAROL } } },
      ])
    })

    test('a course nobody managed ends with nobody winning', () => {
      expect(
        decide(running(), { type: 'CallFullTime', actorId: ALICE, now: at(300) }),
      ).toEqual([{ type: 'BattleEnded', data: { winner: null } }])
    })
  })

  describe('replay', () => {
    test('the places are the sum of the finishes, in order', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
        { type: 'RacerFinished', data: { userId: ALICE, place: 2, seconds: 61 } },
      )

      expect(state.finishers).toEqual([
        { userId: BOB, place: 1, seconds: 42 },
        { userId: ALICE, place: 2, seconds: 61 },
      ])
    })

    test('a redelivered finish does not renumber the podium', () => {
      const state = given(
        raceCreated(),
        joined(ALICE),
        joined(BOB),
        OFF,
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
        { type: 'RacerFinished', data: { userId: BOB, place: 1, seconds: 42 } },
      )

      expect(state.finishers).toHaveLength(1)
    })
  })
})

/**
 * A match fought inside an XP rather than in a world.
 *
 * The field is optional and every match ever created is missing it, which is the
 * property worth pinning: an event that has already happened is not going to
 * grow one, so a decider that needed it would be a decider that cannot replay
 * its own history.
 */
describe('an XP match', () => {
  test('carries the document id, and still has a world', () => {
    const events = battleDecider.decide(battleDecider.initialState, {
      type: 'CreateBattle',
      actorId: HOST,
      name: 'Range day',
      mode: 'ffa',
      worldId: ARENA,
      hostTenantId: HOST,
      xpId: 'shooter',
    })

    expect(events).toHaveLength(1)
    const created = events[0] as { type: string; data: Record<string, unknown> }
    expect(created.data.xpId).toBe('shooter')
    // Both, not either: the roster, the RLS and the scoring all reach for the
    // world, and a match without one would be a second shape for each of them.
    expect(created.data.worldId).toBe(ARENA)
  })

  test('a match in a world does not grow the field', () => {
    const events = battleDecider.decide(battleDecider.initialState, {
      type: 'CreateBattle',
      actorId: HOST,
      name: 'Ordinary',
      mode: 'ffa',
      worldId: ARENA,
      hostTenantId: HOST,
    })
    const created = events[0] as { type: string; data: Record<string, unknown> }
    // Absent rather than null: `JSON.stringify` keeps an explicit undefined out
    // of the payload but an explicit null in, and a stored event is compared
    // against other stored events.
    expect('xpId' in created.data).toBe(false)
  })

  test('an old event replays into a state that says so', () => {
    const state = battleDecider.evolve(battleDecider.initialState, {
      type: 'BattleCreated',
      data: {
        name: 'From before',
        mode: 'ffa',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: HOST,
      },
    } as never)
    expect(state.xpId).toBeNull()
  })
})

/**
 * The day-later backstop.
 *
 * Every clock here is explicit: `openedAt` and `now` both come in on the
 * command, because the state holds no creation time and the decider reads no
 * clock of its own - which is exactly what makes this testable without moving
 * time.
 */
describe('abandoning a match nobody came back to', () => {
  const OPENED = '2026-08-04T09:00:00.000Z'
  const KICKED_OFF: BattleEvent = { type: 'BattleStarted', data: { at: KICKOFF } }

  /** `now`, this many hours after whichever clock is being tested against. */
  function hoursAfter(from: string, hours: number): string {
    return new Date(Date.parse(from) + hours * 3_600_000).toISOString()
  }

  function abandon(now: string) {
    return { type: 'AbandonBattle', now, openedAt: OPENED } as const
  }

  test('a young match is left alone', () => {
    const state = given(created('ffa'), joined(BOB), KICKED_OFF)
    expect(() => decide(state, abandon(hoursAfter(KICKOFF, 23)))).toThrow(DomainError)
  })

  test('a match that never started is called off rather than ended', () => {
    // Nothing happened, so there is no result - and recording one would put a
    // game nobody attended into everybody's tally.
    expect(
      decide(given(created('ffa'), joined(BOB)), abandon(hoursAfter(OPENED, 25))),
    ).toEqual([{ type: 'BattleCancelled', data: {} }])
  })

  /**
   * The trap this rule exists for.
   *
   * A match can sit open for days and then kick off - and reading the opening
   * time for a live match would close it out from under the people standing in
   * it, thirty seconds after the whistle.
   */
  test('a match that kicked off recently survives an old opening', () => {
    const state = given(created('ffa'), joined(BOB), KICKED_OFF)
    // Two days after it was opened, one hour after it actually started.
    expect(() => decide(state, abandon(hoursAfter(KICKOFF, 1)))).toThrow(DomainError)
  })

  test('an abandoned football match keeps the score as it stood', () => {
    const football: BattleEvent = {
      type: 'BattleCreated',
      data: {
        name: 'Friday five-a-side',
        mode: 'football',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: ALICE,
        football: { durationMinutes: 5, damage: true, respawn: true },
      },
    }

    const state = given(
      football,
      joined(ALICE, 'red'),
      joined(BOB, 'blue'),
      KICKED_OFF,
      {
        type: 'GoalScored',
        data: { id: 'aaaaaaa1-0000-4000-8000-000000000001', side: 'blue' },
      },
    )

    expect(decide(state, abandon(hoursAfter(KICKOFF, 24)))).toEqual([
      {
        type: 'BattleEnded',
        data: { winner: { type: 'side', id: 'blue' }, abandoned: true },
      },
    ])
  })

  /**
   * No winner is invented out of who happened to still be standing.
   *
   * An elimination match is decided by the last player alive, and in one nobody
   * finished there is no such player - so the honest result is a match that
   * ended with nobody having won it.
   */
  test('an abandoned free-for-all ends with no winner', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), KICKED_OFF)

    expect(decide(state, abandon(hoursAfter(KICKOFF, 40)))).toEqual([
      { type: 'BattleEnded', data: { winner: null, abandoned: true } },
    ])
  })

  test('sweeping one that is already closed does nothing rather than failing', () => {
    // Two visitors can sweep at the same moment, and the loser of that race
    // must not be an error somebody has to look at.
    const state = given(
      created('ffa'),
      joined(BOB),
      KICKED_OFF,
      { type: 'BattleEnded', data: { winner: null } },
    )

    expect(decide(state, abandon(hoursAfter(KICKOFF, 40)))).toEqual([])
  })
})

/**
 * The ready sign, and the level's own floor under it.
 *
 * Reported as *"it started also without two people in"*, and the fix has two
 * halves that are easy to confuse. The roster says who is *in* the match; this
 * says who is at the line. A world still loading is the gap between them, and
 * counting the roster is what let a match kick off into it.
 */
describe('the ready gate', () => {
  const XP = 'first-room'

  function xpCreated(players?: { min: number; max: number }): BattleEvent {
    return {
      type: 'BattleCreated',
      data: {
        name: 'Inside a level',
        mode: 'ffa',
        worldId: ARENA,
        xpId: XP,
        ...(players ? { xpRules: { preset: 'freestyle' as const, players } } : {}),
        hostTenantId: HOST,
        createdBy: ALICE,
      },
    }
  }

  test('a full roster with nobody at the line will not start', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(() =>
      decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
    ).toThrow(DomainError)
  })

  test('one of two ready is still not a match', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB), atTheLine(ALICE))
    expect(() =>
      decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
    ).toThrow(DomainError)
  })

  test('saying it twice appends nothing, so a double tap is harmless', () => {
    const state = given(created('ffa'), joined(ALICE), atTheLine(ALICE))
    expect(decide(state, { type: 'SetReady', actorId: ALICE, ready: true })).toEqual([])
  })

  test('it can be taken back', () => {
    const state = given(created('ffa'), joined(ALICE), atTheLine(ALICE))
    expect(decide(state, { type: 'SetReady', actorId: ALICE, ready: false })).toEqual([
      { type: 'PlayerReady', data: { userId: ALICE, ready: false } },
    ])
  })

  test('somebody who is not in the match has no say', () => {
    expect(() =>
      decide(given(created('ffa'), joined(ALICE)), {
        type: 'SetReady',
        actorId: BOB,
        ready: true,
      }),
    ).toThrow(DomainError)
  })

  /**
   * The tick leaves with the person. Without this a lobby that emptied out
   * would keep a start button lit for people who are not there.
   */
  test('leaving takes the ready sign with it', () => {
    const state = given(
      created('ffa'),
      joined(ALICE),
      joined(BOB),
      atTheLine(ALICE),
      atTheLine(BOB),
      { type: 'PlayerLeft', data: { userId: BOB } },
    )
    expect(state.ready).toEqual([ALICE])
  })

  /**
   * The whole reason `players.min` is in the format - docs/xp/backlog.md §3:
   * a game needing four that starts with two is broken in a way the runtime can
   * detect and say something about.
   */
  test('a level for four will not start with three at the line', () => {
    const three = given(
      xpCreated({ min: 4, max: 8 }),
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      atTheLine(ALICE),
      atTheLine(BOB),
      atTheLine(CAROL),
    )
    expect(() =>
      decide(three, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
    ).toThrow(DomainError)

    const four = given(
      xpCreated({ min: 4, max: 8 }),
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      joined(DAVE),
      atTheLine(ALICE),
      atTheLine(BOB),
      atTheLine(CAROL),
      atTheLine(DAVE),
    )
    expect(decide(four, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toEqual([
      { type: 'BattleStarted', data: {} },
    ])
  })

  /** A level for one still needs somebody to play against, here. */
  test('a level for one does not lower this app’s own floor', () => {
    const alone = given(xpCreated({ min: 1, max: 4 }), joined(ALICE), atTheLine(ALICE))
    expect(() =>
      decide(alone, { type: 'StartBattle', actorId: ALICE, at: KICKOFF }),
    ).toThrow(DomainError)
  })

  test('a level for two seats two, and turns the third away', () => {
    const full = given(xpCreated({ min: 2, max: 2 }), joined(ALICE), joined(BOB))
    expect(() =>
      decide(full, { type: 'JoinBattle', actorId: CAROL, tenantId: HOST }),
    ).toThrow(DomainError)
  })

  test('nobody is ready once there is nothing to be ready for', () => {
    const live = given(created('ffa'), joined(ALICE), joined(BOB), STARTED)
    expect(() =>
      decide(live, { type: 'SetReady', actorId: ALICE, ready: true }),
    ).toThrow(DomainError)
  })
})

/**
 * A match may override the level it is fought in.
 *
 * Asked for as *"we need to also override the document for a custom match"*.
 * The block lands on the match and never on the document - see `XpMatchRules`
 * and `applyMatchRules`.
 */
describe('the rules a match settled on', () => {
  const RULES = {
    preset: 'deathmatch' as const,
    scoreLimit: 20,
    players: { min: 2, max: 6 },
  }

  test('it is written down beside the level', () => {
    const events = decide(initialBattleState, {
      type: 'CreateBattle',
      actorId: ALICE,
      name: 'Custom',
      mode: 'ffa',
      worldId: ARENA,
      xpId: 'first-room',
      xpRules: RULES,
      hostTenantId: HOST,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'BattleCreated',
      data: { xpId: 'first-room', xpRules: RULES },
    })
  })

  /**
   * Refused rather than dropped, like the two settings blocks beside it: a fact
   * in the log nothing will ever read is worse than an error, because it looks
   * like it means something.
   */
  test('a match with no level has nothing to override', () => {
    expect(() =>
      decide(initialBattleState, {
        type: 'CreateBattle',
        actorId: ALICE,
        name: 'Custom',
        mode: 'ffa',
        worldId: ARENA,
        xpRules: RULES,
        hostTenantId: HOST,
      }),
    ).toThrow(DomainError)
  })

  test('a cap wider than a battle holds is refused on the way into the log', () => {
    expect(() =>
      decide(initialBattleState, {
        type: 'CreateBattle',
        actorId: ALICE,
        name: 'Custom',
        mode: 'ffa',
        worldId: ARENA,
        xpId: 'first-room',
        xpRules: { preset: 'freestyle', players: { min: 2, max: 99 } },
        hostTenantId: HOST,
      }),
    ).toThrow(DomainError)
  })

  test('a crossed pair is refused', () => {
    expect(() =>
      decide(initialBattleState, {
        type: 'CreateBattle',
        actorId: ALICE,
        name: 'Custom',
        mode: 'ffa',
        worldId: ARENA,
        xpId: 'first-room',
        xpRules: { preset: 'freestyle', players: { min: 5, max: 2 } },
        hostTenantId: HOST,
      }),
    ).toThrow(DomainError)
  })

  test('a match created before any of this reads as the level’s own', () => {
    expect(given(created('ffa')).xpRules).toBeNull()
  })
})

/**
 * The whistle, when whoever set the match up has walked out.
 *
 * Reported as "leaving as owner closes the match". It never cancelled one -
 * that only happens when the lobby empties - but a lobby whose host has gone
 * could not be started by anybody left in it, which is closed in every sense
 * that matters to somebody standing in it.
 */
describe('starting it once the host has gone', () => {
  const opened: BattleEvent = {
    type: 'BattleCreated',
    data: {
      name: 'Friday',
      mode: 'ffa',
      worldId: ARENA,
      hostTenantId: HOST,
      createdBy: ALICE,
    },
  }

  test('the host keeps it while they are in it', () => {
    const state = given(opened, joined(ALICE), joined(BOB), atTheLine(ALICE), atTheLine(BOB))
    expect(() =>
      decide(state, { type: 'StartBattle', actorId: BOB, at: KICKOFF }),
    ).toThrow('Only whoever set this up can start it')
    expect(decide(state, { type: 'StartBattle', actorId: ALICE, at: KICKOFF })).toHaveLength(1)
  })

  test('and once they leave, anybody still in it can', () => {
    const state = given(
      opened,
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      atTheLine(BOB),
      atTheLine(CAROL),
      { type: 'PlayerLeft', data: { userId: ALICE } },
    )
    expect(decide(state, { type: 'StartBattle', actorId: BOB, at: KICKOFF })).toHaveLength(1)
  })

  test('but somebody who is not in it still cannot', () => {
    // Being outside a match is not a seat at it, whoever has left.
    const state = given(
      opened,
      joined(ALICE),
      joined(BOB),
      joined(CAROL),
      atTheLine(BOB),
      atTheLine(CAROL),
      { type: 'PlayerLeft', data: { userId: ALICE } },
    )
    expect(() =>
      decide(state, { type: 'StartBattle', actorId: DAVE, at: KICKOFF }),
    ).toThrow('Only somebody in the match can start it')
  })

  test('and the last one out still closes it, because nobody attended', () => {
    const state = given(opened, joined(ALICE))
    expect(decide(state, { type: 'LeaveBattle', actorId: ALICE })).toEqual([
      { type: 'PlayerLeft', data: { userId: ALICE } },
      { type: 'BattleCancelled', data: {} },
    ])
  })
})

/**
 * Restarting one that is still being played.
 *
 * The case is a four-player game somebody has walked out of: what is left is
 * not a match anybody wants to finish, and the alternative to this was all four
 * leaving and setting the whole thing up again from the lobby.
 */
describe('restarting a match in progress', () => {
  const AGAIN = '66666666-6666-4666-8666-666666666666'

  const live = [created('ffa'), joined(ALICE), joined(BOB), joined(CAROL), STARTED]

  test('it points at the new one and calls this one off, in that order', () => {
    expect(
      decide(given(...live), { type: 'RestartBattle', actorId: ALICE, battleId: AGAIN }),
    ).toEqual([
      { type: 'RematchStarted', data: { battleId: AGAIN } },
      { type: 'BattleCancelled', data: {} },
    ])
  })

  /** Cancelled rather than ended: a match nobody finished is a match nobody won. */
  test('the match it leaves behind has no result', () => {
    const state = fold(battleDecider, [
      ...live,
      { type: 'RematchStarted', data: { battleId: AGAIN } },
      { type: 'BattleCancelled', data: {} },
    ])
    expect(state.status).toBe('cancelled')
    expect(state.winner).toBeNull()
    expect(state.rematchBattleId).toBe(AGAIN)
  })

  test('a lobby can be restarted too, before anybody has kicked off', () => {
    const state = given(created('ffa'), joined(ALICE), joined(BOB))
    expect(
      decide(state, { type: 'RestartBattle', actorId: ALICE, battleId: AGAIN }),
    ).toHaveLength(2)
  })

  test('whoever runs the space can, without being in it', () => {
    expect(
      decide(given(...live), {
        type: 'RestartBattle',
        actorId: DAVE,
        battleId: AGAIN,
        asStaff: true,
      }),
    ).toHaveLength(2)
  })

  test('somebody else in the match cannot, while the host is still here', () => {
    expect(() =>
      decide(given(...live), { type: 'RestartBattle', actorId: BOB, battleId: AGAIN }),
    ).toThrow(DomainError)
  })

  /**
   * The whole point of the button: the person who set the match up may be the
   * very one who has just dropped out.
   */
  test('once the host has gone, anybody left in it can', () => {
    const state = given(...live, { type: 'PlayerLeft', data: { userId: ALICE } })
    expect(
      decide(state, { type: 'RestartBattle', actorId: BOB, battleId: AGAIN }),
    ).toHaveLength(2)
  })

  test('but a passer-by still cannot', () => {
    const state = given(...live, { type: 'PlayerLeft', data: { userId: ALICE } })
    expect(() =>
      decide(state, { type: 'RestartBattle', actorId: DAVE, battleId: AGAIN }),
    ).toThrow(DomainError)
  })

  test('two people pressing at once is one restart and one place to go', () => {
    const state = given(
      ...live,
      { type: 'RematchStarted', data: { battleId: AGAIN } },
      { type: 'BattleCancelled', data: {} },
    )
    expect(
      decide(state, { type: 'RestartBattle', actorId: ALICE, battleId: 'another' }),
    ).toEqual([])
  })

  /**
   * A match somebody called off leaves everybody in it with nowhere to go,
   * which is the situation this command exists to fix - so it still writes the
   * pointer, and does not cancel what is already cancelled.
   */
  test('a called-off match can still be pointed at a new one', () => {
    const state = given(...live, { type: 'BattleCancelled', data: {} })
    expect(
      decide(state, { type: 'RestartBattle', actorId: ALICE, battleId: AGAIN }),
    ).toEqual([{ type: 'RematchStarted', data: { battleId: AGAIN } }])
  })

  /** A match that was played out has a result, and a rematch is how it goes again. */
  test('a finished match is refused, and told where to go instead', () => {
    const state = given(
      ...live,
      { type: 'PlayerDefeated', data: { userId: BOB } },
      { type: 'PlayerDefeated', data: { userId: CAROL } },
      { type: 'BattleEnded', data: { winner: { type: 'player', id: ALICE } } },
    )
    expect(state.status).toBe('ended')
    expect(() =>
      decide(state, { type: 'RestartBattle', actorId: ALICE, battleId: AGAIN }),
    ).toThrow('ask for a rematch')
  })

  test('a match that does not exist is not found', () => {
    expect(() =>
      decide(initialBattleState, {
        type: 'RestartBattle',
        actorId: ALICE,
        battleId: AGAIN,
      }),
    ).toThrow(DomainError)
  })
})
