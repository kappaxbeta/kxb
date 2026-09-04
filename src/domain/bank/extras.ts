import 'server-only'
import { extraPrice, type Purchasable } from '@/domain/bank/prices'
import { charge } from '@/domain/bank/purse'
import type { LimitKey } from '@/domain/billing/tiers'
import type { Tier } from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

/**
 * Buying one more than the plan holds.
 *
 * `docs/product/economy.md` §8. The tier is an allowance; beyond it, a member
 * pays coins out of their own purse and the **space** keeps the slot - not the
 * buyer. Somebody who buys an eleventh blueprint and then leaves does not take
 * it with them, and a space that downgrades keeps what it paid for.
 *
 * ---------------------------------------------------------------------------
 * What this file is not allowed to decide
 * ---------------------------------------------------------------------------
 * Not the price - that is `prices.ts`, read here and never passed in. Not
 * whether the space is playing by the economy's rules - `charge` checks the
 * flag. Not how the extra rung combines with the other three - that is
 * `resolveLimit`, which is pure and tested. What is left, and what this owns,
 * is the *order*: charge first, record second.
 */

export type BuyResult =
  | { ok: true; bought: number }
  | { ok: false; error: string }

/**
 * How many extra this space has bought, per limit.
 *
 * Returns a partial map, because most spaces have bought nothing and a row per
 * key for every space would be a table of zeroes. An absent key is none.
 *
 * A failed read answers "none", which is the strict direction here and the
 * opposite of what most lookups in `quota.ts` do. That file fails *open* so an
 * outage cannot turn somebody away at a door they were sent a link to; this
 * fails closed because the failure it admits is different in kind. Reading no
 * extras means a space is briefly held to what its tier includes - annoying,
 * and undone by a refresh. Inventing extras that were never bought means a cap
 * lifted by a network blip.
 */
export async function boughtExtras(
  supabase: Client,
  tenantId: string,
): Promise<Partial<Record<LimitKey, number>>> {
  const { data, error } = await supabase
    .from('space_extras')
    .select('key, bought')
    .eq('tenant_id', tenantId)

  if (error || !data) return {}

  const extras: Partial<Record<LimitKey, number>> = {}
  for (const row of data) {
    // Trusted as a key without checking it against `LIMIT_KEYS`. An unknown one
    // resolves to a rung nothing reads rather than to a wrong number, which is
    // the safe way for the drift the migration warns about to show up.
    extras[row.key as LimitKey] = row.bought
  }
  return extras
}

/**
 * Pay for one more, and record it.
 *
 * ---------------------------------------------------------------------------
 * Charge first, record second
 * ---------------------------------------------------------------------------
 * The same ordering every payment in this economy uses, and for the reason
 * `CoinsSent` gives: the other way round fails by *minting the goods*. A slot
 * recorded and a charge that did not land is a space that got a blueprint for
 * free out of a network error - and it is unrecoverable, because the row says
 * they have already paid and there is nothing to charge them for.
 *
 * Failing this way costs somebody the price of a blueprint, which is a line in
 * the log with their name on it and can be made good.
 *
 * ---------------------------------------------------------------------------
 * What a `null` price means
 * ---------------------------------------------------------------------------
 * Two different situations, and the caller does the same thing in both: a tier
 * where the thing is unlimited has no next one to sell, and a tier where it is
 * forbidden has none either. Free's private XPs are the second - free is public
 * by default and paying is what buys privacy, so there is no amount of coins
 * that makes a private level on free.
 */
export async function buyExtra(
  supabase: Client,
  tenantId: string,
  userId: string,
  tier: Tier,
  what: Purchasable,
): Promise<BuyResult> {
  const price = extraPrice(tier, what)
  if (price === null) {
    return { ok: false, error: 'That is not something this plan can buy more of' }
  }

  const paid = await charge(supabase, tenantId, userId, {
    amount: price,
    reason: 'quota',
    what,
  })
  if (!paid.ok) return { ok: false, error: paid.error }

  const { data, error } = await supabase.rpc('space_extra_add', {
    p_tenant: tenantId,
    p_key: what,
  })

  if (error || typeof data !== 'number') {
    // The coins have gone. Say so plainly rather than reporting success - the
    // charge is in the log with its reason, so it can be found and made good.
    return { ok: false, error: 'You were charged but the slot was not added. Tell us.' }
  }

  return { ok: true, bought: data }
}
