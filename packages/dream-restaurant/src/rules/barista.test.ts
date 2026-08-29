import { describe, expect, test } from 'bun:test'
import {
  canReach,
  nextChore,
  nextErrand,
  pendingOrders,
  RESCUE_MARGIN,
  standingSpotFor,
} from './barista'
import {
  type CafeState,
  type Customer,
  initialState,
  interact,
  place,
  tick,
} from './game'
import { type Tile, tileKey } from '@kxb/peepz-world/grid'

/**
 * A customer sitting in the starting café's one chair, waiting for a burger.
 *
 * Built by hand rather than by letting `tick` spawn one, because a spawn is
 * random and the walk to the seat takes real seconds - neither of which this is
 * testing. What matters is a seated customer with an order, which is the state
 * the planner actually reads.
 */
function seated(order: string, patience = 40, id = 1): Customer {
  return {
    id,
    avatar: 'cat',
    state: 'seated',
    seat: tileKey(0, 3),
    path: [],
    x: 0,
    z: 6,
    rotY: 0,
    order,
    patience,
    eatTimer: 0,
    angry: false,
  }
}

function withCustomer(state: CafeState, ...customers: Customer[]): CafeState {
  return { ...state, customers }
}

/** Somewhere in the middle of the room, out of everybody's way. */
const MIDDLE: Tile = { x: 2, z: 2 }

/**
 * Run the café the way the scene does: ask for an errand, walk to it, press E.
 *
 * The walk is a teleport, deliberately - how the body gets across the floor is
 * the renderer's problem and is covered by the pathing it borrows. What this
 * harness exercises is the loop itself: that following the planner's advice,
 * one step at a time, against the real `interact` and the real `tick`, actually
 * gets a burger onto a table.
 */
function work(
  state: CafeState,
  options: { steps?: number; dt?: number; until?: (state: CafeState) => boolean } = {},
): { state: CafeState; chef: Tile; labels: string[]; steps: number } {
  const { steps = 400, dt = 0.25, until } = options
  let current = state
  let chef = MIDDLE
  const labels: string[] = []

  for (let i = 0; i < steps; i++) {
    if (until?.(current)) return { state: current, chef, labels, steps: i }

    const errand = nextErrand(current, chef)

    if (errand?.goto) {
      chef = errand.goto
    } else if (errand) {
      labels.push(errand.chore.label)
      current = interact(current, errand.chore.tile)
    }

    // Time passes whether or not there was anything to do - which is the point
    // for the stove, since the whole reason to walk away is that it cooks while
    // you are gone. `() => 0.99` keeps the spawner quiet: a second customer
    // wandering in mid-test would make the assertions depend on chance.
    current = tick(current, dt, () => 0.99)
  }

  return { state: current, chef, labels, steps }
}

describe('the whole burger, start to finish', () => {
  test('fries the meat, builds it, serves it, and clears up', () => {
    const start = withCustomer(initialState(), seated('burger'))

    const served = work(start, { until: (state) => state.served > 0 })
    expect(served.state.served).toBe(1)
    // Paid, and more than the coins we started with.
    expect(served.state.coins).toBeGreaterThan(start.coins)

    // The order of operations, which is the actual behaviour under test.
    expect(served.labels).toContain('Fetch the patty_raw')
    expect(served.labels).toContain('Fry the patty')
    expect(served.labels).toContain('Fetch the bun')
    expect(served.labels).toContain('Take the patty_cooked')
    expect(served.labels).toContain('Serve the Burger')

    /**
     * The meat is fried before the burger exists.
     *
     * Asserted against the *last* build step rather than the first, because a
     * burger is assembled in two visits - the bun goes on the counter while the
     * patty is still in a crate, which is the sensible order and the one the
     * planner happens to pick. What must never happen is the counter being
     * offered a raw patty, and that is what this pins down.
     */
    const fried = served.labels.indexOf('Fry the patty')
    expect(fried).toBeLessThan(served.labels.lastIndexOf('Build the Burger'))
    expect(fried).toBeLessThan(served.labels.indexOf('Pick up the Burger'))

    /**
     * And the meat goes on before the bread is even fetched.
     *
     * The stove cooks on its own, so the six seconds a patty takes are six
     * seconds to spend walking to the bread crate. Fetching in recipe order -
     * bun first - leaves the stove cold for that whole trip, which is a walk's
     * worth of delay on every single burger.
     */
    expect(served.labels.indexOf('Fry the patty')).toBeLessThan(
      served.labels.indexOf('Fetch the bun'),
    )

    // Serving is the last thing that happens to the dish.
    expect(served.labels.at(-1)).toBe('Serve the Burger')

    /**
     * And then the washing up.
     *
     * The customer eats for `EAT_TIME` and leaves a plate on the table, so this
     * carries on from where the serve left off - which is the half of the loop
     * that only exists because somebody was served in the first place.
     */
    const tidied = work(served.state, {
      steps: 600,
      until: (state) =>
        state.customers.length === 0 &&
        state.carried === null &&
        [...state.stations.values()].every(
          (station) => !station.items.includes('plate_dirty'),
        ),
    })

    expect(tidied.labels).toContain('Clear the plate')
    // The starting café has no sink, so the plate goes in the bin. Standing
    // there holding it forever would be the bug.
    expect(tidied.state.carried).toBeNull()
  })

  test('serves two customers in a row', () => {
    const start = withCustomer(
      initialState(),
      seated('burger', 40, 1),
      { ...seated('burger', 45, 2), seat: tileKey(0, 3), id: 2 },
    )

    const done = work(start, { steps: 800, until: (state) => state.served >= 2 })
    expect(done.state.served).toBe(2)
  })

  test('the most impatient customer is served first', () => {
    const patient = { ...seated('burger', 45, 1), order: 'burger' }
    const desperate = { ...seated('burger', 5, 2), order: 'burger' }

    const orders = pendingOrders(withCustomer(initialState(), patient, desperate))
    expect(orders[0].id).toBe(2)
  })
})

/**
 * The deep recipes, driven by the same loop.
 *
 * A burger is one combine away from its crates, and for a long time that was the
 * only shape the planner had ever been run against - which is why it could get
 * away with only ever looking one step down. A pizza is three steps and a slice
 * of cake is four, so these are the tests that would have caught a chef fetching
 * dough and then binning it for want of anything that wanted it.
 */
describe('the deep recipes, start to finish', () => {
  /**
   * A layout every square of which can actually be stood next to.
   *
   * The starting café already fills its whole back row, so a prop dropped in
   * front of one seals the square between them - and the counter behind it. A
   * chef that cannot reach the counter simply goes idle holding a ball of dough,
   * which looks exactly like a planner bug and is not one. `(3, 1)` is left
   * clear on purpose: it is the only way in to the counter at `(3, 0)`.
   */
  const BOARD = tileKey(1, 1)
  const OVEN = tileKey(2, 1)
  const DOUGH = tileKey(4, 1)
  const TOMATOES = tileKey(4, 3)
  const CHEESE = tileKey(1, 3)

  function pizzeria(): CafeState {
    let state: CafeState = { ...initialState(), coins: 99999 }
    state = place(state, BOARD, 'board')
    state = place(state, OVEN, 'oven')
    state = place(state, DOUGH, 'crate_dough')
    state = place(state, TOMATOES, 'crate_tomatoes')
    state = place(state, CHEESE, 'crate_cheese')
    return state
  }

  test('chops, assembles, bakes and serves a cheese pizza unaided', () => {
    const start = withCustomer(pizzeria(), seated('pizza_cheese', 400))
    const run = work(start, {
      steps: 1500,
      until: (state) => state.served > 0,
    })

    expect(run.state.served).toBe(1)
    expect(run.labels).toContain('Serve the Cheese pizza')

    // Every stage of the chain, in the order the kitchen actually works.
    expect(run.labels).toContain('Fetch the dough')
    expect(run.labels).toContain('Prep it')
    expect(run.labels).toContain('Build the Unbaked cheese pizza')
    expect(run.labels).toContain('Bake the Cheese pizza')
    expect(run.labels).toContain('Pick up the Cheese pizza')

    // Assembled before it is baked, and baked before it is carried out.
    expect(run.labels.lastIndexOf('Build the Unbaked cheese pizza')).toBeLessThan(
      run.labels.indexOf('Bake the Cheese pizza'),
    )
    expect(run.labels.indexOf('Bake the Cheese pizza')).toBeLessThan(
      run.labels.indexOf('Pick up the Cheese pizza'),
    )
  })

  test('nothing is thrown away on the way to a pizza', () => {
    /**
     * The failure mode this whole change was at risk of. A chopped ingredient
     * that no rule claims falls through to "nobody wants it, put it down", the
     * chef bins it, fetches another, and loops forever looking busy.
     */
    const start = withCustomer(pizzeria(), seated('pizza_cheese', 400))
    const run = work(start, { steps: 1500, until: (state) => state.served > 0 })

    expect(run.labels).not.toContain('Put it down')
    expect(run.labels).not.toContain('Bin it')
  })

  test('brews and serves a coffee with no ingredients at all', () => {
    let state: CafeState = { ...initialState(), coins: 99999 }
    state = place(state, tileKey(1, 1), 'coffee')

    const run = work(withCustomer(state, seated('coffee', 400)), {
      steps: 800,
      until: (done) => done.served > 0,
    })

    expect(run.state.served).toBe(1)
    expect(run.labels).toContain('Start the coffee')
    expect(run.labels).toContain('Serve the Coffee')
  })

  test('bakes a cake, stocks the case, and serves a slice', () => {
    let state: CafeState = { ...initialState(), coins: 99999 }
    state = place(state, OVEN, 'oven')
    state = place(state, tileKey(1, 1), 'display')
    state = place(state, DOUGH, 'crate_flour')
    state = place(state, TOMATOES, 'crate_eggs')

    const run = work(withCustomer(state, seated('cake_slice', 600)), {
      steps: 2000,
      until: (done) => done.served > 0,
    })

    expect(run.state.served).toBe(1)
    expect(run.labels).toContain('Build the Cake batter')
    expect(run.labels).toContain('Bake the Cake')
    expect(run.labels).toContain('Stock the case')
    expect(run.labels).toContain('Serve the Slice of cake')

    // The case was stocked before anybody was handed anything out of it.
    expect(run.labels.indexOf('Stock the case')).toBeLessThan(
      run.labels.indexOf('Serve the Slice of cake'),
    )
  })
})

describe('what to do with full hands', () => {
  test('a burnt patty goes straight in the bin', () => {
    const state = { ...initialState(), carried: 'patty_burnt' }
    const chore = nextChore(state, MIDDLE)

    expect(chore?.label).toBe('Bin the burnt patty')
    expect(chore?.tile).toBe(tileKey(4, 0))
  })

  test('a dirty plate goes to the sink when there is one', () => {
    const base = initialState()
    const props = new Map(base.props)
    props.set(tileKey(4, 1), { propId: 'sink', rotY: 0 })

    const state = { ...base, props, carried: 'plate_dirty' }
    expect(nextChore(state, MIDDLE)?.label).toBe('Wash up')
    expect(nextChore(state, MIDDLE)?.tile).toBe(tileKey(4, 1))
  })

  test('a raw patty goes to the stove, never to the counter', () => {
    const state = withCustomer(
      { ...initialState(), carried: 'patty_raw' },
      seated('burger'),
    )

    const chore = nextChore(state, MIDDLE)
    expect(chore?.label).toBe('Fry the patty')
    expect(chore?.tile).toBe(tileKey(2, 0))
  })

  test('a cooked patty goes to the counter to be built', () => {
    const state = withCustomer(
      { ...initialState(), carried: 'patty_cooked' },
      seated('burger'),
    )

    expect(nextChore(state, MIDDLE)?.tile).toBe(tileKey(3, 0))
  })

  test('holding the dish somebody ordered beats everything else', () => {
    // A plate on the table and a burger in hand. The customer wins.
    const base = withCustomer({ ...initialState(), carried: 'burger' }, seated('burger'))
    const stations = new Map(base.stations)
    stations.set(tileKey(0, 2), { items: ['plate_dirty'], progress: 0, ready: true })

    const chore = nextChore({ ...base, stations }, MIDDLE)
    expect(chore?.label).toBe('Serve the Burger')
  })

  test('something nobody wants is put down rather than carried forever', () => {
    // A tomato in a café whose only customer wants a burger. Holding on to it
    // would deadlock every other chore, since hands hold one thing.
    const state = withCustomer({ ...initialState(), carried: 'tomato' }, seated('burger'))

    expect(nextChore(state, MIDDLE)?.label).toBe('Put it down')
  })
})

describe('the stove is the only thing with a deadline', () => {
  test('a patty close to burning outranks serving', () => {
    const base = withCustomer(initialState(), seated('burger', 3))
    const stations = new Map(base.stations)
    // Cooked, and well into the ten seconds before it is charcoal.
    stations.set(tileKey(2, 0), {
      items: ['patty_cooked'],
      progress: 10 - RESCUE_MARGIN + 0.5,
      ready: true,
    })

    const chore = nextChore({ ...base, stations }, MIDDLE)
    expect(chore?.label).toBe('Save the patty')
    expect(chore?.tile).toBe(tileKey(2, 0))
  })

  test('a patty that has only just finished is left where it is', () => {
    const base = withCustomer(initialState(), seated('burger'))
    const stations = new Map(base.stations)
    stations.set(tileKey(2, 0), {
      items: ['patty_cooked'],
      progress: 0.5,
      ready: true,
    })

    // Still collected - it is what the order needs - but as an ordinary
    // "take the cooked thing" step rather than as a rescue.
    const chore = nextChore({ ...base, stations }, MIDDLE)
    expect(chore?.label).toBe('Take the patty_cooked')
  })
})

describe('not fetching things twice', () => {
  test('a bun already on the counter is not fetched again', () => {
    const base = withCustomer(initialState(), seated('burger'))
    const stations = new Map(base.stations)
    stations.set(tileKey(3, 0), { items: ['bun'], progress: 0, ready: true })

    const chore = nextChore({ ...base, stations }, MIDDLE)
    expect(chore?.label).toBe('Fetch the patty_raw')
  })

  test('a patty already frying is not fetched again', () => {
    const base = withCustomer(initialState(), seated('burger'))
    const stations = new Map(base.stations)
    stations.set(tileKey(2, 0), { items: ['patty_raw'], progress: 1, ready: true })

    // The patty is in flight, so the bun is what is left to do - not a second
    // trip to the meat crate.
    const chore = nextChore({ ...base, stations }, MIDDLE)
    expect(chore?.label).toBe('Fetch the bun')
  })
})

describe('an idle café', () => {
  test('has nothing to do, and says so', () => {
    // `null` is what makes the chef wander instead of standing to attention.
    expect(nextChore(initialState(), MIDDLE)).toBeNull()
  })

  test('still clears a plate left behind', () => {
    const base = initialState()
    const stations = new Map(base.stations)
    stations.set(tileKey(0, 2), { items: ['plate_dirty'], progress: 0, ready: true })

    expect(nextChore({ ...base, stations }, MIDDLE)?.label).toBe('Clear the plate')
  })
})

describe('where to stand', () => {
  test('beside a counter, never on it', () => {
    const state = initialState()
    const spot = standingSpotFor(state, MIDDLE, tileKey(3, 0))

    expect(spot).not.toBeNull()
    // Adjacent to the counter, and a square you can actually stand on.
    expect(Math.abs(spot!.x - 3) + Math.abs(spot!.z - 0)).toBe(1)
    expect(state.props.has(tileKey(spot!.x, spot!.z))).toBe(false)
  })

  test('an errand you are already beside asks for no walk', () => {
    const state = withCustomer({ ...initialState(), carried: 'patty_burnt' }, seated('burger'))
    // Standing right next to the bin at (4,0).
    const errand = nextErrand(state, { x: 4, z: 1 })

    expect(errand?.goto).toBeNull()
    expect(canReach({ x: 4, z: 1 }, tileKey(4, 0))).toBe(true)
  })

  test('a station walled in behind furniture is not walked at forever', () => {
    // Box the bin in on its only open side, so there is nowhere to stand.
    const base = initialState()
    const props = new Map(base.props)
    props.set(tileKey(4, 1), { propId: 'counter', rotY: 0 })
    props.set(tileKey(3, 1), { propId: 'counter', rotY: 0 })

    const state = { ...base, props, carried: 'patty_burnt' }
    // The chef would rather wander than march at something unreachable.
    expect(nextErrand(state, MIDDLE)).toBeNull()
  })
})

describe('breaking a deadlock', () => {
  /**
   * The disagreement this exists for.
   *
   * A counter already holding a cooked patty is, as far as `combineTileFor` is
   * concerned, part-way to a burger - so the planner sends a second cooked
   * patty to it. `canAccept` then refuses, because two patties and no bun is not
   * on the way to anything. Nothing throws; the interaction is simply a no-op,
   * and a chef with no way to notice presses E at that counter forever.
   */
  function jammed(): CafeState {
    const base = withCustomer(
      { ...initialState(), carried: 'patty_cooked' },
      seated('burger'),
    )
    const stations = new Map(base.stations)
    stations.set(tileKey(3, 0), {
      items: ['patty_cooked'],
      progress: 0,
      ready: true,
    })
    return { ...base, stations }
  }

  test('the jam is real - the counter refuses, and nothing changes', () => {
    const state = jammed()
    const chore = nextChore(state, MIDDLE)

    expect(chore?.tile).toBe(tileKey(3, 0))
    // Pressing E achieves precisely nothing, which is why the driver needs a
    // way to notice rather than a longer list of special cases here.
    expect(interact(state, tileKey(3, 0))).toBe(state)
  })

  test('avoiding the jammed square offers the next best thing instead', () => {
    const state = jammed()
    const chore = nextChore(state, MIDDLE, new Set([tileKey(3, 0)]))

    // Not the counter, and not nothing: the patty goes down somewhere so the
    // hands are free for the rest of the order.
    expect(chore).not.toBeNull()
    expect(chore?.tile).not.toBe(tileKey(3, 0))
    expect(chore?.label).toBe('Put it down')
  })

  test('avoiding everything is idle, not a crash', () => {
    const state = jammed()
    const everywhere = new Set([...state.props.keys()])

    expect(nextChore(state, MIDDLE, everywhere)).toBeNull()
    expect(nextErrand(state, MIDDLE, everywhere)).toBeNull()
  })

  test('an avoided square is skipped, not reordered', () => {
    // With nothing avoided the burnt patty goes to the bin; with the bin
    // avoided there is simply nothing else it can do with it.
    const state = { ...initialState(), carried: 'patty_burnt' }

    expect(nextChore(state, MIDDLE)?.tile).toBe(tileKey(4, 0))
    expect(nextChore(state, MIDDLE, new Set([tileKey(4, 0)]))).toBeNull()
  })
})
