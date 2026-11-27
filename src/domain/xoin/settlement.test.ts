import { describe, expect, test } from 'bun:test'

import { completeTrade, type Outcome, type TradeEffects } from '@/domain/xoin/settlement'

/**
 * The four ways a trade can end.
 *
 * This is the only money path in the feature that no other test reaches: the
 * decider's tests prove a fill is priced correctly and `movements.test.ts`
 * proves it moves the right coins, but neither can say what happens when the
 * book moves and the purse then refuses.
 */

const ok: Outcome = { ok: true }
const no = (error: string): Outcome => ({ ok: false, error })

function spy(...outcomes: Outcome[]) {
  const calls: string[] = []
  const effects: TradeEffects = {
    record: async () => {
      calls.push('record')
      return outcomes[0]
    },
    pay: async () => {
      calls.push('pay')
      return outcomes[1] ?? ok
    },
    reverse: async (why) => {
      calls.push(`reverse:${why}`)
      return outcomes[2] ?? ok
    },
  }
  return { effects, calls }
}

describe('finishing a trade', () => {
  test('records, then pays, and that is the whole happy path', async () => {
    const { effects, calls } = spy(ok, ok)
    expect(await completeTrade(effects)).toEqual({ ok: true })
    expect(calls).toEqual(['record', 'pay'])
  })

  test('a book that would not take the fill costs nobody a coin', async () => {
    /*
     * The reason the book goes first. The market stream is the contended one,
     * so this is the *likely* failure - and the player sees "try again" rather
     * than "your coins have gone and there is no trade".
     */
    const { effects, calls } = spy(no('The market was busy. Try again.'))
    const result = await completeTrade(effects)

    expect(result).toEqual({ ok: false, error: 'The market was busy. Try again.' })
    expect(calls).toEqual(['record'])
  })

  test('a fill that was never recorded is never reversed', async () => {
    /*
     * The branch that matters most, and it is a *non*-event. Reversing a trade
     * that did not happen would move the book the wrong way and hand somebody a
     * position out of nothing - minting xoin out of a concurrency error.
     *
     * Asserted as "reverse was not called", which is the only way to state it:
     * every other assertion here would pass with the bug present.
     */
    const { effects, calls } = spy(no('nope'))
    await completeTrade(effects)
    expect(calls.some((call) => call.startsWith('reverse'))).toBe(false)
  })

  test('a purse that refuses puts the book back, and says so', async () => {
    const { effects, calls } = spy(ok, no('That purse was busy.'), ok)
    const result = await completeTrade(effects)

    expect(result).toEqual({ ok: false, error: 'That purse was busy. The trade was put back.' })
    expect(calls).toEqual(['record', 'pay', 'reverse:That purse was busy.'])
  })

  test('the reversal is told why, so the event can carry it', async () => {
    // `TradeReversed.why` is the only record of what went wrong; a reversal
    // that recorded no reason would be a hole in the log rather than an
    // explanation of one.
    const { effects, calls } = spy(ok, no('the purse stayed busy'), ok)
    await completeTrade(effects)
    expect(calls).toContain('reverse:the purse stayed busy')
  })

  test('both halves failing is reported as itself, not as an ordinary refusal', async () => {
    /*
     * The book has moved and the purse has not. Reporting a plain failure would
     * leave a position nobody can explain, so the sentence is deliberately
     * alarming - somebody should look.
     */
    const { effects } = spy(ok, no('That purse was busy.'), no('and the market too'))
    const result = await completeTrade(effects)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBe(
      'That purse was busy. The trade could not be put back either - tell an admin.',
    )
  })

  test('paying is attempted exactly once', async () => {
    // A retry here would be a second charge. Whatever went wrong, the answer is
    // to put the trade back, never to try taking the coins again.
    const { effects, calls } = spy(ok, no('busy'), ok)
    await completeTrade(effects)
    expect(calls.filter((call) => call === 'pay')).toHaveLength(1)
  })
})
