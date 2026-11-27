import { OPENING_COINS, OPENING_SPECKS, settle, unsettle, type Fill } from '@kxb/xoin'
import { XOIN_STREAM_TYPE, type XoinEvent } from '@/domain/xoin/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * Two tables: the book, and everybody standing in it.
 *
 * ---------------------------------------------------------------------------
 * Why the read model does the same arithmetic the decider does
 * ---------------------------------------------------------------------------
 * It looks like duplication and it is not quite: the decider folds a stream to
 * *decide*, and this folds the same stream to *answer questions quickly*. What
 * matters is that both use the same `settle` out of `@kxb/xoin` rather than
 * each writing out the addition, so the two can only disagree if the package is
 * wrong - in which case they are wrong together, and the decider's tests catch
 * it.
 *
 * A read model that had its own arithmetic here would be a second
 * implementation of the market, and the day it drifted would be the day a
 * player's screen and their actual position stopped matching with nothing to
 * say which was right.
 *
 * ---------------------------------------------------------------------------
 * Read-modify-write, with a version guard
 * ---------------------------------------------------------------------------
 * The same shape and the same justification as the radio's `TrackStopped`: a
 * tenant's events are applied in order by a single `runProjection` pass, so
 * there is no second writer to race. The guard is about *retries* - a
 * checkpoint lost between applying a trade and saving the cursor would
 * otherwise replay the fill and move the book twice, which here is not a
 * cosmetic error but coins appearing.
 */
export const xoinProjection: Projection<XoinEvent> = {
  name: 'xoin_market',
  streamTypes: [XOIN_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<XoinEvent>): Promise<void> {
    switch (event.type) {
      /**
       * `opened_at` is the *event's* timestamp, never `new Date()` here and
       * never the clock of whoever opened it. It is the anchor every client
       * subtracts from to find the epoch, so it has to be the one clock they
       * all agree on - the radio's `started_at` makes the same argument.
       */
      case 'MarketOpened': {
        await supabase.from('xoin_markets').upsert(
          {
            tenant_id: event.tenantId,
            mode: event.data.mode,
            coins: OPENING_COINS,
            specks: OPENING_SPECKS,
            opened_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'tenant_id' },
        )
        return
      }

      case 'ModeSet': {
        const market = await readMarket(supabase, event.tenantId)
        if (!market || market.version >= event.version) return
        await supabase
          .from('xoin_markets')
          .update({ mode: event.data.mode, updated_at: event.createdAt, version: event.version })
          .eq('tenant_id', event.tenantId)
        return
      }

      case 'Traded':
      case 'TradeReversed': {
        const market = await readMarket(supabase, event.tenantId)
        // No row means the open has not been projected yet, which cannot happen
        // in order. Doing nothing is right: there is no book to move.
        if (!market) return

        const fill: Fill = {
          side: event.data.side,
          coins: event.data.coins,
          specks: event.data.specks,
          fee: event.data.fee,
        }

        /*
         * ---------------------------------------------------------------------
         * Two tables, two guards, and they are deliberately independent
         * ---------------------------------------------------------------------
         * The obvious version of this reads the market, returns early if it has
         * already seen the event, and otherwise writes both rows. That loses a
         * holding forever: a process that dies between the two writes leaves the
         * book advanced and the position behind, and the retry sees the book's
         * version, decides it has already applied this event, and never writes
         * the position at all.
         *
         * Both writes are additive, so neither may be applied twice and neither
         * may be skipped because the *other* one landed. So each row carries its
         * own cursor and each is checked against it.
         */
        if (market.version < event.version) {
          const before = { coins: market.coins, specks: market.specks }
          const after = event.type === 'Traded' ? settle(before, fill) : unsettle(before, fill)

          await supabase
            .from('xoin_markets')
            .update({
              coins: after.coins,
              specks: after.specks,
              updated_at: event.createdAt,
              version: event.version,
            })
            .eq('tenant_id', event.tenantId)
        }

        /*
         * The holder's side. A buy and its reversal move the position in
         * opposite directions, and the totals move with it - a reversal that
         * left `spent` behind would show somebody money they never parted with,
         * in the one figure they use to tell whether they are winning.
         */
        const held = await readHolding(supabase, event.tenantId, event.data.by)
        if (held.version >= event.version) return

        const sign = event.type === 'Traded' ? 1 : -1
        const buying = event.data.side === 'buy'

        await supabase.from('xoin_holdings').upsert(
          {
            tenant_id: event.tenantId,
            user_id: event.data.by,
            specks: held.specks + sign * (buying ? event.data.specks : -event.data.specks),
            spent: held.spent + (buying ? sign * event.data.coins : 0),
            returned: held.returned + (buying ? 0 : sign * event.data.coins),
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'tenant_id,user_id' },
        )
        return
      }
    }
  },
}

interface MarketRow {
  mode: string
  coins: number
  specks: number
  opened_at: string
  version: number
}

async function readMarket(supabase: Client, tenantId: string): Promise<MarketRow | null> {
  const { data } = await supabase
    .from('xoin_markets')
    .select('mode, coins, specks, opened_at, version')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ?? null
}

interface HoldingRow {
  specks: number
  spent: number
  returned: number
  version: number
}

/**
 * Somebody's position, or the empty one.
 *
 * Version zero for a member who has never traded, so the guard above reads
 * "behind" rather than having to special-case a missing row.
 */
async function readHolding(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<HoldingRow> {
  const { data } = await supabase
    .from('xoin_holdings')
    .select('specks, spent, returned, version')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? { specks: 0, spent: 0, returned: 0, version: 0 }
}
