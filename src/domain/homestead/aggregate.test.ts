import { describe, expect, test } from 'bun:test'
import { prop as cafeProp, refundOf as cafeRefund } from '@kxb/dream-restaurant/catalog'
import { dishPrice } from '@/domain/homestead/pricing'
import {
  decide,
  evolve,
  initialHomesteadState,
  type HomesteadState,
} from '@/domain/homestead/aggregate'
import { MAX_TRANSFER, type HomesteadEvent } from '@/domain/homestead/events'
import { DomainError } from '@/es/errors'

/** Fold a list of events, the way `executeCommand` folds a stream. */
function fold(events: HomesteadEvent[], from = initialHomesteadState): HomesteadState {
  return events.reduce(evolve, from)
}

const FOUNDED: HomesteadEvent = {
  type: 'HomesteadFounded',
  data: {
    coins: 120,
    layout: {
      cafe: [{ tile: '3,0', propId: 'counter', rotY: 0 }],
      home: [],
      outdoor: [],
    },
  },
}

function founded(coins = 120): HomesteadState {
  const state = fold([FOUNDED])
  return { ...state, coins }
}

describe('founding', () => {
  test('opens the homestead with its coins and its opening layout', () => {
    const state = fold([FOUNDED])

    expect(state.founded).toBe(true)
    expect(state.coins).toBe(120)
    expect(state.places.cafe.props.get('3,0')?.propId).toBe('counter')
    expect(state.places.home.props.size).toBe(0)
  })

  test('founding twice is a no-op, not an error', () => {
    // Every page load asks, because that is the only reliable moment to notice
    // a workspace has never opened one. It must be free to ask again.
    const state = fold([FOUNDED])
    expect(
      decide(state, { type: 'FoundHomestead', coins: 999, layout: {} }),
    ).toEqual([])
  })

  test('nothing may be done before founding', () => {
    expect(() =>
      decide(initialHomesteadState, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '1,1',
        propId: 'oven',
        rotY: 0,
      }),
    ).toThrow(DomainError)
  })
})

describe('the purse', () => {
  test('placing deducts the catalogue price', () => {
    const state = founded(500)
    const [event] = decide(state, {
      type: 'PlaceProp',
      place: 'cafe',
      tile: '1,1',
      propId: 'oven',
      rotY: 0,
    })

    expect(event.type).toBe('PropPlaced')
    expect(fold([event], state).coins).toBe(500 - cafeProp('oven')!.price)
  })

  test('you cannot buy what the till cannot cover', () => {
    const broke = founded(5)
    expect(() =>
      decide(broke, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '1,1',
        propId: 'oven',
        rotY: 0,
      }),
    ).toThrow(/till holds 5/)
  })

  test('the price is taken from the log, not from the catalogue, on replay', () => {
    /**
     * The guarantee that stops re-pricing a stove from silently rewriting every
     * workspace's balance. A recorded price of 1 stays 1 however the shop
     * changes underneath it.
     */
    const state = fold(
      [
        FOUNDED,
        {
          type: 'PropPlaced',
          data: {
            place: 'cafe',
            tile: '1,1',
            propId: 'oven',
            rotY: 0,
            onSurface: false,
            price: 1,
          },
        },
      ],
    )
    expect(state.coins).toBe(119)
  })

  test('selling pays the refund back', () => {
    const state = fold(
      [
        {
          type: 'PropPlaced',
          data: {
            place: 'cafe',
            tile: '1,1',
            propId: 'oven',
            rotY: 0,
            onSurface: false,
            price: 260,
          },
        },
      ],
      founded(500),
    )

    const [event] = decide(state, { type: 'RemoveProp', place: 'cafe', tile: '1,1' })
    expect(fold([event], state).coins).toBe(
      state.coins + cafeRefund(cafeProp('oven')!),
    )
  })

  test('selling nothing is a no-op rather than free money', () => {
    expect(
      decide(founded(), { type: 'RemoveProp', place: 'cafe', tile: '9,9' }),
    ).toEqual([])
  })
})

describe('one thing per square', () => {
  test('an occupied square refuses ordinary furniture', () => {
    const state = founded(999)
    expect(() =>
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '3,0',
        propId: 'oven',
        rotY: 0,
      }),
    ).toThrow(/already there/)
  })

  test('a worktop decoration may go on top of a counter', () => {
    const state = founded(999)
    const [event] = decide(state, {
      type: 'PlaceProp',
      place: 'cafe',
      tile: '3,0',
      propId: 'jars',
      rotY: 0,
    })

    expect(event.data).toMatchObject({ onSurface: true })
    const after = fold([event], state)
    expect(after.places.cafe.props.get('3,0')?.propId).toBe('counter')
    expect(after.places.cafe.props.get('3,0')?.topper?.propId).toBe('jars')
  })

  test('only one thing stands on a worktop', () => {
    let state = founded(999)
    state = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '3,0',
        propId: 'jars',
        rotY: 0,
      }),
      state,
    )

    expect(() =>
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '3,0',
        propId: 'condiments',
        rotY: 0,
      }),
    ).toThrow(/already something on that/)
  })

  test('the house has no worktops, so it refuses the whole idea', () => {
    /**
     * Not an oversight - HomeProp has no `onSurface` flag, so there is nothing
     * to infer from. Refusing is the honest answer; guessing would put a bath
     * on a bedside table.
     */
    const state = fold(
      [
        {
          type: 'HomesteadFounded',
          data: {
            coins: 999,
            layout: { home: [{ tile: '1,1', propId: 'bed', rotY: 0 }] },
          },
        },
      ],
    )

    expect(() =>
      decide(state, {
        type: 'PlaceProp',
        place: 'home',
        tile: '1,1',
        propId: 'monstera',
        rotY: 0,
      }),
    ).toThrow(/already there/)
  })

  test('bulldozing takes the decoration first and leaves the counter', () => {
    let state = founded(999)
    state = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '3,0',
        propId: 'jars',
        rotY: 0,
      }),
      state,
    )

    const [first] = decide(state, { type: 'RemoveProp', place: 'cafe', tile: '3,0' })
    expect(first.data).toMatchObject({ onSurface: true })
    state = fold([first], state)
    expect(state.places.cafe.props.get('3,0')?.topper).toBeUndefined()
    expect(state.places.cafe.props.get('3,0')?.propId).toBe('counter')

    const [second] = decide(state, { type: 'RemoveProp', place: 'cafe', tile: '3,0' })
    expect(second.data).toMatchObject({ onSurface: false })
    expect(fold([second], state).places.cafe.props.has('3,0')).toBe(false)
  })
})

describe('moving', () => {
  test('moving is free and carries the worktop decoration along', () => {
    let state = founded(999)
    state = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '3,0',
        propId: 'jars',
        rotY: 0,
      }),
      state,
    )
    const before = state.coins

    const [event] = decide(state, {
      type: 'MoveProp',
      place: 'cafe',
      from: '3,0',
      to: '4,4',
      rotY: 0,
    })
    const after = fold([event], state)

    expect(after.coins).toBe(before)
    expect(after.places.cafe.props.has('3,0')).toBe(false)
    expect(after.places.cafe.props.get('4,4')?.topper?.propId).toBe('jars')
  })

  test('moving onto an occupied square is refused', () => {
    let state = founded(999)
    state = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'cafe',
        tile: '4,4',
        propId: 'oven',
        rotY: 0,
      }),
      state,
    )

    expect(() =>
      decide(state, {
        type: 'MoveProp',
        place: 'cafe',
        from: '3,0',
        to: '4,4',
        rotY: 0,
      }),
    ).toThrow(/already there/)
  })

  test('rotating in place is allowed, and a no-op rotation records nothing', () => {
    const state = founded()
    expect(
      decide(state, {
        type: 'MoveProp',
        place: 'cafe',
        from: '3,0',
        to: '3,0',
        rotY: 0,
      }),
    ).toEqual([])

    const [event] = decide(state, {
      type: 'MoveProp',
      place: 'cafe',
      from: '3,0',
      to: '3,0',
      rotY: Math.PI,
    })
    expect(event.type).toBe('PropMoved')
  })

  test('moving nothing is an error, not a silent success', () => {
    expect(() =>
      decide(founded(), {
        type: 'MoveProp',
        place: 'cafe',
        from: '9,9',
        to: '8,8',
        rotY: 0,
      }),
    ).toThrow(DomainError)
  })
})

describe('buying ground', () => {
  test('the cost is computed here, never taken from the caller', () => {
    const state = founded(999)
    const [event] = decide(state, {
      type: 'BuyGround',
      place: 'cafe',
      tiles: ['9,0', '9,1'],
    })

    expect(event.type).toBe('GroundBought')
    // Two squares at the café's own price function, whatever it currently says.
    expect((event.data as { cost: number }).cost).toBeGreaterThan(0)
    expect(fold([event], state).places.cafe.bought.size).toBe(2)
  })

  test('ground already owned is not charged for twice', () => {
    let state = founded(999)
    state = fold(
      decide(state, { type: 'BuyGround', place: 'cafe', tiles: ['9,0'] }),
      state,
    )
    const coins = state.coins

    // Asking again for the same square buys nothing and costs nothing.
    expect(decide(state, { type: 'BuyGround', place: 'cafe', tiles: ['9,0'] })).toEqual([])

    // A mixed request only charges for the square that is actually new.
    const [event] = decide(state, {
      type: 'BuyGround',
      place: 'cafe',
      tiles: ['9,0', '9,1'],
    })
    expect((event.data as { tiles: string[] }).tiles).toEqual(['9,1'])
    expect(fold([event], state).coins).toBeLessThan(coins)
  })

  test('ground you cannot afford is refused', () => {
    expect(() =>
      decide(founded(0), { type: 'BuyGround', place: 'home', tiles: ['9,9'] }),
    ).toThrow(/till holds 0/)
  })

  test('the house and the café price ground differently', () => {
    const state = founded(9999)
    const cafeCost = (
      decide(state, { type: 'BuyGround', place: 'cafe', tiles: ['9,0'] })[0]
        .data as { cost: number }
    ).cost
    const homeCost = (
      decide(state, { type: 'BuyGround', place: 'home', tiles: ['9,0'] })[0]
        .data as { cost: number }
    ).cost

    expect(homeCost).not.toBe(cafeCost)
  })
})

describe('earning', () => {
  /*
    Read from the catalogue rather than written down.

    These were hardcoded at the burger's price of the day, and a price change
    broke two of them - which is the wrong thing for a test about *earning* to
    have an opinion on. What is being asserted here is that a payment lands in
    the purse and that the ceiling clears an honest tip; neither is a claim
    about what a burger costs, and neither should fail when somebody re-prices
    the menu.
  */
  const BURGER = dishPrice('burger') as number

  test('a served customer adds their payment and counts', () => {
    const state = founded(0)
    const [event] = decide(state, {
      type: 'ServeCustomer',
      dish: 'burger',
      payment: BURGER,
    })

    const after = fold([event], state)
    expect(after.coins).toBe(BURGER)
    expect(after.served).toBe(1)
    expect(after.earned).toBe(BURGER)
  })

  test('a client cannot invent its own payday', () => {
    /**
     * The one command that creates money. The exact figure depends on ambience
     * the aggregate does not model, so it enforces a ceiling instead - a liar
     * can be out by a tip, not by a fortune.
     */
    expect(() =>
      decide(founded(), { type: 'ServeCustomer', dish: 'burger', payment: 100_000 }),
    ).toThrow(/plausible/)
  })

  test('a tip above the menu price is still accepted', () => {
    /*
      The ceiling has to clear a full-ambience tip, or honest play gets
      rejected. Asserted at the menu price plus a quarter, which is comfortably
      inside the multiplier and does not encode what that multiplier is - a test
      that knew the exact ceiling would be a second copy of the rule rather than
      a check on it.
    */
    const [event] = decide(founded(), {
      type: 'ServeCustomer',
      dish: 'burger',
      payment: Math.ceil(BURGER * 1.25),
    })
    expect(event.type).toBe('CustomerServed')
  })

  test('an unknown dish is refused', () => {
    expect(() =>
      decide(founded(), { type: 'ServeCustomer', dish: 'caviar', payment: 5 }),
    ).toThrow(/No such dish/)
  })
})

describe('the places are independent', () => {
  test('furniture in one place does not appear in another', () => {
    const state = founded(999)
    const after = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'outdoor',
        tile: '1,1',
        propId: 'garden_tree',
        rotY: 0,
      }),
      state,
    )

    expect(after.places.outdoor.props.has('1,1')).toBe(true)
    expect(after.places.home.props.has('1,1')).toBe(false)
    expect(after.places.cafe.props.has('1,1')).toBe(false)
  })

  test('but they share one purse', () => {
    // The whole reason this is one stream rather than three.
    const state = founded(999)
    const spent = fold(
      decide(state, {
        type: 'PlaceProp',
        place: 'outdoor',
        tile: '1,1',
        propId: 'garden_tree',
        rotY: 0,
      }),
      state,
    )

    expect(spent.coins).toBeLessThan(999)
  })
})

describe('the front door', () => {
  test('a fresh homestead starts on knock', () => {
    // The recoverable mistake is a visitor waiting, not a stranger already
    // standing in your kitchen - see DEFAULT_DOOR.
    expect(initialHomesteadState.door).toBe('knock')
    expect(founded().door).toBe('knock')
  })

  test('setting it records the change', () => {
    const state = founded()
    const events = decide(state, { type: 'SetHomesteadAccess', mode: 'open' })

    expect(events).toEqual([
      { type: 'HomesteadAccessSet', data: { mode: 'open' } },
    ])
    expect(fold(events, state).door).toBe('open')
  })

  test('every mode is reachable', () => {
    let state = founded()
    for (const mode of ['open', 'closed', 'knock'] as const) {
      state = fold(decide(state, { type: 'SetHomesteadAccess', mode }), state)
      expect(state.door).toBe(mode)
    }
  })

  /**
   * The toggle reports the state it is in, so a double click, a stale tab and a
   * retried request all arrive as "set it to what it already is". None is an
   * error, and none is worth an event.
   */
  test('setting it to what it already is writes nothing', () => {
    const state = fold(
      decide(founded(), { type: 'SetHomesteadAccess', mode: 'closed' }),
      founded(),
    )

    expect(decide(state, { type: 'SetHomesteadAccess', mode: 'closed' })).toEqual([])
  })

  test('a homestead that does not exist has no door to set', () => {
    expect(() =>
      decide(initialHomesteadState, { type: 'SetHomesteadAccess', mode: 'open' }),
    ).toThrow(DomainError)
  })

  test('the door does not touch the purse', () => {
    const state = founded(500)
    const after = fold(
      decide(state, { type: 'SetHomesteadAccess', mode: 'open' }),
      state,
    )
    expect(after.coins).toBe(500)
  })
})

describe('selling ground back', () => {
  /** A homestead that has bought `n` squares in the garden. */
  function withBought(n: number, coins = 5000): HomesteadState {
    let state = founded(coins)
    for (let i = 0; i < n; i++) {
      state = fold(
        decide(state, { type: 'BuyGround', place: 'outdoor', tiles: [`${i},0`] }),
        state,
      )
    }
    return state
  }

  test('ground that was never bought is not for sale', () => {
    const state = founded()
    expect(decide(state, { type: 'SellGround', place: 'outdoor', tiles: ['9,9'] })).toEqual([])
  })

  test('an empty list writes nothing', () => {
    expect(
      decide(founded(), { type: 'SellGround', place: 'outdoor', tiles: [] }),
    ).toEqual([])
  })

  /**
   * The invariant the refund exists to protect. Squares get dearer as you buy
   * them, so refunding the *current* price rather than the last one paid would
   * make buy-then-sell a coin printer.
   */
  test('buying then selling leaves the purse exactly where it started', () => {
    const start = founded(5000)

    let state = start
    for (let round = 0; round < 4; round++) {
      const before = state.coins
      const bought = fold(
        decide(state, { type: 'BuyGround', place: 'outdoor', tiles: [`${round},0`] }),
        state,
      )
      expect(bought.coins).toBeLessThan(before)

      const sold = fold(
        decide(bought, { type: 'SellGround', place: 'outdoor', tiles: [`${round},0`] }),
        bought,
      )
      expect(sold.coins).toBe(before)

      state = bought
    }
  })

  test('selling several at once refunds each at its own price', () => {
    const three = withBought(3)
    const oneAtATime = [...Array(3)].reduce<HomesteadState>(
      (acc, _, i) =>
        fold(decide(acc, { type: 'SellGround', place: 'outdoor', tiles: [`${2 - i},0`] }), acc),
      three,
    )

    const allAtOnce = fold(
      decide(three, {
        type: 'SellGround',
        place: 'outdoor',
        tiles: ['0,0', '1,0', '2,0'],
      }),
      three,
    )

    expect(allAtOnce.coins).toBe(oneAtATime.coins)
    expect(allAtOnce.places.outdoor.bought.size).toBe(0)
  })

  test('the square stops being owned', () => {
    const one = withBought(1)
    expect(one.places.outdoor.bought.has('0,0')).toBe(true)

    const sold = fold(
      decide(one, { type: 'SellGround', place: 'outdoor', tiles: ['0,0'] }),
      one,
    )
    expect(sold.places.outdoor.bought.has('0,0')).toBe(false)
  })

  test('ground under furniture is refused', () => {
    const one = withBought(1)
    const furnished = fold(
      decide(one, {
        type: 'PlaceProp',
        place: 'outdoor',
        tile: '0,0',
        propId: 'garden_tree',
        rotY: 0,
      }),
      one,
    )

    expect(() =>
      decide(furnished, { type: 'SellGround', place: 'outdoor', tiles: ['0,0'] }),
    ).toThrow(DomainError)
  })

  test('a duplicated tile is only refunded once', () => {
    const one = withBought(1)
    const events = decide(one, {
      type: 'SellGround',
      place: 'outdoor',
      tiles: ['0,0', '0,0', '0,0'],
    })

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('GroundSold')
    const sold = fold(events, one)
    // Back to the balance before the single purchase, not three refunds worth.
    expect(sold.coins).toBe(founded(5000).coins)
  })

  test('a homestead that does not exist has no ground to sell', () => {
    expect(() =>
      decide(initialHomesteadState, { type: 'SellGround', place: 'outdoor', tiles: ['0,0'] }),
    ).toThrow(DomainError)
  })
})

describe('spending on a room, out of the same purse', () => {
  test('a summon or a pickup comes off the till', () => {
    const state = founded(500)
    const [event] = decide(state, {
      type: 'SpendCoins',
      on: 'thing',
      what: 'bench',
      cost: 40,
    })

    expect(event.type).toBe('CoinsSpent')
    expect(fold([event], state).coins).toBe(460)
  })

  test('a free one records nothing at all', () => {
    // A row per summon for a thing that cost nothing is a log full of zeroes.
    expect(
      decide(founded(500), { type: 'SpendCoins', on: 'item', what: 'patty', cost: 0 }),
    ).toEqual([])
  })

  test('you cannot spend what you do not have', () => {
    expect(() =>
      decide(founded(10), { type: 'SpendCoins', on: 'thing', what: 'bench', cost: 40 }),
    ).toThrow()
  })

  test('and the cost has to be a plausible number of whole coins', () => {
    // The bound this aggregate can keep without seeing the shelf. The exact
    // price is the server action's to resolve; no browser schema accepts one.
    for (const cost of [-1, 1.5, 1_000_000]) {
      expect(() =>
        decide(founded(9_999_999), { type: 'SpendCoins', on: 'thing', what: 'x', cost }),
      ).toThrow()
    }
  })

  test('it needs a homestead, because that is where the purse is', () => {
    expect(() =>
      decide(initialHomesteadState, {
        type: 'SpendCoins',
        on: 'thing',
        what: 'bench',
        cost: 1,
      }),
    ).toThrow()
  })
})

describe('handing coins to somebody else', () => {
  const transfer = '5d1c2f6a-0000-4000-8000-000000000001'

  test('the debit comes off the sender', () => {
    const state = founded(500)
    const [event] = decide(state, { type: 'SendCoins', to: 'ann', amount: 120, transfer })

    expect(event.type).toBe('CoinsSent')
    expect(fold([event], state).coins).toBe(380)
  })

  test('and the credit goes on to the receiver', () => {
    const state = founded(40)
    const [event] = decide(state, { type: 'ReceiveCoins', from: 'bo', amount: 120, transfer, owner: 'ann' })

    expect(event.type).toBe('CoinsReceived')
    expect(fold([event], state).coins).toBe(160)
  })

  test('you cannot send what you do not have', () => {
    expect(() =>
      decide(founded(10), { type: 'SendCoins', to: 'ann', amount: 40, transfer }),
    ).toThrow()
  })

  test('nor a nonsense amount, in either direction', () => {
    for (const amount of [0, -5, 2.5, MAX_TRANSFER + 1]) {
      expect(() =>
        decide(founded(9_999_999), { type: 'SendCoins', to: 'ann', amount, transfer }),
      ).toThrow()
      expect(() =>
        decide(founded(0), { type: 'ReceiveCoins', from: 'ann', amount, transfer, owner: 'bo' }),
      ).toThrow()
    }
  })

  test('being paid needs no café of your own', () => {
    // Refusing the credit would make somebody who has never opened one unable
    // to be paid, and push every sender into checking first.
    const [event] = decide(initialHomesteadState, {
      type: 'ReceiveCoins',
      from: 'ann',
      amount: 25,
      transfer,
      owner: 'bo',
    })
    expect(event.type).toBe('CoinsReceived')
    expect(fold([event], initialHomesteadState).coins).toBe(25)
  })

  test('sending does need one, because that is where the purse is', () => {
    expect(() =>
      decide(initialHomesteadState, { type: 'SendCoins', to: 'ann', amount: 1, transfer }),
    ).toThrow()
  })

  test('the credit names whose purse it lands in, not just who sent it', () => {
    /*
      The field that stops a transfer going missing. `events.actor_id` is
      `auth.uid()`, forced by RLS in `append_events`, so the credit half - which
      is appended to the *recipient's* stream by the *sender's* session - is
      stamped with the sender. A projection that read the actor moved the wrong
      purse, and the replay guard on that wrong row then skipped the write
      altogether. `owner` is what the projection reads instead.
    */
    const [credit] = decide(founded(0), {
      type: 'ReceiveCoins',
      from: 'sender',
      amount: 10,
      transfer,
      owner: 'recipient',
    })
    expect(credit.data).toMatchObject({ from: 'sender', owner: 'recipient' })
  })

  test('a transfer moves exactly what it took, and nothing is created', () => {
    const sender = founded(500)
    const receiver = founded(100)

    const [debit] = decide(sender, { type: 'SendCoins', to: 'ann', amount: 75, transfer })
    const [credit] = decide(receiver, { type: 'ReceiveCoins', from: 'bo', amount: 75, transfer, owner: 'ann' })

    const before = sender.coins + receiver.coins
    const after = fold([debit], sender).coins + fold([credit], receiver).coins
    expect(after).toBe(before)
    // Both halves carry the same id, which is the only way to find the two ends
    // of one movement in the log afterwards.
    expect(debit.data).toMatchObject({ transfer })
    expect(credit.data).toMatchObject({ transfer })
  })
})
