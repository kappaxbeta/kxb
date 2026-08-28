import { describe, expect, test } from 'bun:test'
import {
  decide,
  evolve,
  initialTournamentState,
  tournamentDecider,
} from '@/domain/tournament/aggregate'
import type { TournamentEvent } from '@/domain/tournament/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ARENA = '99999999-9999-4999-8999-999999999999'
const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'
const DAVE = '44444444-4444-4444-8444-444444444444'

function given(...events: TournamentEvent[]) {
  return fold(tournamentDecider, events)
}

const created: TournamentEvent = {
  type: 'TournamentCreated',
  data: {
    name: 'Summer cup',
    mode: 'ffa',
    worldId: ARENA,
    hostTenantId: HOST,
    createdBy: ALICE,
  },
}

function entered(entrantId: string): TournamentEvent {
  return { type: 'EntrantRegistered', data: { entrantId, tenantId: HOST } }
}

const STARTED: TournamentEvent = { type: 'TournamentStarted', data: {} }

describe('entering', () => {
  test('records an entrant and their space', () => {
    expect(
      decide(given(created), { type: 'RegisterEntrant', actorId: BOB, tenantId: HOST }),
    ).toEqual([{ type: 'EntrantRegistered', data: { entrantId: BOB, tenantId: HOST } }])
  })

  test('entering twice is a no-op', () => {
    expect(
      decide(given(created, entered(BOB)), {
        type: 'RegisterEntrant',
        actorId: BOB,
        tenantId: HOST,
      }),
    ).toEqual([])
  })

  test('nobody enters once it has started', () => {
    const state = given(created, entered(ALICE), entered(BOB), STARTED)
    expect(() =>
      decide(state, { type: 'RegisterEntrant', actorId: CAROL, tenantId: HOST }),
    ).toThrow(DomainError)
  })

  test('withdrawing before the start removes you', () => {
    expect(
      decide(given(created, entered(BOB)), { type: 'WithdrawEntrant', actorId: BOB }),
    ).toEqual([{ type: 'EntrantWithdrew', data: { entrantId: BOB } }])
  })
})

describe('starting', () => {
  test('only the host may start it', () => {
    const state = given(created, entered(ALICE), entered(BOB))
    expect(() => decide(state, { type: 'StartTournament', actorId: BOB })).toThrow(
      DomainError,
    )
  })

  test('one entrant is not a tournament', () => {
    const state = given(created, entered(ALICE))
    expect(() => decide(state, { type: 'StartTournament', actorId: ALICE })).toThrow(
      DomainError,
    )
  })

  test('starting builds the bracket', () => {
    const state = given(created, entered(ALICE), entered(BOB), entered(CAROL))
    expect(decide(state, { type: 'StartTournament', actorId: ALICE })).toEqual([
      { type: 'TournamentStarted', data: {} },
    ])

    const live = evolve(state, { type: 'TournamentStarted', data: {} })
    // Three entrants: a bracket of four, so two opening matches, one a bye.
    expect(live.rounds[0]).toHaveLength(2)
  })
})

describe('results', () => {
  const live = given(created, entered(ALICE), entered(BOB), entered(CAROL), entered(DAVE), STARTED)

  test('a winner has to be in the match', () => {
    expect(() =>
      decide(live, {
        type: 'RecordMatchResult',
        actorId: ALICE,
        round: 0,
        match: 0,
        winner: 'somebody-else',
      }),
    ).toThrow(DomainError)
  })

  test('recording the same match twice is a no-op', () => {
    const first = live.rounds[0]![0]!
    const after = evolve(live, {
      type: 'MatchResultRecorded',
      data: { round: 0, match: 0, winner: first.a! },
    })

    expect(
      decide(after, {
        type: 'RecordMatchResult',
        actorId: ALICE,
        round: 0,
        match: 0,
        winner: first.b!,
      }),
    ).toEqual([])
  })

  /**
   * The bracket is derived, so recording a result has to make the next round
   * appear without anybody commanding it into existence.
   */
  test('deciding a round unrolls the next one', () => {
    let state = live
    for (const [index, match] of state.rounds[0]!.entries()) {
      state = evolve(state, {
        type: 'MatchResultRecorded',
        data: { round: 0, match: index, winner: match.a! },
      })
    }

    expect(state.rounds).toHaveLength(2)
    expect(state.rounds[1]).toHaveLength(1)
  })

  test('the final result completes the tournament in the same append', () => {
    let state = live
    for (const [index, match] of state.rounds[0]!.entries()) {
      state = evolve(state, {
        type: 'MatchResultRecorded',
        data: { round: 0, match: index, winner: match.a! },
      })
    }

    const final = state.rounds[1]![0]!
    const events = decide(state, {
      type: 'RecordMatchResult',
      actorId: ALICE,
      round: 1,
      match: 0,
      winner: final.a!,
    })

    expect(events).toEqual([
      { type: 'MatchResultRecorded', data: { round: 1, match: 0, winner: final.a! } },
      { type: 'TournamentCompleted', data: { winner: final.a! } },
    ])
  })
})

describe('match battles', () => {
  const live = given(created, entered(ALICE), entered(BOB), STARTED)

  test('attaching a battle to a ready match', () => {
    expect(
      decide(live, {
        type: 'AttachMatchBattle',
        actorId: ALICE,
        round: 0,
        match: 0,
        battleId: ARENA,
      }),
    ).toEqual([
      { type: 'MatchBattleCreated', data: { round: 0, match: 0, battleId: ARENA } },
    ])
  })

  /** Otherwise one match could be fought twice and reported twice. */
  test('a match that already has a battle keeps it', () => {
    const after = evolve(live, {
      type: 'MatchBattleCreated',
      data: { round: 0, match: 0, battleId: ARENA },
    })
    expect(
      decide(after, {
        type: 'AttachMatchBattle',
        actorId: ALICE,
        round: 0,
        match: 0,
        battleId: 'another',
      }),
    ).toEqual([])
  })

  test('a match that does not exist cannot get one', () => {
    expect(() =>
      decide(live, {
        type: 'AttachMatchBattle',
        actorId: ALICE,
        round: 5,
        match: 0,
        battleId: ARENA,
      }),
    ).toThrow(DomainError)
  })
})

describe('replaying a match that decided nothing', () => {
  const attached = given(created, entered(ALICE), entered(BOB), STARTED, {
    type: 'MatchBattleCreated',
    data: { round: 0, match: 0, battleId: ARENA },
  })

  test('lets the battle go, so a fresh one can be attached', () => {
    expect(
      decide(attached, { type: 'ReplayMatch', actorId: ALICE, round: 0, match: 0 }),
    ).toEqual([
      { type: 'MatchBattleDetached', data: { round: 0, match: 0, battleId: ARENA } },
    ])
  })

  /** The deadlock this exists to break: a slot could never take a second battle. */
  test('and the slot then accepts one', () => {
    const free = given(
      created,
      entered(ALICE),
      entered(BOB),
      STARTED,
      { type: 'MatchBattleCreated', data: { round: 0, match: 0, battleId: ARENA } },
      { type: 'MatchBattleDetached', data: { round: 0, match: 0, battleId: ARENA } },
    )
    expect(free.rounds[0]?.[0]?.battleId).toBe(null)
    expect(
      decide(free, {
        type: 'AttachMatchBattle',
        actorId: ALICE,
        round: 0,
        match: 0,
        battleId: HOST,
      }),
    ).toEqual([
      { type: 'MatchBattleCreated', data: { round: 0, match: 0, battleId: HOST } },
    ])
  })

  test('a decided match cannot be replayed - the rounds after it are built on it', () => {
    const decidedMatch = given(
      created,
      entered(ALICE),
      entered(BOB),
      STARTED,
      { type: 'MatchBattleCreated', data: { round: 0, match: 0, battleId: ARENA } },
      { type: 'MatchResultRecorded', data: { round: 0, match: 0, winner: ALICE } },
    )
    expect(() =>
      decide(decidedMatch, { type: 'ReplayMatch', actorId: ALICE, round: 0, match: 0 }),
    ).toThrow(DomainError)
  })

  test('only the host can order one', () => {
    expect(() =>
      decide(attached, { type: 'ReplayMatch', actorId: BOB, round: 0, match: 0 }),
    ).toThrow(DomainError)
  })

  test('a slot with no battle has nothing to let go of', () => {
    const live = given(created, entered(ALICE), entered(BOB), STARTED)
    expect(
      decide(live, { type: 'ReplayMatch', actorId: ALICE, round: 0, match: 0 }),
    ).toEqual([])
  })
})

describe('the match format', () => {
  test('is recorded on the stream, so every match can carry it', () => {
    const football = given({
      type: 'TournamentCreated',
      data: {
        name: 'Cup',
        mode: 'football',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: ALICE,
        football: { durationMinutes: 5, damage: true, respawn: true },
      },
    })
    expect(football.football).toEqual({
      durationMinutes: 5,
      damage: true,
      respawn: true,
    })
  })

  test('is absent on a bracket created before it existed', () => {
    expect(given(created).football).toBeUndefined()
  })

  /**
   * A race bracket, which was unreachable rather than unbuilt.
   *
   * `createTournament` wrote the settings, `playMatch` read them back and handed
   * them to `createBattle`, and the events type carried them - and the setup
   * form's mode list was four long, so the branch that settles a bracket's race
   * format had never run. This is the state that branch produces, pinned so the
   * next person to shorten a picker finds out here.
   */
  test('a race bracket carries the format its matches are run under', () => {
    const race = given({
      type: 'TournamentCreated',
      data: {
        name: 'Time trial',
        mode: 'race',
        worldId: ARENA,
        hostTenantId: HOST,
        createdBy: ALICE,
        race: { durationMinutes: 10, damage: false },
      },
    })
    expect(race.mode).toBe('race')
    expect(race.race).toEqual({ durationMinutes: 10, damage: false })
    // And no football settings, because a bracket is one format or the other.
    expect(race.football).toBeUndefined()
  })
})

/**
 * A bracket can be fought inside a level, and the ground is exclusive.
 *
 * The state matters more than it looks: `playMatch` reads `xpId` to decide
 * whether to name an arena at all, and `mode` to hand the two entrants a side.
 * A bracket whose stored mode disagreed with the matches it stages would hand
 * somebody a side the battle then refuses - which is why the mode is resolved
 * from the document once, here, rather than per round.
 */
describe('the ground', () => {
  const inLevel: TournamentEvent = {
    type: 'TournamentCreated',
    data: {
      name: 'Corridor cup',
      // What `battleModeFor` read off the document, not what a form asked for.
      mode: 'team',
      // Filled in with the host's own space, exactly as an XP match stores it.
      worldId: HOST,
      xpId: 'corridor',
      hostTenantId: HOST,
      createdBy: ALICE,
    },
  }

  test('a level is carried onto the state, beside the world', () => {
    const state = given(inLevel)
    expect(state.xpId).toBe('corridor')
    expect(state.worldId).toBe(HOST)
    expect(state.mode).toBe('team')
  })

  test('a bracket on an arena has none, which is every one fought so far', () => {
    expect(given(created).xpId).toBeUndefined()
    expect(given(created).worldId).toBe(ARENA)
  })

  test('and the sides a round hands out follow the stored mode', () => {
    // Not asserted through `playMatch`, which needs a database - this is the
    // fact that call reads, and the one that breaks if the mode is re-derived
    // per round rather than settled at creation.
    expect(given(inLevel).mode).toBe('team')
    expect(given(created).mode).toBe('ffa')
  })
})

describe('evolve', () => {
  test('rebuilds the bracket from results alone on replay', () => {
    const state = given(
      created,
      entered(ALICE),
      entered(BOB),
      entered(CAROL),
      entered(DAVE),
      STARTED,
      { type: 'MatchResultRecorded', data: { round: 0, match: 0, winner: ALICE } },
      { type: 'MatchResultRecorded', data: { round: 0, match: 1, winner: BOB } },
      { type: 'MatchResultRecorded', data: { round: 1, match: 0, winner: ALICE } },
      { type: 'TournamentCompleted', data: { winner: ALICE } },
    )

    expect(state.status).toBe('ended')
    expect(state.winner).toBe(ALICE)
    expect(state.rounds).toHaveLength(2)
  })

  test('a result for a match that does not exist is ignored rather than fatal', () => {
    const state = given(created, entered(ALICE), entered(BOB), STARTED, {
      type: 'MatchResultRecorded',
      data: { round: 9, match: 9, winner: ALICE },
    })
    expect(state.status).toBe('live')
  })

  test('ignores unknown event types instead of throwing', () => {
    expect(
      evolve(initialTournamentState, {
        type: 'SomethingFromTheFuture',
        data: {},
      } as unknown as TournamentEvent),
    ).toEqual(initialTournamentState)
  })
})
