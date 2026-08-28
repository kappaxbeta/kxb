import { describe, expect, test } from 'bun:test'
import {
  battlefieldDecider,
  decide,
  evolve,
  initialBattlefieldState,
} from '@/domain/battlefields/aggregate'
import type { BattlefieldEvent } from '@/domain/battlefields/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'

function given(...events: BattlefieldEvent[]) {
  return fold(battlefieldDecider, events)
}

const created: BattlefieldEvent[] = [
  {
    type: 'BattlefieldCreated',
    data: { name: 'Sandpit', createdBy: ALICE, visibility: 'space' },
  },
]

describe('creating a battlefield', () => {
  test('records the name, its maker and who may find it', () => {
    expect(
      decide(initialBattlefieldState, {
        type: 'CreateBattlefield',
        actorId: ALICE,
        name: 'Sandpit',
        visibility: 'space',
      }),
    ).toEqual([
      {
        type: 'BattlefieldCreated',
        data: { name: 'Sandpit', createdBy: ALICE, visibility: 'space' },
      },
    ])
  })

  /**
   * The id is minted fresh per creation, so this can only happen if two
   * creations somehow landed on one stream. Refusing keeps that impossible
   * rather than merely unlikely.
   */
  test('creating one twice on the same stream is refused', () => {
    expect(() =>
      decide(given(...created), {
        type: 'CreateBattlefield',
        actorId: BOB,
        name: 'Coliseum',
        visibility: 'space',
      }),
    ).toThrow(DomainError)
  })
})

describe('renaming', () => {
  test('renames an active battlefield', () => {
    expect(
      decide(given(...created), {
        type: 'RenameBattlefield',
        actorId: ALICE,
        name: 'Coliseum',
      }),
    ).toEqual([{ type: 'BattlefieldRenamed', data: { name: 'Coliseum' } }])
  })

  test('renaming to the current name is a no-op', () => {
    expect(
      decide(given(...created), {
        type: 'RenameBattlefield',
        actorId: ALICE,
        name: 'Sandpit',
      }),
    ).toEqual([])
  })

  test('a battlefield that does not exist cannot be renamed', () => {
    expect(() =>
      decide(initialBattlefieldState, {
        type: 'RenameBattlefield',
        actorId: ALICE,
        name: 'Coliseum',
      }),
    ).toThrow(DomainError)
  })

  test('an archived battlefield cannot be renamed', () => {
    const state = given(...created, { type: 'BattlefieldArchived', data: {} })
    expect(() =>
      decide(state, { type: 'RenameBattlefield', actorId: ALICE, name: 'Coliseum' }),
    ).toThrow(DomainError)
  })
})

describe('visibility', () => {
  test('a space arena can be opened to everyone', () => {
    expect(
      decide(given(...created), {
        type: 'SetBattlefieldVisibility',
        actorId: ALICE,
        visibility: 'public',
      }),
    ).toEqual([{ type: 'BattlefieldVisibilitySet', data: { visibility: 'public' } }])
  })

  test('setting the visibility it already has is a no-op', () => {
    expect(
      decide(given(...created), {
        type: 'SetBattlefieldVisibility',
        actorId: ALICE,
        visibility: 'space',
      }),
    ).toEqual([])
  })
})

describe('archiving', () => {
  test('retires an active battlefield', () => {
    expect(
      decide(given(...created), { type: 'ArchiveBattlefield', actorId: ALICE }),
    ).toEqual([{ type: 'BattlefieldArchived', data: {} }])
  })

  test('archiving twice is a no-op', () => {
    const state = given(...created, { type: 'BattlefieldArchived', data: {} })
    expect(decide(state, { type: 'ArchiveBattlefield', actorId: ALICE })).toEqual([])
  })
})

describe('evolve', () => {
  test('replays history into current state', () => {
    const state = given(
      ...created,
      { type: 'BattlefieldRenamed', data: { name: 'Coliseum' } },
      { type: 'BattlefieldVisibilitySet', data: { visibility: 'public' } },
    )

    expect(state).toEqual({
      status: 'active',
      name: 'Coliseum',
      visibility: 'public',
      createdBy: ALICE,
    })
  })

  test('ignores unknown event types instead of throwing', () => {
    const state = evolve(initialBattlefieldState, {
      type: 'SomethingFromTheFuture',
      data: {},
    } as unknown as BattlefieldEvent)

    expect(state).toEqual(initialBattlefieldState)
  })
})
