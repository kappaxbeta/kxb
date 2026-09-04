import { BANK_STREAM_TYPE, type BankEvent } from '@/domain/bank/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * Fold the bank stream into one row per space.
 *
 * A running total, which is the awkward kind of projection: a replay folds the
 * same log twice and must land in the same place, and `coins = coins + n` does
 * not. The guard is the stream version carried on the row - an event whose
 * version has already been applied is skipped outright, which is what makes the
 * increment safe.
 *
 * This is the same arrangement `homestead_read_model` uses for a purse, and the
 * failure it prevents is worth naming: without it, the first time anybody
 * rebuilds this projection every space in the app doubles its money. That kind
 * of bug is invisible until the rebuild, and permanent afterwards.
 *
 * ---------------------------------------------------------------------------
 * Why the balance is not recomputed from the log instead
 * ---------------------------------------------------------------------------
 * It could be - a sum over one stream is idempotent by construction, and needs
 * no version column. It is not, because the stream grows with every sandwich in
 * a space where hunger is on, and a projection that re-sums it on each event is
 * quadratic in the busiest case. The version guard buys the same idempotency
 * for one integer comparison.
 */

/**
 * Move the totals, guarded on the version.
 *
 * One writer for the row rather than one per event type, for the reason the
 * homestead's `bumpPurse` gives: two writers would each advance `version` past
 * the other's work, and the loser's movement would be skipped on the next
 * replay - money that vanishes only when somebody rebuilds.
 */
async function moveBalance(
  supabase: Client,
  event: StoredEvent<BankEvent>,
  delta: { coins: number; taken?: number; paidOut?: number },
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('space_bank_read_model')
    .select('coins, taken, paid_out, version, created_at')
    .eq('tenant_id', event.tenantId)
    .maybeSingle()

  if (readError) {
    throw new Error(`bank projection failed to read the balance: ${readError.message}`)
  }

  // Already folded. The guard that makes the increments replay-safe.
  if (data && data.version >= event.version) return

  const { error } = await supabase.from('space_bank_read_model').upsert(
    {
      tenant_id: event.tenantId,
      // Carried so a balance can jump to its own history. The event knows it;
      // the row would otherwise have to derive it, which means importing
      // `bankStreamId` and its `node:crypto` dependency into a projection.
      stream_id: event.streamId,
      coins: (data?.coins ?? 0) + delta.coins,
      taken: (data?.taken ?? 0) + (delta.taken ?? 0),
      paid_out: (data?.paid_out ?? 0) + (delta.paidOut ?? 0),
      // Preserved on an existing row: an upsert writes every column it is
      // given, so a literal here would reset the founding date on every
      // sandwich - the trap the homestead projection names.
      created_at: data?.created_at ?? event.createdAt,
      updated_at: event.createdAt,
      version: event.version,
    },
    { onConflict: 'tenant_id' },
  )

  if (error) {
    throw new Error(`bank projection failed on the balance: ${error.message}`)
  }
}

export const bankProjection: Projection<BankEvent> = {
  name: 'space_bank_read_model',
  streamTypes: [BANK_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<BankEvent>): Promise<void> {
    switch (event.type) {
      case 'CoinsBanked':
        await moveBalance(supabase, event, {
          coins: event.data.amount,
          taken: event.data.amount,
        })
        return

      case 'CoinsWithdrawn':
        await moveBalance(supabase, event, {
          coins: -event.data.amount,
          paidOut: event.data.amount,
        })
        return

      default: {
        /**
         * Deliberately not exhaustive-checked with a `never`.
         *
         * A projection replays streams written by every version of this code
         * there has ever been, including ones that wrote events this build has
         * since stopped knowing about. Throwing on an unrecognised type would
         * park the whole tenant's projection on a single old row - the failure
         * `events-log-has-holes` is remembered for. Skipping is the recoverable
         * direction, and the cursor still advances.
         */
        return
      }
    }
  },
}
