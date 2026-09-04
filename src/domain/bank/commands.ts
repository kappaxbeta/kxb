import { MAX_PRICE } from '@/domain/bank/prices'

/**
 * What can be asked of a space's bank.
 *
 * Deliberately four commands and no Zod schema, and the absence is the guard
 * rather than an omission - the same call `homestead/commands.ts` makes about
 * `SpendCoins`. **Nothing a browser sends reaches this file.** Every one of
 * these is issued by a server action that has already established who is
 * asking, read a price out of a row, and derived both stream ids itself.
 *
 * The one number a person really does choose is a grant's amount, and it is
 * parsed at the action, against `MAX_GRANT` below.
 */

/** Coins arriving from a member. See `CoinsBanked`. */
export type BankCoins = {
  type: 'BankCoins'
  from: string
  amount: number
  reason: 'needs' | 'room-entry' | 'bank-grant-out' | 'channel'
  what?: string
  transfer: string
}

/** Coins leaving for a member. See `CoinsWithdrawn`. */
export type WithdrawCoins = {
  type: 'WithdrawCoins'
  to: string
  amount: number
  reason: 'bank-grant-in' | 'loan'
  transfer: string
}

export type BankCommand = BankCoins | WithdrawCoins

/**
 * The most a bank may move at once.
 *
 * `MAX_PRICE` rather than a number of its own, because the two bounds are the
 * same bound: the largest single thing anybody can buy in this product is a
 * vehicle on the free tier, and a movement larger than that is somebody's
 * typing rather than somebody's intent. Sharing the constant means the two
 * cannot drift apart into a state where a legitimate purchase is refused by the
 * guard meant to catch a stray zero.
 *
 * The guard that actually matters is the balance, and it is in the decider.
 */
export const MAX_GRANT = MAX_PRICE
