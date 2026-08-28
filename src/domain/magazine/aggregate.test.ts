import { describe, expect, test } from 'bun:test'
import {
  decide,
  evolve,
  initialMagazineState,
  type MagazineState,
} from '@/domain/magazine/aggregate'
import { magazineStreamId, type MagazineEvent } from '@/domain/magazine/events'
import { DomainError } from '@/es/errors'

/**
 * The shelf has one rule, and the interesting part is that it is not symmetric.
 */

const REF = 'builtin:minigolf'

function given(...events: MagazineEvent[]): MagazineState {
  return events.reduce(evolve, initialMagazineState)
}

const tookIn = (xpRef = REF, name = 'Minigolf'): MagazineEvent => ({
  type: 'XpTakenIn',
  data: { xpRef, name },
})

describe('taking in', () => {
  test('puts it on the shelf', () => {
    const events = decide(initialMagazineState, {
      type: 'TakeInXp',
      xpRef: REF,
      name: 'Minigolf',
    })

    expect(events).toEqual([{ type: 'XpTakenIn', data: { xpRef: REF, name: 'Minigolf' } }])
    expect(given(...events).refs.has(REF)).toBe(true)
  })

  test('twice is a no-op, not an error', () => {
    // Two people pressing the same button on the same afternoon is the ordinary
    // case for a shared shelf, and so is a double click. An error here would be
    // showing somebody a failure for a state they wanted and now have.
    const events = decide(given(tookIn()), {
      type: 'TakeInXp',
      xpRef: REF,
      name: 'Minigolf',
    })

    expect(events).toEqual([])
  })

  test('one shelf holds many different XPs', () => {
    const state = given(tookIn('builtin:minigolf'), tookIn('project:abc', 'Ludo'))
    expect(state.refs.size).toBe(2)
  })
})

describe('putting back', () => {
  test('takes it off the shelf', () => {
    const events = decide(given(tookIn()), { type: 'PutBackXp', xpRef: REF })

    expect(events).toEqual([{ type: 'XpPutBack', data: { xpRef: REF } }])
    expect(given(tookIn(), ...events).refs.has(REF)).toBe(false)
  })

  test('something that is not there is refused, unlike taking in twice', () => {
    // The asymmetry is the point. Taking in twice lands on the state you asked
    // for; putting back something absent means the shelf you are looking at is
    // not the shelf that exists, and quietly succeeding would leave you
    // believing you had removed something.
    expect(() => decide(initialMagazineState, { type: 'PutBackXp', xpRef: REF })).toThrow(
      DomainError,
    )
  })

  test('putting one back leaves the others alone', () => {
    const state = given(tookIn('a'), tookIn('b'), { type: 'XpPutBack', data: { xpRef: 'a' } })
    expect([...state.refs]).toEqual(['b'])
  })

  test('taken in again after being put back', () => {
    const state = given(tookIn(), { type: 'XpPutBack', data: { xpRef: REF } })
    expect(decide(state, { type: 'TakeInXp', xpRef: REF, name: 'Minigolf' })).toHaveLength(1)
  })
})

describe('folding', () => {
  test('evolve does not mutate the state it is given', () => {
    // `fold` may replay the same events to answer a different question, and a
    // decider that mutated its input would make the second answer depend on the
    // first.
    const before = given(tookIn('a'))
    const after = evolve(before, tookIn('b'))

    expect([...before.refs]).toEqual(['a'])
    expect(after.refs.size).toBe(2)
  })
})

describe('the stream id', () => {
  test('is stable, so the same space always finds the same shelf', () => {
    const tenant = '11111111-1111-1111-1111-111111111111'
    expect(magazineStreamId(tenant)).toBe(magazineStreamId(tenant))
  })

  test('differs per space', () => {
    expect(magazineStreamId('11111111-1111-1111-1111-111111111111')).not.toBe(
      magazineStreamId('22222222-2222-2222-2222-222222222222'),
    )
  })

  test('is not the tenant id - that would collide with the tenant stream', () => {
    // append_events() versions by stream_id alone, so two stream types sharing
    // an id would share one sequence and collide on every write.
    const tenant = '11111111-1111-1111-1111-111111111111'
    expect(magazineStreamId(tenant)).not.toBe(tenant)
  })
})

describe('restocking', () => {
  const V3 = 'p-11111111-1111-1111-1111-111111111111-v3'
  const V4 = 'p-11111111-1111-1111-1111-111111111111-v4'

  const restock = (from: string, to: string) =>
    ({ type: 'RestockXp', from, to, name: 'Ladder Run' }) as const

  test('swaps the old version for the new one, in that order', () => {
    const events = decide(given(tookIn(V3)), restock(V3, V4))

    // The order is the whole of it. `evolve` removes then adds, so these
    // reversed would leave the shelf empty for anything that named one
    // reference twice.
    expect(events).toEqual([
      { type: 'XpPutBack', data: { xpRef: V3 } },
      { type: 'XpTakenIn', data: { xpRef: V4, name: 'Ladder Run' } },
    ])
  })

  test('leaves the shelf holding exactly one of them', () => {
    const events = decide(given(tookIn(V3)), restock(V3, V4))
    const after = given(tookIn(V3), ...events)

    expect(after.refs.has(V3)).toBe(false)
    expect(after.refs.has(V4)).toBe(true)
    expect(after.refs.size).toBe(1)
  })

  test('already on the newest is a no-op, not an error', () => {
    // Two people read the same badge and the second presses a moment later.
    // They wanted a state and it is the state that exists.
    expect(decide(given(tookIn(V4)), restock(V3, V4))).toEqual([])
  })

  test('the same reference twice does nothing rather than emptying the shelf', () => {
    expect(decide(given(tookIn(V3)), restock(V3, V3))).toEqual([])
  })

  test('restocking something not on the shelf is refused', () => {
    // The asymmetry `PutBackXp` already has, and for a sharper reason: the
    // shelf on the screen is not the shelf that exists, and succeeding would
    // *add* a level somebody had just removed.
    expect(() => decide(initialMagazineState, restock(V3, V4))).toThrow(DomainError)
  })

  test('does not disturb anything else on the shelf', () => {
    const other = 'builtin:ladder-run'
    const events = decide(given(tookIn(V3), tookIn(other)), restock(V3, V4))
    const after = given(tookIn(V3), tookIn(other), ...events)

    expect(after.refs.has(other)).toBe(true)
    expect(after.refs.size).toBe(2)
  })
})
