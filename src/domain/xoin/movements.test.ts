import { describe, expect, test } from 'bun:test'

import { OPENING_COINS, OPENING_SPECKS, SPECKS, quoteBuy, quoteSell } from '@kxb/xoin'

import { movementsFor, netFor } from '@/domain/xoin/movements'

/**
 * That a trade moves exactly the coins it says it moves.
 *
 * Two movements per fill, the fee its own line, and a sale that credits the
 * gross before paying the house. Every one of those is a sign away from being
 * wrong, and every wrong version fails silently - which is the whole reason
 * this arithmetic was lifted out of the action.
 */

const reserves = { coins: OPENING_COINS, specks: OPENING_SPECKS }

describe('what a fill does to a purse', () => {
  test('a buy takes exactly what the quote said, no more and no less', () => {
    const quote = quoteBuy(reserves, OPENING_SPECKS, 40)!
    expect(netFor(quote)).toBe(-quote.coins)
  })

  test('a sale hands over exactly what the quote said', () => {
    const quote = quoteSell(reserves, OPENING_SPECKS, 40 * SPECKS)!
    expect(netFor(quote)).toBe(quote.coins)
  })

  test('the fee is always its own line, and always goes to the house', () => {
    for (const quote of [
      quoteBuy(reserves, OPENING_SPECKS, 40)!,
      quoteSell(reserves, OPENING_SPECKS, 40 * SPECKS)!,
    ]) {
      const banked = movementsFor(quote).filter((movement) => movement.kind === 'bank')
      expect(banked).toHaveLength(1)
      expect(banked[0].amount).toBe(quote.fee)
      expect(banked[0].reason).toBe('xoin-fee')
    }
  })

  test('a sale credits the gross before the house takes its cut', () => {
    /*
     * Not a stylistic preference: crediting the net and then charging the fee
     * would take a coin the player never received.
     */
    const quote = quoteSell(reserves, OPENING_SPECKS, 40 * SPECKS)!
    const [credited] = movementsFor(quote)
    expect(credited.kind).toBe('earn')
    expect(credited.amount).toBe(quote.coins + quote.fee)
  })

  test('a round trip costs the player both fees and nothing else appears', () => {
    const buy = quoteBuy(reserves, OPENING_SPECKS, 100)!
    const sell = quoteSell(reserves, OPENING_SPECKS, buy.specks)!

    const fees = movementsFor(buy)
      .concat(movementsFor(sell))
      .filter((movement) => movement.kind === 'bank')
      .reduce((total, movement) => total + movement.amount, 0)

    expect(fees).toBe(buy.fee + sell.fee)
  })

  test('every movement is a positive amount', () => {
    // A negative amount would be a direction expressed twice, and one of the
    // two would eventually be read on its own.
    for (const quote of [
      quoteBuy(reserves, OPENING_SPECKS, 40)!,
      quoteSell(reserves, OPENING_SPECKS, 40 * SPECKS)!,
    ]) {
      for (const movement of movementsFor(quote)) expect(movement.amount).toBeGreaterThan(0)
    }
  })
})
