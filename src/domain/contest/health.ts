import 'server-only'
import { codeIsLive } from '@/domain/promo/application'
import { asTier, isPaidTier } from '@/domain/billing/tiers'
import type { ContestSettings } from '@/domain/contest/settings'
import type { Client } from '@/es/store'

/**
 * Is the promise the conditions make actually kept?
 *
 * § 5 of the contest conditions says entering is free, and that sentence is
 * true only while the code named in `contest_settings.code` is a live promo
 * code that outlives the draw. Nothing enforces that - they are two tables and
 * one of them is prose - and it cannot be checked from outside either, because
 * `/code/<anything>` redirects to the sign-up form whether or not the code
 * exists.
 *
 * So it is checked here, and the Gewinnspiel page in the backoffice shows the
 * answer beside the switch that turns the campaign on. A prize draw somebody
 * has to pay to enter is a different thing in law from the one the document
 * describes, and "we forgot to create the code" is the way that happens.
 *
 * Every check is a sentence rather than a boolean, because an operator reading
 * "the code expires before the draw" can act on it and an operator reading
 * `expiresOk: false` has to go and find out what that means.
 */

export interface ContestCheck {
  /** Short label for the row. */
  what: string
  ok: boolean
  /** What is true right now, in one line. */
  says: string
}

export interface ContestHealth {
  checks: readonly ContestCheck[]
  /** True when nothing is wrong. What the page's headline reads off. */
  well: boolean
  /** What the code hands over, for the offer line. Null when there is no code. */
  offer: {
    tier: string
    freeDays: number | null
    bucks: number
    vouchers: number
    coins: number
  } | null
}

export async function readContestHealth(
  admin: Client,
  settings: ContestSettings,
): Promise<ContestHealth> {
  const { data } = await admin
    .from('promo_codes')
    .select(
      'code, tier, free_days, bucks, vouchers, coins, max_uses, uses, starts_at, expires_at, revoked_at',
    )
    .eq('code', settings.code)
    .maybeSingle()

  const checks: ContestCheck[] = []

  if (!data) {
    checks.push({
      what: 'The code',
      ok: false,
      says: `${settings.code} does not exist. Entering is not free until it does — mint it below.`,
    })
    return { checks, well: false, offer: null }
  }

  const live = codeIsLive({
    maxUses: data.max_uses,
    uses: data.uses,
    startsAt: data.starts_at,
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
  })

  checks.push({
    what: 'The code',
    ok: live,
    says: live
      ? `${data.code} is live and has been redeemed ${data.uses} time${data.uses === 1 ? '' : 's'}.`
      : `${data.code} exists but is not redeemable — revoked, expired, not started, or fully spent.`,
  })

  /*
    The expiry against the draw, not against today.

    A code that dies on the 30th is a code that was live for every entry and
    dead for the winner who is told to go and use it. The conditions promise a
    free plan to entrants, and the draw is two days after entries close.
  */
  const draws = new Date(`${settings.drawsOn}T23:59:59Z`)
  const outlives = !data.expires_at || new Date(data.expires_at).getTime() > draws.getTime()

  checks.push({
    what: 'Outlives the draw',
    ok: outlives,
    says: outlives
      ? data.expires_at
        ? `It stops working on ${new Date(data.expires_at).toLocaleDateString()}, after the draw.`
        : 'It has no expiry.'
      : `It stops working on ${new Date(data.expires_at!).toLocaleDateString()}, before the draw on ${settings.drawsOn}.`,
  })

  const tier = asTier(data.tier)
  const paid = tier !== null && isPaidTier(tier)

  checks.push({
    what: 'Worth something',
    ok: paid,
    says: paid
      ? `It grants ${data.free_days === null ? 'an unending run' : `${data.free_days} days`} of ${tier}.`
      : 'It grants the free tier, which is what an account has anyway.',
  })

  return {
    checks,
    well: checks.every((check) => check.ok),
    offer: {
      tier: data.tier,
      freeDays: data.free_days,
      bucks: data.bucks ?? 0,
      vouchers: data.vouchers ?? 0,
      coins: data.coins ?? 0,
    },
  }
}
