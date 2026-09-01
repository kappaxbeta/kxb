import 'server-only'
import {
  type SignupOffer,
  SIGNUP_OFFER_PREFIX,
  codeIsLive,
  compareSignupOffers,
} from '@/domain/promo/application'
import { asTier, DEFAULT_TIER } from '@/domain/billing/tiers'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What is on offer at the front door.
 *
 * The sign-up form used to ask a question most visitors cannot answer - an
 * empty box labelled "Code (optional)" - while the codes that would have filled
 * it sat in the backoffice being handed out one link at a time. This reads them
 * the other way round: a code named `SIGNUP…` is a standing offer, and the form
 * shows it rather than waiting to be told about it.
 *
 * Runs as the service role, and that is intrinsic rather than a shortcut. The
 * caller is by definition somebody with no account, `promo_codes` is admin-only
 * so that nobody can enumerate the campaign codes, and the whole point here is
 * to publish the handful that were named to be published. Same reasoning, and
 * the same shape, as `access/gate.ts`.
 */

/**
 * Every live offer, best first.
 *
 * Three things are true of what comes back, and all three matter to the caller:
 * every code is claimable *right now* (`codeIsLive`, the same predicate the
 * backoffice badges with), every code was named to be shown, and the first one
 * is the one to lead with.
 *
 * A failure returns an empty list rather than throwing. This decorates the
 * sign-up form; it is not the sign-up form, and a promo table that cannot be
 * read must not be able to stop anybody creating an account.
 */
export async function listSignupOffers(limit = 3): Promise<SignupOffer[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('promo_codes')
    .select('code, label, tier, free_days, spaces, max_uses, uses, starts_at, expires_at, revoked_at')
    // Prefix match on the stored code. `code` is uppercase by the column's own
    // check constraint, so this needs no case folding - and `like` rather than
    // `ilike` keeps it on the unique index.
    .like('code', `${SIGNUP_OFFER_PREFIX}%`)
    // A cap on the query as well as on the result, so a table that somehow
    // grows a thousand of these does not travel before being cut down.
    .limit(50)

  if (error || !data) return []

  return data
    .filter((row) =>
      codeIsLive({
        maxUses: row.max_uses,
        uses: row.uses,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      }),
    )
    .map(
      (row): SignupOffer => ({
        code: row.code,
        label: row.label,
        tier: asTier(row.tier) ?? DEFAULT_TIER,
        freeDays: row.free_days,
        spaces: row.spaces,
        closesAt: row.expires_at,
        /**
         * Uses left, not uses made. The form only ever says this out loud when
         * it is small, and "4 left" is the number that means something to
         * somebody deciding whether to bother - "196 claimed" is a number about
         * us.
         */
        remaining: row.max_uses === null ? null : Math.max(0, row.max_uses - row.uses),
      }),
    )
    .sort(compareSignupOffers)
    .slice(0, limit)
}
