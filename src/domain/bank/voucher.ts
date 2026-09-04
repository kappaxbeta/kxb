import 'server-only'
import { credit } from '@/domain/bank/purse'
import type { Client } from '@/es/store'

/**
 * The way out for a player with nothing left.
 *
 * `docs/product/economy.md` §7.5, and the whole of it is behind a flag that is
 * off. The café always works, so nobody is ever *permanently* stuck without
 * one; a voucher is for a space that would rather not make somebody go and
 * serve twenty coffees before they can play again.
 *
 * ---------------------------------------------------------------------------
 * The amount is an operator's, and that is the important part
 * ---------------------------------------------------------------------------
 * `voucher` is a **valued** flag rather than a boolean. The brief named 10,000
 * coins, which is a hundred times the opening balance - somebody holding one
 * has no reason to care what anything costs for a long while, and every price
 * in the product flattens while they spend it.
 *
 * That is right for a space running an event and wrong for one running an
 * economy, so it is not a decision a constant should make. The flag ships
 * parked at the brief's 10,000 so nobody has to guess what was meant, and
 * nothing in this file names an amount.
 */

export type VoucherResult =
  | { ok: true; coins: number }
  | { ok: false; reason: 'off' | 'not-broke' | 'taken' | 'failed' }

/**
 * What a voucher is worth here, or `null` if there are none.
 *
 * Falls to "none" on any failure, which is the direction every switch in this
 * economy falls: a resolver blip that quietly hands somebody ten thousand coins
 * is not recoverable, and one that briefly says "no voucher today" is.
 */
export async function voucherWorth(
  supabase: Client,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('tenant_feature_limit', {
    p_key: 'voucher',
    p_tenant_id: tenantId,
  })

  if (error) return null

  const row = data?.[0]
  if (!row) return null

  /*
    A valued flag answers with an override and a global default. Either being a
    positive number means vouchers are on here; the override wins, which is what
    lets one space run them without switching them on for everybody.

    `has_override` is not consulted, unlike in `quota.ts`. There the difference
    between "no override" and "an override of unlimited" is load-bearing; here
    there is no third state - a number is a number and its absence is off.
  */
  const override = typeof row.override_value === 'number' ? row.override_value : 0
  const ceiling = typeof row.ceiling_value === 'number' ? row.ceiling_value : 0
  const worth = override > 0 ? override : ceiling

  return worth > 0 ? worth : null
}

/**
 * Claim one.
 *
 * Three conditions, and the order they are checked in is the order that gives
 * the most useful answer: are there vouchers at all, have you already had one,
 * and are you actually stuck.
 *
 * ---------------------------------------------------------------------------
 * Only with an empty purse
 * ---------------------------------------------------------------------------
 * A voucher is for somebody who cannot play, not a bonus for somebody who can.
 * Strictly zero rather than "nearly nothing": a threshold would be a number
 * nobody could justify, and a player at 3 coins can still enter three battles.
 *
 * ---------------------------------------------------------------------------
 * The claim is written before the coins, and that is deliberate
 * ---------------------------------------------------------------------------
 * The opposite of most payments here, and the same reasoning as the door toll:
 * what is being protected is not a purchase but *not handing out two*. A crash
 * between the two costs one player one voucher they will notice and can be
 * given by hand; the other ordering hands out a second one to anybody whose
 * connection drops at the wrong moment, and each of those is ten thousand coins
 * out of nowhere.
 */
export async function claimVoucher(
  admin: Client,
  tenantId: string,
  userId: string,
): Promise<VoucherResult> {
  const worth = await voucherWorth(admin, tenantId)
  if (worth === null) return { ok: false, reason: 'off' }

  const { data: purse } = await admin
    .from('homestead_read_model')
    .select('coins')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  // No row is no coins, which counts. Somebody who has never opened a café here
  // is as stuck as somebody who spent everything.
  if ((purse?.coins ?? 0) > 0) return { ok: false, reason: 'not-broke' }

  const { error: claimed } = await admin
    .from('voucher_claims')
    .insert({ tenant_id: tenantId, user_id: userId, coins: worth })

  // The primary key refused it: already taken. Not distinguished from any other
  // insert failure, because the caller does the same thing either way and
  // "you have had one" is the true answer in the case that actually happens.
  if (claimed) return { ok: false, reason: 'taken' }

  const paid = await credit(admin, tenantId, userId, {
    amount: worth,
    reason: 'voucher',
    what: 'a voucher',
  })

  if (!paid.ok) return { ok: false, reason: 'failed' }
  return { ok: true, coins: worth }
}
