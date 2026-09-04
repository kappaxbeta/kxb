import { describe, expect, test } from 'bun:test'
import {
  BURNS,
  type CoinReason,
  EARN_REASONS,
  isBurn,
  isMint,
  MINTS,
  REASON_LABELS,
  SPEND_REASONS,
} from '@/domain/bank/reasons'

/**
 * The closed set, checked for the two properties that make it worth having.
 *
 * Neither is about what any particular reason means. They are about the set
 * being *complete* and *sound*: complete, so a movement can always be labelled,
 * and sound, so the short list of ways coins are created cannot quietly grow by
 * somebody adding a reason to the wrong array.
 */

describe('the set is closed', () => {
  test('every reason has a label', () => {
    const labelled = new Set(Object.keys(REASON_LABELS))
    for (const reason of [...EARN_REASONS, ...SPEND_REASONS]) {
      expect(labelled.has(reason)).toBe(true)
    }
  })

  test('no label is left behind by a reason that was removed', () => {
    const live = new Set<string>([...EARN_REASONS, ...SPEND_REASONS])
    for (const key of Object.keys(REASON_LABELS)) {
      expect(live.has(key)).toBe(true)
    }
  })

  /**
   * `battle-stake` and `remix` are each on both lists, and that is correct
   * rather than a duplicate: one person pays and another is paid, so the same
   * movement is a spend at one end and an earning at the other. The test names
   * them so that a third one appearing is a decision somebody made rather than
   * a merge nobody read.
   */
  test('the reasons on both lists are exactly the two with a payer and a payee', () => {
    const both = EARN_REASONS.filter((reason) =>
      (SPEND_REASONS as readonly string[]).includes(reason),
    )
    expect([...both].sort()).toEqual(['battle-stake', 'remix'])
  })
})

describe('what creates and destroys coins', () => {
  test('every mint is an earning', () => {
    for (const reason of MINTS) {
      expect((EARN_REASONS as readonly string[]).includes(reason)).toBe(true)
      expect(isMint(reason)).toBe(true)
    }
  })

  test('every burn is a spend', () => {
    for (const reason of BURNS) {
      expect((SPEND_REASONS as readonly string[]).includes(reason)).toBe(true)
      expect(isBurn(reason)).toBe(true)
    }
  })

  /**
   * The guard that matters. A movement with a payer and a payee nets to zero,
   * so a bug in one shows up as a balance that does not add up. A mint has no
   * counterparty at all, and a bug in one shows up as an economy that inflates
   * with nothing to compare it against - which is why the list is short and why
   * a change to it should be hard to make by accident.
   */
  test('a transfer is never a mint, in either direction', () => {
    expect(isMint('transfer-in')).toBe(false)
    expect(isMint('bank-grant-in')).toBe(false)
    expect(isMint('battle-stake')).toBe(false)
    expect(isMint('remix')).toBe(false)
  })

  test('a payment to somebody is never a burn', () => {
    expect(isBurn('transfer-out')).toBe(false)
    expect(isBurn('bank-grant-out')).toBe(false)
    expect(isBurn('battle-stake')).toBe(false)
    expect(isBurn('remix')).toBe(false)
    expect(isBurn('needs')).toBe(false)
  })

  /**
   * A loan is money the space already had, moved. It is on no mint list, and
   * the test exists because it is the reason most likely to be "simplified"
   * into one by somebody implementing §7.3's fallback for a broke player - a
   * loan that mints is a button that prints coins.
   */
  test('a loan comes out of the bank, not out of nowhere', () => {
    expect(isMint('loan')).toBe(false)
  })
})

describe('labels', () => {
  test('are written for the person whose purse it is', () => {
    const label = (reason: CoinReason): string => REASON_LABELS[reason]
    expect(label('battle-win')).toBe('won a battle')
    expect(label('quota')).toBe('one more than the plan holds')
  })

  test('never name a counterparty', () => {
    // The event carries the id; the sentence must not, because a stake paid to
    // a level's owner should not name that owner to a stranger.
    for (const text of Object.values(REASON_LABELS)) {
      expect(text).not.toContain('{')
      expect(text).not.toContain('%')
    }
  })
})
