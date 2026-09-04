import { describe, expect, test } from 'bun:test'
import { movementOf } from '@/domain/bank/backoffice'
import type { HomesteadEvent } from '@/domain/homestead/events'

/**
 * What an event means on a statement.
 *
 * The mapping is the interesting half of the money section - a balance is
 * arithmetic, and this is the part that decides whether a reader can tell a won
 * battle from a loan from somebody minting coins. It is a pure function of an
 * event on purpose, and this is the test the file's own note asks for.
 *
 * The two properties worth guarding are the sign and the other end. A sign that
 * flips turns a drain into a source and the page stops meaning anything; a
 * missing counterparty is how "-40, sent" came to be a line that answered
 * nothing about where a space's coins were pooling.
 */
const AT = '2026-09-03T10:00:00Z'
const SPACE = 'space-1'
const ME = 'user-me'

const line = (event: unknown) => movementOf(event as HomesteadEvent, SPACE, AT, ME)

describe('the sign says which way it went', () => {
  test('a spend leaves', () => {
    const move = line({ type: 'CoinsSpent', data: { cost: 40, reason: 'quota', what: 'blueprints' } })
    expect(move?.amount).toBe(-40)
    expect(move?.what).toBe('blueprints')
  })

  test('an earning arrives', () => {
    const move = line({ type: 'CoinsEarned', data: { amount: 10, reason: 'battle-win', owner: ME } })
    expect(move?.amount).toBe(10)
  })

  test('a transfer is negative on the way out and positive on the way in', () => {
    expect(line({ type: 'CoinsSent', data: { to: 'user-bo', amount: 25, transfer: 't1' } })?.amount).toBe(-25)
    expect(
      line({ type: 'CoinsReceived', data: { from: 'user-bo', amount: 25, transfer: 't1', owner: ME } })?.amount,
    ).toBe(25)
  })
})

describe('the other end of it', () => {
  test('a transfer out names who it went to', () => {
    const move = line({ type: 'CoinsSent', data: { to: 'user-bo', amount: 25, transfer: 't1' } })
    expect(move?.counterparty).toBe('user-bo')
  })

  test('a transfer in names who it came from', () => {
    const move = line({
      type: 'CoinsReceived',
      data: { from: 'user-ada', amount: 25, transfer: 't1', owner: ME },
    })
    expect(move?.counterparty).toBe('user-ada')
  })

  test('a paid earning names the payer', () => {
    // A battle stake is somebody else's coin arriving. `from` is what makes
    // that different from a mint, and it is the same distinction `minted`
    // draws from the reason table - they have to agree.
    const move = line({
      type: 'CoinsEarned',
      data: { amount: 1, reason: 'stake', from: 'user-ada', owner: ME },
    })
    expect(move?.counterparty).toBe('user-ada')
  })

  test('a mint has nobody on the other side, which is the whole point of the badge', () => {
    const move = line({ type: 'CoinsEarned', data: { amount: 10, reason: 'battle-win', owner: ME } })
    expect(move?.counterparty).toBeNull()
    expect(move?.minted).toBe(true)
  })

  test('a spend has none either - the bank is not a person', () => {
    // A toll leaves a purse and lands in the space's bank, which has no user id
    // to link to. Left null rather than invented: a link to a person who does
    // not exist is worse than no link.
    expect(line({ type: 'CoinsSpent', data: { cost: 5, reason: 'toll', what: null } })?.counterparty).toBeNull()
  })
})

describe('every line knows whose it is and where it happened', () => {
  test('so a space’s statement can name a different person on every row', () => {
    const move = line({ type: 'CoinsSent', data: { to: 'user-bo', amount: 1, transfer: 't1' } })
    expect(move?.owner).toBe(ME)
    expect(move?.tenantId).toBe(SPACE)
  })
})

describe('what moved nothing is not a line', () => {
  test('an unrelated homestead event is dropped rather than drawn as a zero', () => {
    expect(line({ type: 'HungerSet', data: { on: true } })).toBeNull()
  })
})
