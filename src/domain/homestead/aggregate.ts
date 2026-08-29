import { squarePrice } from '@kxb/dream-restaurant/game'
import { groundPrice } from '@kxb/peepz-world/game'
import {
  DEFAULT_DOOR,
  type DoorMode,
  HOMESTEAD_STREAM_TYPE,
  type HomesteadEvent,
  type PlaceId,
} from '@/domain/homestead/events'
import {
  dishPrice,
  priceOf,
  refundOf,
  surfaceOf,
  topperOf,
} from '@/domain/homestead/pricing'
import type { HomesteadCommand } from '@/domain/homestead/commands'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * What the aggregate knows, and what it deliberately leaves to the client.
 *
 * ---------------------------------------------------------------------------
 * Guarded here
 * ---------------------------------------------------------------------------
 * Money, and ownership. You cannot spend coins you do not have, sell furniture
 * that is not there, put two things on one square, or buy the same ground
 * twice. These are the rules where being wrong means a workspace ends up with
 * an impossible balance, and a balance is the one number in this game that has
 * to be exactly right.
 *
 * ---------------------------------------------------------------------------
 * Left to the client
 * ---------------------------------------------------------------------------
 * Floor plans and taste. Whether a square is inside the bathroom, whether a bed
 * belongs there, whether a chair touches a table. Being wrong about any of them
 * puts a sofa somewhere silly - it does not conjure coins, and re-implementing
 * `domain/home/plan` here would mean two copies of the floor plan drifting
 * apart to prevent a cosmetic mistake.
 *
 * That line is worth stating because it is the tempting one to blur. An
 * aggregate that validates everything is an aggregate that has absorbed the
 * whole game, and this one has a specific job: keep the purse honest.
 */
export interface PlacedProp {
  propId: string
  rotY: number
  /** A decoration standing on this one's worktop. */
  topper?: { propId: string; rotY: number }
}

export interface PlaceState {
  props: Map<string, PlacedProp>
  /** Ground bought beyond whatever the place opened with. */
  bought: Set<string>
}

export interface HomesteadState {
  founded: boolean
  coins: number
  places: Record<PlaceId, PlaceState>
  served: number
  /** Lifetime takings, kept because it is the one stat you cannot re-derive. */
  earned: number
  /** Who may come in. See `DoorMode`. */
  door: DoorMode
}

const PLACES: PlaceId[] = ['cafe', 'home', 'outdoor']

function emptyPlaces(): Record<PlaceId, PlaceState> {
  return {
    cafe: { props: new Map(), bought: new Set() },
    home: { props: new Map(), bought: new Set() },
    outdoor: { props: new Map(), bought: new Set() },
  }
}

export const initialHomesteadState: HomesteadState = {
  founded: false,
  coins: 0,
  places: emptyPlaces(),
  served: 0,
  earned: 0,
  door: DEFAULT_DOOR,
}

/** Copy just the place being changed; the other two keep their references. */
function withPlace(
  state: HomesteadState,
  place: PlaceId,
  change: (current: PlaceState) => PlaceState,
): Record<PlaceId, PlaceState> {
  return { ...state.places, [place]: change(state.places[place]) }
}

export function evolve(
  state: HomesteadState,
  event: HomesteadEvent,
): HomesteadState {
  switch (event.type) {
    case 'HomesteadFounded': {
      const places = emptyPlaces()
      for (const place of PLACES) {
        for (const entry of event.data.layout[place] ?? []) {
          places[place].props.set(entry.tile, {
            propId: entry.propId,
            rotY: entry.rotY,
          })
        }
      }
      return { ...state, founded: true, coins: event.data.coins, places }
    }

    case 'PropPlaced': {
      const { place, tile, propId, rotY, onSurface, price } = event.data
      return {
        ...state,
        coins: state.coins - price,
        places: withPlace(state, place, (current) => {
          const props = new Map(current.props)
          if (onSurface) {
            const base = props.get(tile)
            // Guarded in `decide`; a replay of a valid log never sees this.
            if (base) props.set(tile, { ...base, topper: { propId, rotY } })
          } else {
            props.set(tile, { propId, rotY })
          }
          return { ...current, props }
        }),
      }
    }

    case 'PropRemoved': {
      const { place, tile, onSurface, refund } = event.data
      return {
        ...state,
        coins: state.coins + refund,
        places: withPlace(state, place, (current) => {
          const props = new Map(current.props)
          const existing = props.get(tile)
          if (onSurface && existing) {
            props.set(tile, { propId: existing.propId, rotY: existing.rotY })
          } else {
            props.delete(tile)
          }
          return { ...current, props }
        }),
      }
    }

    case 'PropMoved': {
      const { place, from, to, rotY } = event.data
      return {
        ...state,
        places: withPlace(state, place, (current) => {
          const props = new Map(current.props)
          const moving = props.get(from)
          if (!moving) return current
          props.delete(from)
          // Spread, so a decoration on the worktop travels with it.
          props.set(to, { ...moving, rotY })
          return { ...current, props }
        }),
      }
    }

    case 'GroundBought': {
      const { place, tiles, cost } = event.data
      return {
        ...state,
        coins: state.coins - cost,
        places: withPlace(state, place, (current) => ({
          ...current,
          bought: new Set([...current.bought, ...tiles]),
        })),
      }
    }

    case 'CustomerServed':
      return {
        ...state,
        coins: state.coins + event.data.payment,
        served: state.served + 1,
        earned: state.earned + event.data.payment,
      }

    case 'GroundSold': {
      const { place, tiles, refund } = event.data
      const sold = new Set(tiles)
      return {
        ...state,
        coins: state.coins + refund,
        places: withPlace(state, place, (current) => ({
          ...current,
          bought: new Set([...current.bought].filter((tile) => !sold.has(tile))),
        })),
      }
    }

    case 'HomesteadAccessSet':
      return { ...state, door: event.data.mode }

    default:
      return state
  }
}

/** Nothing may be done to a homestead that has not been founded. */
function requireFounded(state: HomesteadState): void {
  if (!state.founded) {
    throw new DomainError('This space has no homestead yet', 'homestead_missing')
  }
}

function requireAffordable(state: HomesteadState, cost: number): void {
  if (cost > state.coins) {
    throw new DomainError(
      `That costs ${cost} and the till holds ${state.coins}`,
      'homestead_too_expensive',
    )
  }
}

export function decide(
  state: HomesteadState,
  command: HomesteadCommand,
): HomesteadEvent[] {
  switch (command.type) {
    /**
     * Founding is idempotent by returning nothing, not by throwing.
     *
     * Every page load calls it, because that is the only reliable moment to
     * discover a workspace has never opened one. A second call is the normal
     * case rather than an error, and an empty result costs no event.
     */
    case 'FoundHomestead': {
      if (state.founded) return []
      return [
        {
          type: 'HomesteadFounded',
          data: { coins: command.coins, layout: command.layout },
        },
      ]
    }

    case 'PlaceProp': {
      requireFounded(state)
      const { place, tile, propId, rotY } = command
      const price = priceOf(place, propId)
      if (price === undefined) {
        throw new DomainError(`No such thing to buy: ${propId}`, 'homestead_unknown_prop')
      }

      const existing = state.places[place].props.get(tile)
      let onSurface = false

      if (existing) {
        /**
         * The square is taken, so this is only legal as a worktop decoration.
         *
         * Three things have to hold: the thing being bought is small enough to
         * stand on something, the thing already there has a top to stand on,
         * and that top is free.
         */
        if (!topperOf(place, propId)) {
          throw new DomainError('Something is already there', 'homestead_occupied')
        }
        if (existing.topper) {
          throw new DomainError(
            'There is already something on that',
            'homestead_surface_taken',
          )
        }
        if (surfaceOf(place, existing.propId) === undefined) {
          throw new DomainError(
            'That has nothing to stand on',
            'homestead_no_surface',
          )
        }
        onSurface = true
      }

      requireAffordable(state, price)

      return [
        { type: 'PropPlaced', data: { place, tile, propId, rotY, onSurface, price } },
      ]
    }

    case 'RemoveProp': {
      requireFounded(state)
      const { place, tile } = command
      const existing = state.places[place].props.get(tile)
      if (!existing) return []

      /**
       * Top down, one press at a time - the same order the single-player café
       * settled on. Selling both at once makes the decoration unremovable
       * except by demolishing the counter it is standing on.
       */
      const onSurface = existing.topper !== undefined
      const soldId = onSurface ? existing.topper!.propId : existing.propId
      const refund = refundOf(place, soldId) ?? 0

      return [{ type: 'PropRemoved', data: { place, tile, onSurface, refund } }]
    }

    case 'MoveProp': {
      requireFounded(state)
      const { place, from, to, rotY } = command
      const props = state.places[place].props
      if (!props.has(from)) {
        throw new DomainError('There is nothing there to move', 'homestead_empty')
      }
      // Landing on itself is how a prop is rotated in place.
      if (to !== from && props.has(to)) {
        throw new DomainError('Something is already there', 'homestead_occupied')
      }
      if (to === from && props.get(from)!.rotY === rotY) return []

      return [{ type: 'PropMoved', data: { place, from, to, rotY } }]
    }

    case 'BuyGround': {
      requireFounded(state)
      const { place, tiles } = command
      if (tiles.length === 0) return []

      const owned = state.places[place].bought
      const fresh = tiles.filter((tile) => !owned.has(tile))
      if (fresh.length === 0) return []

      /**
       * Priced from the count this aggregate has itself recorded, using the
       * same function the client prices with - never from a number the caller
       * sent. A client that could name its own price is a client that can buy
       * the whole map for nothing.
       */
      let cost = 0
      for (let i = 0; i < fresh.length; i++) {
        cost +=
          place === 'cafe'
            ? squarePrice(owned.size + i)
            : groundPrice(owned.size + i)
      }

      requireAffordable(state, cost)

      return [{ type: 'GroundBought', data: { place, tiles: fresh, cost } }]
    }

    /**
     * The one command that creates money, and so the one worth being strict
     * about.
     *
     * The payment is *not* taken from the client. The café's tip multiplier
     * depends on the room's ambience, which depends on furniture this aggregate
     * already knows about - but reconstructing that here would mean importing
     * the whole café simulation. The compromise is a hard ceiling: a dish's
     * catalogue price plus the largest tip the game can produce. A client that
     * lies can lie by a few coins, not by a million.
     */
    case 'ServeCustomer': {
      requireFounded(state)
      const ceiling = dishPrice(command.dish)
      if (ceiling === undefined) {
        throw new DomainError(`No such dish: ${command.dish}`, 'homestead_unknown_dish')
      }

      const most = Math.ceil(ceiling * MAX_TIP_MULTIPLIER)
      if (command.payment < 0 || command.payment > most) {
        throw new DomainError('That is not a plausible payment', 'homestead_bad_payment')
      }

      return [
        {
          type: 'CustomerServed',
          data: { payment: command.payment, dish: command.dish },
        },
      ]
    }

    /**
     * Ground sold back.
     *
     * Two guards, and they are the two this aggregate exists for.
     *
     * **The refund is symmetric with the price.** Squares get dearer as you
     * buy them - `groundPrice(n)` - so selling one back returns
     * `groundPrice(n - 1)`, exactly what the last one cost. Refunding the
     * *current* price instead would make buy-then-sell a coin printer, which
     * is the kind of arithmetic mistake that only shows up once somebody has
     * an infinite balance.
     *
     * **Nothing may be sold out from under furniture.** The floor plan is the
     * client's business - see the note at the top of this file - but a sofa
     * standing on a square that no longer exists is not a cosmetic mistake,
     * it is a prop with nowhere to be. Only the anchor is checked here, which
     * is all this aggregate models; the client refuses the rest, including
     * squares a two-square prop merely covers.
     */
    case 'SellGround': {
      requireFounded(state)
      const { place, tiles } = command
      if (tiles.length === 0) return []

      const { bought, props } = state.places[place]

      // Only ground that was bought. The opening plan is the shape of the
      // house itself, and selling a piece of it would leave the room a shape
      // the founding event does not describe.
      const sellable = [...new Set(tiles)].filter((tile) => bought.has(tile))
      if (sellable.length === 0) return []

      for (const tile of sellable) {
        if (props.has(tile)) {
          throw new DomainError(
            'Something is standing there - move it first',
            'homestead_occupied',
          )
        }
      }

      let refund = 0
      for (let i = 0; i < sellable.length; i++) {
        // Walking the count *down*: the first square sold gives back what the
        // last one bought cost, and so on.
        const at = bought.size - 1 - i
        refund += place === 'cafe' ? squarePrice(at) : groundPrice(at)
      }

      return [{ type: 'GroundSold', data: { place, tiles: sellable, refund } }]
    }

    /**
     * Setting the door to what it already is produces nothing.
     *
     * The toggle is a three-way control that reports the state it is in, so a
     * double click, a stale tab and a retried request all arrive as "set it to
     * closed" against a homestead that is already closed. None of those is an
     * error, and none of them is worth an event.
     */
    case 'SetHomesteadAccess': {
      requireFounded(state)
      if (state.door === command.mode) return []
      return [{ type: 'HomesteadAccessSet', data: { mode: command.mode } }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(
        `Unknown command: ${JSON.stringify(exhaustive)}`,
        'homestead_unknown_command',
      )
    }
  }
}

/**
 * The most a dish can ever be worth, as a multiple of its menu price.
 *
 * Ambience is capped at 50 and reads as a percentage on top of the bill, so
 * 1.5x is the ceiling the simulation can actually reach. The extra margin is
 * there so that tuning the tip curve slightly does not start rejecting honest
 * payments - this is a sanity bound, not a second pricing model.
 */
const MAX_TIP_MULTIPLIER = 1.6

export const homesteadDecider: Decider<
  HomesteadState,
  HomesteadCommand,
  HomesteadEvent
> = {
  streamType: HOMESTEAD_STREAM_TYPE,
  initialState: initialHomesteadState,
  evolve,
  decide,
}
