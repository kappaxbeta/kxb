import 'server-only'
import type { Client } from '@/es/store'
import { asTier, DEFAULT_TIER, type Tier } from '@/domain/billing/tiers'
import type { RedeemGrant, RedeemSource } from '@/domain/promo/application'

/**
 * The free month, claimed without a code.
 *
 * One month of xo per account, ever, from whichever screen somebody is standing
 * on: the space picker for an account that has just arrived, and the
 * paused-space wall for one that stopped paying and came back. Everything it
 * can refuse, and why it may relax the rule that `redeem_promo_code` cannot, is
 * argued in the migration (20261104000000_a_month_to_come_back.sql); the short
 * version is that the cancel-and-redeem loop is bounded by the unique index on
 * (user_id, granted_tier) rather than by the "never subscribed" check, so
 * dropping that check pays out once per account and not once a month.
 *
 * Its own file rather than a second export in `redeem.ts` because the two must
 * not be reachable through one another. `redeemPromoCode` is the strict path
 * and is called from four doors including an unauthenticated one; this is the
 * relaxed path. Sharing a function would mean one relaxation parameter standing
 * between the sign-up form and a free month for anybody who has ever paid.
 */

/** Every answer `claim_free_month()` can give. */
export type ClaimOutcome = 'ok' | 'already' | 'inactive' | 'refused'

function isClaimOutcome(value: unknown): value is ClaimOutcome {
  return (
    value === 'ok' || value === 'already' || value === 'inactive' || value === 'refused'
  )
}

export type ClaimResult =
  | { ok: true; grant: RedeemGrant }
  | { ok: false; outcome: Exclude<ClaimOutcome, 'ok'>; error: string }

/**
 * Why a claim was refused, in words.
 *
 * Not in `application.ts` with the voucher refusals, and the split is the same
 * one that file already makes for a different reason: those sentences are
 * imported by Client Components and exist in two languages because the German
 * landing page redeems codes. These are produced by one Server Action, rendered
 * on one English screen, and answer questions the voucher refusals do not ask.
 * Folding them in would put four strings nobody translates next to four that
 * must always be translated in pairs.
 *
 * `refused` is reachable only by a caller that has named a space it does not
 * own, which means a caller that has gone around the button.
 */
const REFUSALS: Record<Exclude<ClaimOutcome, 'ok'>, string> = {
  already: 'This account has already had a free month of xo.',
  inactive: 'The free month is not on offer at the moment.',
  refused: 'That space is not yours to claim a free month against.',
}

/**
 * Take the free month, or say why not.
 *
 * Runs as the caller rather than as the service role - the opposite choice from
 * `redeemPromoCode`, and for the reason that one gives: it uses the service role
 * because the sign-up path has no session to run as. This path always has one.
 * The function is SECURITY DEFINER, so it sees what it needs to either way, and
 * the version that runs with less privilege is the one to prefer.
 *
 * `userId` comes off a verified session and may never be taken from a request
 * body: the function grants a month to whichever account it is handed. The same
 * goes for `tenantId`, which is provenance rather than scope - see the migration
 * - and which the database checks the ownership of regardless.
 */
export async function claimFreeMonth(
  supabase: Client,
  userId: string,
  options: { source: RedeemSource; tenantId?: string | null } = { source: 'picker' },
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_free_month', {
    p_user_id: userId,
    p_source: options.source,
    p_tenant_id: options.tenantId ?? undefined,
  })

  if (error) {
    /**
     * The unique index firing is the rule working, not a failure.
     *
     * Same read, and the same reasoning, as `redeemPromoCode`: two claims for
     * one account racing - a double-clicked button, or this and a voucher
     * redeemed in another tab - is precisely what
     * `promo_redemptions_user_tier_key` exists to settle, and the loser should
     * be told they have already had their month rather than shown a database
     * error.
     */
    if (error.message.includes('promo_redemptions_user_tier_key')) {
      return { ok: false, outcome: 'already', error: REFUSALS.already }
    }
    throw new Error(`Could not start the free month: ${error.message}`)
  }

  const row = data?.[0]
  const outcome: ClaimOutcome = isClaimOutcome(row?.outcome) ? row.outcome : 'refused'

  if (outcome !== 'ok' || !row?.granted_until) {
    const refused = outcome === 'ok' ? 'refused' : outcome
    return { ok: false, outcome: refused, error: REFUSALS[refused] }
  }

  const until = row.granted_until
  return {
    ok: true,
    grant: {
      until,
      days: Math.max(1, Math.round((new Date(until).getTime() - Date.now()) / 86_400_000)),
      tier: asTier(row.granted_tier) ?? DEFAULT_TIER,
      /*
        Nothing but the month, and that is the whole difference between this and
        a code.

        `claim_free_month` has no code behind it - it is the win-back, taken by
        somebody who was already here - so there is nothing that could have said
        what else to hand over. Zeros rather than an optional field on
        `RedeemGrant`, so every surface that shows a grant can ask the same
        three questions of it and get an honest answer.
      */
      bucks: 0,
      coins: 0,
      voucherCodes: [],
    },
  }
}

/**
 * Could this account still take the free month?
 *
 * For deciding whether to *offer* it, not for deciding whether to honour it -
 * `claim_free_month` re-checks everything itself and is the one that matters.
 * Unlike `mayRedeem`, this errs towards *hiding*: a code field shown to
 * somebody who will be refused is a mild annoyance, and this is a button
 * promising a month for free. Offering that and then taking it back on click is
 * worse than never having offered it, so anything unreadable here reads as "no
 * offer" and the screen falls back to its honest prices.
 *
 * One question, because under the rule this feature actually has there is only
 * one: has this account had its free month of xo. Ownership is checked by the
 * caller that names a space, and nothing else can fail.
 *
 * The read is the caller's own row, allowed by `promo_redemptions_select_own`.
 */
export async function mayClaimFreeMonth(
  supabase: Client,
  userId: string,
  tier: Tier = DEFAULT_TIER,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('id')
    .eq('user_id', userId)
    .eq('granted_tier', tier)
    .maybeSingle()

  if (error) return false
  return data === null
}
