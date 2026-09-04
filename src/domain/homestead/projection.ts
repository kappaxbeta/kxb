import {
  type DoorMode,
  HOMESTEAD_STREAM_TYPE,
  type HomesteadEvent,
  type PlaceId,
} from '@/domain/homestead/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * Fold the homestead stream into the three read-model tables.
 *
 * Every handler is idempotent, because a replay folds the same log twice and
 * must land in the same place. That is easy for the property tables - a
 * placement is an upsert keyed on the square - and is the one genuinely awkward
 * case for the purse, which is a *running total*.
 *
 * The purse is therefore written as an absolute value carried by the event's
 * own arithmetic rather than as `coins = coins + n`: each handler recomputes
 * the balance from the row it just read and the event in hand, keyed on the
 * stream version. Replaying an event whose version has already been applied is
 * skipped outright, which is what makes the increment safe. An unconditional
 * `+ payment` would double every workspace's money on the first replay - the
 * kind of bug that is invisible until somebody rebuilds a projection.
 */

/**
 * Whose homestead an event belongs to.
 *
 * ---------------------------------------------------------------------------
 * The actor is right for most events and wrong for the ones that matter
 * ---------------------------------------------------------------------------
 * For anything somebody does to their *own* homestead, the actor is exactly
 * right: a catch-up run triggered by one member may well be the first to fold a
 * colleague's events, and those rows have to be attributed to whoever actually
 * bought the sofa. That was the whole of this function, and for a stream nobody
 * else ever writes to it was correct.
 *
 * It stopped being correct the moment one purse could pay another. `events`
 * forces `actor_id = auth.uid()` in `append_events`, and `metadata.actorId`
 * does not override it - so the credit half of a transfer, appended to the
 * *recipient's* stream by the *sender's* session, carries the sender as its
 * actor. Reading the actor there moved the wrong purse.
 *
 * It moved it badly, too, and the way it failed is worth knowing because it is
 * silent: `bumpPurse` compares the row's `version` against the event's, and the
 * event's version came from a different stream. The sender's row is usually
 * further along, so the credit was not merely misattributed - it was skipped by
 * the replay guard. Sender debited, nobody credited.
 *
 * So an event that lands on somebody else's stream carries `owner`, and that
 * wins. The stream id cannot stand in for it: it is a `uuidv5` hash of
 * `tenant:user` and does not come apart.
 *
 * ---------------------------------------------------------------------------
 * What this does not fix
 * ---------------------------------------------------------------------------
 * `CoinsReceived` events written before `owner` existed do not have one, and
 * history is immutable. They were misattributed when they were written and a
 * rebuild reproduces that faithfully. The coins are in the log and can be found
 * by their `transfer` id; putting them back is a one-off correction somebody
 * has to decide to make, not something a projection may do on its own.
 *
 * An event with no owner and no actor cannot be placed at all, so it is skipped
 * rather than written against a null - the same call the avatar projection made.
 *
 * Exported only so `projection.test.ts` can pin this, and it is worth the
 * exception: this one function is where a transfer silently stopped arriving,
 * and the rest of the projection needs a database to exercise at all.
 */
export function ownerOf(event: StoredEvent<HomesteadEvent>): string | null {
  // Not `'owner' in event.data`: the union has members without the key, and a
  // narrow here would have to name every one of them and be updated whenever a
  // new event joins. The question is only ever "did this event say whose purse
  // it is", and one lookup answers it for the whole union.
  const owner = (event.data as { owner?: unknown }).owner
  if (typeof owner === 'string' && owner !== '') return owner

  return event.actorId
}

/**
 * Move the running totals, and optionally set an absolute column alongside.
 *
 * `set` exists for the door, which is the one column on this row that is *not*
 * a running total. It rides along here rather than in its own writer so that
 * both kinds of change go through the same version guard - two writers for one
 * row would each advance `version` past the other's work, and the loser's
 * increment would be skipped on the next replay.
 */
async function bumpPurse(
  supabase: Client,
  event: StoredEvent<HomesteadEvent>,
  delta: { coins?: number; served?: number; earned?: number },
  set?: { access_mode?: DoorMode },
): Promise<void> {
  const owner = ownerOf(event)
  if (!owner) return

  const { data, error: readError } = await supabase
    .from('homestead_read_model')
    .select('coins, served, earned, version, created_at')
    .eq('tenant_id', event.tenantId)
    .eq('user_id', owner)
    .maybeSingle()

  if (readError) {
    throw new Error(`homestead projection failed to read purse: ${readError.message}`)
  }

  /**
   * Already folded. The guard that makes the increments below replay-safe -
   * and the reason the row carries the stream version at all.
   */
  if (data && data.version >= event.version) return

  const { error } = await supabase.from('homestead_read_model').upsert(
    {
      tenant_id: event.tenantId,
      user_id: owner,
      coins: (data?.coins ?? 0) + (delta.coins ?? 0),
      served: (data?.served ?? 0) + (delta.served ?? 0),
      earned: (data?.earned ?? 0) + (delta.earned ?? 0),
      // Spread rather than passed as `access_mode: set?.access_mode`, because
      // an explicit `undefined` in an upsert payload is a column being written,
      // not a column being skipped - it would reset the door to its default on
      // every burger sold.
      ...(set?.access_mode ? { access_mode: set.access_mode } : {}),
      // Preserve the original on an existing row: an upsert writes every
      // column it is given, so `undefined` here is not "leave it alone", it is
      // a type error - and a literal would reset the founding date on every
      // burger sold.
      created_at: data?.created_at ?? event.createdAt,
      updated_at: event.createdAt,
      version: event.version,
    },
    { onConflict: 'tenant_id,user_id' },
  )

  if (error) {
    throw new Error(`homestead projection failed on the purse: ${error.message}`)
  }
}

export const homesteadProjection: Projection<HomesteadEvent> = {
  name: 'homestead_read_model',
  streamTypes: [HOMESTEAD_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<HomesteadEvent>): Promise<void> {
    // Whose homestead this is. Every write below is scoped to it, which is what
    // keeps one member's café out of another's.
    const owner = ownerOf(event)
    if (!owner) return

    switch (event.type) {
      case 'HomesteadFounded': {
        await bumpPurse(supabase, event, { coins: event.data.coins })

        const rows = Object.entries(event.data.layout).flatMap(([place, entries]) =>
          entries.map((entry) => ({
            tenant_id: event.tenantId,
            user_id: owner,
            place,
            tile: entry.tile,
            prop_id: entry.propId,
            rot_y: entry.rotY,
            topper_id: null,
            topper_rot_y: null,
          })),
        )

        if (rows.length > 0) {
          const { error } = await supabase
            .from('homestead_props_read_model')
            .upsert(rows, { onConflict: 'tenant_id,user_id,place,tile' })
          if (error) {
            throw new Error(`homestead projection failed on founding: ${error.message}`)
          }
        }
        return
      }

      case 'PropPlaced': {
        const { place, tile, propId, rotY, onSurface, price } = event.data
        await bumpPurse(supabase, event, { coins: -price })

        if (onSurface) {
          // The square keeps its furniture; only the worktop columns change.
          const { error } = await supabase
            .from('homestead_props_read_model')
            .update({ topper_id: propId, topper_rot_y: rotY })
            .eq('tenant_id', event.tenantId)
            .eq('user_id', owner)
            .eq('place', place)
            .eq('tile', tile)
          if (error) {
            throw new Error(`homestead projection failed on topper: ${error.message}`)
          }
          return
        }

        const { error } = await supabase.from('homestead_props_read_model').upsert(
          {
            tenant_id: event.tenantId,
            user_id: owner,
            place,
            tile,
            prop_id: propId,
            rot_y: rotY,
            topper_id: null,
            topper_rot_y: null,
          },
          { onConflict: 'tenant_id,user_id,place,tile' },
        )
        if (error) {
          throw new Error(`homestead projection failed on placement: ${error.message}`)
        }
        return
      }

      case 'PropRemoved': {
        const { place, tile, onSurface, refund } = event.data
        await bumpPurse(supabase, event, { coins: refund })

        // Only the decoration was sold - the counter under it stays.
        const { error } = onSurface
          ? await supabase
              .from('homestead_props_read_model')
              .update({ topper_id: null, topper_rot_y: null })
              .eq('tenant_id', event.tenantId)
              .eq('user_id', owner)
              .eq('place', place)
              .eq('tile', tile)
          : await supabase
              .from('homestead_props_read_model')
              .delete()
              .eq('tenant_id', event.tenantId)
              .eq('user_id', owner)
              .eq('place', place)
              .eq('tile', tile)

        if (error) {
          throw new Error(`homestead projection failed on removal: ${error.message}`)
        }
        return
      }

      case 'PropMoved': {
        const { place, from, to, rotY } = event.data

        const { data: existing, error: readError } = await supabase
          .from('homestead_props_read_model')
          .select('prop_id, topper_id, topper_rot_y')
          .eq('tenant_id', event.tenantId)
          .eq('user_id', owner)
          .eq('place', place)
          .eq('tile', from)
          .maybeSingle()

        if (readError) {
          throw new Error(`homestead projection failed to read move: ${readError.message}`)
        }
        // Already moved by an earlier fold of this same event.
        if (!existing) return

        const { error: writeError } = await supabase
          .from('homestead_props_read_model')
          .upsert(
            {
              tenant_id: event.tenantId,
              user_id: owner,
              place,
              tile: to,
              prop_id: existing.prop_id,
              rot_y: rotY,
              topper_id: existing.topper_id,
              topper_rot_y: existing.topper_rot_y,
            },
            { onConflict: 'tenant_id,user_id,place,tile' },
          )
        if (writeError) {
          throw new Error(`homestead projection failed on move: ${writeError.message}`)
        }

        if (to !== from) {
          const { error } = await supabase
            .from('homestead_props_read_model')
            .delete()
            .eq('tenant_id', event.tenantId)
            .eq('user_id', owner)
            .eq('place', place)
            .eq('tile', from)
          if (error) {
            throw new Error(`homestead projection failed clearing move: ${error.message}`)
          }
        }
        return
      }

      case 'GroundBought': {
        const { place, tiles, cost } = event.data
        await bumpPurse(supabase, event, { coins: -cost })

        const { error } = await supabase.from('homestead_ground_read_model').upsert(
          tiles.map((tile) => ({
            tenant_id: event.tenantId,
            user_id: owner,
            place,
            tile,
          })),
          { onConflict: 'tenant_id,user_id,place,tile' },
        )
        if (error) {
          throw new Error(`homestead projection failed on ground: ${error.message}`)
        }
        return
      }

      case 'GroundSold': {
        const { place, tiles, refund } = event.data
        await bumpPurse(supabase, event, { coins: refund })

        // Deleted by the same key the purchase upserted on. A replay finds the
        // rows already gone and deletes nothing, which is the idempotence this
        // projection needs.
        const { error } = await supabase
          .from('homestead_ground_read_model')
          .delete()
          .eq('tenant_id', event.tenantId)
          .eq('user_id', owner)
          .eq('place', place)
          .in('tile', tiles)
        if (error) {
          throw new Error(`homestead projection failed selling ground: ${error.message}`)
        }
        return
      }

      case 'CustomerServed':
        await bumpPurse(supabase, event, {
          coins: event.data.payment,
          served: 1,
          earned: event.data.payment,
        })
        return

      case 'HomesteadAccessSet':
        // No coins move; the empty delta is what says so.
        await bumpPurse(supabase, event, {}, { access_mode: event.data.mode })
        return

      /*
        The three ways coins move that are not furniture, ground or a customer.

        Every one of them has to be here rather than falling through to the
        `default` below, and the reason is worth writing down because the bug it
        causes is silent: the *aggregate* folds these and so refuses an
        unaffordable command correctly, while the *read model* is what anybody
        actually sees. A case missing from this switch is a balance that is
        right every time it is enforced and wrong every time it is shown.
      */
      case 'CoinsSpent':
        await bumpPurse(supabase, event, { coins: -event.data.cost })
        return

      case 'CoinsSent':
        await bumpPurse(supabase, event, { coins: -event.data.amount })
        return

      case 'CoinsReceived':
        // The recipient's stream, and `owner` on the event is what says so -
        // the actor here is the *sender*. See `ownerOf`.
        await bumpPurse(supabase, event, { coins: event.data.amount })
        return

      /**
       * Coins from outside: a won battle, a knockout, a remix, a voucher.
       *
       * Moves `coins` alone. Deliberately not `earned`, which is the café's
       * takings and is what the homestead leaderboard ranks on - a player who
       * won ten battles has not served anybody.
       */
      case 'CoinsEarned':
        await bumpPurse(supabase, event, { coins: event.data.amount })
        return

      default:
        return
    }
  },
}

/** Narrowing helper for callers that only care about one place. */
export function isPlace(value: string): value is PlaceId {
  return value === 'cafe' || value === 'home' || value === 'outdoor'
}
