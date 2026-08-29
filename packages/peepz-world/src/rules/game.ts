/**
 * Decorating: what a square can hold, what it costs, and how comfortable the
 * result is.
 *
 * There is no simulation here. The café has customers, patience and a clock;
 * the house has a player, a purse and a floor plan, and every function in this
 * file is a plain transformation of one state into the next. That is deliberate
 * - it means the whole of the house's rules can be tested without a canvas, and
 * it means the frame loop has nothing to do but draw.
 *
 * The coins in `HomeState` are a *copy* of the shared purse, refreshed when the
 * page loads and written back when it changes. The purse itself lives in
 * `domain/world/save`, because the café is where the money comes from.
 */

import {
  depthOf,
  homeProp,
  type HomeProp,
  isSolid,
  refundOf,
  type Theme,
  widthOf,
} from './catalog'
import {
  blockedEdges,
  blockedTiles,
  edgeKey,
  type Plan,
  planFor,
} from './plan'
import type { DecoratablePlace } from '../world/places'
import { STARTING_COINS } from '../world/save'
import {
  DIRECTIONS,
  parseTile,
  type Tile,
  TILE,
  tileKey,
  type TileKey,
} from '../world/grid'

export interface Placed {
  propId: string
  /** Radians about Y. Also decides which way a two-square prop lies. */
  rotY: number
}

export interface HomeState {
  place: DecoratablePlace
  plan: Plan
  /**
   * Every square and which room it belongs to, including the ones you bought.
   *
   * The plan is what the house was built as; this is what it has become. Rooms
   * are read from here everywhere, so extending is one entry in one map and the
   * walls, the floor and the palette all follow without being told.
   */
  rooms: Map<TileKey, Theme>
  coins: number
  /**
   * Props by the square they are anchored to.
   *
   * A two-square sofa appears here once, under the square you clicked. The
   * second square it fills is derived - see `occupancy` - rather than stored,
   * for the same reason walls are: two records of one fact drift, and the one
   * that drifts is always the one you did not think to update when the sofa was
   * rotated.
   */
  props: Map<TileKey, Placed>
  /**
   * The square of the thing you are currently sitting on or lying in.
   *
   * Not saved. Coming back to a house to find yourself still asleep in the bed
   * you left in is a worse welcome than standing in the hall, and it would mean
   * a save that can strand you if the bed is ever sold from under you.
   */
  resting: TileKey | null
}

export function initialState(place: DecoratablePlace): HomeState {
  const plan = planFor(place)

  return {
    place,
    plan,
    rooms: new Map(plan.rooms),
    coins: STARTING_COINS,
    props: startingProps(place),
    resting: null,
  }
}

/**
 * What is already there on a first visit.
 *
 * Enough that each room is recognisably the room it is, and no more. The living
 * room gets nothing at all, which is the closest this has to a goal: it is the
 * one room that is obviously unfinished, and everything in the catalogue that
 * fills it costs more than an afternoon.
 */
function startingProps(place: DecoratablePlace): Map<TileKey, Placed> {
  if (place === 'outdoor') {
    return new Map([
      [tileKey(4, 3), { propId: 'garden_path', rotY: 0 }],
      [tileKey(4, 4), { propId: 'garden_path', rotY: 0 }],
      [tileKey(7, 1), { propId: 'garden_tree', rotY: 0 }],
      [tileKey(0, 1), { propId: 'garden_bush', rotY: 0 }],
      [tileKey(6, 6), { propId: 'garden_bush', rotY: 0 }],
    ])
  }

  return new Map([
    // Bedroom: a bed, lying north to south along the west wall.
    [tileKey(0, 0), { propId: 'bed', rotY: 0 }],
    // Kitchen: somewhere to put the kettle down.
    [tileKey(0, 2), { propId: 'counter_home', rotY: Math.PI / 2 }],
    [tileKey(0, 3), { propId: 'sink_home', rotY: Math.PI / 2 }],
    // Bathroom: the one fixture a house is not habitable without.
    [tileKey(0, 4), { propId: 'toilet', rotY: Math.PI / 2 }],
  ])
}

// --- geometry ---------------------------------------------------------------

/**
 * Which way a prop faces, as a unit step on the grid.
 *
 * Rotation about Y takes the model's +z onto (sin, cos), and every rotation this
 * game produces is a quarter turn, so rounding recovers an exact step without
 * caring about the floating point that a chain of `+= PI/2` leaves behind.
 *
 * The `|| 0` is not decoration. `Math.round` of a very small negative number is
 * negative zero, which is equal to zero everywhere except in the tests and the
 * debugger - and a step of `-0` that reads as `0` is exactly the kind of thing
 * that is fine until the day something keys a map on it.
 */
export function facing(rotY: number): { dx: number; dz: number } {
  return {
    dx: Math.round(Math.sin(rotY)) || 0,
    dz: Math.round(Math.cos(rotY)) || 0,
  }
}

/**
 * Every square a prop occupies, anchored at `tile` and lying along its facing.
 *
 * The anchor is the square you pointed at, and a two-square prop grows *away*
 * from you into the one behind it. Growing towards the player instead would mean
 * clicking the far end of where you wanted the bed, which nobody has ever
 * expected of a game.
 */
export function coveredTiles(tile: Tile, def: HomeProp, rotY: number): Tile[] {
  const step = facing(rotY)
  const side = rightOf(step)
  const tiles: Tile[] = []
  for (let along = 0; along < depthOf(def); along++) {
    for (let across = 0; across < widthOf(def); across++) {
      tiles.push({
        x: tile.x + step.dx * along + side.dx * across,
        z: tile.z + step.dz * along + side.dz * across,
      })
    }
  }
  return tiles
}

/**
 * The step at ninety degrees to a facing, which is where width grows.
 *
 * Right rather than left so that the anchor is the corner nearest the way you
 * came at it, the same convention depth already follows by growing away.
 */
export function rightOf(step: { dx: number; dz: number }): {
  dx: number
  dz: number
} {
  return { dx: step.dz, dz: -step.dx }
}

/**
 * Where a prop's model sits inside its footprint, in its own space and in world
 * units: `z` along its facing, `x` to its right.
 *
 * Two things go into it. A prop that covers more than one square is drawn
 * centred across them, which is half a square along each axis it grew on. Then
 * `nudge` moves it within that footprint - see the catalog, but the short of it
 * is that furniture is modelled shallower than the square it stands in and
 * wants pushing back to the wall.
 */
export function drawOffset(def: HomeProp): { x: number; z: number } {
  return {
    x: ((widthOf(def) - 1) / 2) * TILE + (def.nudge?.x ?? 0),
    z: ((depthOf(def) - 1) / 2) * TILE + (def.nudge?.z ?? 0),
  }
}

/**
 * Every filled square, mapped back to the prop that fills it.
 *
 * Recomputed rather than cached: a house holds tens of props, this is a walk
 * over a small map, and a cache would need invalidating in five places that each
 * currently consist of one line.
 */
export function occupancy(state: HomeState): Map<TileKey, TileKey> {
  const filled = new Map<TileKey, TileKey>()

  for (const [key, placed] of state.props) {
    const def = homeProp(placed.propId)
    if (!def) continue
    for (const tile of coveredTiles(parseTile(key), def, placed.rotY)) {
      filled.set(tileKey(tile.x, tile.z), key)
    }
  }

  return filled
}

/** The prop covering a square, if any, and the square it is anchored to. */
export function propAt(
  state: HomeState,
  key: TileKey,
): { anchor: TileKey; placed: Placed; def: HomeProp } | undefined {
  const anchor = occupancy(state).get(key)
  if (!anchor) return undefined
  const placed = state.props.get(anchor)
  const def = placed && homeProp(placed.propId)
  if (!placed || !def) return undefined
  return { anchor, placed, def }
}

export function roomAt(state: HomeState, key: TileKey): Theme | undefined {
  return state.rooms.get(key)
}

/**
 * Can a body stand here?
 *
 * Outside the plan is solid, which is what makes the hedge and the walls behave
 * like walls without either being an object anything has to collide with.
 */
export function isWalkable(state: HomeState, tile: Tile): boolean {
  const key = tileKey(tile.x, tile.z)
  if (!state.rooms.has(key)) return false
  if (blockedTiles(state.plan).has(key)) return false

  const found = propAt(state, key)
  return !found || !isSolid(found.def)
}

// --- buying and selling -----------------------------------------------------

export interface Refusal {
  ok: false
  why: string
}

export type Verdict = { ok: true } | Refusal

/**
 * Whether a purchase would go through, and if not, in words.
 *
 * A verdict rather than a boolean because every one of these refusals has a
 * different fix - move, rotate, earn, pick a different room - and a build
 * preview that only knows "no" has to leave the player to guess which.
 */
export function canPlace(
  state: HomeState,
  key: TileKey,
  propId: string,
  rotY: number,
): Verdict {
  const def = homeProp(propId)
  if (!def) return { ok: false, why: 'No such thing.' }

  const theme = roomAt(state, key)
  if (!theme) return { ok: false, why: 'Not part of the house.' }
  if (!def.themes.includes(theme)) {
    return { ok: false, why: `A ${def.name.toLowerCase()} does not go here.` }
  }
  if (state.coins < def.price) {
    return { ok: false, why: `${def.price - state.coins} coins short.` }
  }

  const filled = occupancy(state)
  const blocked = blockedTiles(state.plan)

  for (const tile of coveredTiles(parseTile(key), def, rotY)) {
    const covered = tileKey(tile.x, tile.z)
    if (roomAt(state, covered) !== theme) {
      return {
        ok: false,
        why:
          depthOf(def) * widthOf(def) > 1
            ? 'Not enough room - try rotating.'
            : 'Off the floor.',
      }
    }
    if (blocked.has(covered)) return { ok: false, why: 'Something is in the way.' }
    if (filled.has(covered)) return { ok: false, why: 'That square is taken.' }
  }

  return { ok: true }
}

export function place(
  state: HomeState,
  key: TileKey,
  propId: string,
  rotY: number,
): HomeState {
  if (!canPlace(state, key, propId, rotY).ok) return state
  const def = homeProp(propId)!

  const props = new Map(state.props)
  props.set(key, { propId, rotY })
  return { ...state, coins: state.coins - def.price, props }
}

/**
 * Sell whatever covers a square.
 *
 * Keyed by any square the prop covers, not just its anchor: you point at the
 * foot of the bed and press the button, and being told to aim at the head
 * instead would be a rule about the data model leaking into the game.
 */
export function remove(state: HomeState, key: TileKey): HomeState {
  const found = propAt(state, key)
  if (!found) return state

  const props = new Map(state.props)
  props.delete(found.anchor)
  return {
    ...state,
    coins: state.coins + refundOf(found.def),
    props,
    // Selling the bed you are asleep in has to wake you up, or the renderer is
    // left posing a body on furniture that no longer exists.
    resting: state.resting === found.anchor ? null : state.resting,
  }
}

/**
 * Whether a prop already owned could be put down at `to`.
 *
 * Checked against a state with the prop already lifted, so that a sofa can be
 * nudged one square along without its own old position counting as an
 * obstruction - and so that rotating it in place is allowed.
 */
export function canMove(
  state: HomeState,
  from: TileKey,
  to: TileKey,
  rotY: number,
): Verdict {
  const placed = state.props.get(from)
  if (!placed) return { ok: false, why: 'Nothing to move.' }

  const props = new Map(state.props)
  props.delete(from)
  const def = homeProp(placed.propId)
  if (!def) return { ok: false, why: 'No such thing.' }

  // Lifted, and paid for already: the price check in `canPlace` would otherwise
  // refuse to let a broke player put their own sofa back down.
  const lifted: HomeState = {
    ...state,
    props,
    coins: Math.max(state.coins, def.price),
  }
  return canPlace(lifted, to, placed.propId, rotY)
}

export function moveProp(
  state: HomeState,
  from: TileKey,
  to: TileKey,
  rotY: number,
): HomeState {
  if (!canMove(state, from, to, rotY).ok) return state
  const placed = state.props.get(from)!

  const props = new Map(state.props)
  props.delete(from)
  props.set(to, { propId: placed.propId, rotY })
  return {
    ...state,
    props,
    resting: state.resting === from ? null : state.resting,
  }
}

// --- extending ---------------------------------------------------------------

/**
 * What the next square costs.
 *
 * Rises with the size of the place, which is the only thing stopping "extend"
 * from being the answer to every problem: the first few are an afternoon's
 * service, and by the time the house is twice the size a square costs more than
 * the sofa you would put on it. Priced against a burger at fourteen coins.
 */
/**
 * What the next square costs, given how many have already been bought.
 *
 * Split out from `extensionCost` so the homestead aggregate can price a
 * purchase from its own count without reconstructing a `HomeState`. One
 * function, so the server and the client cannot disagree about the price.
 */
export function groundPrice(boughtCount: number): number {
  return 80 + boughtCount * 25
}

export function extensionCost(state: HomeState): number {
  const built = state.plan.rooms.size
  const bought = Math.max(0, state.rooms.size - built)
  return groundPrice(bought)
}

/**
 * Which room a new square would join.
 *
 * Whichever one it touches, in a fixed direction order so that a square in a
 * corner between the kitchen and the bathroom always joins the same one of the
 * two. Corners are rare and either answer is defensible; picking a *consistent*
 * answer is what stops the same click doing different things.
 */
export function extensionTheme(
  state: HomeState,
  key: TileKey,
): Theme | undefined {
  const tile = parseTile(key)
  for (const dir of DIRECTIONS) {
    const theme = state.rooms.get(tileKey(tile.x + dir.dx, tile.z + dir.dz))
    if (theme) return theme
  }
  return undefined
}

/**
 * Whether a square is for sale, and if not, why not.
 *
 * A square can only be bought next to one that already exists, so the house
 * grows outward rather than sprouting a detached room in the middle of a field
 * you would have no way of reaching.
 */
export function canExtend(state: HomeState, key: TileKey): Verdict {
  if (state.rooms.has(key)) return { ok: false, why: 'Already part of the house.' }
  if (!extensionTheme(state, key)) {
    return { ok: false, why: 'Too far - build out from a room you have.' }
  }

  const price = extensionCost(state)
  if (state.coins < price) {
    return { ok: false, why: `${price - state.coins} coins short.` }
  }
  return { ok: true }
}

export function extend(state: HomeState, key: TileKey): HomeState {
  if (!canExtend(state, key).ok) return state
  const theme = extensionTheme(state, key)!

  const rooms = new Map(state.rooms)
  rooms.set(key, theme)
  return { ...state, coins: state.coins - extensionCost(state), rooms }
}

/**
 * What a square sells back for.
 *
 * The price the *last* square cost, not the price the next one would - see the
 * decider's `SellGround`. That symmetry is what makes trying a layout free
 * rather than a way to print coins.
 */
export function shrinkRefund(state: HomeState): number {
  const bought = Math.max(0, state.rooms.size - state.plan.rooms.size)
  return groundPrice(Math.max(0, bought - 1))
}

/**
 * Would the house still hold together without this square?
 *
 * A flood fill from the original plan across everything that would remain. Any
 * square it cannot reach has been cut off - still owned, still drawn, and no
 * longer walkable to - which is a worse outcome than refusing the sale.
 *
 * Cheap enough to run on a cursor: a house is tens of squares, and this only
 * runs for the one under it.
 */
function staysConnected(state: HomeState, removing: TileKey): boolean {
  const remaining = new Set(state.rooms.keys())
  remaining.delete(removing)
  if (remaining.size === 0) return true

  // Start from the squares the plan itself provides. They can never be sold,
  // so they are the part of the house that is always there to reach from.
  const queue: TileKey[] = []
  const seen = new Set<TileKey>()
  for (const key of state.plan.rooms.keys()) {
    if (key === removing || !remaining.has(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    queue.push(key)
  }

  while (queue.length > 0) {
    const tile = parseTile(queue.pop()!)
    for (const dir of DIRECTIONS) {
      const next = tileKey(tile.x + dir.dx, tile.z + dir.dz)
      if (seen.has(next) || !remaining.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }

  return seen.size === remaining.size
}

/**
 * Whether a square can be sold back, and if not, why not.
 *
 * The refusals are ordered by how obvious they are to somebody holding the
 * cursor over the square: what it is comes before what is on it, which comes
 * before the one that needs the whole floor plan to explain.
 */
export function canShrink(state: HomeState, key: TileKey): Verdict {
  if (!state.rooms.has(key)) return { ok: false, why: 'Not part of the house.' }
  if (state.plan.rooms.has(key)) {
    return { ok: false, why: 'The house came with this - only bought ground sells.' }
  }

  // Coverage, not just the anchor: half of a two-square sofa is still a sofa
  // standing on the square. This is the check the aggregate cannot make.
  if (occupancy(state).has(key)) {
    return { ok: false, why: 'Something is standing there - move it first.' }
  }

  if (state.resting && coversRestSpot(state, key)) {
    return { ok: false, why: 'You are sitting on it.' }
  }

  if (!staysConnected(state, key)) {
    return { ok: false, why: 'That would cut off part of the house.' }
  }

  return { ok: true }
}

/** Is the body currently resting on furniture anchored at this square? */
function coversRestSpot(state: HomeState, key: TileKey): boolean {
  return state.resting === key
}

export function shrink(state: HomeState, key: TileKey): HomeState {
  if (!canShrink(state, key).ok) return state

  const rooms = new Map(state.rooms)
  rooms.delete(key)
  return { ...state, coins: state.coins + shrinkRefund(state), rooms }
}

// --- sitting and sleeping ----------------------------------------------------

export interface RestSpot {
  /** World units. */
  x: number
  z: number
  y: number
  rotY: number
  pose: 'sit' | 'lie'
}

/**
 * Where a body ends up when it uses a piece of furniture.
 *
 * Centred on the *model* rather than the anchor square, which is the whole
 * reason `drawOffset` is exported: sitting on the near end of a two-square sofa
 * would leave you perched on the arm.
 */
export function restSpotAt(state: HomeState, anchor: TileKey): RestSpot | null {
  const placed = state.props.get(anchor)
  const def = placed && homeProp(placed.propId)
  if (!placed || !def?.use) return null

  const tile = parseTile(anchor)
  const step = facing(placed.rotY)
  const side = rightOf(step)
  const offset = drawOffset(def)

  // The seat, not the square: a sofa shoved back to the wall is a sofa whose
  // cushions moved, and a body left on the square's centre would be sitting on
  // the floor in front of it.
  return {
    x: tile.x * TILE + step.dx * offset.z + side.dx * offset.x,
    z: tile.z * TILE + step.dz * offset.z + side.dz * offset.x,
    y: def.use.y,
    rotY: placed.rotY,
    pose: def.use.pose,
  }
}

/** What using the thing under the crosshair would do, in words. */
export function describeUse(state: HomeState, key: TileKey | null): string | null {
  const target = targetOfUse(state, key)
  if (!target) return null
  return target.kind === 'up' ? 'Get up' : target.label
}

/**
 * The same answer, before it is turned into words.
 *
 * `describeUse` above hands back the catalogue's own English, which is right
 * for anything that only needs a string - a test, a script, the backoffice. The
 * HUD needs to *word* it in the reader's language, and to do that it needs the
 * thing rather than the sentence: which prop is under the crosshair, so the
 * German catalogue can be asked what that prop's label is.
 *
 * Two shapes rather than one, because getting up is not a property of the
 * furniture: you can be sitting in a chair and looking at a bath.
 *
 * Named `targetOfUse` rather than `useTarget` for the same reason `sitOn` is
 * not `useProp`: the hooks lint rule reads any `use` prefix as a React hook,
 * and refuses to let one be called from a callback.
 */
export function targetOfUse(
  state: HomeState,
  key: TileKey | null,
): { kind: 'up' } | { kind: 'prop'; id: string; label: string } | null {
  if (state.resting) return { kind: 'up' }
  if (!key) return null

  const found = propAt(state, key)
  const label = found?.def.use?.label
  if (!found || !label) return null

  return { kind: 'prop', id: found.def.id, label }
}

/**
 * Sit down on, or lie in, whatever covers a square - or get up again.
 *
 * Keyed by any square the thing covers rather than its anchor, for the same
 * reason selling is: you are looking at the foot of the bed, and being told to
 * aim at the head instead is the data model leaking into the game.
 *
 * Named `sitOn` rather than `useProp` because anything starting with `use` is a
 * React hook as far as the linter is concerned, and a domain function that
 * cannot be called from a callback is no use to anybody.
 */
export function sitOn(state: HomeState, key: TileKey | null): HomeState {
  if (state.resting) return { ...state, resting: null }
  if (!key) return state

  const found = propAt(state, key)
  if (!found?.def.use) return state
  return { ...state, resting: found.anchor }
}

export function standUp(state: HomeState): HomeState {
  return state.resting ? { ...state, resting: null } : state
}

/**
 * Somewhere to put a body that has just got out of the furniture.
 *
 * Getting up has to *move* you, and this is not a nicety. A sofa is solid and
 * you are sitting in the middle of it, so standing up where you sat leaves you
 * inside a solid square - and the voxel controller then refuses every direction,
 * because every direction is still inside it. You are stuck in the sofa forever,
 * which is exactly how it was reported.
 *
 * The caller prefers the square you were standing on when you sat down. This is
 * the fallback for when that is no longer free - you can sell the sofa from
 * under yourself, and the room can have been rearranged around you.
 */
export function freeSpotNear(
  state: HomeState,
  anchor: TileKey,
): { x: number; z: number } | null {
  const placed = state.props.get(anchor)
  const def = placed && homeProp(placed.propId)
  const covered = placed && def
    ? coveredTiles(parseTile(anchor), def, placed.rotY)
    : [parseTile(anchor)]

  /**
   * Walls count, not just floor.
   *
   * `isWalkable` answers a question about a *square* - is it part of the house,
   * is something solid on it - and knows nothing about the wall between two
   * squares. Without this check, getting out of a bath pressed against the
   * bathroom wall would deposit you in the kitchen, through the tiling.
   */
  const walls = blockedEdges(state.plan, state.rooms)

  for (const tile of covered) {
    for (const dir of DIRECTIONS) {
      if (walls.has(edgeKey(tile, dir.name))) continue
      const next = { x: tile.x + dir.dx, z: tile.z + dir.dz }
      if (isWalkable(state, next)) {
        return { x: next.x * TILE, z: next.z * TILE }
      }
    }
  }

  // Walled in on every side by furniture. Vanishingly unlikely, and the caller
  // treats null as "stay put" rather than teleporting you somewhere arbitrary.
  return null
}

// --- comfort ----------------------------------------------------------------

/**
 * Capped, so that a bedroom carpeted in teddy bears is not a money printer.
 *
 * The number matches the café's ambience cap for the same reason it exists: the
 * two bonuses are added together into one tip multiplier, and either one being
 * able to reach the ceiling alone would make the other pointless.
 */
export const MAX_COMFORT = 50

/** What the house is worth to the café, as whole percentage points of tips. */
export function comfort(state: HomeState): number {
  let total = 0
  for (const placed of state.props.values()) {
    total += homeProp(placed.propId)?.comfort ?? 0
  }
  return Math.min(total, MAX_COMFORT)
}

/** What the whole place would fetch if you sold every stick of it. */
export function contentsValue(state: HomeState): number {
  let total = 0
  for (const placed of state.props.values()) {
    const def = homeProp(placed.propId)
    if (def) total += def.price
  }
  return total
}

// --- persistence ------------------------------------------------------------

/**
 * localStorage, not the event log - the same call the café made, for the same
 * reason. Nothing here is anybody else's, there is no second player, and a save
 * is a snapshot rather than a history worth replaying.
 *
 * The coins are *not* written here. They live in `domain/world/save`, shared
 * with the café, and a copy in this blob would be a second opinion about the
 * balance that could only ever be wrong.
 */
export interface SavedHome {
  props: [TileKey, Placed][]
  /**
   * Squares bought, on top of the ones the plan came with.
   *
   * Only the extras. Writing the whole room map would freeze the authored plan
   * into every save, so a later change to where the bathroom is would apply to
   * new players and silently not to anybody who had already been home.
   */
  extra?: [TileKey, Theme][]
}

export function serialize(state: HomeState): SavedHome {
  const extra: [TileKey, Theme][] = []
  for (const [key, theme] of state.rooms) {
    if (!state.plan.rooms.has(key)) extra.push([key, theme])
  }

  return { props: [...state.props], extra }
}

export function deserialize(place: DecoratablePlace, saved: SavedHome): HomeState {
  const base = initialState(place)

  /**
   * Props whose ids no longer exist are dropped rather than kept.
   *
   * Renaming a catalogue entry is a thing that happens while a prototype is
   * being built, and the alternative is an empty square that cannot be built on
   * because something invisible is standing there.
   */
  const props = new Map(
    (saved.props ?? []).filter(([, placed]) => homeProp(placed.propId)),
  )

  const rooms = new Map(base.rooms)
  for (const [key, theme] of saved.extra ?? []) rooms.set(key, theme)

  return { ...base, rooms, props }
}
