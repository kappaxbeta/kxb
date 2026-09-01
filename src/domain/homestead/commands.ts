import { z } from 'zod'
import { MAX_TRANSFER, type DoorMode, type PlaceId } from '@/domain/homestead/events'

/**
 * The write side's edge.
 *
 * Every field that reaches the decider is validated here first, and the two
 * layers deliberately overlap: the schema rejects a malformed shape with a
 * readable message, and the decider re-checks the rules that protect the purse
 * because it is the last thing between a caller and immutable history. It does
 * not get to assume everybody came through Zod.
 *
 * Notably absent: any price. What something costs is decided by the aggregate
 * from its own state, never sent by the caller - see `BuyGround`.
 */

const placeSchema = z.enum(['cafe', 'home', 'outdoor'])

/** `"x,z"` with optional minus signs. Anything else is not a tile. */
const tileSchema = z
  .string()
  .regex(/^-?\d+,-?\d+$/, { message: 'That is not a square' })

/**
 * A quarter turn, and only a quarter turn.
 *
 * The palette rotates in 90-degree steps, so an arbitrary float is either a
 * bug or somebody poking at the action directly. Rounding it here keeps the
 * read model's `rot_y` to four possible values forever.
 */
const rotationSchema = z
  .number()
  .finite()
  .transform((value) => {
    const quarter = Math.PI / 2
    const steps = Math.round(value / quarter)
    return ((steps % 4) + 4) % 4 * quarter
  })

const propIdSchema = z.string().min(1).max(64)

export const placePropSchema = z.object({
  place: placeSchema,
  tile: tileSchema,
  propId: propIdSchema,
  rotY: rotationSchema,
})

export const removePropSchema = z.object({
  place: placeSchema,
  tile: tileSchema,
})

export const movePropSchema = z.object({
  place: placeSchema,
  from: tileSchema,
  to: tileSchema,
  rotY: rotationSchema,
})

export const buyGroundSchema = z.object({
  place: placeSchema,
  /**
   * Bounded, because the café buys a strip at a time and a strip is small. An
   * unbounded array is a request to write an arbitrarily large event, and the
   * cost is computed per tile - so this is also what stops one call looping
   * ten thousand times inside the decider.
   */
  tiles: z.array(tileSchema).min(1).max(64),
})

/** Same shape as buying, and bounded for the same reason. */
export const sellGroundSchema = buyGroundSchema

export const serveCustomerSchema = z.object({
  dish: z.string().min(1).max(64),
  payment: z.number().int().min(0).max(10_000),
})

/**
 * An enum rather than a boolean pair, so there is no way to express "closed but
 * also accepting knocks". Three named states, exactly one of which holds.
 */
export const setHomesteadAccessSchema = z.object({
  mode: z.enum(['open', 'knock', 'closed']),
})

export type FoundHomestead = {
  type: 'FoundHomestead'
  coins: number
  layout: Record<string, { tile: string; propId: string; rotY: number }[]>
}

/**
 * What one person may hand another.
 *
 * The one part of a transfer a browser *does* get to name. Both stream ids are
 * derived - the sender from the session, the recipient from a membership row
 * the action checked - so what is parsed here is the amount and nothing else.
 */
export const sendCoinsSchema = z.object({
  to: z.uuid(),
  amount: z
    .number()
    .int('Coins come in whole numbers')
    .min(1, 'Send at least one coin')
    .max(MAX_TRANSFER, `Send at most ${MAX_TRANSFER} at a time`),
})

export type HomesteadCommand =
  | FoundHomestead
  | ({ type: 'PlaceProp' } & { place: PlaceId; tile: string; propId: string; rotY: number })
  | ({ type: 'RemoveProp' } & { place: PlaceId; tile: string })
  | ({ type: 'MoveProp' } & { place: PlaceId; from: string; to: string; rotY: number })
  | ({ type: 'BuyGround' } & { place: PlaceId; tiles: string[] })
  | ({ type: 'SellGround' } & { place: PlaceId; tiles: string[] })
  | ({ type: 'ServeCustomer' } & { dish: string; payment: number })
  | ({ type: 'SetHomesteadAccess' } & { mode: DoorMode })
  /**
   * Spending on something outside the homestead. See `CoinsSpent`.
   *
   * Deliberately has **no Zod schema above**, and that absence is the guard
   * rather than an omission: every other command here is parsed from something
   * a browser sent, and this one is not reachable that way at all. It is issued
   * by a server action that read a blueprint's price out of the shelf, which is
   * the only place that number is allowed to come from - see the note at the
   * top of this file about prices, which still holds.
   */
  | ({ type: 'SpendCoins' } & { on: 'thing' | 'item'; what: string; cost: number })
  /**
   * The two halves of a transfer. See `CoinsSent`.
   *
   * Like `SpendCoins`, neither has a Zod schema above, and for a related
   * reason: the *amount* is a browser's to name here, but the two stream ids
   * are not - they are derived from the session and from a member the action
   * has checked. The action parses the amount; these are what it issues.
   */
  | ({ type: 'SendCoins' } & { to: string; amount: number; transfer: string })
  | ({ type: 'ReceiveCoins' } & { from: string; amount: number; transfer: string })
