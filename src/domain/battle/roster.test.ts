import { describe, expect, test } from 'bun:test'
import type { BattleParticipantView } from '@/domain/battle/queries'
import { alliesOf, footballSide, homeInOrder, wonBy } from '@/domain/battle/roster'

/**
 * Four readings that lived inline in `battle-room.tsx`.
 *
 * None of them are hard. All of them were unreachable, and each carries a rule
 * that reads as arbitrary until you know what it is protecting against - a
 * podium in join order, a winning team shown a losing screen, a spectator's
 * stray touch counted as an own goal.
 */

const who = (
  userId: string,
  extra: Partial<BattleParticipantView> = {},
): BattleParticipantView => ({
  userId,
  tenantId: 't',
  side: null,
  defeated: false,
  wantsRematch: false,
  ready: false,
  name: userId,
  place: null,
  seconds: null,
  ...extra,
})

describe('who is on our side', () => {
  test('a team match gathers everybody wearing our colour', () => {
    const roster = [
      who('me', { side: 'red' }),
      who('mate', { side: 'red' }),
      who('them', { side: 'blue' }),
    ]
    expect([...alliesOf(roster, 'me')].sort()).toEqual(['mate', 'me'])
  })

  /**
   * Falls out rather than being special-cased: with no sides, the loop that
   * adds side-mates never runs.
   */
  test('a free-for-all leaves everybody on their own', () => {
    const roster = [who('me'), who('a'), who('b')]
    expect([...alliesOf(roster, 'me')]).toEqual(['me'])
  })

  /**
   * An empty set reads downstream as *everybody is an enemy*, which paints the
   * whole room as a target for somebody who is only watching.
   */
  test('somebody not on the roster is still their own ally', () => {
    expect([...alliesOf([who('a', { side: 'red' })], 'guest')]).toEqual(['guest'])
  })

  test('and we are in the set even when we are on a side', () => {
    const roster = [who('me', { side: 'blue' }), who('mate', { side: 'blue' })]
    expect(alliesOf(roster, 'me').has('me')).toBe(true)
  })

  test('the other side is never in it', () => {
    const roster = [who('me', { side: 'red' }), who('them', { side: 'blue' })]
    expect(alliesOf(roster, 'me').has('them')).toBe(false)
  })
})

describe('which football side', () => {
  test('reads the two colours', () => {
    const roster = [who('r', { side: 'red' }), who('b', { side: 'blue' })]
    expect(footballSide(roster, 'r')).toBe('red')
    expect(footballSide(roster, 'b')).toBe('blue')
  })

  /** How a stray touch from somebody not playing stays out of the scoring. */
  test('a spectator has no side', () => {
    expect(footballSide([who('r', { side: 'red' })], 'watcher')).toBeUndefined()
  })

  test('nor has somebody on the roster with no side at all', () => {
    expect(footballSide([who('a')], 'a')).toBeUndefined()
  })

  /** Sides are used for other things in other modes; a ball only knows two. */
  test('and a side that is not one of the two is not guessed at', () => {
    expect(footballSide([who('a', { side: 'green' as never })], 'a')).toBeUndefined()
  })
})

describe('did we win', () => {
  test('nobody has won an unfinished match', () => {
    expect(wonBy(null, 'me', 'red')).toBe(false)
  })

  test('a free-for-all names a person', () => {
    expect(wonBy({ type: 'player', id: 'me' }, 'me', null)).toBe(true)
    expect(wonBy({ type: 'player', id: 'them' }, 'me', null)).toBe(false)
  })

  /**
   * Reading only the player shape is how a winning team gets a losing screen:
   * the id matches nobody's user id, so the answer is silently no.
   */
  test('a team match names a side', () => {
    expect(wonBy({ type: 'side', id: 'red' }, 'me', 'red')).toBe(true)
    expect(wonBy({ type: 'side', id: 'red' }, 'me', 'blue')).toBe(false)
  })

  test('a winning side is not read as a user id', () => {
    expect(wonBy({ type: 'side', id: 'me' }, 'me', 'red')).toBe(false)
  })

  test('and a spectator has not won either way', () => {
    expect(wonBy({ type: 'side', id: 'red' }, 'watcher', null)).toBe(false)
    expect(wonBy({ type: 'player', id: 'them' }, 'watcher', undefined)).toBe(false)
  })
})

describe('who is home', () => {
  /**
   * The roster arrives in join order, which has nothing to do with the finish.
   * A podium in join order looks like a scoring bug rather than a sorting one,
   * because every name on it is correct.
   */
  test('is in finishing order, not the order people joined', () => {
    const roster = [
      who('joined-first', { place: 3 }),
      who('joined-second', { place: 1 }),
      who('joined-third', { place: 2 }),
    ]
    expect(homeInOrder(roster).map((p) => p.place)).toEqual([1, 2, 3])
  })

  /** Still running is not on the list of people who finished. */
  test('leaves out anybody who has not finished', () => {
    const roster = [who('home', { place: 1 }), who('running')]
    expect(homeInOrder(roster).map((p) => p.userId)).toEqual(['home'])
  })

  test('a race nobody finished has an empty podium', () => {
    expect(homeInOrder([who('a'), who('b')])).toEqual([])
  })

  test('and one finisher is a podium of one', () => {
    expect(homeInOrder([who('a', { place: 1 }), who('b')]).length).toBe(1)
  })
})
