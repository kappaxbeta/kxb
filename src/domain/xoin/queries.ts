import 'server-only'
import { DEFAULT_MODE, readMode, type Reserves, type XoinMode } from '@kxb/xoin'
import type { Client } from '@/es/store'

/**
 * What a screen needs to draw a market, read from the two read models.
 *
 * Deliberately no price and no float. Both are functions of the clock, and a
 * server that computed one would be sending a number that is already stale by
 * the time it renders - and, worse, a number the client would then have to
 * decide whether to trust over its own. The client is handed the *book* and
 * works the price out itself with `priceAt`, which is exactly what makes two
 * people looking at the same market agree.
 */

export interface MarketView {
  mode: XoinMode
  reserves: Reserves
  /** Epoch zero, as an epoch-milliseconds number the client can subtract from. */
  startedAt: number
}

export interface HoldingView {
  specks: number
  spent: number
  returned: number
}

export const noHoldingView: HoldingView = { specks: 0, spent: 0, returned: 0 }

/**
 * A space's book, or nothing if no market was ever opened here.
 *
 * `null` rather than a default market, and the distinction matters at the
 * screen: a space with no market shows an owner a button to open one, and a
 * space whose market is in `demo` shows everybody a sandbox. Collapsing the two
 * would hide the switch from the only person who can throw it.
 */
export async function readMarket(
  supabase: Client,
  tenantId: string,
): Promise<MarketView | null> {
  const { data } = await supabase
    .from('xoin_markets')
    .select('mode, coins, specks, opened_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) return null

  return {
    // Through `readMode`, never straight off the column. A row written by a
    // version that knew a fourth mode must not be read as permission to spend
    // somebody's purse - see the note at `readMode` itself.
    mode: readMode(data.mode),
    reserves: { coins: data.coins, specks: Number(data.specks) },
    startedAt: Date.parse(data.opened_at),
  }
}

/**
 * One member's position.
 *
 * An empty position for somebody who has never traded, rather than null. There
 * is no difference worth drawing between "has never traded" and "holds
 * nothing", and making the caller handle both would be two branches that render
 * the same zero.
 */
export async function readHolding(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<HoldingView> {
  const { data } = await supabase
    .from('xoin_holdings')
    .select('specks, spent, returned')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return noHoldingView
  return { specks: Number(data.specks), spent: data.spent, returned: data.returned }
}

/** What a space that has never opened one is playing: nothing at stake. */
export const modeOrDefault = (market: MarketView | null): XoinMode => market?.mode ?? DEFAULT_MODE
