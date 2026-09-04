import { MAX_GRANT, type BankCommand } from '@/domain/bank/commands'
import { BANK_STREAM_TYPE, type BankEvent } from '@/domain/bank/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * The one rule a bank has: it cannot pay out what it does not hold.
 *
 * Everything else about a space's money is somebody's policy - what a sandwich
 * costs, whether hunger is on, who may be lent to. Those belong to the actions
 * and the settings that own them. This is the invariant, and it is here because
 * here is the only place that can see the folded balance at the moment of the
 * write.
 *
 * ---------------------------------------------------------------------------
 * State is one number
 * ---------------------------------------------------------------------------
 * Not who paid in, not what was bought, not how much has been lent. All of that
 * is in the log and belongs in the read model, and putting it here would mean
 * the decider grows a row every time somebody wants a new column on a page.
 * The decider holds what it needs to decide, which is the balance.
 */

export interface BankState {
  coins: number
}

export const initialBankState: BankState = { coins: 0 }

export function evolve(state: BankState, event: BankEvent): BankState {
  switch (event.type) {
    case 'CoinsBanked':
      return { coins: state.coins + event.data.amount }

    case 'CoinsWithdrawn':
      return { coins: state.coins - event.data.amount }

    default:
      // Total, so a stream containing an event written by a newer version of
      // this code still folds rather than throwing halfway through a replay.
      return state
  }
}

/**
 * A whole, positive, plausible number of coins.
 *
 * Three checks that look like belt and braces over a typed parameter, and are
 * not: these commands are built by server actions from prices read out of rows
 * that a person typed into a form. `amount` is a `number` to the compiler and
 * could still be `0`, `-40`, `1e9` or `NaN` by the time it arrives.
 *
 * Zero is refused rather than ignored. A free sandwich is a real thing an owner
 * may want, and the right way to have one is to not charge for it - a zero-coin
 * movement written into the log is a row that says nothing happened, forever.
 */
function checkAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new DomainError('Coins come in whole positive numbers')
  }
  if (amount > MAX_GRANT) {
    throw new DomainError(`That is more than ${MAX_GRANT} coins`)
  }
}

export const bankDecider: Decider<BankState, BankCommand, BankEvent> = {
  streamType: BANK_STREAM_TYPE,
  initialState: initialBankState,
  evolve,

  decide(state, command) {
    switch (command.type) {
      case 'BankCoins': {
        checkAmount(command.amount)
        return [
          {
            type: 'CoinsBanked',
            data: {
              from: command.from,
              amount: command.amount,
              reason: command.reason,
              // Spread rather than `what: command.what`, because an explicit
              // `undefined` in a jsonb payload is a key with a null in it - a
              // column of "what: null" on every grant, forever.
              ...(command.what === undefined ? {} : { what: command.what }),
              transfer: command.transfer,
            },
          },
        ]
      }

      case 'WithdrawCoins': {
        checkAmount(command.amount)

        /**
         * The invariant. Note it is `>` and not `>=`: a bank may be emptied
         * exactly, and an owner who pays out their last coin has done something
         * ordinary rather than something to be refused.
         */
        if (command.amount > state.coins) {
          throw new DomainError(
            state.coins === 0
              ? 'This space has nothing banked'
              : `This space has only ${state.coins} coins banked`,
          )
        }

        return [
          {
            type: 'CoinsWithdrawn',
            data: {
              to: command.to,
              amount: command.amount,
              reason: command.reason,
              transfer: command.transfer,
            },
          },
        ]
      }

      default: {
        const exhaustive: never = command
        throw new Error(`Unknown command: ${JSON.stringify(exhaustive)}`)
      }
    }
  },
}
