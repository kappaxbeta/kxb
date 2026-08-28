/**
 * The rules, played out.
 *
 * ---------------------------------------------------------------------------
 * Every deal below is stacked, and none of them is shuffled
 * ---------------------------------------------------------------------------
 * `deal` takes a pack in the order it will be dealt from, and these tests hand
 * it one they wrote - which is the entire reason `apply` has no randomness in
 * it. A test that shuffled would be a test that fails one run in forty and
 * cannot say why.
 *
 * The pack is drawn from the *end* (`pop`), so these lists read backwards from
 * how they play. `packed` below turns a readable "this is dealt, then this is
 * the top card, then the pile in draw order" into the array `deal` wants,
 * because a test that gets that reversal wrong looks exactly like a rule that
 * is broken.
 */

import { describe, expect, test } from 'bun:test'

import { deckOf, sizeOf, readCard, suitOf, rankOf, type Card } from './cards'
import { HOUSE, MAX_PLAYERS, handCap, readHouse, sameHouse, type House } from './house'
import {
  apply,
  catchable,
  owesMau,
  deal,
  facing,
  follows,
  legal,
  playableIn,
  seatAfter,
  seatAt,
  seenBy,
  topOf,
  type Move,
  type Table,
} from './table'

/** No shuffle at all, so a refill is the discard in the order it was played. */
const asis = (cards: Card[]) => [...cards]

/**
 * Build the pack `deal` wants out of the order things should come off it.
 *
 * `hands` is dealt round by round - one card to each seat, then the next - so
 * this interleaves them the same way rather than making each test do it.
 */
function packed(hands: Card[][], top: Card, pile: Card[] = []): Card[] {
  const order: Card[] = []
  const rounds = Math.max(...hands.map((hand) => hand.length))
  for (let round = 0; round < rounds; round++) {
    for (const hand of hands) {
      const card = hand[round]
      if (card) order.push(card)
    }
  }
  order.push(top)
  order.push(...pile)
  // Dealt from the end.
  return order.reverse()
}

/**
 * Make a move, having first insisted it is a legal one.
 *
 * `apply` does not check - the authority calls `legal` first and `apply`
 * second, and splitting them is what lets the refusal messages be tested
 * separately from what a move does. The cost of that split is a test that can
 * quietly assert the behaviour of a play nobody could ever make, which is
 * exactly what the first version of the specials below did: a seven of hearts
 * onto a queen of spades, following nothing, stacking a debt in a game where it
 * would have been refused.
 *
 * The database implementation caught it, because that one has no way to apply a
 * move without deciding it first. Every play below goes through here now.
 */
const move = (from: Table, seat: string, what: Move): Table => {
  expect(legal(from, seat, what)).toBeNull()
  return apply(from, seat, what, asis)
}

const table = (
  seats: string[],
  hands: Card[][],
  top: Card,
  pile: Card[] = [],
  house: Partial<House> = {},
): Table => {
  const rules = { ...HOUSE, ...house, hand: hands[0]!.length }
  return deal(seats, packed(hands, top, pile), rules)
}

describe('a card', () => {
  test('is a suit letter and a rank, both ways round', () => {
    expect(suitOf('h7')).toBe('hearts')
    expect(rankOf('h7')).toBe('7')
    expect(suitOf('d10')).toBe('diamonds')
    expect(rankOf('d10')).toBe('10')
    expect(rankOf('sA')).toBe('A')
  })

  test('refuses anything that is not one', () => {
    for (const junk of ['', 'x7', 'h', 'h1', 'hearts7', 7, null, {}, 'h07']) {
      expect(readCard(junk)).toBeNull()
    }
  })

  test('comes in packs of thirty-two and fifty-two, with no repeats', () => {
    for (const deck of ['short', 'full'] as const) {
      const pack = deckOf(deck)
      expect(pack.length).toBe(sizeOf(deck))
      expect(new Set(pack).size).toBe(pack.length)
    }
    expect(deckOf('short')).not.toContain('h2')
    expect(deckOf('full')).toContain('h2')
  })
})

describe('the deal', () => {
  test('gives everybody a hand and turns one card up', () => {
    const game = table(['a', 'b', 'c'], [['h7', 'h8'], ['d9', 'd10'], ['cQ', 'cK']], 'sA')
    expect(game.hands.a).toEqual(['h7', 'h8'])
    expect(game.hands.b).toEqual(['d9', 'd10'])
    expect(game.hands.c).toEqual(['cQ', 'cK'])
    expect(topOf(game.discard)).toBe('sA')
    expect(seatAt(game)).toBe('a')
  })

  test('never opens on a jack', () => {
    const game = table(['a', 'b'], [['h7'], ['h8']], 'sJ', ['d9'])
    expect(rankOf(topOf(game.discard)!)).not.toBe('J')
    expect(topOf(game.discard)).toBe('d9')
    // The buried jack goes back under the pile rather than out of the game.
    expect(game.pile).toContain('sJ')
  })

  test('a face-up seven owes nobody anything', () => {
    const game = table(['a', 'b'], [['h8'], ['h9']], 's7')
    expect(game.owed).toBe(0)
  })

  test('refuses a table of one', () => {
    expect(() => deal(['a'], deckOf(), HOUSE)).toThrow()
  })
})

describe('following', () => {
  const house = HOUSE

  test('matches the suit or the rank', () => {
    expect(follows('h9', ['h7'], null, 0, house)).toBeNull()
    expect(follows('d7', ['h7'], null, 0, house)).toBeNull()
    expect(follows('d9', ['h7'], null, 0, house)).not.toBeNull()
  })

  test('a jack goes on anything but a jack', () => {
    expect(follows('sJ', ['h7'], null, 0, house)).toBeNull()
    expect(follows('sJ', ['hJ'], null, 0, house)).not.toBeNull()
    expect(follows('sJ', ['hJ'], null, 0, { ...house, jackOnJack: false })).toBeNull()
  })

  test('a wish replaces the top card’s suit, and its rank with it', () => {
    // A jack of clubs wished into hearts. Hearts follow; clubs do not.
    expect(facing(['cJ'], 'hearts')).toBe('hearts')
    expect(follows('h8', ['cJ'], 'hearts', 0, house)).toBeNull()
    expect(follows('c8', ['cJ'], 'hearts', 0, house)).not.toBeNull()
    // ...and neither does another jack, which would otherwise match by rank.
    expect(follows('dJ', ['cJ'], 'hearts', 0, house)).not.toBeNull()
  })

  test('a debt is answered with a seven or not at all', () => {
    expect(follows('h7', ['s7'], null, 2, house)).toBeNull()
    // A matching suit is not an answer.
    expect(follows('s8', ['s7'], null, 2, house)).not.toBeNull()
    expect(follows('sJ', ['s7'], null, 2, house)).not.toBeNull()
  })
})

describe('a turn', () => {
  test('passes to the next seat', () => {
    const game = table(['a', 'b', 'c'], [['h7', 'hQ'], ['d9', 'd10'], ['cQ', 'cK']], 'sQ')
    const after = move(game, 'a', { kind: 'play', card: 'hQ' })
    expect(seatAt(after)).toBe('b')
  })

  test('is refused to anybody whose turn it is not', () => {
    const game = table(['a', 'b'], [['h7'], ['hQ']], 'sQ')
    expect(legal(game, 'b', { kind: 'draw' })).toBe('not your turn')
    expect(legal(game, 'z', { kind: 'draw' })).toBe('you are not at this table')
  })

  test('is refused a card that is not in the hand', () => {
    const game = table(['a', 'b'], [['h7'], ['hQ']], 'sQ')
    expect(legal(game, 'a', { kind: 'play', card: 'hQ' })).toBe('that card is not in your hand')
  })

  test('ends when you draw, whatever you drew', () => {
    const game = table(['a', 'b'], [['h7', 'h8'], ['d9', 'd10']], 'sQ', ['cK'])
    const after = move(game, 'a', { kind: 'draw' })
    expect(after.hands.a).toHaveLength(3)
    expect(seatAt(after)).toBe('b')
  })

  test('goes backwards and forwards with the modulo intact', () => {
    expect(seatAfter(0, -1, 4)).toBe(3)
    expect(seatAfter(0, -1, 4, 2)).toBe(2)
    expect(seatAfter(3, 1, 4)).toBe(0)
  })
})

describe('the specials', () => {
  test('a seven makes the next player owe two, and sevens stack', () => {
    // The top card is a heart, so the opening seven follows it. It was a queen
    // of spades before, which nobody could have played that seven onto.
    const game = table(
      ['a', 'b', 'c'],
      [['h7', 'hQ'], ['d7', 'dQ'], ['cQ', 'cK']],
      'hK',
      ['s10', 'sK', 'c10', 'd10'],
    )
    const one = move(game, 'a', { kind: 'play', card: 'h7' })
    expect(one.owed).toBe(2)
    expect(seatAt(one)).toBe('b')

    const two = move(one, 'b', { kind: 'play', card: 'd7' })
    expect(two.owed).toBe(4)
    expect(seatAt(two)).toBe('c')

    // c cannot answer, so c pays for two people's sevens.
    expect(legal(two, 'c', { kind: 'play', card: 'cQ' })).toBe(
      'you owe cards - play a seven or draw',
    )
    const paid = move(two, 'c', { kind: 'draw' })
    expect(paid.hands.c).toHaveLength(2 + 4)
    expect(paid.owed).toBe(0)
    expect(seatAt(paid)).toBe('a')
  })

  test('an eight skips the next player', () => {
    const game = table(['a', 'b', 'c'], [['h8', 'h9'], ['d9', 'd10'], ['cQ', 'cK']], 'hK')
    const after = move(game, 'a', { kind: 'play', card: 'h8' })
    expect(seatAt(after)).toBe('c')
  })

  test('a nine turns the play around', () => {
    const game = table(['a', 'b', 'c'], [['h9', 'h8'], ['d9', 'd10'], ['cQ', 'cK']], 'hK')
    const after = move(game, 'a', { kind: 'play', card: 'h9' })
    expect(after.direction).toBe(-1)
    expect(seatAt(after)).toBe('c')
  })

  test('a nine at two players skips rather than quietly doing nothing', () => {
    const game = table(['a', 'b'], [['h9', 'hQ'], ['d9', 'd10']], 'hK')
    const after = move(game, 'a', { kind: 'play', card: 'h9' })
    expect(seatAt(after)).toBe('a')
    // The direction is left alone, because flipping it at two seats is what
    // makes the card mean nothing in the first place.
    expect(after.direction).toBe(1)
  })

  test('an ace gives another turn', () => {
    const game = table(['a', 'b'], [['hA', 'hQ'], ['d9', 'd10']], 'sA')
    const after = move(game, 'a', { kind: 'play', card: 'hA' })
    expect(seatAt(after)).toBe('a')
  })

  test('a jack names a suit, and must', () => {
    const game = table(['a', 'b'], [['hJ', 'sK'], ['d9', 'd10']], 'sQ')
    expect(legal(game, 'a', { kind: 'play', card: 'hJ' })).toBe('name a suit')
    // A wish on a card that follows perfectly well, so the refusal is about the
    // wish and not about the card.
    expect(legal(game, 'a', { kind: 'play', card: 'sK', wish: 'clubs' })).toBe(
      'only a jack names a suit',
    )

    const after = move(game, 'a', { kind: 'play', card: 'hJ', wish: 'clubs' })
    expect(after.wish).toBe('clubs')
    expect(legal(after, 'b', { kind: 'play', card: 'd9' })).toBe('follow the suit that was asked for')
  })

  test('a wish lasts exactly one card', () => {
    const game = table(['a', 'b'], [['hJ', 'hQ'], ['c10', 'd10']], 'sQ')
    const wished = move(game, 'a', { kind: 'play', card: 'hJ', wish: 'clubs' })
    const answered = move(wished, 'b', { kind: 'play', card: 'c10' })
    expect(answered.wish).toBeNull()
  })

  test('are all switchable off, and then they are plain cards', () => {
    const plain = { sevens: false, eights: false, nines: false, aces: false }
    const game = table(['a', 'b', 'c'], [['h7', 'hQ'], ['d9', 'd10'], ['cQ', 'cK']], 'hK', [], plain)
    const after = move(game, 'a', { kind: 'play', card: 'h7' })
    expect(after.owed).toBe(0)
    expect(seatAt(after)).toBe('b')
  })
})

describe('Mau', () => {
  test('is said on the card that takes you to one', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ')
    const said = move(game, 'a', { kind: 'play', card: 'hQ', mau: true })
    expect(said.said).toEqual(['a'])
    expect(catchable(seenBy(said, 'b'))).toEqual([])
  })

  test('leaves you catchable when you forget, for two cards', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ', ['cK', 'c10'])
    const quiet = move(game, 'a', { kind: 'play', card: 'hQ' })
    expect(catchable(seenBy(quiet, 'b'))).toEqual(['a'])

    const caught = move(quiet, 'b', { kind: 'catch', who: 'a' })
    expect(caught.hands.a).toHaveLength(3)
    // A catch is not a turn: it was b's go before and it still is.
    expect(seatAt(caught)).toBe('b')
    expect(catchable(seenBy(caught, 'b'))).toEqual([])
  })

  test('cannot be claimed for somebody who said it, or for yourself', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ')
    const said = move(game, 'a', { kind: 'play', card: 'hQ', mau: true })
    expect(legal(said, 'b', { kind: 'catch', who: 'a' })).toBe('they said it')
    expect(legal(said, 'a', { kind: 'catch', who: 'a' })).toBe('you cannot catch yourself')
  })

  test('does not survive being made to draw', () => {
    const game = table(['a', 'b'], [['d7', 'hQ'], ['h7', 'd10']], 'sQ', ['cK', 'cQ'])
    const said = move(game, 'a', { kind: 'play', card: 'hQ', mau: true })
    expect(said.said).toEqual(['a'])
    // b's seven puts two into a's hand, and what a said is no longer true.
    const seven = move(said, 'b', { kind: 'play', card: 'h7' })
    const paid = move(seven, 'a', { kind: 'draw' })
    expect(paid.hands.a).toHaveLength(3)
    expect(paid.said).toEqual([])
  })

  test('can be said after the card is down, which is how it is really played', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ', ['cK', 'c10'])
    const quiet = move(game, 'a', { kind: 'play', card: 'hQ' })
    expect(quiet.said).toEqual([])
    expect(catchable(seenBy(quiet, 'b'))).toEqual(['a'])
    expect(owesMau(seenBy(quiet, 'a'))).toBe(true)

    // Out of turn on purpose: the card is down and play has moved on. That is
    // the whole point - it is a race with whoever is about to catch you.
    const said = move(quiet, 'a', { kind: 'mau' })
    expect(said.said).toEqual(['a'])
    expect(seatAt(said)).toBe('b')
    expect(owesMau(seenBy(said, 'a'))).toBe(false)
    expect(legal(said, 'b', { kind: 'catch', who: 'a' })).toBe('they said it')
  })

  test('cannot be said early, twice, or once you have been caught', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ', ['cK', 'c10'])
    expect(legal(game, 'a', { kind: 'mau' })).toBe('you are not on your last card')

    const armed = move(game, 'a', { kind: 'play', card: 'hQ', mau: true })
    expect(legal(armed, 'a', { kind: 'mau' })).toBe('you have already said it')

    const quiet = move(game, 'a', { kind: 'play', card: 'hQ' })
    const caught = move(quiet, 'b', { kind: 'catch', who: 'a' })
    expect(legal(caught, 'a', { kind: 'mau' })).toBe('you are not on your last card')
  })

  test('is not played at all when the house has it off', () => {
    const game = table(['a', 'b'], [['h7', 'hQ'], ['d9', 'd10']], 'sQ', [], { mau: false })
    const quiet = move(game, 'a', { kind: 'play', card: 'hQ' })
    expect(legal(quiet, 'b', { kind: 'catch', who: 'a' })).toBe('this table does not play Mau')
    expect(legal(quiet, 'a', { kind: 'mau' })).toBe('this table does not play Mau')
    expect(catchable(seenBy(quiet, 'b'))).toEqual([])
  })
})

describe('the end', () => {
  test('is the last card, and it counts a win', () => {
    const game = table(['a', 'b'], [['hQ'], ['d9']], 'sQ')
    const over = move(game, 'a', { kind: 'play', card: 'hQ', mau: true })
    expect(over.phase).toBe('over')
    expect(over.winner).toBe('a')
    expect(over.wins.a).toBe(1)
    expect(legal(over, 'b', { kind: 'draw' })).toBe('the hand is over')
  })

  test('carries the score into the next hand', () => {
    const game = table(['a', 'b'], [['hQ'], ['d9']], 'sQ')
    const over = move(game, 'a', { kind: 'play', card: 'hQ' })
    const again = deal(['a', 'b'], deckOf(), HOUSE, over.wins)
    expect(again.wins.a).toBe(1)
    expect(again.phase).toBe('playing')
  })
})

describe('the pile', () => {
  test('is refilled from the discard, leaving the top card alone', () => {
    // One card to draw, then nothing: the next draw has to reshuffle.
    const game = table(['a', 'b'], [['h7', 'hQ'], ['sK', 'd10']], 'sQ', ['cK'])
    const one = move(game, 'a', { kind: 'draw' })
    expect(one.pile).toHaveLength(0)

    const two = move(one, 'b', { kind: 'play', card: 'sK' })
    const three = move(two, 'a', { kind: 'draw' })
    // 'sK' is the top and stays there; 'sQ' came back round as the pile.
    expect(topOf(three.discard)).toBe('sK')
    expect(three.hands.a).toContain('sQ')
  })

  test('running out entirely still ends the turn rather than throwing', () => {
    const game = table(['a', 'b'], [['h7'], ['d9']], 'sQ')
    expect(game.pile).toHaveLength(0)
    const after = move(game, 'a', { kind: 'draw' })
    expect(after.hands.a).toHaveLength(1)
    expect(seatAt(after)).toBe('b')
  })
})

describe('what a player is shown', () => {
  test('is their own hand and everybody else as a number', () => {
    const game = table(['a', 'b', 'c'], [['h7', 'h8'], ['d9', 'd10'], ['cQ', 'cK']], 'sQ')
    const seen = seenBy(game, 'b')
    expect(seen.hand).toEqual(['d9', 'd10'])
    expect(seen.counts).toEqual({ a: 2, b: 2, c: 2 })
    expect(JSON.stringify(seen)).not.toContain('h7')
    expect(JSON.stringify(seen)).not.toContain('cQ')
  })

  test('never carries the pile, only its size', () => {
    const game = table(['a', 'b'], [['h7'], ['d9']], 'sQ', ['cK', 'c9'])
    const seen = seenBy(game, 'a')
    expect(seen.pile).toBe(2)
    expect(JSON.stringify(seen)).not.toContain('cK')
  })

  test('greys out exactly the cards the authority would refuse', () => {
    const game = table(['a', 'b'], [['h7', 'd8', 'sJ'], ['d9', 'd10', 'c9']], 'sQ')
    const seen = seenBy(game, 'a')
    expect(new Set(playableIn(seen))).toEqual(new Set(['sJ']))
    for (const card of seen.hand) {
      const allowed = legal(game, 'a', {
        kind: 'play',
        card,
        ...(rankOf(card) === 'J' ? { wish: 'hearts' as const } : {}),
      })
      expect(allowed === null).toBe(playableIn(seen).includes(card))
    }
  })

  test('shows nobody anything when it is not their turn', () => {
    const game = table(['a', 'b'], [['h7'], ['sJ']], 'sQ')
    expect(playableIn(seenBy(game, 'b'))).toEqual([])
  })
})

describe('the house', () => {
  test('fills in everything that was not said', () => {
    expect(readHouse(null)).toEqual(HOUSE)
    expect(readHouse({})).toEqual(HOUSE)
    expect(readHouse({ nines: false }).nines).toBe(false)
    expect(readHouse({ nines: false }).sevens).toBe(true)
  })

  test('clamps a hand to something the pack can actually deal', () => {
    expect(readHouse({ hand: 900 }, 4).hand).toBe(handCap('short', 4))
    expect(readHouse({ hand: 0 }).hand).toBe(2)
    expect(handCap('short', 4)).toBe(6)
    // The full table: five hands of five out of thirty-two, and a pile of six.
    expect(handCap('short', 5)).toBe(5)
    expect(handCap('full', 2)).toBe(17)
  })

  test('knows when two tables are playing different games', () => {
    expect(sameHouse(HOUSE, readHouse({}))).toBe(true)
    expect(sameHouse(HOUSE, readHouse({ nines: false }))).toBe(false)
  })

  test('a capped hand always leaves a pile at least as big as the deal', () => {
    for (const deck of ['short', 'full'] as const) {
      for (let seats = 2; seats <= MAX_PLAYERS; seats++) {
        const hand = handCap(deck, seats)
        expect(sizeOf(deck) - hand * seats - 1).toBeGreaterThanOrEqual(hand)
      }
    }
  })
})

describe('a whole four-handed game', () => {
  /**
   * Played out from a stacked pack, move by move, with every rule in the file
   * firing at least once.
   *
   * This is the test that catches what unit tests do not: a debt paid by
   * somebody who never played a seven, a wish surviving a draw and into a third
   * player's turn, a Mau said on the card that made it true, and a pile that
   * runs down without ever going wrong. It asserts the seat after every move,
   * because that is the one number a rule can get wrong without anything else
   * looking odd.
   */
  test('runs from deal to winner with the seat correct at every step', () => {
    const seats = ['a', 'b', 'c', 'd']
    const game = table(
      seats,
      [
        ['h7', 's9', 'hJ'],
        ['d7', 'd8', 'dQ'],
        ['c10', 'cK', 'cA'],
        ['s10', 'sQ', 'sK'],
      ],
      'h10',
      ['s7', 'd10', 'c7', 'h8', 'sA', 'dK', 'c9', 'hK'],
    )

    expect(seatAt(game)).toBe('a')
    expect(game.pile).toHaveLength(8)

    // a opens with a seven of the top card's suit. b owes two.
    const one = move(game, 'a', { kind: 'play', card: 'h7' })
    expect(one.owed).toBe(2)
    expect(seatAt(one)).toBe('b')

    // b answers with a seven of its own, and hands four on to somebody who
    // played nothing at all.
    const two = move(one, 'b', { kind: 'play', card: 'd7' })
    expect(two.owed).toBe(4)
    expect(seatAt(two)).toBe('c')

    expect(legal(two, 'c', { kind: 'play', card: 'c10' })).toBe(
      'you owe cards - play a seven or draw',
    )
    const three = move(two, 'c', { kind: 'draw' })
    expect(three.hands.c).toHaveLength(7)
    expect(three.owed).toBe(0)
    expect(three.pile).toHaveLength(4)
    expect(seatAt(three)).toBe('d')

    // d has nothing on a seven of diamonds, so d takes one and passes.
    const four = move(three, 'd', { kind: 'draw' })
    expect(four.hands.d).toHaveLength(4)
    expect(seatAt(four)).toBe('a')

    // a is down to a nine that does not follow and a jack that follows
    // anything. The jack goes down and a is on one card - and says so.
    const five = move(four, 'a', { kind: 'play', card: 'hJ', wish: 'spades' })
    expect(five.wish).toBe('spades')
    expect(five.hands.a).toEqual(['s9'])
    expect(catchable(seenBy(five, 'b'))).toEqual(['a'])

    const spoken = apply(four, 'a', { kind: 'play', card: 'hJ', wish: 'spades', mau: true }, asis)
    expect(spoken.said).toEqual(['a'])
    expect(catchable(seenBy(spoken, 'b'))).toEqual([])
    expect(seatAt(spoken)).toBe('b')

    // b holds nothing but diamonds against a wish for spades.
    expect(legal(spoken, 'b', { kind: 'play', card: 'd8' })).toBe('follow the suit that was asked for')
    const six = move(spoken, 'b', { kind: 'draw' })
    // Drawing does not answer a wish, so it is still standing for c.
    expect(six.wish).toBe('spades')
    expect(seatAt(six)).toBe('c')

    // c drew a seven of spades four turns ago and can now use it.
    const seven = move(six, 'c', { kind: 'play', card: 's7' })
    expect(seven.wish).toBeNull()
    expect(seven.owed).toBe(2)
    expect(seatAt(seven)).toBe('d')

    const eight = move(seven, 'd', { kind: 'draw' })
    expect(eight.hands.d).toHaveLength(6)
    expect(eight.pile).toHaveLength(0)
    expect(seatAt(eight)).toBe('a')

    // a's last card follows the seven by suit, so a goes out on it.
    const nine = move(eight, 'a', { kind: 'play', card: 's9' })
    expect(nine.phase).toBe('over')
    expect(nine.winner).toBe('a')
    expect(nine.wins).toEqual({ a: 1 })
    expect(legal(nine, 'b', { kind: 'draw' })).toBe('the hand is over')

    // No card was created, destroyed or in two places at once - the invariant a
    // reshuffle or a badly spliced hand breaks first.
    const everything = [...nine.pile, ...nine.discard, ...Object.values(nine.hands).flat()]
    expect(new Set(everything).size).toBe(everything.length)
    expect(everything).toHaveLength(21)
  })
})
