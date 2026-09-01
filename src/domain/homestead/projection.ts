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
 * The event's actor, never the session running the projection. A catch-up run
 * triggered by one member may well be the first to fold a colleague's events,
 * and those rows have to be attributed to whoever actually bought the sofa.
 *
 * An event with no actor cannot be placed, so it is skipped rather than written
 * against a null - the same call the avatar projection made. In practice every
 * homestead command carries one, because they all come from a server action
 * with a session behind it.
 */
function ownerOf(event: StoredEvent<HomesteadEvent>): string | null {
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
        // On the recipient's own stream, so `ownerOf` already points at the
        // right purse - the same scoping every other case here relies on.
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
