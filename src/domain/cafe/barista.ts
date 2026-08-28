/**
 * Running the café without being told: fry the meat, build the burger, serve
 * it, and clear up afterwards.
 *
 * ---------------------------------------------------------------------------
 * Why this is a priority list and not a plan
 * ---------------------------------------------------------------------------
 * The obvious shape is a plan - a queue of steps worked out once per order and
 * then followed. It is the wrong shape here, because the kitchen changes
 * underneath you: a patty starts burning, a customer runs out of patience and
 * walks out, somebody picks up the bun you were going to use. A plan made three
 * seconds ago is a plan about a café that no longer exists, and the code that
 * notices and repairs it ends up bigger than the code that made it.
 *
 * So this answers one question - "what is the single best thing to do right
 * now" - against the current state, every time it is asked. Interrupting is
 * free, because there is nothing to interrupt. Recovering from a failed step is
 * free, because the next call simply sees the world as it is.
 *
 * The cost is that it cannot reason about the future: it will not start a pizza
 * early because the oven will be free by the time the dough is ready. For a
 * kitchen two transforms deep that is a trade worth making, and the ordering
 * below encodes what little foresight is actually needed.
 *
 * ---------------------------------------------------------------------------
 * Deliberately not a second copy of the rules
 * ---------------------------------------------------------------------------
 * Nothing here decides what a station will accept or what a pile of items
 * becomes - `canAccept` and `completed` in ./game.ts and ./recipes.ts do, and
 * this asks them. A planner that reimplemented "a counter takes a bun" would be
 * a second rulebook drifting out of step with the first, and the symptom would
 * be a chef walking confidently up to a station and pressing E on nothing.
 */

import { prop } from '@/domain/cafe/catalog'
import {
  type CafeState,
  type Customer,
  isWalkable,
  propAt,
  stationAt,
  tableFor,
} from '@/domain/cafe/game'
import {
  type ItemId,
  isWaste,
  recipe,
  type Recipe,
  TRANSFORMS,
} from '@/domain/cafe/recipes'
import { findPath, parseTile, type Tile, tileKey, type TileKey } from '@/domain/world/grid'

/** One thing to do: stand next to a square and press E on it. */
export interface Chore {
  tile: TileKey
  /** What this accomplishes. Shown in the HUD, and what the tests assert on. */
  label: string
}

/**
 * How long a cooked patty may sit on the heat before it is a burnt one.
 *
 * Six seconds of the ten the transform allows, so there is slack to walk across
 * the room. Collecting it is the highest priority in the whole list, because it
 * is the only step in the café with a deadline - everything else waits patiently
 * for as long as it takes.
 */
export const RESCUE_MARGIN = 6

/** Every square holding a station of this kind. Sorted, so ties break the same way twice. */
function tilesOf(state: CafeState, kind: string): TileKey[] {
  const found: TileKey[] = []
  for (const [key, placed] of state.props) {
    if (prop(placed.propId)?.station === kind) found.push(key)
  }
  return found.sort()
}

/**
 * The reachable square nearest `from`, by actual walking distance.
 *
 * Path length rather than straight-line distance, because a café is a room full
 * of counters: the crate two squares away on the other side of the kitchen
 * island is further than the one four squares away down the aisle. Unreachable
 * candidates drop out here rather than being walked at and never arrived at.
 */
function nearest(
  state: CafeState,
  from: Tile,
  tiles: TileKey[],
): TileKey | undefined {
  let best: TileKey | undefined
  let bestCost = Number.POSITIVE_INFINITY

  for (const key of tiles) {
    const cost = costTo(state, from, key)
    if (cost === null || cost >= bestCost) continue
    best = key
    bestCost = cost
  }

  return best
}

/**
 * How far it is to stand next to `key` and be able to press E on it.
 *
 * `findPath` is asked for a route *to* the square itself, which it allows even
 * when the square is solid - that is what its "the goal may be unwalkable" rule
 * is for. The last step is the one the chef does not take: they stop on the
 * square before and reach across, which is exactly how a person uses a counter.
 *
 * `null` for no route at all, which is a real case: decorate a café badly enough
 * and the sink ends up walled in.
 */
export function costTo(state: CafeState, from: Tile, key: TileKey): number | null {
  const to = parseTile(key)
  if (from.x === to.x && from.z === to.z) return 0

  const path = findPath(from, to, (tile) => isWalkable(state, tile))
  return path === null ? null : path.length
}

/** Orders that somebody is currently sitting and waiting for, most urgent first. */
export function pendingOrders(state: CafeState): Customer[] {
  return state.customers
    .filter((customer) => customer.state === 'seated' && customer.order !== null)
    .sort((a, b) => a.patience - b.patience || a.id - b.id)
}

/** Where to stand to serve somebody: their table if they have one, else their chair. */
function serveTile(state: CafeState, customer: Customer): TileKey | null {
  if (!customer.seat) return null
  return tableFor(state, customer.seat) ?? customer.seat
}

/**
 * Is this item already on its way to becoming part of `dish`?
 *
 * The check that stops the chef fetching a second bun because the first one is
 * sitting on the counter where they left it. Counts three places something can
 * be in flight: on the combine station, cooking at a prep or a stove, or in the
 * chef's own hands.
 */
function inFlight(
  state: CafeState,
  component: ItemId,
  combineTile: TileKey | null,
): boolean {
  /**
   * The empty-handed check comes first, and it is load-bearing.
   *
   * `rawFor` returns null for anything a crate hands over ready to use - a bun
   * has no earlier form - and `state.carried` is null when the chef is holding
   * nothing. Comparing the two directly makes `null === null` true, which marks
   * every un-transformed ingredient as already on its way and means the bun is
   * never fetched: the chef fries a patty, puts it on the counter, and stands
   * there forever waiting for a burger that is one ingredient short.
   */
  if (state.carried !== null) {
    if (state.carried === component || state.carried === rawFor(component)) return true
  }

  for (const [key, station] of state.stations) {
    if (key === combineTile) {
      if (station.items.includes(component)) return true
      continue
    }
    // Cooking or chopping toward it. `patty_raw` on a stove is a `patty_cooked`
    // that has not happened yet, and fetching another would make two.
    for (const item of station.items) {
      if (item === component || TRANSFORMS[item]?.to === component) return true
    }
  }

  return false
}

/** The raw thing a crate would give you for a prepped component. */
function rawFor(component: ItemId): ItemId | null {
  for (const [from, transform] of Object.entries(TRANSFORMS)) {
    if (transform?.to === component) return from
  }
  return null
}

/**
 * Everything that goes into `dish`, at any depth, plus `dish` itself.
 *
 * A dish stopped being one combine deep when the pizza moved onto the counter:
 * a cheese pizza is now an oven's worth of a counter's worth of a chopping
 * board's worth of three crates, and a slice of cake is a step deeper still.
 * Anything that wants to ask "is this thing on the way to that order" - which is
 * most of the list below - needs the whole tree rather than one level of it.
 */
function chainOf(dish: Recipe, into: Set<ItemId> = new Set()): Set<ItemId> {
  if (into.has(dish.id)) return into
  into.add(dish.id)

  for (const need of dish.needs) {
    /**
     * A need with a recipe of its own is added by the recursion, not here.
     *
     * Adding it first and then recursing looks equivalent and is not: the guard
     * at the top would see the id already present, return immediately, and the
     * whole sub-tree below it would go missing. The visible symptom was a chef
     * who fetched a ball of dough and then stood holding it forever, because
     * `dough_base` - two levels down - was not in the chain.
     */
    const sub = recipe(need)
    if (sub) {
      chainOf(sub, into)
      continue
    }

    into.add(need)
    const raw = rawFor(need)
    if (raw !== null) into.add(raw)
  }
  return into
}

/**
 * The recipe that eats `item` on the way to `dish`, and therefore where it goes
 * next.
 *
 * This is what turns a pizza base in the chef's hands into "walk to the
 * counter" rather than "nobody wants this, bin it". Before the pizza gained an
 * assembly step, every component was consumed by the ordered dish itself and
 * this was a one-line `includes`; now the answer can be two levels down.
 */
function consumerOf(item: ItemId, dish: Recipe): Recipe | undefined {
  if (dish.needs.includes(item)) return dish

  for (const need of dish.needs) {
    const sub = recipe(need)
    if (!sub) continue
    const found = consumerOf(item, sub)
    if (found) return found
  }
  return undefined
}

/** How to describe taking something to the station that consumes it. */
function deliveryLabel(consumer: Recipe): string {
  if (consumer.station === 'oven') return `Bake the ${consumer.name}`
  if (consumer.station === 'display') return 'Stock the case'
  return `Build the ${consumer.name}`
}

/**
 * Ingredients that have to be cooked, before the ones that do not.
 *
 * The stove and the prep board run on their own once something is on them, so
 * the six seconds a patty takes are six seconds the chef can spend walking to
 * the bread crate. Fetching in recipe order instead - bun, then patty - leaves
 * the stove cold for that entire trip and makes every burger a walk longer than
 * it needs to be.
 *
 * A stable sort, so within each group the recipe's own order still decides. It
 * is only a reordering: nothing is skipped, and a dish whose components all cook
 * or none do comes out exactly as it went in.
 */
function cookFirst(needs: ItemId[]): ItemId[] {
  return [...needs].sort(
    (a, b) => Number(rawFor(b) !== null) - Number(rawFor(a) !== null),
  )
}

/** A crate that yields this item. */
function crateFor(state: CafeState, item: ItemId): TileKey | undefined {
  for (const key of tilesOf(state, 'crate')) {
    if (propAt(state, key)?.yields === item) return key
  }
  return undefined
}

/**
 * The station where `dish` gets combined, preferring one already part-way there.
 *
 * Preferring matters with two counters: without it the chef puts the bun on one
 * and the patty on the other, and neither ever becomes a burger.
 */
function combineTileFor(state: CafeState, dish: Recipe): TileKey | null {
  const candidates = tilesOf(state, dish.station)
  let empty: TileKey | null = null

  for (const key of candidates) {
    const station = stationAt(state, key)
    if (station.items.length > 0) {
      // Part-way toward this dish specifically, not toward something else.
      const wanted = dish.needs.filter((need) => station.items.includes(need))
      if (wanted.length > 0) return key
    } else if (!empty) {
      empty = key
    }
  }

  return empty
}

/**
 * What to do with what the chef is already holding.
 *
 * Separated because a full pair of hands eliminates almost every option: you
 * cannot pick anything up, so the only question is where this goes. Getting rid
 * of it - to a customer, a station, or the bin - is always the next move.
 */
function* carriedChores(
  state: CafeState,
  from: Tile,
  carried: ItemId,
): Generator<Chore> {
  const bin = nearest(state, from, tilesOf(state, 'bin'))

  // Ruined. Only the bin takes it, and holding it blocks everything else.
  if (isWaste(carried)) {
    if (bin) yield { tile: bin, label: 'Bin the burnt patty' }
    return
  }

  if (carried === 'plate_dirty') {
    const sink = nearest(state, from, tilesOf(state, 'sink'))
    if (sink) yield { tile: sink, label: 'Wash up' }
    // No sink yet - or the sink was refused. The bin is a worse answer than
    // washing and a much better one than standing holding a plate forever.
    if (bin) yield { tile: bin, label: 'Bin the plate' }
    return
  }

  // Somebody ordered exactly this. Nothing outranks handing it over - it is the
  // only step that earns, and the customer is on a timer.
  for (const customer of pendingOrders(state)) {
    if (customer.order !== carried) continue
    const tile = serveTile(state, customer)
    if (tile && costTo(state, from, tile) !== null) {
      yield { tile, label: `Serve the ${recipe(carried)?.name ?? carried}` }
    }
  }

  /**
   * A component of something somebody wants. Take it to where it is combined -
   * or, if it still needs cooking or chopping, to the thing that does that.
   *
   * The transform is checked first because a raw patty is not what the counter
   * wants: `canAccept` would refuse it, and the chef would stand there pressing
   * E at a counter that will never take it.
   */
  for (const customer of pendingOrders(state)) {
    const dish = customer.order ? recipe(customer.order) : undefined
    if (!dish) continue
    const chain = chainOf(dish)

    /**
     * Chopping and frying come first, and the target is now the whole chain
     * rather than the ordered dish's own ingredient list.
     *
     * A ball of dough is three steps from a pizza, so `dish.needs.includes` -
     * which only ever saw the last step - said no and dropped the chef through
     * to the bin below. Asking the chain instead is what makes a deep recipe
     * work at all.
     */
    const transform = TRANSFORMS[carried]
    if (transform && chain.has(transform.to)) {
      const free = tilesOf(state, transform.at).filter(
        (key) => stationAt(state, key).items.length === 0,
      )
      for (const tile of free) {
        if (costTo(state, from, tile) === null) continue
        yield {
          tile,
          label: transform.at === 'stove' ? 'Fry the patty' : 'Prep it',
        }
      }
      /**
       * Every station of that kind is busy, or every one of them refused.
       *
       * `return`, not a fall-through to the bin: a raw patty with the stove
       * occupied is a perfectly good patty, and binning it because the kitchen
       * is momentarily full would be worse than standing still for a second.
       */
      return
    }

    const consumer = consumerOf(carried, dish)
    if (consumer) {
      const tile = combineTileFor(state, consumer)
      if (tile && costTo(state, from, tile) !== null) {
        yield { tile, label: deliveryLabel(consumer) }
      }
    }
  }

  // Nobody wants it and it is not waste. Rather than carry it around forever -
  // which would deadlock every other chore, since hands hold one thing - put it
  // down. The bin is lossy and it is the only universal receptacle there is.
  if (bin) yield { tile: bin, label: 'Put it down' }
}

/**
 * The next thing worth doing, or `null` when the café is genuinely idle.
 *
 * `null` is a real answer and not a failure: the scene falls back to wandering
 * when it gets one, so a chef with nothing to cook potters about instead of
 * standing to attention in the middle of the kitchen.
 */
function* allChores(state: CafeState, from: Tile): Generator<Chore> {
  if (state.carried) {
    yield* carriedChores(state, from, state.carried)
    return
  }

  const orders = pendingOrders(state)

  /**
   * Rescue anything about to burn. The only deadline in the building.
   *
   * Above even serving, because a serve can wait a couple of seconds and a
   * patty on a stove cannot - and a burnt one costs the walk to the bin *and*
   * the whole cook again, which is what actually loses the customer.
   */
  for (const key of tilesOf(state, 'stove')) {
    const station = stationAt(state, key)
    const item = station.items[0]
    if (!item || !station.ready) continue
    const decay = TRANSFORMS[item]
    // Something that decays into waste, and far enough through to worry about.
    if (!decay || !isWaste(decay.to)) continue
    if (station.progress < decay.seconds - RESCUE_MARGIN) continue
    if (costTo(state, from, key) === null) continue
    yield { tile: key, label: 'Save the patty' }
  }

  /**
   * Collect a finished dish somebody is waiting for.
   *
   * Ahead of starting anything new, because the thing that is already made is
   * one walk away from being paid for.
   */
  for (const customer of orders) {
    const dish = customer.order ? recipe(customer.order) : undefined
    if (!dish) continue

    for (const key of tilesOf(state, dish.station)) {
      const station = stationAt(state, key)
      if (!station.ready) continue
      // `includes` rather than "is the only thing there", because the display
      // case holds a whole cake's worth of slices and every one of them is a
      // finished dish somebody can be handed.
      if (!station.items.includes(dish.id)) continue
      if (costTo(state, from, key) === null) continue
      yield { tile: key, label: `Pick up the ${dish.name}` }
    }
  }

  /**
   * Collect anything finished that has somewhere else to be.
   *
   * This used to be "look at the stoves and the prep boards", which was the
   * complete list back when those were the only stations that produced
   * something to carry. A counter now produces an unbaked pizza and an oven
   * produces a whole cake, and both need moving on.
   *
   * The test is not the station's kind but whether *this* station is the one
   * that consumes what is sitting on it. A bun on a counter is waiting for its
   * patty and must be left alone; an unbaked pizza on the same counter is
   * finished with the counter and wants an oven.
   */
  for (const customer of orders) {
    const dish = customer.order ? recipe(customer.order) : undefined
    if (!dish) continue
    const chain = chainOf(dish)

    for (const [key, station] of state.stations) {
      if (!station.ready || station.items.length !== 1) continue
      const item = station.items[0]
      if (item === dish.id || !chain.has(item)) continue

      const consumer = consumerOf(item, dish)
      if (!consumer) continue
      if (consumer.station === propAt(state, key)?.station) continue
      if (costTo(state, from, key) === null) continue

      yield { tile: key, label: `Take the ${item}` }
    }
  }

  /**
   * Clear a table.
   *
   * Below the food and above the shopping, on the grounds that it is two quick
   * actions that free a table up, and a café that never clears runs out of
   * places to seat anybody. During a genuine rush the food steps above keep
   * winning, which is the right answer - the plates are still there afterwards.
   */
  for (const key of tilesOf(state, 'table')) {
    const station = stationAt(state, key)
    if (!station.items.includes('plate_dirty')) continue
    if (costTo(state, from, key) === null) continue
    yield { tile: key, label: 'Clear the plate' }
  }

  /** Fetch the next thing the most urgent order still needs. */
  for (const customer of orders) {
    const dish = customer.order ? recipe(customer.order) : undefined
    if (!dish) continue
    yield* fetchChores(state, from, dish)
  }

}

/**
 * Walk down a recipe to the next thing that can actually be picked up.
 *
 * Recursive because the tree is: a cheese pizza needs an unbaked cheese pizza,
 * which needs a pizza base, which is a ball of dough from a crate. Only the
 * leaves are fetchable, and stopping at the first level - which is all the old
 * flat loop did - meant the chef looked for a crate labelled "unbaked pizza",
 * failed to find one, and did nothing at all for the whole order.
 *
 * `seen` guards against a recipe table that ever describes a loop. It cannot
 * today, and a hung frame loop is a bad way to find out that changed.
 */
function* fetchChores(
  state: CafeState,
  from: Tile,
  dish: Recipe,
  seen: Set<ItemId> = new Set(),
): Generator<Chore> {
  if (seen.has(dish.id)) return
  seen.add(dish.id)

  /**
   * A machine that takes nothing: an ice cream is pulled and a coffee is
   * brewed. There is nothing to fetch, only a button to press and then
   * something to collect.
   */
  if (dish.needs.length === 0) {
    const idle = tilesOf(state, dish.station).filter(
      (key) => stationAt(state, key).items.length === 0,
    )
    const tile = nearest(state, from, idle)
    if (tile) yield { tile, label: `Start the ${dish.name.toLowerCase()}` }
    return
  }

  const combine = combineTileFor(state, dish)
  if (!combine) return

  for (const component of cookFirst(dish.needs)) {
    if (inFlight(state, component, combine)) continue

    // Either the crate hands it over ready to use, or it hands over the raw
    // thing and the stove or the prep board does the rest.
    const raw = rawFor(component) ?? component

    /**
     * Do not pick up something there is nowhere to put.
     *
     * A pizza wants three chopped things and a café typically has one board, so
     * fetching whatever is next in the recipe means walking back with a tomato
     * while the board is busy with the dough - and then standing there, because
     * hands hold one thing and the only way to free the board is to pick up what
     * is on it. A burger never showed this up: its two components use different
     * stations, so there was always somewhere to put the thing in your hands.
     *
     * Waiting is the right answer rather than a worse errand. The board finishes
     * on its own, and collecting from it outranks fetching, so the moment it is
     * free the chef empties it and comes back for the tomato.
     */
    const transform = TRANSFORMS[raw]
    if (
      transform &&
      !tilesOf(state, transform.at).some(
        (key) => stationAt(state, key).items.length === 0,
      )
    ) {
      continue
    }

    const crate = crateFor(state, raw)
    if (crate) {
      if (costTo(state, from, crate) === null) continue
      yield { tile: crate, label: `Fetch the ${raw}` }
      continue
    }

    // No crate sells it, so something in the kitchen has to make it first.
    const sub = recipe(component)
    if (sub) yield* fetchChores(state, from, sub, seen)
  }
}

/**
 * The next thing worth doing, or `null` when the café is genuinely idle.
 *
 * `null` is a real answer and not a failure: the scene falls back to wandering
 * when it gets one, so a chef with nothing to cook potters about instead of
 * standing to attention in the middle of the kitchen.
 *
 * `avoid` is how the driver breaks a deadlock. The planner and the rules can
 * disagree - `combineTileFor` will happily point at a counter that `canAccept`
 * then refuses, because the pile on it is one the recipe cannot use - and the
 * symptom is a chef pressing E at the same square forever. Rather than teach
 * this every reason a station might say no, which is the second-rulebook
 * mistake this file exists to avoid, the driver notices that nothing happened
 * and asks for a different answer. That is why the candidates are generated
 * lazily and in priority order: skipping one costs nothing and the next best
 * thing is simply the next one out.
 */
export function nextChore(
  state: CafeState,
  from: Tile,
  avoid?: ReadonlySet<TileKey>,
): Chore | null {
  for (const chore of allChores(state, from)) {
    if (avoid?.has(chore.tile)) continue
    return chore
  }
  return null
}

/**
 * Where to stand to work on a square.
 *
 * The chef stops on a neighbouring square and reaches across, which is both how
 * a person uses a counter and the only thing that works: a counter is solid, so
 * the square itself cannot be stood on. Returns `null` when there is nowhere
 * free beside it, which is a café decorated into a corner.
 */
export function standingSpotFor(
  state: CafeState,
  from: Tile,
  target: TileKey,
): Tile | null {
  const to = parseTile(target)

  // The square itself, when it is something you stand on rather than at - a
  // chair being the case that matters, since a customer's own seat serves.
  if (isWalkable(state, to)) return to

  const options: Tile[] = [
    { x: to.x + 1, z: to.z },
    { x: to.x - 1, z: to.z },
    { x: to.x, z: to.z + 1 },
    { x: to.x, z: to.z - 1 },
  ].filter((tile) => state.tiles.has(tileKey(tile.x, tile.z)) && isWalkable(state, tile))

  let best: Tile | null = null
  let bestCost = Number.POSITIVE_INFINITY

  for (const option of options) {
    const cost = costTo(state, from, tileKey(option.x, option.z))
    if (cost === null || cost >= bestCost) continue
    best = option
    bestCost = cost
  }

  return best
}

/** Is the chef close enough to press E on this square? */
export function canReach(from: Tile, target: TileKey): boolean {
  const to = parseTile(target)
  const gap = Math.abs(from.x - to.x) + Math.abs(from.z - to.z)
  return gap <= 1
}

/** Everything a chore needs, resolved against where the chef is standing. */
export interface Errand {
  chore: Chore
  /** The square to walk to. `null` when already in reach. */
  goto: Tile | null
}

/**
 * The next chore, plus where to stand to do it.
 *
 * One call rather than two so the scene never holds a chore whose standing spot
 * has since been furnished over - both halves are answered against the same
 * state, in the same frame.
 */
export function nextErrand(
  state: CafeState,
  from: Tile,
  avoid?: ReadonlySet<TileKey>,
): Errand | null {
  const chore = nextChore(state, from, avoid)
  if (!chore) return null

  if (canReach(from, chore.tile)) return { chore, goto: null }

  const spot = standingSpotFor(state, from, chore.tile)
  // Nowhere to stand and do it. Returning the chore anyway would park the chef
  // walking on the spot forever; returning nothing lets them wander instead.
  if (!spot) return null

  return { chore, goto: spot }
}
