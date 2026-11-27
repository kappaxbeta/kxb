import { describe, expect, test } from 'bun:test'

import { OPENING_COINS, OPENING_SPECKS, SPECKS, quoteBuy } from '@kxb/xoin'

import { decide, evolve, initialXoinState, type XoinState } from '@/domain/xoin/aggregate'
import type { XoinCommand } from '@/domain/xoin/commands'
import type { XoinEvent } from '@/domain/xoin/events'
import { DomainError } from '@/es/errors'

/**
 * The market's decider, and the two invariants it is the only thing protecting.
 *
 * Nobody may sell xoin they do not hold, and nobody may cause a `Traded` event
 * carrying a number they chose. Both are single-stream facts - the reserves and
 * every position are folded from the same history - which is the whole reason
 * `events.ts` keeps them together.
 */

const FLOAT = OPENING_SPECKS

function run(state: XoinState, ...commands: XoinCommand[]): XoinState {
  return commands.reduce(
    (current, command) => decide(current, command).reduce(evolve, current),
    state,
  )
}

const opened = (mode: 'demo' | 'asset' | 'currency' = 'asset') =>
  run(initialXoinState, { type: 'OpenMarket', mode })

const buy = (by: string, size: number, float = FLOAT): XoinCommand => ({
  type: 'RecordTrade',
  side: 'buy',
  by,
  size,
  float,
})

describe('opening a market', () => {
  test('opens once, at the mode it was given', () => {
    const state = opened('asset')
    expect(state.open).toBe(true)
    expect(state.mode).toBe('asset')
    expect(state.reserves).toEqual({ coins: OPENING_COINS, specks: OPENING_SPECKS })
  })

  test('opening twice is a no-op, not an error', () => {
    // Two admins pressing the same button is not a mistake either of them made.
    expect(decide(opened(), { type: 'OpenMarket', mode: 'demo' })).toEqual([])
  })

  test('a market that was never opened refuses everything but opening', () => {
    expect(() => decide(initialXoinState, { type: 'SetMode', mode: 'asset' })).toThrow(DomainError)
    expect(() => decide(initialXoinState, buy('ana', 20))).toThrow(DomainError)
  })

  test('before anything happens the mode is the one that cannot cost anybody a coin', () => {
    expect(initialXoinState.mode).toBe('demo')
  })
})

describe('the mode', () => {
  test('changing it keeps the book and everybody in it', () => {
    /*
     * A space switching back to `demo` has members holding positions bought
     * with real coins. Wiping the book would be confiscating them as a side
     * effect of a settings change.
     */
    const traded = run(opened('asset'), buy('ana', 40))
    const back = run(traded, { type: 'SetMode', mode: 'demo' })

    expect(back.mode).toBe('demo')
    expect(back.holdings.ana.specks).toBe(traded.holdings.ana.specks)
    expect(back.reserves).toEqual(traded.reserves)
  })

  test('setting the mode it already has writes nothing', () => {
    expect(decide(opened('asset'), { type: 'SetMode', mode: 'asset' })).toEqual([])
  })

  test('a demo market refuses to record a trade at all', () => {
    /*
     * The promise the mode is made of. An append here would arrive as a real
     * position in a space that believes it is playing, so it is refused in the
     * decider rather than only at the action.
     */
    expect(() => decide(opened('demo'), buy('ana', 20))).toThrow(DomainError)
  })
})

describe('trading', () => {
  test('the decider prices it - the caller only says which way and how much', () => {
    const state = opened()
    const events = decide(state, buy('ana', 40))
    const expected = quoteBuy(state.reserves, FLOAT, 40)!

    expect(events).toHaveLength(1)
    const data = (events[0] as Extract<XoinEvent, { type: 'Traded' }>).data
    expect(data.coins).toBe(expected.coins)
    expect(data.specks).toBe(expected.specks)
    expect(data.fee).toBe(expected.fee)
    expect(data.by).toBe('ana')
  })

  test('a buy moves the book and the position together', () => {
    const before = opened()
    const after = run(before, buy('ana', 40))

    expect(after.reserves.coins).toBeGreaterThan(before.reserves.coins)
    expect(after.reserves.specks).toBeLessThan(before.reserves.specks)
    expect(after.holdings.ana.specks).toBe(before.reserves.specks - after.reserves.specks)
    expect(after.holdings.ana.spent).toBe(40)
  })

  test('nobody can sell what they do not hold', () => {
    const state = run(opened(), buy('ana', 40))
    const held = state.holdings.ana.specks

    const sell = (by: string, size: number): XoinCommand => ({
      type: 'RecordTrade',
      side: 'sell',
      by,
      size,
      float: FLOAT,
    })

    expect(() => decide(state, sell('ana', held + 1))).toThrow(DomainError)
    // And somebody who has never traded holds nothing, rather than undefined.
    expect(() => decide(state, sell('bo', 1))).toThrow(DomainError)
    expect(() => decide(state, sell('ana', held))).not.toThrow()
  })

  test('two people trade against one book, in the order they arrive', () => {
    const first = run(opened(), buy('ana', 40))
    const second = run(first, buy('bo', 40))

    // The second buyer pays more per xoin, because the first one moved it.
    expect(second.holdings.bo.specks).toBeLessThan(first.holdings.ana.specks)
  })

  test('a price that moved past what the player agreed to is refused', () => {
    const state = opened()
    const agreed = quoteBuy(state.reserves, FLOAT, 40)!

    const at = (float: number): XoinCommand => ({
      type: 'RecordTrade',
      side: 'buy',
      by: 'ana',
      size: 40,
      float,
      agreed: { specks: agreed.specks },
    })

    // A smaller float is a dearer market: the same coins buy fewer specks.
    expect(() => decide(state, at(Math.round(FLOAT * 0.8)))).toThrow(DomainError)

    // And movement in the player's favour always fills.
    expect(() => decide(state, at(Math.round(FLOAT * 1.2)))).not.toThrow()
  })

  test('a trade too small for this market is refused rather than pocketed', () => {
    expect(() => decide(opened(), buy('ana', 1))).toThrow(DomainError)
  })

  test('the pool never pays out coins it was not given, however people trade', () => {
    /*
     * The invariant from `pool.test.ts`, re-checked through the decider - which
     * is the only path a real trade takes. A pool that was safe in isolation
     * could still be drained by a fold that applied a fill the wrong way round.
     */
    let state = opened()
    let paidIn = 0
    let paidOut = 0
    let rng = 987

    const next = () => {
      rng = (Math.imul(rng, 1_103_515_245) + 12_345) >>> 0
      return rng / 0x100000000
    }

    for (let i = 0; i < 400; i += 1) {
      const who = next() < 0.5 ? 'ana' : 'bo'
      const holding = state.holdings[who]?.specks ?? 0
      const wantsToSell = holding > SPECKS && next() < 0.5

      const command: XoinCommand = wantsToSell
        ? {
            type: 'RecordTrade',
            side: 'sell',
            by: who,
            size: 1 + Math.floor(next() * holding),
            float: FLOAT,
          }
        : buy(who, 10 + Math.floor(next() * 300))

      let events: XoinEvent[]
      try {
        events = decide(state, command)
      } catch {
        continue
      }

      for (const event of events) {
        if (event.type !== 'Traded') continue
        if (event.data.side === 'buy') paidIn += event.data.coins
        else paidOut += event.data.coins + event.data.fee
      }
      state = events.reduce(evolve, state)

      expect(state.reserves.coins).toBeGreaterThanOrEqual(1)
      expect(state.holdings[who]?.specks ?? 0).toBeGreaterThanOrEqual(0)
    }

    expect(paidOut).toBeLessThanOrEqual(paidIn + OPENING_COINS)
  })
})

describe('reversing a trade', () => {
  test('puts the book and the position back exactly', () => {
    const before = opened()
    const after = run(before, buy('ana', 40))
    const fill = after.holdings.ana

    const back = run(after, {
      type: 'ReverseTrade',
      by: 'ana',
      side: 'buy',
      coins: 40,
      specks: fill.specks,
      fee: quoteBuy(before.reserves, FLOAT, 40)!.fee,
      why: 'the purse stayed busy',
    })

    expect(back.reserves).toEqual(before.reserves)
    expect(back.holdings.ana).toEqual({ specks: 0, spent: 0, returned: 0 })
  })
})
