import { describe, expect, test } from 'bun:test'
import { bankDecider, evolve, initialBankState } from '@/domain/bank/aggregate'
import type { BankCommand } from '@/domain/bank/commands'
import { MAX_GRANT } from '@/domain/bank/commands'
import type { BankEvent } from '@/domain/bank/events'
import { DomainError } from '@/es/errors'

/**
 * The bank, tested as a pure function of its own history.
 *
 * There is one rule worth testing here - a bank cannot pay out what it does not
 * hold - and a handful of ways to get a number wrong on the way in. Everything
 * else about a space's money is policy that lives in the actions.
 */

/** Fold a list of events, so a test can set up a balance the way the log does. */
function stateAfter(events: BankEvent[]) {
  return events.reduce(evolve, initialBankState)
}

const banked = (amount: number, from = 'member-a'): BankEvent => ({
  type: 'CoinsBanked',
  data: { from, amount, reason: 'needs', what: 'a sandwich', transfer: 't' },
})

function decide(events: BankEvent[], command: BankCommand): BankEvent[] {
  return bankDecider.decide(stateAfter(events), command)
}

describe('a new space has an empty bank', () => {
  test('with no event required to say so', () => {
    // Deliberately no `BankOpened`. A space that has never taken a coin has a
    // balance of zero, and writing an event to record that would be a write on
    // every space creation to state the default.
    expect(initialBankState.coins).toBe(0)
  })

  test('and cannot pay anybody', () => {
    expect(() =>
      decide([], { type: 'WithdrawCoins', to: 'b', amount: 1, reason: 'loan', transfer: 't' }),
    ).toThrow(DomainError)
  })

  test('and says so in a way an owner can act on', () => {
    expect(() =>
      decide([], { type: 'WithdrawCoins', to: 'b', amount: 1, reason: 'loan', transfer: 't' }),
    ).toThrow('This space has nothing banked')
  })
})

describe('the one invariant', () => {
  test('a bank may be emptied exactly', () => {
    const events = decide([banked(40)], {
      type: 'WithdrawCoins',
      to: 'b',
      amount: 40,
      reason: 'bank-grant-in',
      transfer: 't',
    })
    expect(events).toHaveLength(1)
    expect(stateAfter([banked(40), ...events]).coins).toBe(0)
  })

  test('but not overdrawn by one', () => {
    expect(() =>
      decide([banked(40)], {
        type: 'WithdrawCoins',
        to: 'b',
        amount: 41,
        reason: 'bank-grant-in',
        transfer: 't',
      }),
    ).toThrow('only 40 coins')
  })

  /**
   * The case optimistic concurrency exists for. Two owners each paying out the
   * whole balance decide against the *same* folded state in this test, and both
   * succeed - which is exactly right, because a decider cannot see a race. What
   * stops the second one landing is the version guard at append time; this test
   * pins that the decider is not where that is supposed to happen, so nobody
   * later "fixes" it by adding a read here.
   */
  test('two payouts against one balance both decide - the version guard is what refuses', () => {
    const history = [banked(10)]
    const first = decide(history, {
      type: 'WithdrawCoins', to: 'b', amount: 10, reason: 'bank-grant-in', transfer: 't1',
    })
    const second = decide(history, {
      type: 'WithdrawCoins', to: 'c', amount: 10, reason: 'bank-grant-in', transfer: 't2',
    })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
  })
})

describe('amounts', () => {
  test('zero is refused rather than written as a movement of nothing', () => {
    expect(() =>
      decide([], { type: 'BankCoins', from: 'a', amount: 0, reason: 'needs', transfer: 't' }),
    ).toThrow(DomainError)
  })

  test('so is a negative, which would be a payout wearing a deposit', () => {
    expect(() =>
      decide([], { type: 'BankCoins', from: 'a', amount: -50, reason: 'needs', transfer: 't' }),
    ).toThrow(DomainError)
  })

  test('and a fraction', () => {
    expect(() =>
      decide([], { type: 'BankCoins', from: 'a', amount: 1.5, reason: 'needs', transfer: 't' }),
    ).toThrow(DomainError)
  })

  test('and NaN, which compares false against every bound', () => {
    expect(() =>
      decide([], { type: 'BankCoins', from: 'a', amount: NaN, reason: 'needs', transfer: 't' }),
    ).toThrow(DomainError)
  })

  test('a stray zero on the end is a refusal, not an emptied bank', () => {
    expect(() =>
      decide([], {
        type: 'BankCoins', from: 'a', amount: MAX_GRANT + 1, reason: 'needs', transfer: 't',
      }),
    ).toThrow(DomainError)
  })
})

describe('what is written down', () => {
  test('a deposit keeps what it was for, so a balance can be explained', () => {
    const [event] = decide([], {
      type: 'BankCoins',
      from: 'member-a',
      amount: 4,
      reason: 'needs',
      what: 'a sandwich',
      transfer: 'move-1',
    })
    expect(event).toEqual({
      type: 'CoinsBanked',
      data: {
        from: 'member-a',
        amount: 4,
        reason: 'needs',
        what: 'a sandwich',
        transfer: 'move-1',
      },
    })
  })

  test('a deposit for no particular thing carries no key at all', () => {
    // Not `what: undefined`, which is a null in jsonb - a column of nothing on
    // every grant this space ever takes.
    const [event] = decide([], {
      type: 'BankCoins', from: 'a', amount: 4, reason: 'bank-grant-out', transfer: 't',
    })
    expect(Object.hasOwn(event.data, 'what')).toBe(false)
  })

  test('a loan is recorded as a loan, not as a generous grant', () => {
    // §7.3 does not repay loans yet. Keeping the reason distinct is what makes
    // "which of these were loans" answerable when it does.
    const [event] = decide([banked(100)], {
      type: 'WithdrawCoins', to: 'b', amount: 3, reason: 'loan', transfer: 't',
    })
    expect(event.data.reason).toBe('loan')
  })
})

describe('folding', () => {
  test('a balance is the sum of what came in less what went out', () => {
    expect(
      stateAfter([
        banked(10),
        banked(30),
        { type: 'CoinsWithdrawn', data: { to: 'b', amount: 15, reason: 'loan', transfer: 't' } },
      ]).coins,
    ).toBe(25)
  })

  test('an event this version does not know leaves the balance alone', () => {
    // Total, so a replay of a stream written by newer code does not throw
    // halfway through and park the projection.
    const unknown = { type: 'SomethingLater', data: {} } as unknown as BankEvent
    expect(evolve({ coins: 7 }, unknown).coins).toBe(7)
  })
})
