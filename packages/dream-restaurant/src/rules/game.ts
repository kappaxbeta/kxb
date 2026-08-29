/**
 * The café simulation: money, stations, customers, and the shop.
 *
 * Pure, like `lounge/physics.ts` and for the same reason - the interesting rules
 * (does this pile of ingredients make a pizza, can that customer reach a chair,
 * can you afford this) are all decidable without a canvas, and testing them
 * through a WebGL scene would mean not testing them. The renderer owns the
 * camera, the clock and the models; everything below owns what is true.
 *
 * State is treated as immutable by convention: every reducer returns a new top
 * level object, and copies the collection it touches. It does *not* deep-copy
 * everything, because the tick runs sixty times a second and a café has a few
 * hundred squares in it.
 */

import {
  isSelfServe,
  isSolid,
  isTopper,
  prop,
  refundOf,
  type PropDef,
  type StationKind,
} from './catalog'
import {
  accepts,
  CAKE_SLICES,
  completed,
  isWaste,
  recipe,
  RECIPES,
  selfServeRecipe,
  TRANSFORMS,
  type ItemId,
  type Recipe,
} from './recipes'
import {
  DIRECTIONS,
  findPath,
  neighbours,
  parseTile,
  rectangleRoom,
  spawnPoint,
  tileKey,
  tileToWorld,
  type Doorway,
  type Tile,
  type TileKey,
} from '@kxb/peepz-world/grid'

/** Squares per second a customer walks. A shade slower than the chef, on purpose. */
export const CUSTOMER_SPEED = 2.4

/** How long a customer will wait for their order before giving up. */
export const PATIENCE = 50

/** How long they sit eating once served. */
export const EAT_TIME = 7

/** How long a plate takes to wash. */
export const WASH_TIME = 3

/** Ambience is capped, so a room full of jars is not a money printer. */
export const MAX_AMBIENCE = 50

export interface Placed {
  propId: string
  /** Radians about Y, always a multiple of a quarter turn. */
  rotY: number
  /**
   * A decoration standing on this prop's worktop.
   *
   * Nested inside the thing it sits on rather than kept in a second map, so the
   * two travel together: move the counter and the ketchup goes with it, sell the
   * counter and the ketchup is sold too. A parallel `toppers` map would have
   * meant remembering to keep both in step in four places, and forgetting in
   * one of them leaves a jar hovering over an empty square.
   */
  topper?: { propId: string; rotY: number }
}

export interface StationState {
  /** What is sitting in or on it. */
  items: ItemId[]
  /** Seconds into whatever it is currently doing. */
  progress: number
  /**
   * Whether the contents can be picked up.
   *
   * False only while a station is *producing* - baking a pizza, pulling a cone.
   * A transform (chopping, frying) swaps the item and leaves it takeable, which
   * is what lets you grab a patty the instant it is done and lets you fail to.
   */
  ready: boolean
}

export type CustomerState = 'arriving' | 'seated' | 'eating' | 'leaving'

export interface Customer {
  id: number
  /** A peep from `public/xo/peeps`, chosen at spawn. */
  avatar: string
  state: CustomerState
  /** Chair tile they are heading for or sitting on. */
  seat: TileKey | null
  /** Remaining waypoints, in walk order. */
  path: Tile[]
  x: number
  z: number
  /** Facing, in radians, smoothed by the renderer. */
  rotY: number
  order: ItemId | null
  patience: number
  eatTimer: number
  /** Set when they leave without being served, so the renderer can sulk. */
  angry: boolean
}

export interface CafeState {
  coins: number
  tiles: Set<TileKey>
  door: Doorway
  props: Map<TileKey, Placed>
  stations: Map<TileKey, StationState>
  customers: Customer[]
  /**
   * Whether the door is open to new customers.
   *
   * Closing does not clear the room - anyone already seated still gets served,
   * which is what "last orders" means and also stops the button being a way to
   * make an inconvenient customer disappear. It exists so that rearranging the
   * furniture is not a race against the next arrival.
   */
  open: boolean
  /** What the chef is holding. One thing, like every game of this shape. */
  carried: ItemId | null
  served: number
  walkedOut: number
  /** Seconds of simulated time, only used to pace spawns. */
  clock: number
  nextSpawn: number
  nextId: number
  /**
   * How comfortable the house is, read from the shared save on load.
   *
   * A plain number rather than anything the café can compute, because the café
   * has no business parsing a floor plan. It is here rather than in the
   * renderer because it changes what a bill is worth, and every other input to
   * that lives in this file.
   */
  homeComfort: number
}

/**
 * The starting café.
 *
 * Deliberately not empty. A blank room is a worse tutorial than a bad one: you
 * cannot serve anybody, so you cannot earn, so the shop is unreachable and the
 * game appears broken. This is the smallest layout that can actually complete an
 * order - one crate chain, one counter, one table, one chair - with enough coins
 * left to buy the second thing you will want.
 */
export function initialState(): CafeState {
  const tiles = rectangleRoom(5, 4)
  const door: Doorway = { tile: { x: 2, z: 3 }, dir: 'south' }

  const props = new Map<TileKey, Placed>([
    [tileKey(0, 0), { propId: 'crate_buns', rotY: 0 }],
    [tileKey(1, 0), { propId: 'crate_steak', rotY: 0 }],
    [tileKey(2, 0), { propId: 'stove', rotY: 0 }],
    [tileKey(3, 0), { propId: 'counter', rotY: 0 }],
    [tileKey(4, 0), { propId: 'bin', rotY: 0 }],
    [tileKey(0, 2), { propId: 'table', rotY: 0 }],
    [tileKey(0, 3), { propId: 'chair', rotY: Math.PI }],
  ])

  return {
    coins: 120,
    tiles,
    door,
    props,
    stations: new Map(),
    customers: [],
    // Open from the start, so the game begins by happening to you rather than
    // waiting behind a button nobody has been told about yet.
    open: true,
    carried: null,
    served: 0,
    walkedOut: 0,
    clock: 0,
    // A few seconds of quiet to look around before the first customer.
    nextSpawn: 6,
    nextId: 1,
    // Overwritten from the shared save on load. Zero is the honest default: a
    // player who has never been home has not earned the bonus.
    homeComfort: 0,
  }
}

// --- queries ----------------------------------------------------------------

export function propAt(state: CafeState, key: TileKey): PropDef | undefined {
  const placed = state.props.get(key)
  return placed ? prop(placed.propId) : undefined
}

export function stationAt(state: CafeState, key: TileKey): StationState {
  return state.stations.get(key) ?? { items: [], progress: 0, ready: true }
}

/** Can a body stand here? Floor, and nothing solid on it. */
export function isWalkable(state: CafeState, tile: Tile): boolean {
  const key = tileKey(tile.x, tile.z)
  if (!state.tiles.has(key)) return false
  const def = propAt(state, key)
  return !def || !isSolid(def)
}

/**
 * Chairs that count.
 *
 * A chair only seats somebody if it touches a table, which is the one layout
 * rule the game enforces. It exists so that "buy a chair" cannot be a way to
 * print customers - the table is the expensive half, and the pair is the unit
 * that actually earns.
 */
export function seats(state: CafeState): TileKey[] {
  const found: TileKey[] = []
  for (const [key, placed] of state.props) {
    if (prop(placed.propId)?.station !== 'chair') continue
    const tile = parseTile(key)
    const hasTable = neighbours(tile).some(
      (next) => propAt(state, tileKey(next.x, next.z))?.station === 'table',
    )
    if (hasTable) found.push(key)
  }
  return found
}

/** The table a seat eats at, if it has one. */
export function tableFor(state: CafeState, seat: TileKey): TileKey | undefined {
  const tile = parseTile(seat)
  for (const next of neighbours(tile)) {
    const key = tileKey(next.x, next.z)
    if (propAt(state, key)?.station === 'table') return key
  }
  return undefined
}

/** Every station kind the café currently owns. */
export function ownedStations(state: CafeState): Set<StationKind> {
  const kinds = new Set<StationKind>()
  for (const placed of state.props.values()) {
    const def = prop(placed.propId)
    if (def) kinds.add(def.station)
  }
  return kinds
}

/** Every ingredient the café has a crate for. */
export function ownedIngredients(state: CafeState): Set<ItemId> {
  const items = new Set<ItemId>()
  for (const placed of state.props.values()) {
    const def = prop(placed.propId)
    if (def?.station === 'crate' && def.yields) items.add(def.yields)
  }
  return items
}

/**
 * Can this item be produced, given what is in the room?
 *
 * Walks the transform chain backwards to a crate. The recursion is safe because
 * `TRANSFORMS` is acyclic by construction - every arrow goes from a rawer thing
 * to a more prepared one - and `seen` is there so that a future edit which
 * breaks that assumption hangs a test rather than the browser.
 */
function canObtain(
  item: ItemId,
  stations: Set<StationKind>,
  crates: Set<ItemId>,
  seen: Set<ItemId> = new Set(),
): boolean {
  if (crates.has(item)) return true
  if (seen.has(item)) return false

  /**
   * `seen` is the current path, not everything ever visited.
   *
   * It has to be un-marked on the way out, because a recipe may want the same
   * sub-ingredient twice over - two pizzas both walking back to the dough crate,
   * say. Leaving the mark set would make the second lookup answer "no, that is
   * a cycle" and quietly drop a dish from the menu that the room can obviously
   * make. Cycles are still caught: a genuine one revisits an item that is still
   * on the stack.
   */
  seen.add(item)
  const found = obtainable(item, stations, crates, seen)
  seen.delete(item)
  return found
}

function obtainable(
  item: ItemId,
  stations: Set<StationKind>,
  crates: Set<ItemId>,
  seen: Set<ItemId>,
): boolean {
  for (const [from, transform] of Object.entries(TRANSFORMS)) {
    if (!transform || transform.to !== item) continue
    if (!stations.has(transform.at)) continue
    if (canObtain(from, stations, crates, seen)) return true
  }

  /**
   * Recipes count as a way to obtain something, not only transforms.
   *
   * Once a pizza became "bake the thing the counter made", the walk back to the
   * crates had to be able to step through a *combine* as well as a chop -
   * otherwise the oven's pizza looks unobtainable, pizza silently vanishes from
   * the menu, and the café you just kitted out sells nothing but ice cream.
   */
  for (const entry of RECIPES) {
    if (entry.id !== item) continue
    if (!stations.has(entry.station)) continue
    if (entry.needs.every((need) => canObtain(need, stations, crates, seen))) {
      return true
    }
  }
  return false
}

/**
 * The menu.
 *
 * Derived from the equipment rather than stored, which is what makes the shop
 * double as the tech tree: buying an oven puts pizza on the menu because pizza
 * is defined as a thing an oven makes, not because a purchase handler said so.
 */
export function menu(state: CafeState): Recipe[] {
  const stations = ownedStations(state)
  const crates = ownedIngredients(state)
  return RECIPES.filter(
    (entry) =>
      // A half-built pizza is not something anyone walks in and asks for.
      !entry.intermediate &&
      stations.has(entry.station) &&
      entry.needs.every((need) => canObtain(need, stations, crates)),
  )
}

/** Sum of every prop's decorative contribution, capped. */
export function ambience(state: CafeState): number {
  let total = 0
  for (const placed of state.props.values()) {
    total += prop(placed.propId)?.ambience ?? 0
    // A jar shelf counts the same whether it is on the floor or on a counter.
    // Missing this was the whole reason to be careful here: the nicest way to
    // use the feature would otherwise have been the one that scored nothing.
    if (placed.topper) total += prop(placed.topper.propId)?.ambience ?? 0
  }
  return Math.min(total, MAX_AMBIENCE)
}

/**
 * What a nicer room - and a nicer home - are worth on every bill.
 *
 * The two bonuses add, which is the whole reason the house is connected to this
 * one rather than being a separate toy: an evening spent furnishing the living
 * room shows up on tomorrow's takings. Both are capped at fifty, so the ceiling
 * is double, and neither can reach it alone.
 */
export function tipMultiplier(state: CafeState): number {
  return 1 + (ambience(state) + state.homeComfort) / 100
}

/**
 * What one square of floor costs, in a room that already has `tileCount` of them.
 *
 * Priced per square rather than per purchase because floor is bought a strip at
 * a time - see `expansionFor`. The numbers are deliberately low next to a 14
 * coin burger *per square*, because a strip is four or five of them at once and
 * the first extension has to be reachable in a sitting rather than an evening.
 */
/**
 * Exported so the homestead aggregate prices floor with the same function the
 * client does. Two copies of a pricing curve is two curves, and the one that
 * matters - the server's - would be the one nobody notices has drifted.
 */
export function squarePrice(tileCount: number): number {
  return 4;//10 + Math.max(0, tileCount - 20) * 2
}

/** What the next single square would cost. Rises with the size of the room. */
export function tileCost(state: CafeState): number {
  return squarePrice(state.tiles.size)
}

/** Squares you are allowed to buy: not floor yet, but touching floor. */
export function expandableTiles(state: CafeState): TileKey[] {
  const candidates = new Set<TileKey>()
  for (const key of state.tiles) {
    for (const next of neighbours(parseTile(key))) {
      const nextKey = tileKey(next.x, next.z)
      if (!state.tiles.has(nextKey)) candidates.add(nextKey)
    }
  }
  return [...candidates]
}

// --- station behaviour ------------------------------------------------------

/**
 * How long the station needs before its contents can be taken.
 *
 * Zero for anything that is not mid-production, which is why a crate and a
 * finished patty both read as "ready" without special cases at the call site.
 */
function produceTime(kind: StationKind, items: ItemId[]): number {
  if (isSelfServe(kind)) return selfServeRecipe(kind)?.seconds ?? 0
  if (kind === 'counter' || kind === 'oven') {
    return completed(kind, items)?.seconds ?? 0
  }
  return 0
}

function withStation(
  state: CafeState,
  key: TileKey,
  next: StationState,
): CafeState {
  const stations = new Map(state.stations)
  if (next.items.length === 0 && next.progress === 0 && next.ready) {
    stations.delete(key)
  } else {
    stations.set(key, next)
  }
  return { ...state, stations }
}

// --- interaction ------------------------------------------------------------

/**
 * What pressing E on this square would do.
 *
 * Sharing one function between the prompt and the action is the point: a HUD
 * that describes a different rule from the one that runs is worse than no HUD,
 * and this way "Take bun" appearing is proof that taking a bun is what happens.
 *
 * It answers with the *act* rather than with a sentence, and that is the one
 * thing that changed when the café learned a second language. The rules here
 * decide what is possible; the words are the HUD's, because only the HUD knows
 * who is reading them - and only the German catalogue knows that a bun is a
 * Brötchen. `interactionWords` in `@/app/i18n/cafe` is the other half.
 *
 * Every item that appears in a prompt travels as an id for the same reason.
 */
export type Interaction =
  | { kind: 'serve'; item: ItemId }
  | { kind: 'take'; item: ItemId | null }
  | { kind: 'binWaste' }
  | { kind: 'bin' }
  | { kind: 'brew' }
  | { kind: 'pull' }
  | { kind: 'takeMade'; item: ItemId }
  | { kind: 'making' }
  | { kind: 'putCakeIn' }
  | { kind: 'takeSlice'; left: number }
  | { kind: 'washUp' }
  | { kind: 'clearPlate' }
  | { kind: 'putDown'; item: ItemId }
  | { kind: 'pickUp' }
  | { kind: 'cooking' }

export function describeInteraction(
  state: CafeState,
  key: TileKey | null,
): Interaction | null {
  if (!key) return null

  const seated = state.customers.find(
    (customer) => customer.seat === key && customer.state === 'seated',
  )
  const def = propAt(state, key)

  // A customer's own square, and the table they are sitting at, both serve.
  const servable = seated ?? servableAt(state, key)
  if (servable && state.carried && state.carried === servable.order) {
    return { kind: 'serve', item: servable.order }
  }

  if (!def) return null
  const station = stationAt(state, key)

  switch (def.station) {
    case 'crate':
      return state.carried ? null : { kind: 'take', item: def.yields ?? null }
    case 'bin':
      if (!state.carried) return null
      // Waste gets its own wording, because binning a burnt patty is the
      // intended move and binning a cooked one is a mistake worth hesitating at.
      return isWaste(state.carried) ? { kind: 'binWaste' } : { kind: 'bin' }
    case 'icecream':
    case 'coffee': {
      if (state.carried) return null
      const made = selfServeRecipe(def.station)
      if (!made) return null
      if (station.items.length === 0) {
        return def.station === 'coffee' ? { kind: 'brew' } : { kind: 'pull' }
      }
      return station.ready ? { kind: 'takeMade', item: made.id } : { kind: 'making' }
    }

    case 'display': {
      if (state.carried) {
        return canAccept(def.station, station, state.carried)
          ? { kind: 'putCakeIn' }
          : null
      }
      if (station.items.length === 0) return null
      // Named by what is left, because the case is the one station where
      // "how many are in there" is the thing you are deciding on.
      return { kind: 'takeSlice', left: station.items.length }
    }
    case 'sink':
      if (state.carried === 'plate_dirty') return { kind: 'washUp' }
      return null
    case 'table':
      if (!state.carried && station.items.length > 0) return { kind: 'clearPlate' }
      return null
    case 'prep':
    case 'stove':
    case 'counter':
    case 'oven': {
      if (state.carried) {
        return canAccept(def.station, station, state.carried)
          ? { kind: 'putDown', item: state.carried }
          : null
      }
      if (station.items.length > 0 && station.ready) return { kind: 'pickUp' }
      if (station.items.length > 0) return { kind: 'cooking' }
      return null
    }
    default:
      return null
  }
}

/** A seated customer at a table, reachable from this square. */
function servableAt(state: CafeState, key: TileKey): Customer | undefined {
  if (propAt(state, key)?.station !== 'table') return undefined
  return state.customers.find(
    (customer) =>
      customer.state === 'seated' &&
      customer.seat !== null &&
      tableFor(state, customer.seat) === key,
  )
}

function canAccept(
  kind: StationKind,
  station: StationState,
  item: ItemId,
): boolean {
  if (!station.ready) return false

  if (kind === 'prep' || kind === 'stove') {
    // One thing at a time, and only if this station is what transforms it.
    if (station.items.length > 0) return false
    return TRANSFORMS[item]?.at === kind
  }

  if (kind === 'counter' || kind === 'oven') {
    // Refuse anything that cannot still become a dish, so the player never ends
    // up with a pile that silently goes nowhere.
    if (completed(kind, station.items)) return false
    return accepts(kind, station.items, item)
  }

  if (kind === 'display') {
    // One cake at a time. Topping the case up while it still holds slices would
    // make "how many are left" stop being a number you can see.
    if (station.items.length > 0) return false
    return accepts(kind, [], item)
  }

  return false
}

/** Press E on a square. Returns the state unchanged when nothing applies. */
export function interact(state: CafeState, key: TileKey | null): CafeState {
  if (!key) return state

  const seated = state.customers.find(
    (customer) => customer.seat === key && customer.state === 'seated',
  )
  const target = seated ?? servableAt(state, key)
  if (target && state.carried && state.carried === target.order) {
    return serve(state, target)
  }

  const def = propAt(state, key)
  if (!def) return state
  const station = stationAt(state, key)

  switch (def.station) {
    case 'crate':
      if (state.carried || !def.yields) return state
      return { ...state, carried: def.yields }

    case 'bin':
      if (!state.carried) return state
      return { ...state, carried: null }

    case 'icecream':
    case 'coffee': {
      if (state.carried) return state
      const made = selfServeRecipe(def.station)
      if (!made) return state
      if (station.items.length === 0) {
        return withStation(state, key, {
          items: [made.id],
          progress: 0,
          ready: false,
        })
      }
      if (!station.ready) return state
      return {
        ...withStation(state, key, { items: [], progress: 0, ready: true }),
        carried: station.items[0],
      }
    }

    /**
     * The case turns one cake into a row of slices.
     *
     * Stocking it writes the slices straight in rather than storing a cake and a
     * counter, so taking one back out is the same "pick up the last item" the
     * counter and the oven already do - and the renderer gets a case that
     * visibly empties as the afternoon goes on, for free.
     */
    case 'display': {
      if (state.carried) {
        if (!canAccept(def.station, station, state.carried)) return state
        const slice = completed(def.station, [state.carried])
        if (!slice) return state
        return {
          ...withStation(state, key, {
            items: Array<ItemId>(CAKE_SLICES).fill(slice.id),
            progress: 0,
            ready: true,
          }),
          carried: null,
        }
      }

      if (station.items.length === 0) return state
      return {
        ...withStation(state, key, {
          items: station.items.slice(0, -1),
          progress: 0,
          ready: true,
        }),
        carried: station.items[station.items.length - 1],
      }
    }

    case 'sink': {
      if (state.carried !== 'plate_dirty') return state
      return {
        ...withStation(state, key, {
          items: [...station.items, 'plate_dirty'],
          progress: 0,
          ready: true,
        }),
        carried: null,
      }
    }

    case 'table': {
      if (state.carried || station.items.length === 0) return state
      const rest = station.items.slice(0, -1)
      return {
        ...withStation(state, key, { ...station, items: rest }),
        carried: station.items[station.items.length - 1],
      }
    }

    case 'prep':
    case 'stove':
    case 'counter':
    case 'oven': {
      if (state.carried) {
        if (!canAccept(def.station, station, state.carried)) return state
        const items = [...station.items, state.carried]
        return {
          ...withStation(state, key, { items, progress: 0, ready: true }),
          carried: null,
        }
      }

      if (station.items.length === 0 || !station.ready) return state
      const rest = station.items.slice(0, -1)
      return {
        ...withStation(state, key, {
          items: rest,
          progress: 0,
          ready: true,
        }),
        carried: station.items[station.items.length - 1],
      }
    }

    default:
      return state
  }
}

function serve(state: CafeState, customer: Customer): CafeState {
  const order = customer.order
  const dish = order ? recipe(order) : undefined
  if (!dish) return state

  const payment = Math.round(dish.price * tipMultiplier(state))

  return {
    ...state,
    carried: null,
    coins: state.coins + payment,
    served: state.served + 1,
    customers: state.customers.map((entry) =>
      entry.id === customer.id
        ? { ...entry, state: 'eating', eatTimer: EAT_TIME, order: null }
        : entry,
    ),
  }
}

// --- the shop ---------------------------------------------------------------

/**
 * Whether the square already holds something a decoration could stand on.
 *
 * Two conditions, and both matter: there has to be a prop there, and it has to
 * have a worktop. A crate has a `surfaceY` and a chair does not, which is why
 * this asks the catalogue rather than assuming every occupied square has a top.
 */
export function surfaceAt(state: CafeState, key: TileKey): number | undefined {
  const def = propAt(state, key)
  return def?.surfaceY
}

export function canPlace(
  state: CafeState,
  key: TileKey,
  propId: string,
): boolean {
  const def = prop(propId)
  if (!def) return false
  if (!state.tiles.has(key)) return false
  if (state.coins < def.price) return false

  const occupied = state.props.get(key)
  if (occupied) {
    /**
     * An occupied square is only buildable if this is a worktop decoration and
     * there is a worktop free to stand it on.
     *
     * Note it does not matter whether a *customer* is on the square here - the
     * check below is about building at floor level, and putting a jar on a
     * counter over somebody's head harms nobody.
     */
    if (!isTopper(def)) return false
    if (occupied.topper) return false
    return surfaceAt(state, key) !== undefined
  }

  // Never build on top of somebody. Trapping a customer under a fridge is funny
  // exactly once, and then it is a stuck seat forever.
  return !state.customers.some(
    (customer) => tileKey(...customerTile(customer)) === key,
  )
}

function customerTile(customer: Customer): [number, number] {
  return [Math.round(customer.x / 2), Math.round(customer.z / 2)]
}

export function place(
  state: CafeState,
  key: TileKey,
  propId: string,
  rotY = 0,
): CafeState {
  if (!canPlace(state, key, propId)) return state
  const def = prop(propId)!

  const props = new Map(state.props)
  const occupied = props.get(key)

  if (occupied) {
    // Buying onto a worktop. `canPlace` has already established there is one
    // and that it is empty.
    props.set(key, { ...occupied, topper: { propId, rotY } })
  } else {
    props.set(key, { propId, rotY })
  }

  return { ...state, props, coins: state.coins - def.price }
}

/**
 * Is somebody relying on this square right now?
 *
 * Selling or moving a table mid-meal would take the plate out from under a
 * customer and orphan the seat they are sitting on, so both are refused while
 * anyone is attached to it.
 */
function inUse(state: CafeState, key: TileKey): boolean {
  return state.customers.some(
    (customer) =>
      customer.state !== 'leaving' &&
      customer.seat !== null &&
      (customer.seat === key || tableFor(state, customer.seat) === key),
  )
}

export function remove(state: CafeState, key: TileKey): CafeState {
  const placed = state.props.get(key)
  if (!placed) return state

  /**
   * The thing on top goes first.
   *
   * One bulldoze at a time, top down, which is the only order that lets you take
   * the jars off a counter and keep the counter. The alternative - selling both
   * at once - makes the jars unremovable except by demolishing the worktop they
   * are standing on.
   */
  if (placed.topper) {
    const topper = prop(placed.topper.propId)
    if (!topper) return state

    const props = new Map(state.props)
    props.set(key, { propId: placed.propId, rotY: placed.rotY })
    return { ...state, props, coins: state.coins + refundOf(topper) }
  }

  const def = prop(placed.propId)
  if (!def) return state
  if (inUse(state, key)) return state

  const props = new Map(state.props)
  props.delete(key)
  const stations = new Map(state.stations)
  stations.delete(key)

  return { ...state, props, stations, coins: state.coins + refundOf(def) }
}

export function canMove(
  state: CafeState,
  from: TileKey,
  to: TileKey,
): boolean {
  if (!state.props.has(from)) return false
  if (!state.tiles.has(to)) return false
  // Landing on itself is allowed - that is how a prop is rotated in place.
  if (to !== from && state.props.has(to)) return false
  if (inUse(state, from)) return false
  return !state.customers.some(
    (customer) => tileKey(...customerTile(customer)) === to,
  )
}

/**
 * Pick a prop up and put it down somewhere else, for free.
 *
 * Deliberately not "sell then buy". Rearranging a room you have already paid
 * for is the whole point of decorating, and charging half the price every time
 * a counter is one square off would teach players not to touch anything.
 *
 * Whatever was sitting on the prop travels with it, so moving a counter
 * mid-service does not silently bin the burger on top of it.
 */
export function moveProp(
  state: CafeState,
  from: TileKey,
  to: TileKey,
  rotY?: number,
): CafeState {
  if (!canMove(state, from, to)) return state
  const placed = state.props.get(from)!

  const props = new Map(state.props)
  props.delete(from)
  props.set(to, { ...placed, rotY: rotY ?? placed.rotY })

  const stations = new Map(state.stations)
  const carried = stations.get(from)
  stations.delete(from)
  if (carried) stations.set(to, carried)

  return { ...state, props, stations }
}

/**
 * The whole strip of floor that laying at `key` would add.
 *
 * Extending one square at a time produces staircases and one-square nooks that
 * nothing fits in, and makes growing a room a chore measured in clicks. Laying a
 * strip keeps the room rectangular-ish by default, which is the shape furniture
 * is 2 units wide for.
 *
 * The strip runs along the wall being pushed out, and stops where the room stops
 * - so extending the north side of an L-shaped café widens only the part that
 * actually has a north side, rather than growing floor into open space.
 */
export function expansionFor(state: CafeState, key: TileKey): TileKey[] {
  if (state.tiles.has(key)) return []

  const tile = parseTile(key)

  // Which way is the room? That decides which axis the strip runs along.
  const anchor = DIRECTIONS.find((dir) =>
    state.tiles.has(tileKey(tile.x + dir.dx, tile.z + dir.dz)),
  )
  if (!anchor) return []

  /** Is there floor directly behind this square, to extend outward from? */
  const backed = (x: number, z: number) =>
    state.tiles.has(tileKey(x + anchor.dx, z + anchor.dz)) &&
    !state.tiles.has(tileKey(x, z))

  // The strip runs perpendicular to the direction the room lies in.
  const stepX = anchor.dx === 0 ? 1 : 0
  const stepZ = anchor.dz === 0 ? 1 : 0

  const strip: TileKey[] = [key]

  // Walk out from the target in both directions while the wall behind holds,
  // so the strip is contiguous rather than a scattering of eligible squares.
  for (const sign of [1, -1]) {
    let x = tile.x + stepX * sign
    let z = tile.z + stepZ * sign
    while (backed(x, z)) {
      strip.push(tileKey(x, z))
      x += stepX * sign
      z += stepZ * sign
    }
  }

  return strip
}

/**
 * What that strip costs.
 *
 * Priced square by square as the room grows, so a wide extension is not a way to
 * dodge the escalating per-square price by buying them all at today's rate.
 */
export function expansionCost(state: CafeState, key: TileKey): number {
  const strip = expansionFor(state, key)
  let total = 0
  for (let i = 0; i < strip.length; i++) {
    total += squarePrice(state.tiles.size + i)
  }
  return total
}

export function canBuyTile(state: CafeState, key: TileKey): boolean {
  const strip = expansionFor(state, key)
  if (strip.length === 0) return false
  return state.coins >= expansionCost(state, key)
}

export function buyTile(state: CafeState, key: TileKey): CafeState {
  if (!canBuyTile(state, key)) return state

  const cost = expansionCost(state, key)
  const tiles = new Set(state.tiles)
  for (const entry of expansionFor(state, key)) tiles.add(entry)

  return { ...state, tiles, coins: state.coins - cost }
}

// --- the tick ---------------------------------------------------------------

/**
 * Advance everything by `dt` seconds.
 *
 * `random` is injected rather than reached for, so the tests can decide which
 * animal walks in and which dish it orders. Everything else about a tick is
 * already deterministic.
 */
export function tick(
  state: CafeState,
  dt: number,
  random: () => number = Math.random,
): CafeState {
  let next = tickStations(state, dt)
  next = tickCustomers(next, dt)
  next = tickSpawns(next, dt, random)
  return { ...next, clock: next.clock + dt }
}

function tickStations(state: CafeState, dt: number): CafeState {
  if (state.stations.size === 0) return state

  let changed = false
  const stations = new Map(state.stations)

  for (const [key, station] of state.stations) {
    const def = propAt(state, key)
    if (!def) continue

    const updated = advanceStation(def.station, station, dt)
    if (updated !== station) {
      changed = true
      if (updated.items.length === 0 && updated.progress === 0 && updated.ready) {
        stations.delete(key)
      } else {
        stations.set(key, updated)
      }
    }
  }

  return changed ? { ...state, stations } : state
}

function advanceStation(
  kind: StationKind,
  station: StationState,
  dt: number,
): StationState {
  // Producing: a pizza baking, a cone being pulled. Nothing to do but wait.
  if (!station.ready) {
    const progress = station.progress + dt
    const needed = produceTime(kind, station.items)
    if (progress < needed) return { ...station, progress }
    /**
     * Finishing means the contents *become* the dish.
     *
     * Leaving the ingredients in place was the bug that made the oven bake
     * forever: the next tick would look at three raw ingredients, see an
     * unfinished pizza, and set `ready` back to false - so the timer restarted
     * every time it ran out and no pizza ever came out. A self-serve station has
     * nothing to convert, since it put the finished item in on the first press.
     */
    const dish = completed(kind, station.items)
    return {
      items: dish ? [dish.id] : station.items,
      progress: 0,
      ready: true,
    }
  }

  if (kind === 'sink') {
    if (station.items.length === 0) return station
    const progress = station.progress + dt
    if (progress < WASH_TIME) return { ...station, progress }
    // Clean plates are not a resource. Washing is a chore that clears a table,
    // and making the player then carry the clean plate back would be busywork
    // wearing an economy's clothes.
    return { items: station.items.slice(1), progress: 0, ready: true }
  }

  if (kind === 'prep' || kind === 'stove') {
    if (station.items.length !== 1) return station
    const transform = TRANSFORMS[station.items[0]]
    if (!transform || transform.at !== kind) return station

    const progress = station.progress + dt
    if (progress < transform.seconds) return { ...station, progress }
    return { items: [transform.to], progress: 0, ready: true }
  }

  if (kind === 'counter' || kind === 'oven') {
    const dish = completed(kind, station.items)
    if (!dish) return station
    // Already the finished thing, sitting there waiting to be collected.
    if (station.items.length === 1 && station.items[0] === dish.id) return station

    if (dish.seconds === 0) {
      return { items: [dish.id], progress: 0, ready: true }
    }
    return { items: station.items, progress: 0, ready: false }
  }

  return station
}

function tickCustomers(state: CafeState, dt: number): CafeState {
  if (state.customers.length === 0) return state

  let walkedOut = state.walkedOut
  let stations = state.stations
  let stationsCopied = false

  const customers: Customer[] = []

  for (const customer of state.customers) {
    let next = customer

    switch (customer.state) {
      case 'arriving': {
        next = walk(next, dt)
        if (next.path.length === 0) {
          next = {
            ...next,
            state: 'seated',
            rotY: faceTable(state, next),
            patience: PATIENCE,
          }
        }
        break
      }

      case 'seated': {
        const patience = next.patience - dt
        if (patience <= 0) {
          walkedOut += 1
          next = { ...next, angry: true, order: null, ...leave(state, next) }
        } else {
          next = { ...next, patience }
        }
        break
      }

      case 'eating': {
        const eatTimer = next.eatTimer - dt
        if (eatTimer > 0) {
          next = { ...next, eatTimer }
          break
        }

        // Leave the plate on the table. Somebody has to wash it, and that
        // somebody is the reason a sink is worth buying.
        const table = next.seat ? tableFor(state, next.seat) : undefined
        if (table) {
          if (!stationsCopied) {
            stations = new Map(stations)
            stationsCopied = true
          }
          const existing = stations.get(table) ?? {
            items: [],
            progress: 0,
            ready: true,
          }
          stations.set(table, {
            ...existing,
            items: [...existing.items, 'plate_dirty'],
          })
        }
        next = { ...next, eatTimer: 0, ...leave(state, next) }
        break
      }

      case 'leaving': {
        next = walk(next, dt)
        // Off the end of their path is off the premises: drop them entirely
        // rather than keep a stationary animal parked outside the door.
        if (next.path.length === 0) continue
        break
      }
    }

    customers.push(next)
  }

  return {
    ...state,
    customers,
    stations,
    walkedOut,
  }
}

/** Turn a seated customer towards the table they are eating at. */
function faceTable(state: CafeState, customer: Customer): number {
  if (!customer.seat) return customer.rotY
  const table = tableFor(state, customer.seat)
  if (!table) return customer.rotY

  const seatWorld = tileToWorld(parseTile(customer.seat))
  const tableWorld = tileToWorld(parseTile(table))
  return Math.atan2(tableWorld.x - seatWorld.x, tableWorld.z - seatWorld.z)
}

/** Send a customer back out of the door, giving up their seat immediately. */
function leave(state: CafeState, customer: Customer): Partial<Customer> {
  const from = { x: Math.round(customer.x / 2), z: Math.round(customer.z / 2) }
  const path = findPath(from, state.door.tile, (tile) => isWalkable(state, tile))

  const spawn = spawnPoint(state.door)
  const out = { x: spawn.x / 2, z: spawn.z / 2 }

  return {
    state: 'leaving',
    seat: null,
    order: null,
    // A customer whose way out has been decorated shut still goes home; walking
    // the straight line is better than standing in the dining room forever.
    path: [...(path ?? [state.door.tile]), out],
  }
}

function walk(customer: Customer, dt: number): Customer {
  if (customer.path.length === 0) return customer

  let { x, z, rotY } = customer
  let remaining = CUSTOMER_SPEED * dt * 2 // squares -> world units
  let path = customer.path

  while (remaining > 0 && path.length > 0) {
    const target = tileToWorld(path[0])
    const dx = target.x - x
    const dz = target.z - z
    const distance = Math.hypot(dx, dz)

    if (distance <= remaining) {
      x = target.x
      z = target.z
      remaining -= distance
      path = path.slice(1)
      if (distance > 1e-6) rotY = Math.atan2(dx, dz)
    } else {
      x += (dx / distance) * remaining
      z += (dz / distance) * remaining
      rotY = Math.atan2(dx, dz)
      remaining = 0
    }
  }

  return { ...customer, x, z, rotY, path }
}

/** Peeps used for customers. The chef gets one too, picked in the scene. */
export const CUSTOMER_AVATARS = [
  'bunny',
  'cat',
  'cow',
  'deer',
  'dog',
  'elephant',
  'fox',
  'hog',
  'koala',
  'monkey',
  'panda',
  'penguin',
  'pig',
  'tiger',
]

/**
 * How often somebody new walks in.
 *
 * Faster as the room gets nicer and bigger, because a café with eight covers and
 * one customer every twenty seconds is a café where you stand around. Floored so
 * that a very large room does not become unplayable.
 */
export function spawnInterval(state: CafeState): number {
  const covers = seats(state).length
  return Math.max(7, 22 - covers * 1.5 - ambience(state) * 0.1)
}

export function setOpen(state: CafeState, open: boolean): CafeState {
  if (state.open === open) return state
  // Re-opening starts the clock fresh rather than firing whatever was left on
  // it, so flipping the sign does not summon somebody instantly.
  return { ...state, open, nextSpawn: open ? spawnInterval(state) : state.nextSpawn }
}

function tickSpawns(
  state: CafeState,
  dt: number,
  random: () => number,
): CafeState {
  if (!state.open) return state

  const nextSpawn = state.nextSpawn - dt
  if (nextSpawn > 0) return { ...state, nextSpawn }

  const options = menu(state)
  const free = freeSeats(state)

  // No menu or no covers is not a failure state, just a quiet one - reset the
  // timer and try again, so the café comes back to life the moment you fix it.
  if (options.length === 0 || free.length === 0) {
    return { ...state, nextSpawn: 3 }
  }

  const seat = free[Math.floor(random() * free.length)]
  const from = state.door.tile
  const path = findPath(from, parseTile(seat), (tile) => isWalkable(state, tile))
  if (!path) return { ...state, nextSpawn: 3 }

  const spawn = spawnPoint(state.door)
  const order = options[Math.floor(random() * options.length)]
  const avatar =
    CUSTOMER_AVATARS[Math.floor(random() * CUSTOMER_AVATARS.length)]

  const customer: Customer = {
    id: state.nextId,
    avatar,
    state: 'arriving',
    seat,
    path: [from, ...path],
    x: spawn.x,
    z: spawn.z,
    rotY: 0,
    order: order.id,
    patience: PATIENCE,
    eatTimer: 0,
    angry: false,
  }

  return {
    ...state,
    customers: [...state.customers, customer],
    nextId: state.nextId + 1,
    nextSpawn: spawnInterval(state),
  }
}

/** Seats with nobody on the way to them and no dirty plate at the table. */
export function freeSeats(state: CafeState): TileKey[] {
  const taken = new Set(
    state.customers
      .filter((customer) => customer.seat !== null)
      .map((customer) => customer.seat as TileKey),
  )

  return seats(state).filter((seat) => {
    if (taken.has(seat)) return false
    const table = tableFor(state, seat)
    if (!table) return false
    return stationAt(state, table).items.length === 0
  })
}

// --- persistence ------------------------------------------------------------

/**
 * localStorage, not the event log.
 *
 * The rest of this app is event-sourced per tenant, and a café that ticks sixty
 * times a second is the wrong shape for that - it would write a stream nobody
 * will ever replay, for a single-player prototype. A save is a snapshot, and it
 * lives in the browser until the game is worth a table.
 */
export interface SavedCafe {
  /**
   * Kept for a first load, and overruled the moment the shared purse exists.
   *
   * The café is where money is earned and the house is where it is spent, so
   * the balance lives in `domain/world/save`. This field is what a save written
   * before the house existed still has to be readable through.
   */
  coins: number
  tiles: string[]
  door: Doorway
  props: [TileKey, Placed][]
  served: number
  walkedOut: number
  open?: boolean
}

export function serialize(state: CafeState): SavedCafe {
  return {
    coins: state.coins,
    tiles: [...state.tiles],
    door: state.door,
    props: [...state.props],
    served: state.served,
    walkedOut: state.walkedOut,
    open: state.open,
  }
}

/**
 * Restore a save on top of a fresh state.
 *
 * Customers, station contents and the clock are deliberately *not* restored. A
 * pizza that was in the oven when you closed the tab is not worth the schema,
 * and reloading into an empty room that fills up again is the friendlier
 * behaviour anyway.
 */
export function deserialize(saved: SavedCafe): CafeState {
  const base = initialState()
  return {
    ...base,
    coins: saved.coins,
    tiles: new Set(saved.tiles),
    door: saved.door,
    props: new Map(saved.props),
    served: saved.served,
    walkedOut: saved.walkedOut,
    // Saves written before the sign existed reopen, which is the friendlier of
    // the two guesses - a café that loads permanently shut looks broken.
    open: saved.open ?? true,
  }
}
