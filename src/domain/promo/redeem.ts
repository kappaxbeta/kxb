import 'server-only'
import type { Locale } from '@/domain/i18n/locale'
import type { Client } from '@/es/store'
import {
  type RedeemOutcome,
  type RedeemResult,
  type RedeemSource,
  isRedeemOutcome,
  normaliseCode,
  refusalForLocale,
} from '@/domain/promo/application'
import { asTier, DEFAULT_TIER, TIERS, type Tier } from '@/domain/billing/tiers'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Spending a code.
 *
 * One function, called by all four doors - the sign-up action, the link route,
 * the space picker and a space's billing page - because the eligibility rules
 * are the interesting part and a second copy of them is a second set of bugs.
 * The doors differ only in what they pass as `source`, which is the thing being
 * measured, and in what they do with the answer.
 *
 * Everything below the RPC boundary is in SQL on purpose. Checking the code,
 * checking the account, writing the redemption and bumping the counter have to
 * be one transaction or the last use of a code can be handed to two people; see
 * the function's own comment in the migration.
 */

/**
 * Redeem, or say why not.
 *
 * The user id comes from the caller's verified session, never from the form.
 * `redeem_promo_code` is SECURITY DEFINER and takes an id, so it would happily
 * grant a month to whoever it was told about - which is exactly why no caller
 * of this function is allowed to take that id from a request body.
 *
 * Runs as the service role rather than the caller's client. On the sign-up path
 * there is no session to run as at all (with email confirmation on, the account
 * exists and is not signed in), and having one path use a different client from
 * the others is how the two quietly stop behaving the same.
 */
export async function redeemPromoCode(
  code: string,
  userId: string,
  options: {
    source: RedeemSource
    tenantId?: string | null
    campaign?: string | null
    locale?: Locale
  },
): Promise<RedeemResult> {
  const locale = options.locale ?? 'en'
  const normalised = normaliseCode(code)

  // Refused before the round trip. A string that cannot be a code cannot match
  // one, and answering locally keeps someone pasting junk at the endpoint off
  // the database entirely.
  if (!normalised) {
    return { ok: false, outcome: 'unknown', error: refusalForLocale('unknown', locale) }
  }

  const admin = createAdminClient() as unknown as Client

  const { data, error } = await admin.rpc('redeem_promo_code', {
    p_code: normalised,
    p_user_id: userId,
    p_source: options.source,
    p_tenant_id: options.tenantId ?? undefined,
    p_campaign: options.campaign ?? undefined,
  })

  if (error) {
    /**
     * The one error worth reading rather than reporting.
     *
     * `promo_redemptions_user_tier_key` is the unique index that makes "one per
     * account per tier" true, and it fires when two redemptions for the same
     * account and tier race - a double-submitted form, or the link route and
     * the sign-up form both firing for somebody who arrived with a code and
     * then typed it in. That is not a failure, it is the rule working, and the
     * person should be told they have already had that month rather than shown
     * a database error.
     */
    if (error.message.includes('promo_redemptions_user_tier_key')) {
      return { ok: false, outcome: 'already', error: refusalForLocale('already', locale) }
    }
    throw new Error(`Could not redeem that code: ${error.message}`)
  }

  const row = data?.[0]
  const outcome: RedeemOutcome = isRedeemOutcome(row?.outcome) ? row.outcome : 'unknown'

  if (outcome !== 'ok' || !row?.granted_until) {
    const refused = outcome === 'ok' ? 'unknown' : outcome
    return { ok: false, outcome: refused, error: refusalForLocale(refused, locale) }
  }

  const until = row.granted_until
  return {
    ok: true,
    grant: {
      until,
      days: Math.max(1, Math.round((new Date(until).getTime() - Date.now()) / 86_400_000)),
      tier: asTier(row.granted_tier) ?? DEFAULT_TIER,
    },
  }
}

/**
 * Could this account still redeem something?
 *
 * For deciding whether to *show* a code field, not for deciding whether to
 * honour one - `redeem_promo_code` re-checks all of this itself, and it is the
 * one that matters. Showing the field to somebody who will be refused is a
 * worse experience than hiding it, and hiding it from somebody who would have
 * been allowed is a worse bug, so this errs towards showing: anything it cannot
 * determine reads as eligible and the refusal happens honestly on submit.
 *
 * ---------------------------------------------------------------------------
 * Now a question about tiers, not about the account
 * ---------------------------------------------------------------------------
 * It used to be "has this account ever redeemed, or ever paid" - one row, one
 * answer. That is wrong under per-tier vouchers in the direction that costs
 * money: an xo customer who has never tried xp is exactly the person an xp
 * voucher is for, and the old check hid the field from them.
 *
 * So it asks per tier and says yes if *any* tier is still open. Which tier the
 * code they hold is for is not knowable until they type it, which is also why
 * this cannot be any more precise than it is.
 */
export async function mayRedeem(supabase: Client, userId: string): Promise<boolean> {
  const open = await openTiersFor(supabase, userId)
  return open.length > 0
}

/**
 * The tiers this account could still get a free month of.
 *
 * Two round trips rather than one per tier, because the number of tiers is
 * small and fixed but the number of round trips should not grow with it.
 * `account_has_had_tier` is the SQL half of the same rule - see the tiers
 * migration - and is what actually decides on submit; this reproduces it for
 * rendering, and the two are allowed to disagree only in the safe direction.
 */
export async function openTiersFor(supabase: Client, userId: string): Promise<Tier[]> {
  const [{ data: redeemed }, { data: subscribed }, { data: entitlement }] =
    await Promise.all([
      supabase.from('promo_redemptions').select('granted_tier').eq('user_id', userId),
      /**
       * Tiers any space they own has been on, live or not.
       *
       * `!inner` on the membership join so this is one query rather than
       * "list my spaces, then list their subscriptions" - and filtered to
       * owner, because being a member of somebody else's xp space is not
       * having had xp.
       */
      supabase
        .from('subscriptions_read_model')
        .select('tier, tenant_members!inner(user_id, role)')
        .eq('tenant_members.user_id', userId)
        .eq('tenant_members.role', 'owner'),
      supabase
        .from('user_entitlements')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

  const had = new Set<Tier>()

  for (const row of redeemed ?? []) {
    const tier = asTier(row.granted_tier)
    if (tier) had.add(tier)
  }

  for (const row of subscribed ?? []) {
    const tier = asTier(row.tier)
    if (tier) had.add(tier)
  }

  // Grandfathered onto xp by the retired €20 plan, so an xp voucher is not
  // theirs to claim. Mirrors the same clause in `account_has_had_tier`.
  if (entitlement?.stripe_customer_id) had.add('xp')

  return TIERS.filter((tier) => !had.has(tier))
}
