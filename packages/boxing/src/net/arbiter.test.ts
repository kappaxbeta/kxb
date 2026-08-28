import { describe, expect, test } from 'bun:test'
import { memoryArbiter, memoryHost, memoryNetwork } from '@kxb/xp/host'

import { REPORT, boxingArbiter, reportFight, type Recorded } from './arbiter'
import type { Verdict } from '../rules/fight'

/**
 * The tier where being wrong is permanent.
 *
 * Everything else in this package can be wrong for a frame and correct itself.
 * A result cannot, so these are the tests for the two properties that make it
 * safe: it cannot be overwritten, and it cannot be reported by somebody who was
 * not in the fight.
 */

const KO: Verdict = { winner: 'red', how: 'ko', cards: [{ round: 1, red: 10, blue: 8 }] }
const OTHER: Verdict = { winner: 'blue', how: 'decision', cards: [] }

function ring(fighters = ['a', 'b']) {
  const arbiter = boxingArbiter(memoryArbiter(), fighters)
  const network = memoryNetwork()
  const host = (id: string) =>
    memoryHost({ player: { id, name: id }, network, arbiter, now: () => 0 })
  return { arbiter, host }
}

describe('reporting a result', () => {
  test('a fighter may report the fight they were in', async () => {
    const { host } = ring()
    const answer = await host('a').arbiter!.ask<Recorded>(REPORT, { match: 'ring', verdict: KO })
    expect(answer.ok).toBe(true)
    expect(answer.ok && answer.outcome.verdict.how).toBe('ko')
    expect(answer.ok && answer.outcome.fresh).toBe(true)
  })

  test('a stranger may not', async () => {
    const { host } = ring()
    const answer = await host('nosy').arbiter!.ask(REPORT, { match: 'ring', verdict: KO })
    expect(answer.ok).toBe(false)
    expect(!answer.ok && answer.why).toBe('refused')
  })

  test('nonsense is refused rather than stored', async () => {
    const { arbiter, host } = ring()
    const answer = await host('a').arbiter!.ask(REPORT, { match: 'ring', verdict: { how: 'lol' } })
    expect(answer.ok).toBe(false)
    expect(arbiter.state.size).toBe(0)
  })
})

describe('reporting it twice', () => {
  /**
   * The case this file exists for. Both clients watch the same fight end and
   * `XpRefusal` has a `lost` state, so a second ask is *expected* rather than
   * suspicious.
   */
  test('the second report is answered with the first, not an error', async () => {
    const { host } = ring()
    await host('a').arbiter!.ask(REPORT, { match: 'ring', verdict: KO })
    const second = await host('b').arbiter!.ask<Recorded>(REPORT, { match: 'ring', verdict: KO })

    expect(second.ok).toBe(true)
    expect(second.ok && second.outcome.fresh).toBe(false)
    expect(second.ok && second.outcome.by).toBe('a')
  })

  test('the loser cannot report a different result over the top', async () => {
    const { arbiter, host } = ring()
    await host('a').arbiter!.ask(REPORT, { match: 'ring', verdict: KO })
    const cheat = await host('b').arbiter!.ask<Recorded>(REPORT, { match: 'ring', verdict: OTHER })

    // Answered, and answered with the truth. Not the caller's version.
    expect(cheat.ok && cheat.outcome.verdict.winner).toBe('red')
    expect((arbiter.state.get('boxing:result:ring') as Recorded).verdict.how).toBe('ko')
  })

  test('a different match is a different result', async () => {
    const { arbiter, host } = ring()
    await host('a').arbiter!.ask(REPORT, { match: 'one', verdict: KO })
    await host('a').arbiter!.ask(REPORT, { match: 'two', verdict: OTHER })
    expect(arbiter.state.size).toBe(2)
  })
})

describe('a host that cannot do all of it', () => {
  test('with both ports, the result is agreed and kept', async () => {
    const { host } = ring()
    const outcome = await reportFight(host('a'), 'ring', KO)
    expect(outcome.agreed?.ok).toBe(true)
    expect(outcome.kept).toBe(true)
  })

  /**
   * `localHost` is exactly this: storage, no authority. A friendly match that
   * nobody countersigned is still a match that was won, so the record is kept
   * anyway - see the note in `reportFight`.
   */
  test('with no arbiter, it is still kept', async () => {
    const bare = memoryHost({ player: { id: 'a', name: 'a' }, now: () => 0 })
    const outcome = await reportFight(bare, 'ring', KO)
    expect(outcome.agreed).toBe(null)
    expect(outcome.kept).toBe(true)
  })
})
