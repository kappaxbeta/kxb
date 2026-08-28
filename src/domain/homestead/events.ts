import type { DomainEvent } from '@/es/types'

/**
 * One member's café, house and garden - and the single purse behind all three.
 *
 * ---------------------------------------------------------------------------
 * What is in the log, and what is deliberately not
 * ---------------------------------------------------------------------------
 * In: what was built, what was bought, what was sold, and every coin earned.
 * These are the facts a member expects to survive closing the tab, and the
 * facts another member expects to see when they open theirs.
 *
 * Out: where anybody is standing. The café ticks sixty times a second and a
 * position is stale before it is written - appending it would produce a stream
 * nobody will ever replay, at a rate that would dwarf every other aggregate in
 * the app combined. Presence already carries "who is here" over a realtime
 * channel without touching Postgres, and that is the right home for it.
 *
 * Also out: which stations hold which ingredients, whether the café is serving,
 * and how impatient the current customers are. All of it is gone in seconds and
 * none of it is worth a schema - the same call `SavedCafe` already made when
 * this was a browser snapshot.
 *
 * The one exception is `HomesteadAccessSet`, and the exception proves the rule.
 * Who is *currently* standing in your kitchen is ephemeral and lives on the
 * channel; the standing answer to "may people come in at all" is a setting you
 * expect to still be true tomorrow, so it is an event like any other.
 *
 * ---------------------------------------------------------------------------
 * One stream, not three - and one per member, not per workspace
 * ---------------------------------------------------------------------------
 * The café, the house and the garden share a purse, and a shared balance is the
 * textbook reason to put things in one aggregate: with a stream each, the same
 * 200 coins could be spent in two places at once and both writes would succeed,
 * because neither stream saw the other. One stream makes "can I afford this" a
 * single-stream invariant that optimistic concurrency actually protects.
 *
 * Since 20260730000000 each *member* has their own set within a workspace, so
 * the stream id is derived from (tenant, user) rather than the tenant alone.
 * Nothing in this file changed for that, which is the point: the aggregate was
 * never about who owns the house, only about keeping one purse honest.
 *
 * A side effect worth noticing: contention all but disappeared. Two colleagues
 * decorating simultaneously now write to different streams and cannot collide
 * at all, where before one of them retried.
 */

export const HOMESTEAD_STREAM_TYPE = 'homestead'

/** Which of the three rooms an event is about. */
export type PlaceId = 'cafe' | 'home' | 'outdoor'

/**
 * A member's homestead began.
 *
 * Carries the whole opening layout rather than leaving the client to overlay a
 * starting plan from code. The alternative is tempting - `initialState()`
 * already knows where the first crates go - and it is wrong for the usual
 * reason: code changes. A tenant who founded a café in July and never touched
 * the corner crate would find it had silently become something else in August,
 * because the read model was only ever half the story.
 *
 * Exactly one of these per workspace; the decider refuses a second.
 */
export type HomesteadFounded = DomainEvent<
  'HomesteadFounded',
  {
    coins: number
    /** Opening furniture per place: tile -> prop, exactly as placed. */
    layout: Record<string, { tile: string; propId: string; rotY: number }[]>
  }
>

/**
 * Something was bought and put down.
 *
 * The price is recorded rather than derived on replay. That looks redundant -
 * the catalogue knows what a stove costs - and it is the whole point: the
 * catalogue is code, and code changes. Re-pricing a stove next month must not
 * retroactively change what a workspace paid for one last month, or every
 * balance in the app silently drifts the moment somebody edits a number.
 */
export type PropPlaced = DomainEvent<
  'PropPlaced',
  {
    place: PlaceId
    /** `"x,z"`, the same key the grid uses. */
    tile: string
    propId: string
    rotY: number
    /** True when it went onto a worktop rather than onto the floor. */
    onSurface: boolean
    price: number
  }
>

/** Sold back. `refund` is recorded for the same reason `price` is. */
export type PropRemoved = DomainEvent<
  'PropRemoved',
  {
    place: PlaceId
    tile: string
    /** True when only the decoration on top was sold, not the thing under it. */
    onSurface: boolean
    refund: number
  }
>

/** Picked up and put down elsewhere. Free, so it moves no coins. */
export type PropMoved = DomainEvent<
  'PropMoved',
  { place: PlaceId; from: string; to: string; rotY: number }
>

/**
 * Floor or garden bought.
 *
 * Carries every tile in one event rather than one event per square, because the
 * café buys a whole strip per click and a player who extends the room twice
 * should not produce fourteen events.
 */
export type GroundBought = DomainEvent<
  'GroundBought',
  { place: PlaceId; tiles: string[]; cost: number }
>

/**
 * Ground sold back, shrinking a room.
 *
 * The counterpart to `GroundBought`, and `refund` is recorded for the same
 * reason `cost` is: what a square was worth on the day it was sold must not
 * change when somebody edits the pricing curve next month.
 *
 * The refund is deliberately the exact price the square last cost - see the
 * decider. Anything more would make buy-then-sell a way to print coins, and
 * anything less would make trying out a layout quietly expensive.
 */
export type GroundSold = DomainEvent<
  'GroundSold',
  { place: PlaceId; tiles: string[]; refund: number }
>

/**
 * A customer paid.
 *
 * One event each, which is the decision that makes the balance exactly
 * derivable rather than approximately. A busy café serves a few customers a
 * minute; the log handles that without noticing, and closing the tab mid-shift
 * keeps everything already earned.
 */
export type CustomerServed = DomainEvent<
  'CustomerServed',
  { payment: number; dish: string }
>

/**
 * Who may walk into your café, house and garden.
 *
 * - `open` - anyone in the workspace, no asking.
 * - `knock` - they have to ask, and you have to be there to answer.
 * - `closed` - nobody, and there is no knock to ignore.
 *
 * One setting for all three places rather than one each. They are one
 * homestead - you walk between them through doors - and a house you can be
 * thrown out of by walking into the garden is not a coherent thing to have
 * built. If per-place ever becomes worth it, this event grows a `place` field
 * and the absent one means "all three", which is why the field is not here now.
 *
 * `closed` is not a way to hide. A colleague can still *see* your homestead in
 * the neighbours list and can still read what is in it - the read model is
 * membership-scoped on purpose, see 20260730000000. What the door controls is
 * whether they can stand in it with you.
 */
export type DoorMode = 'open' | 'knock' | 'closed'

/**
 * The default for a homestead that has never set one.
 *
 * `knock` rather than `open`, because the first time somebody walks into your
 * house unannounced is the moment you find out the default was wrong, and by
 * then they are already standing in your kitchen. The recoverable mistake is
 * the one where a visitor has to wait.
 */
export const DEFAULT_DOOR: DoorMode = 'knock'

/**
 * The door was set.
 *
 * Recorded rather than stored as a mutable column for the ordinary reason: the
 * question "was it open when Sam got in" is one you can only answer from a log.
 */
export type HomesteadAccessSet = DomainEvent<
  'HomesteadAccessSet',
  { mode: DoorMode }
>

export type HomesteadEvent =
  | HomesteadFounded
  | PropPlaced
  | PropRemoved
  | PropMoved
  | GroundBought
  | GroundSold
  | CustomerServed
  | HomesteadAccessSet

export const HOMESTEAD_EVENT_LABELS: Record<HomesteadEvent['type'], string> = {
  HomesteadFounded: 'homestead founded',
  PropPlaced: 'furniture placed',
  PropRemoved: 'furniture sold',
  PropMoved: 'furniture moved',
  GroundBought: 'ground bought',
  GroundSold: 'ground sold',
  CustomerServed: 'customer served',
  HomesteadAccessSet: 'door setting changed',
}
