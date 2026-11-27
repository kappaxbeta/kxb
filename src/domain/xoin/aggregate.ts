import {
  OPENING_COINS,
  OPENING_SPECKS,
  accepts,
  quoteBuy,
  quoteSell,
  rulesOf,
  settle,
  unsettle,
  type Reserves,
  type XoinMode,
} from '@kxb/xoin'
import type { XoinCommand } from '@/domain/xoin/commands'
import { XOIN_STREAM_TYPE, type XoinEvent } from '@/domain/xoin/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * The book, the mode, and who holds what.
 *
 * ---------------------------------------------------------------------------
 * The decider does the arithmetic, and that is the security model
 * ---------------------------------------------------------------------------
 * Every coin figure on a `Traded` event is produced here, from reserves this
 * fold produced, using the same pure functions the browser used to draw the
 * quote. A caller supplies a side, a size and the float; it cannot supply a
 * price, a payout or a fee.
 *
 * That is what makes the market safe against a modified client without a single
 * check that looks like policing. The worst a forged request can do is ask for
 * a trade at the true price.
 *
 * ---------------------------------------------------------------------------
 * No clock, deliberately
 * ---------------------------------------------------------------------------
 * The xoin side of a market moves with time (`drift.ts`), and none of that
 * happens here: the float arrives on the command. A decider that read a clock
 * would stop being a pure fold of its history, and replaying this stream a
 * month from now would produce different state than it did when it was written
 * - which would make every balance in the read model unreproducible.
 */

/** One member's position, as folded from the trades. */
export interface Holding {
  specks: number
  /** Coins handed over across every buy, fees included. */
  spent: number
  /** Coins taken home across every sale. */
  returned: number
}

export const noHolding: Holding = { specks: 0, spent: 0, returned: 0 }

export interface XoinState {
  open: boolean
  mode: XoinMode
  reserves: Reserves
  holdings: Record<string, Holding>
}

export const initialXoinState: XoinState = {
  open: false,
  /*
   * `demo` before anything has happened, matching `DEFAULT_MODE`. A market that
   * has never been opened must never be read as one that spends purses - see
   * `readMode`, which makes the same choice about a value it does not
   * recognise, and for the same reason.
   */
  mode: 'demo',
  reserves: { coins: OPENING_COINS, specks: OPENING_SPECKS },
  holdings: {},
}

const held = (state: XoinState, who: string): Holding => state.holdings[who] ?? noHolding

export function evolve(state: XoinState, event: XoinEvent): XoinState {
  switch (event.type) {
    case 'MarketOpened':
      return { ...initialXoinState, open: true, mode: event.data.mode, holdings: {} }

    case 'ModeSet':
      /*
       * The book survives a mode change, and that is a decision rather than an
       * omission. A space that switches from `asset` back to `demo` has members
       * holding positions bought with real coins; wiping the book would be
       * taking those away as a side effect of a settings change, and wiping the
       * *holdings* would be worse. What a mode change does is stop the next
       * trade spending a purse. What it must never do is confiscate.
       */
      return { ...state, mode: event.data.mode }

    case 'Traded': {
      const { by, side, coins, specks, fee } = event.data
      const before = held(state, by)
      return {
        ...state,
        reserves: settle(state.reserves, { side, coins, specks, fee }),
        holdings: {
          ...state.holdings,
          [by]:
            side === 'buy'
              ? { ...before, specks: before.specks + specks, spent: before.spent + coins }
              : { ...before, specks: before.specks - specks, returned: before.returned + coins },
        },
      }
    }

    case 'TradeReversed': {
      /*
       * Exactly the inverse of the fill it undoes, including the totals - a
       * reversal that left `spent` behind would show a player money they never
       * actually parted with, in the one figure they use to decide whether they
       * are winning.
       */
      const { by, side, coins, specks, fee } = event.data
      const before = held(state, by)
      return {
        ...state,
        reserves: unsettle(state.reserves, { side, coins, specks, fee }),
        holdings: {
          ...state.holdings,
          [by]:
            side === 'buy'
              ? { ...before, specks: before.specks - specks, spent: before.spent - coins }
              : { ...before, specks: before.specks + specks, returned: before.returned - coins },
        },
      }
    }

    default:
      // An event this version has never heard of. Ignored rather than thrown,
      // so a rolled-back deploy can still replay newer history.
      return state
  }
}

export function decide(state: XoinState, command: XoinCommand): XoinEvent[] {
  switch (command.type) {
    case 'OpenMarket':
      // Opening twice is a no-op rather than an error: two admins pressing the
      // same button is not a mistake either of them made.
      if (state.open) return []
      return [{ type: 'MarketOpened', data: { mode: command.mode } }]

    case 'SetMode':
      if (!state.open) throw new DomainError('This space has no market yet.')
      if (state.mode === command.mode) return []
      return [{ type: 'ModeSet', data: { mode: command.mode } }]

    case 'RecordTrade': {
      if (!state.open) throw new DomainError('This space has no market yet.')

      /*
       * A demo trade must never reach a stream. Demo is a sandbox whose whole
       * definition is that nothing leaves the cartridge, so an append here
       * would be the one thing the mode promises cannot happen - and it would
       * arrive as a *real* position in a space that thinks it is playing.
       *
       * Refused in the decider rather than only at the action, because the
       * action is a polite layer and this is the promise the mode is made of.
       */
      if (!rulesOf(state.mode).spendsPurse) {
        throw new DomainError('This market is a demo. Nothing here is written down.')
      }

      const quote =
        command.side === 'buy'
          ? quoteBuy(state.reserves, command.float, command.size)
          : quoteSell(state.reserves, command.float, command.size)

      if (!quote) throw new DomainError('This market will not take a trade that size.')

      if (command.side === 'sell' && held(state, command.by).specks < command.size) {
        throw new DomainError('You do not hold that much.')
      }

      /*
       * The player's own floor. The epoch may have turned over between the
       * browser quoting and this fold running, so the price here is not the one
       * they were shown - `accepts` fills anything at least as good as what
       * they agreed to and refuses the rest, which is the whole reason the
       * field exists. See the note on `accepts`.
       */
      if (command.agreed && !accepts(quote, command.agreed)) {
        throw new DomainError('The price moved. Have another look.')
      }

      return [
        {
          type: 'Traded',
          data: {
            side: quote.side,
            by: command.by,
            coins: quote.coins,
            specks: quote.specks,
            fee: quote.fee,
            float: command.float,
          },
        },
      ]
    }

    case 'ReverseTrade':
      if (!state.open) return []
      return [
        {
          type: 'TradeReversed',
          data: {
            by: command.by,
            side: command.side,
            coins: command.coins,
            specks: command.specks,
            fee: command.fee,
            why: command.why,
          },
        },
      ]
  }
}

export const xoinDecider: Decider<XoinState, XoinCommand, XoinEvent> = {
  streamType: XOIN_STREAM_TYPE,
  initialState: initialXoinState,
  evolve,
  decide,
}
