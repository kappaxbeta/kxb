import { describe, expect, test } from 'bun:test'
import { prop, refundOf } from './catalog'
import { tileKey } from '@kxb/peepz-world/grid'
import {
  ambience,
  buyTile,
  type CafeState,
  canBuyTile,
  canMove,
  canPlace,
  type Customer,
  deserialize,
  EAT_TIME,
  expansionCost,
  expansionFor,
  freeSeats,
  initialState,
  interact,
  menu,
  moveProp,
  PATIENCE,
  place,
  remove,
  seats,
  serialize,
  setOpen,
  stationAt,
  tick,
  tileCost,
  tipMultiplier,
  WASH_TIME,
} from './game'
import { CAKE_SLICES, recipe, TRANSFORMS } from './recipes'

/** Run the clock forward in 1/60s frames, the way the renderer does. */
function advance(state: CafeState, seconds: number, random = () => 0): CafeState {
  let next = state
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) next = tick(next, 1 / 60, random)
  return next
}

/** A state with nobody in it, so spawns cannot interfere with a station test. */
function quiet(): CafeState {
  return { ...initialState(), nextSpawn: Number.POSITIVE_INFINITY }
}

const BUNS = tileKey(0, 0)
const PATTIES = tileKey(1, 0)
const STOVE = tileKey(2, 0)
const COUNTER = tileKey(3, 0)
const BIN = tileKey(4, 0)
const TABLE = tileKey(0, 2)
const CHAIR = tileKey(0, 3)

describe('crates and the bin', () => {
  test('a crate hands over its ingredient', () => {
    expect(interact(quiet(), BUNS).carried).toBe('bun')
  })

  test('you can only carry one thing', () => {
    const holding = interact(quiet(), BUNS)
    expect(interact(holding, PATTIES).carried).toBe('bun')
  })

  test('the bin takes anything and gives nothing back', () => {
    const holding = interact(quiet(), PATTIES)
    expect(interact(holding, BIN).carried).toBeNull()
    expect(interact(quiet(), BIN).carried).toBeNull()
  })
})

describe('the stove', () => {
  test('cooks a patty after its transform time, and not before', () => {
    const cook = TRANSFORMS.patty_raw!
    let state = interact(interact(quiet(), PATTIES), STOVE)
    expect(stationAt(state, STOVE).items).toEqual(['patty_raw'])

    state = advance(state, cook.seconds - 0.5)
    expect(stationAt(state, STOVE).items).toEqual(['patty_raw'])

    state = advance(state, 1)
    expect(stationAt(state, STOVE).items).toEqual(['patty_cooked'])
  })

  test('burns a patty left on the heat', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    state = advance(state, TRANSFORMS.patty_raw!.seconds + 0.5)
    expect(stationAt(state, STOVE).items).toEqual(['patty_cooked'])

    state = advance(state, TRANSFORMS.patty_cooked!.seconds)
    expect(stationAt(state, STOVE).items).toEqual(['patty_burnt'])
  })

  test('a burnt patty stops there rather than transforming forever', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    state = advance(state, 60)
    expect(stationAt(state, STOVE).items).toEqual(['patty_burnt'])
  })

  test('refuses a second item while it is busy', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    state = interact(state, PATTIES)
    state = interact(state, STOVE)
    expect(state.carried).toBe('patty_raw')
    expect(stationAt(state, STOVE).items.length).toBe(1)
  })

  test('refuses something it cannot cook', () => {
    const state = interact(interact(quiet(), BUNS), STOVE)
    expect(state.carried).toBe('bun')
    expect(stationAt(state, STOVE).items).toEqual([])
  })
})

describe('assembly', () => {
  test('a bun and a cooked patty make a burger on the counter', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    state = advance(state, TRANSFORMS.patty_raw!.seconds + 0.1)
    state = interact(state, STOVE)
    expect(state.carried).toBe('patty_cooked')

    state = interact(state, COUNTER)
    state = interact(interact(state, BUNS), COUNTER)
    state = advance(state, 0.1)

    expect(stationAt(state, COUNTER).items).toEqual(['burger'])
    expect(interact(state, COUNTER).carried).toBe('burger')
  })

  test('the counter refuses an ingredient no recipe of its wants', () => {
    const state = interact(interact(quiet(), PATTIES), COUNTER)
    expect(state.carried).toBe('patty_raw')
    expect(stationAt(state, COUNTER).items).toEqual([])
  })

  test('a finished dish blocks further additions', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    state = advance(state, TRANSFORMS.patty_raw!.seconds + 0.1)
    state = interact(state, STOVE)
    state = interact(state, COUNTER)
    state = interact(interact(state, BUNS), COUNTER)
    state = advance(state, 0.1)

    state = interact(interact(state, BUNS), COUNTER)
    expect(state.carried).toBe('bun')
    expect(stationAt(state, COUNTER).items).toEqual(['burger'])
  })

  test('you can take a wrongly placed ingredient back off', () => {
    let state = interact(interact(quiet(), BUNS), COUNTER)
    expect(state.carried).toBeNull()
    state = interact(state, COUNTER)
    expect(state.carried).toBe('bun')
    expect(stationAt(state, COUNTER).items).toEqual([])
  })
})

/**
 * The whole pizza, crate to plate.
 *
 * There was never a test that ran a dish all the way through an oven, which is
 * exactly how the oven came to bake forever: finishing left the raw ingredients
 * in place, the next tick saw an unfinished pizza and restarted the timer, and
 * every test that only checked the menu or only checked the first few seconds
 * passed anyway. These walk the whole chain and assert on what comes out.
 */
describe('the pizza chain', () => {
  // Free squares in the starting room, which is five by four with its back row
  // already kitted out.
  const BOARD = tileKey(1, 1)
  const OVEN = tileKey(2, 1)
  const DOUGH = tileKey(3, 1)
  const TOMATOES = tileKey(4, 1)
  const CHEESE = tileKey(1, 2)

  /** A café kitted out for pizza, with nobody in it. */
  function pizzeria(): CafeState {
    let state: CafeState = { ...quiet(), coins: 99999 }
    state = place(state, BOARD, 'board')
    state = place(state, OVEN, 'oven')
    state = place(state, DOUGH, 'crate_dough')
    state = place(state, TOMATOES, 'crate_tomatoes')
    state = place(state, CHEESE, 'crate_cheese')
    return state
  }

  /** Take from `crate`, chop on the board, and pick the result back up. */
  function chop(state: CafeState, crate: string): CafeState {
    let next = interact(interact(state, crate), BOARD)
    const item = stationAt(next, BOARD).items[0]
    next = advance(next, TRANSFORMS[item]!.seconds + 0.1)
    return interact(next, BOARD)
  }

  test('the board turns each raw ingredient into its prepped one', () => {
    expect(chop(pizzeria(), DOUGH).carried).toBe('dough_base')
    expect(chop(pizzeria(), TOMATOES).carried).toBe('tomato_slices')
    expect(chop(pizzeria(), CHEESE).carried).toBe('cheese_grated')
  })

  test('the three prepped parts assemble into a raw pizza on the counter', () => {
    let state = pizzeria()
    for (const crate of [DOUGH, TOMATOES, CHEESE]) {
      state = interact(chop(state, crate), COUNTER)
    }
    state = advance(state, 0.1)

    expect(stationAt(state, COUNTER).items).toEqual(['pizza_cheese_raw'])
  })

  test('the oven bakes a raw pizza and actually finishes', () => {
    let state = pizzeria()
    for (const crate of [DOUGH, TOMATOES, CHEESE]) {
      state = interact(chop(state, crate), COUNTER)
    }
    state = advance(state, 0.1)
    state = interact(state, COUNTER)
    expect(state.carried).toBe('pizza_cheese_raw')

    state = interact(state, OVEN)
    expect(stationAt(state, OVEN).items).toEqual(['pizza_cheese_raw'])

    const bake = recipe('pizza_cheese')!.seconds
    const midway = advance(state, bake - 0.5)
    expect(stationAt(midway, OVEN).items).toEqual(['pizza_cheese_raw'])
    expect(stationAt(midway, OVEN).ready).toBe(false)

    state = advance(state, bake + 0.5)
    expect(stationAt(state, OVEN).items).toEqual(['pizza_cheese'])
    expect(stationAt(state, OVEN).ready).toBe(true)
    expect(interact(state, OVEN).carried).toBe('pizza_cheese')
  })

  test('a baked pizza stays baked instead of restarting the timer', () => {
    /**
     * The exact shape of the bug. A finished oven left alone used to flip back
     * to "baking" on the very next tick, so the pizza was never collectable -
     * and standing there watching it was the only way to find out.
     */
    let state = pizzeria()
    for (const crate of [DOUGH, TOMATOES, CHEESE]) {
      state = interact(chop(state, crate), COUNTER)
    }
    state = advance(state, 0.1)
    state = interact(interact(state, COUNTER), OVEN)

    state = advance(state, recipe('pizza_cheese')!.seconds * 4)
    expect(stationAt(state, OVEN).items).toEqual(['pizza_cheese'])
    expect(stationAt(state, OVEN).ready).toBe(true)
  })

  test('the oven will not take loose ingredients any more', () => {
    // Assembly belongs to the counter now. An oven that quietly accepted a
    // handful of grated cheese would leave a pile that can never become a dish.
    const state = interact(chop(pizzeria(), CHEESE), OVEN)
    expect(state.carried).toBe('cheese_grated')
    expect(stationAt(state, OVEN).items).toEqual([])
  })

  test('an unbaked pizza is never something a customer asks for', () => {
    expect(menu(pizzeria()).map((entry) => entry.id)).not.toContain(
      'pizza_cheese_raw',
    )
    expect(menu(pizzeria()).map((entry) => entry.id)).toContain('pizza_cheese')
  })
})

describe('the coffee machine', () => {
  const COFFEE = tileKey(1, 1)

  function cafe(): CafeState {
    return place({ ...quiet(), coins: 99999 }, COFFEE, 'coffee')
  }

  test('one press starts it, and it is not ready before its time', () => {
    const brew = recipe('coffee')!.seconds
    let state = interact(cafe(), COFFEE)
    expect(stationAt(state, COFFEE).ready).toBe(false)

    state = advance(state, brew - 0.5)
    expect(stationAt(state, COFFEE).ready).toBe(false)
    expect(interact(state, COFFEE).carried).toBeNull()
  })

  test('brews a coffee with no ingredients at all', () => {
    let state = advance(interact(cafe(), COFFEE), recipe('coffee')!.seconds + 0.5)
    expect(stationAt(state, COFFEE).ready).toBe(true)

    state = interact(state, COFFEE)
    expect(state.carried).toBe('coffee')
    // Taking it empties the machine, so the next customer starts a fresh one.
    expect(stationAt(state, COFFEE).items).toEqual([])
  })

  test('a machine on its own puts coffee on the menu', () => {
    expect(menu(cafe()).map((entry) => entry.id)).toContain('coffee')
  })
})

describe('cake, from batter to the display case', () => {
  const OVEN = tileKey(2, 1)
  const CASE = tileKey(3, 1)
  const FLOUR = tileKey(4, 1)
  const EGGS = tileKey(1, 2)

  function bakery(): CafeState {
    let state: CafeState = { ...quiet(), coins: 99999 }
    state = place(state, OVEN, 'oven')
    state = place(state, CASE, 'display')
    state = place(state, FLOUR, 'crate_flour')
    state = place(state, EGGS, 'crate_eggs')
    return state
  }

  /** Flour plus egg on the counter, baked, and back in hand. */
  function bake(state: CafeState): CafeState {
    let next = interact(interact(state, FLOUR), COUNTER)
    next = interact(interact(next, EGGS), COUNTER)
    next = advance(next, 0.1)
    next = interact(next, COUNTER)
    next = interact(next, OVEN)
    next = advance(next, recipe('cake')!.seconds + 0.5)
    return interact(next, OVEN)
  }

  test('flour and an egg make batter, and the oven turns it into a cake', () => {
    let state = interact(interact(bakery(), FLOUR), COUNTER)
    state = interact(interact(state, EGGS), COUNTER)
    state = advance(state, 0.1)
    expect(stationAt(state, COUNTER).items).toEqual(['cake_raw'])

    expect(bake(bakery()).carried).toBe('cake')
  })

  test('one cake in the case becomes a row of slices', () => {
    const state = interact(bake(bakery()), CASE)
    expect(state.carried).toBeNull()
    expect(stationAt(state, CASE).items).toEqual(
      Array(CAKE_SLICES).fill('cake_slice'),
    )
  })

  test('the case hands out one slice per press and then empties', () => {
    let state = interact(bake(bakery()), CASE)

    for (let taken = 1; taken <= CAKE_SLICES; taken++) {
      state = interact(state, CASE)
      expect(state.carried).toBe('cake_slice')
      expect(stationAt(state, CASE).items.length).toBe(CAKE_SLICES - taken)
      // Put it down again so the next press is not blocked by full hands.
      state = { ...state, carried: null }
    }

    // Empty, and pressing again is a no-op rather than an endless supply.
    expect(interact(state, CASE).carried).toBeNull()
  })

  test('a full case refuses a second cake', () => {
    let state = interact(bake(bakery()), CASE)
    state = bake(state)
    expect(state.carried).toBe('cake')

    const blocked = interact(state, CASE)
    expect(blocked.carried).toBe('cake')
    expect(stationAt(blocked, CASE).items.length).toBe(CAKE_SLICES)
  })

  test('slices are on the menu, whole cakes and batter are not', () => {
    const ids = menu(bakery()).map((entry) => entry.id)
    expect(ids).toContain('cake_slice')
    expect(ids).not.toContain('cake')
    expect(ids).not.toContain('cake_raw')
  })

  test('a case with no oven behind it sells nothing', () => {
    // The gate is the whole chain, not just the last station. A display case in
    // an empty room would otherwise advertise cake it can never stock.
    const bare = place({ ...quiet(), coins: 99999 }, CASE, 'display')
    expect(menu(bare).map((entry) => entry.id)).not.toContain('cake_slice')
  })
})

describe('the menu is derived from the equipment', () => {
  test('the starting café can only sell burgers', () => {
    expect(menu(initialState()).map((entry) => entry.id)).toEqual(['burger'])
  })

  test('an ice cream machine puts ice cream on the menu', () => {
    const state = place({ ...quiet(), coins: 9999 }, tileKey(4, 1), 'icecream')
    expect(menu(state).map((entry) => entry.id)).toContain('icecream')
  })

  test('an oven alone is not enough for pizza without the ingredients', () => {
    const state = place({ ...quiet(), coins: 9999 }, tileKey(4, 1), 'oven')
    expect(menu(state).map((entry) => entry.id)).not.toContain('pizza_cheese')
  })

  test('an oven plus a board plus the three crates unlocks cheese pizza', () => {
    let state: CafeState = { ...quiet(), coins: 9999 }
    state = place(state, tileKey(4, 1), 'oven')
    state = place(state, tileKey(3, 1), 'board')
    state = place(state, tileKey(2, 1), 'crate_dough')
    state = place(state, tileKey(1, 1), 'crate_tomatoes')
    state = place(state, tileKey(0, 1), 'crate_cheese')

    expect(menu(state).map((entry) => entry.id)).toContain('pizza_cheese')
    // Pepperoni still needs its own crate.
    expect(menu(state).map((entry) => entry.id)).not.toContain('pizza_pepperoni')
  })
})

describe('customers', () => {
  function seat(state: CafeState, order = 'burger'): CafeState {
    const customer: Customer = {
      id: 99,
      avatar: 'cat',
      state: 'seated',
      seat: CHAIR,
      path: [],
      x: 0,
      z: 6,
      rotY: 0,
      order,
      patience: PATIENCE,
      eatTimer: 0,
      angry: false,
    }
    return { ...state, customers: [customer] }
  }

  test('a chair only counts as a cover if it touches a table', () => {
    expect(seats(initialState())).toEqual([CHAIR])

    const stranded = place({ ...quiet(), coins: 999 }, tileKey(4, 3), 'chair')
    expect(seats(stranded)).toEqual([CHAIR])
  })

  test('serving the right dish pays and starts them eating', () => {
    const state = seat({ ...quiet(), carried: 'burger', coins: 0 })
    const after = interact(state, TABLE)

    expect(after.carried).toBeNull()
    expect(after.served).toBe(1)
    expect(after.coins).toBeGreaterThan(0)
    expect(after.customers[0].state).toBe('eating')
  })

  test('serving the wrong dish does nothing at all', () => {
    const state = seat({ ...quiet(), carried: 'icecream' }, 'burger')
    const after = interact(state, TABLE)

    expect(after.carried).toBe('icecream')
    expect(after.served).toBe(0)
    expect(after.customers[0].state).toBe('seated')
  })

  test('a customer who runs out of patience leaves and is counted', () => {
    const state = advance(seat(quiet()), PATIENCE + 1)

    expect(state.walkedOut).toBe(1)
    expect(state.customers[0]?.state ?? 'gone').not.toBe('seated')
  })

  test('finishing a meal leaves a dirty plate on the table', () => {
    let state = interact(seat({ ...quiet(), carried: 'burger' }), TABLE)
    state = advance(state, EAT_TIME + 0.5)

    expect(stationAt(state, TABLE).items).toEqual(['plate_dirty'])
  })

  test('a table with a dirty plate on it is not a free seat', () => {
    let state = interact(seat({ ...quiet(), carried: 'burger' }), TABLE)
    state = advance(state, EAT_TIME + 0.5)

    expect(freeSeats(state)).toEqual([])
  })

  test('clearing the plate and washing it frees the seat again', () => {
    let state = interact(seat({ ...quiet(), carried: 'burger' }), TABLE)
    state = advance(state, EAT_TIME + 0.5)
    state = { ...state, customers: [], coins: 9999 }

    state = place(state, tileKey(4, 1), 'sink')
    state = interact(state, TABLE)
    expect(state.carried).toBe('plate_dirty')

    state = interact(state, tileKey(4, 1))
    expect(state.carried).toBeNull()

    state = advance(state, WASH_TIME + 0.5)
    expect(stationAt(state, tileKey(4, 1)).items).toEqual([])
    expect(freeSeats(state)).toEqual([CHAIR])
  })

  test('a customer walks in, sits down, and orders something on the menu', () => {
    const state = advance({ ...initialState(), nextSpawn: 0 }, 12)
    const customer = state.customers[0]

    expect(customer).toBeDefined()
    expect(customer.state).toBe('seated')
    expect(customer.seat).toBe(CHAIR)
    expect(menu(state).map((entry) => entry.id)).toContain(customer.order!)
  })
})

describe('the shop', () => {
  test('you cannot buy what you cannot afford', () => {
    const broke: CafeState = { ...quiet(), coins: 0 }
    expect(canPlace(broke, tileKey(4, 1), 'oven')).toBe(false)
    expect(place(broke, tileKey(4, 1), 'oven')).toBe(broke)
  })

  test('placing deducts the price and occupies the square', () => {
    const state = { ...quiet(), coins: 500 }
    const after = place(state, tileKey(4, 1), 'oven')

    expect(after.coins).toBe(500 - prop('oven')!.price)
    expect(after.props.get(tileKey(4, 1))?.propId).toBe('oven')
  })

  test('one prop per square', () => {
    let state = place({ ...quiet(), coins: 999 }, tileKey(4, 1), 'oven')
    const coins = state.coins
    state = place(state, tileKey(4, 1), 'counter')

    expect(state.props.get(tileKey(4, 1))?.propId).toBe('oven')
    expect(state.coins).toBe(coins)
  })

  test('you cannot build outside the room', () => {
    expect(canPlace({ ...quiet(), coins: 999 }, tileKey(9, 9), 'counter')).toBe(
      false,
    )
  })

  test('removing refunds half, rounded down', () => {
    const state = { ...quiet(), coins: 0 }
    const after = remove(state, BIN)
    expect(after.coins).toBe(refundOf(prop('bin')!))
    expect(after.props.has(BIN)).toBe(false)
  })

  test('a table in use cannot be sold out from under a customer', () => {
    const customer: Customer = {
      id: 1,
      avatar: 'cat',
      state: 'seated',
      seat: CHAIR,
      path: [],
      x: 0,
      z: 6,
      rotY: 0,
      order: 'burger',
      patience: PATIENCE,
      eatTimer: 0,
      angry: false,
    }
    const state: CafeState = { ...quiet(), customers: [customer] }

    expect(remove(state, TABLE).props.has(TABLE)).toBe(true)
    expect(remove(state, CHAIR).props.has(CHAIR)).toBe(true)
  })
})

describe('opening and closing', () => {
  test('a closed café gets no new customers', () => {
    const closed = setOpen({ ...initialState(), nextSpawn: 0 }, false)
    expect(advance(closed, 60).customers).toEqual([])
  })

  test('an open café does', () => {
    const state = advance({ ...initialState(), nextSpawn: 0 }, 30)
    expect(state.customers.length).toBeGreaterThan(0)
  })

  test('closing does not throw out somebody already seated', () => {
    let state = advance({ ...initialState(), nextSpawn: 0 }, 12)
    expect(state.customers.length).toBe(1)

    state = setOpen(state, false)
    state = advance(state, 2)

    expect(state.customers.length).toBe(1)
    expect(state.customers[0].state).toBe('seated')
  })

  test('a seated customer can still be served after closing', () => {
    let state = advance({ ...initialState(), nextSpawn: 0 }, 12)
    state = setOpen(state, false)
    const order = state.customers[0].order!

    const after = interact({ ...state, carried: order }, TABLE)
    expect(after.served).toBe(1)
  })

  test('re-opening does not instantly summon somebody', () => {
    let state = setOpen({ ...initialState(), nextSpawn: 0 }, false)
    state = advance(state, 30)
    state = setOpen(state, true)

    expect(state.nextSpawn).toBeGreaterThan(0)
    expect(advance(state, 1).customers).toEqual([])
  })

  test('the sign survives a save', () => {
    const closed = setOpen(initialState(), false)
    expect(deserialize(serialize(closed)).open).toBe(false)
  })
})

describe('decorating a worktop', () => {
  test('a small decoration goes on a counter that is already there', () => {
    const state = { ...quiet(), coins: 500 }
    expect(canPlace(state, COUNTER, 'jars')).toBe(true)

    const after = place(state, COUNTER, 'jars', Math.PI / 2)

    // The counter is untouched underneath, and the jars are on top of it.
    expect(after.props.get(COUNTER)?.propId).toBe('counter')
    expect(after.props.get(COUNTER)?.topper?.propId).toBe('jars')
    expect(after.props.get(COUNTER)?.topper?.rotY).toBe(Math.PI / 2)
    expect(after.coins).toBe(500 - prop('jars')!.price)
  })

  test('only one thing at a time stands on a worktop', () => {
    let state = place({ ...quiet(), coins: 500 }, COUNTER, 'jars')
    const coins = state.coins

    expect(canPlace(state, COUNTER, 'condiments')).toBe(false)
    state = place(state, COUNTER, 'condiments')
    expect(state.coins).toBe(coins)
    expect(state.props.get(COUNTER)?.topper?.propId).toBe('jars')
  })

  test('a fridge does not go on a counter', () => {
    // The rule is about the *decoration*, not about the square being occupied:
    // anything without `onSurface` still needs bare floor.
    const state = { ...quiet(), coins: 999 }
    expect(canPlace(state, COUNTER, 'oven')).toBe(false)
  })

  test('a worktop is required, not merely an occupied square', () => {
    // A chair is a prop with no `surfaceY`, so there is nothing to stand on.
    const state = place({ ...quiet(), coins: 999 }, tileKey(4, 1), 'chair')
    expect(canPlace(state, tileKey(4, 1), 'jars')).toBe(false)
  })

  test('bulldozing takes the decoration first and leaves the counter', () => {
    const state = place({ ...quiet(), coins: 500 }, COUNTER, 'jars')

    const once = remove(state, COUNTER)
    expect(once.props.get(COUNTER)?.propId).toBe('counter')
    expect(once.props.get(COUNTER)?.topper).toBeUndefined()
    expect(once.coins).toBe(state.coins + refundOf(prop('jars')!))

    // Only then does a second press sell the counter itself.
    const twice = remove(once, COUNTER)
    expect(twice.props.has(COUNTER)).toBe(false)
  })

  test('moving the counter carries what is standing on it', () => {
    const state = place({ ...quiet(), coins: 500 }, COUNTER, 'jars')
    const after = moveProp(state, COUNTER, tileKey(4, 1))

    expect(after.props.has(COUNTER)).toBe(false)
    expect(after.props.get(tileKey(4, 1))?.topper?.propId).toBe('jars')
  })

  test('a decoration on a counter still makes the room nicer', () => {
    // The neatest way to use the feature must not be the one that scores
    // nothing, or the tip multiplier quietly argues against decorating well.
    const bare = { ...quiet(), coins: 500 }
    const dressed = place(bare, COUNTER, 'jars')

    expect(ambience(dressed)).toBe(ambience(bare) + prop('jars')!.ambience!)
  })
})

describe('moving furniture', () => {
  test('a prop can be picked up and put down for free', () => {
    const state = { ...quiet(), coins: 100 }
    const after = moveProp(state, BIN, tileKey(4, 1))

    expect(after.coins).toBe(100)
    expect(after.props.has(BIN)).toBe(false)
    expect(after.props.get(tileKey(4, 1))?.propId).toBe('bin')
  })

  test('moving onto an occupied square is refused', () => {
    const state = quiet()
    expect(canMove(state, BIN, COUNTER)).toBe(false)
    expect(moveProp(state, BIN, COUNTER)).toBe(state)
  })

  test('moving outside the room is refused', () => {
    expect(canMove(quiet(), BIN, tileKey(9, 9))).toBe(false)
  })

  test('moving a prop onto itself just re-rotates it', () => {
    const after = moveProp(quiet(), BIN, BIN, Math.PI)
    expect(after.props.get(BIN)?.rotY).toBe(Math.PI)
  })

  test('whatever was on the prop travels with it', () => {
    let state = interact(interact(quiet(), PATTIES), STOVE)
    expect(stationAt(state, STOVE).items).toEqual(['patty_raw'])

    state = moveProp(state, STOVE, tileKey(2, 1))

    expect(stationAt(state, STOVE).items).toEqual([])
    expect(stationAt(state, tileKey(2, 1)).items).toEqual(['patty_raw'])
  })

  test('a table cannot be moved out from under a customer', () => {
    const customer: Customer = {
      id: 1,
      avatar: 'cat',
      state: 'seated',
      seat: CHAIR,
      path: [],
      x: 0,
      z: 6,
      rotY: 0,
      order: 'burger',
      patience: PATIENCE,
      eatTimer: 0,
      angry: false,
    }
    const state: CafeState = { ...quiet(), customers: [customer] }

    expect(canMove(state, TABLE, tileKey(2, 1))).toBe(false)
    expect(canMove(state, CHAIR, tileKey(2, 1))).toBe(false)
  })
})

describe('extending the room', () => {
  test('only squares touching the floor can be bought', () => {
    const state = { ...quiet(), coins: 9999 }
    expect(canBuyTile(state, tileKey(5, 0))).toBe(true)
    expect(canBuyTile(state, tileKey(7, 0))).toBe(false)
  })

  test('a square already floored is not for sale', () => {
    expect(canBuyTile({ ...quiet(), coins: 9999 }, tileKey(0, 0))).toBe(false)
  })

  test('laying floor extends a whole strip, not one square', () => {
    // The starting room is 5 wide by 4 deep. Pushing out the east wall should
    // add all four squares of that wall, not just the one under the crosshair.
    const state = { ...quiet(), coins: 9999 }
    const strip = expansionFor(state, tileKey(5, 0))

    expect(strip.length).toBe(4)
    expect(new Set(strip)).toEqual(
      new Set([tileKey(5, 0), tileKey(5, 1), tileKey(5, 2), tileKey(5, 3)]),
    )
  })

  test('the strip runs along the wall being pushed, whichever wall that is', () => {
    const state = { ...quiet(), coins: 9999 }
    // Pushing out the north wall of a 5-wide room adds five squares.
    expect(expansionFor(state, tileKey(2, -1)).length).toBe(5)
  })

  test('buying the strip lays all of it and charges for all of it', () => {
    const state = { ...quiet(), coins: 9999 }
    const cost = expansionCost(state, tileKey(5, 0))

    const after = buyTile(state, tileKey(5, 0))

    expect(after.coins).toBe(9999 - cost)
    for (const z of [0, 1, 2, 3]) {
      expect(after.tiles.has(tileKey(5, z))).toBe(true)
    }
  })

  test('a strip costs the sum of its squares, not one square', () => {
    const state = { ...quiet(), coins: 9999 }
    expect(expansionCost(state, tileKey(5, 0))).toBeGreaterThan(tileCost(state))
  })

  test('a wider strip costs more than a narrower one', () => {
    /**
     * Regression, phrased so it survives retuning. The bug was that the price
     * *shown* was one square's while the price *charged* was the whole strip's,
     * which made laying floor look broken. What has to stay true is that cost
     * tracks the number of squares - the actual coin values are a balance knob
     * and this should not pin them down.
     */
    const state = { ...quiet(), coins: 999999 }

    const eastStrip = expansionFor(state, tileKey(5, 0)) // 4 deep
    const northStrip = expansionFor(state, tileKey(2, -1)) // 5 wide
    expect(northStrip.length).toBeGreaterThan(eastStrip.length)

    expect(expansionCost(state, tileKey(2, -1))).toBeGreaterThan(
      expansionCost(state, tileKey(5, 0)),
    )
  })

  test('an unaffordable strip cannot be part-bought', () => {
    // A coin short of the real price, derived rather than hard-coded so this
    // keeps testing the rule when the prices are retuned.
    const full = expansionCost({ ...quiet(), coins: 999999 }, tileKey(5, 0))
    const state = { ...quiet(), coins: full - 1 }

    expect(canBuyTile(state, tileKey(5, 0))).toBe(false)
    expect(buyTile(state, tileKey(5, 0))).toBe(state)
  })

  test('the strip stops where the room stops', () => {
    // Trim the room to an L, then push out the east wall of the short arm.
    const tiles = new Set([tileKey(0, 0), tileKey(1, 0), tileKey(0, 1)])
    const state: CafeState = { ...quiet(), tiles, coins: 9999 }

    expect(new Set(expansionFor(state, tileKey(2, 0)))).toEqual(
      new Set([tileKey(2, 0)]),
    )
  })

  test('the new squares are immediately buildable and walkable', () => {
    let state = buyTile({ ...quiet(), coins: 9999 }, tileKey(5, 0))
    state = place(state, tileKey(5, 2), 'counter')
    expect(state.props.get(tileKey(5, 2))?.propId).toBe('counter')
  })
})

describe('ambience', () => {
  test('decor raises the tip multiplier', () => {
    const before = tipMultiplier(quiet())
    const after = tipMultiplier(
      place({ ...quiet(), coins: 999 }, tileKey(4, 1), 'pillar'),
    )
    expect(after).toBeGreaterThan(before)
  })

  test('a customer pays more in a decorated room', () => {
    const customer: Customer = {
      id: 1,
      avatar: 'cat',
      state: 'seated',
      seat: CHAIR,
      path: [],
      x: 0,
      z: 6,
      rotY: 0,
      order: 'burger',
      patience: PATIENCE,
      eatTimer: 0,
      angry: false,
    }

    /** Takings from one burger, in a room decorated with `decor`. */
    function billFor(decor: string[]): number {
      let state: CafeState = { ...quiet(), coins: 9999, customers: [customer] }
      decor.forEach((id, index) => {
        state = place(state, tileKey(index, 1), id)
      })
      const before = state.coins
      return interact({ ...state, carried: 'burger' }, TABLE).coins - before
    }

    // Ambience is a property of the whole room, and payment is whole coins, so a
    // single ornament on a 14-coin burger genuinely rounds away to nothing. This
    // asserts the scale the stat actually operates at rather than pretending one
    // cabinet is worth a coin.
    expect(billFor(['cabinet', 'cabinet', 'cabinet'])).toBeGreaterThan(
      billFor([]),
    )
  })

  test('ambience is capped so decor cannot become a money printer', () => {
    let state: CafeState = { ...quiet(), coins: 999999 }
    for (let x = 0; x < 5; x++) {
      for (let z = 1; z < 4; z++) {
        if (state.props.has(tileKey(x, z))) continue
        state = place(state, tileKey(x, z), 'cabinet')
      }
    }
    expect(ambience(state)).toBeLessThanOrEqual(50)
  })
})

describe('saving', () => {
  test('a save round-trips the room, the shop and the takings', () => {
    let state = place({ ...quiet(), coins: 999 }, tileKey(4, 1), 'oven')
    state = buyTile(state, tileKey(5, 0))
    state = { ...state, served: 7, walkedOut: 2 }

    const restored = deserialize(serialize(state))

    expect(restored.coins).toBe(state.coins)
    expect(restored.served).toBe(7)
    expect(restored.walkedOut).toBe(2)
    expect(restored.tiles.has(tileKey(5, 0))).toBe(true)
    expect(restored.props.get(tileKey(4, 1))?.propId).toBe('oven')
  })

  test('a reload starts the room empty of customers', () => {
    const state = advance({ ...initialState(), nextSpawn: 0 }, 12)
    expect(state.customers.length).toBeGreaterThan(0)
    expect(deserialize(serialize(state)).customers).toEqual([])
  })
})
