'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { campaignFrom } from '@/domain/analytics/campaign'
import { asPaidTier, DEFAULT_TIER, TIERS, type Tier } from '@/domain/billing/tiers'
import {
  type RedeemResult,
  type RedeemSource,
  isRedeemSource,
  normaliseCode,
} from '@/domain/promo/application'
import { mintPromoCode } from '@/domain/promo/mint'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { forgetPromoCode } from '@/domain/promo/cookie'
import { redeemPromoCode } from '@/domain/promo/redeem'
import { type ClaimResult, claimFreeMonth as claim } from '@/domain/promo/winback'
import { requireUser } from '@/lib/auth'
import { findAccountByEmail } from '@/lib/backoffice'
import { requireBackofficeSection } from '@/lib/backoffice'
import { hasRole, requireTenant } from '@/lib/tenant'

/**
 * Redeeming a code, and minting one.
 *
 * Two audiences again, and the gate between them is the same one the rest of
 * the backoffice uses. The thing worth being careful about is in the middle:
 * `redeem_promo_code` is SECURITY DEFINER and grants a month to whichever user
 * id it is handed, so the id passed below comes off `requireUser()` - the
 * verified session - and there is no parameter through which a caller could
 * name somebody else.
 */

export type PromoResult = { ok: false; error: string } | { ok: true }

// ---------------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------------

/**
 * Spend a code as the signed-in account.
 *
 * The two doors that reach this - the space picker and a space's billing page -
 * differ only in what they report as the source and which path gets
 * revalidated. Both go through the same rules, so a code refused in one place
 * cannot be accepted in the other by finding the friendlier form.
 *
 * `slug` is provenance, not scope. A grant is a seat, and a seat belongs to a
 * person; recording which space somebody was standing in when they redeemed is
 * how "redeemed on the way in" and "redeemed from inside a space that had gone
 * read-only" stay distinguishable afterwards.
 */
export async function redeemCode(input: {
  code: string
  source: RedeemSource
  slug?: string | null
  tenantId?: string | null
  /** The `?src=` of the page the form was submitted from, if it had one. */
  search?: string | null
}): Promise<RedeemResult> {
  const { user } = await requireUser()

  const source: RedeemSource = isRedeemSource(input.source) ? input.source : 'picker'

  const result = await redeemPromoCode(input.code, user.id, {
    source,
    tenantId: input.tenantId ?? null,
    campaign: campaignFrom(input.search),
  })

  if (!result.ok) return result

  /**
   * Drop the cookie on success only.
   *
   * A refused code has to stay put: the commonest refusal is somebody
   * mistyping, and clearing the hint would mean the second attempt starts from
   * an empty field with no way back to what the link said.
   */
  await forgetPromoCode()

  // The picker gates the create-space form on `canCreate`, and the workspace
  // layout gates writing on the same read. Both have to see the new seat on the
  // very next render, or the reward for redeeming is a page that still says no.
  revalidatePath('/tenants')
  if (input.slug) revalidatePath(`/t/${input.slug}`, 'layout')

  return result
}

/**
 * Take the free month, with no code to type.
 *
 * Two doors, one rule. The picker calls this with no slug - an account that has
 * just arrived has no space to name - and the paused-space wall calls it with
 * its own, which is recorded as provenance so that "claimed on the way in" and
 * "claimed by somebody coming back" stay tellable apart afterwards.
 *
 * The checks are load-bearing rather than belt-and-braces. Every Server Action
 * is a public POST endpoint - see the note at the top of `billing/actions.ts` -
 * and this one grants a month, so "you were on that screen" cannot be the
 * reason anything is allowed. `requireTenant` resolves the slug against the
 * session's own memberships, and `claim_free_month` re-checks the ownership and
 * the one-per-account rule itself.
 */
export async function claimFreeMonth(input: {
  source: RedeemSource
  slug?: string | null
} = { source: 'picker' }): Promise<ClaimResult> {
  const source: RedeemSource = isRedeemSource(input.source) ? input.source : 'picker'

  /**
   * A slug means the claim names a space, which means the space has to be
   * resolved as the caller before its id goes anywhere near the grant.
   * `requireTenant` is what makes the id trustworthy; taking it off the request
   * would let anybody file their free month against somebody else's space.
   */
  if (input.slug) {
    const context = await requireTenant(input.slug)

    if (!hasRole(context, ['owner'])) {
      return {
        ok: false,
        outcome: 'refused',
        error: 'Only the space owner can start a free month.',
      }
    }

    const result = await claim(context.supabase, context.user.id, {
      source,
      tenantId: context.tenant.id,
    })
    if (!result.ok) return result

    /**
     * Both paths that gate on the seat, for the same reason `redeemCode`
     * revalidates them: the workspace layout decides whether to render the wall
     * or the space, and the picker gates the create-space form. A grant that
     * the very next render cannot see is a button that appears to do nothing.
     */
    revalidatePath('/tenants')
    revalidatePath(`/t/${input.slug}`, 'layout')

    return result
  }

  const { user, supabase } = await requireUser()

  const result = await claim(supabase, user.id, { source })
  if (!result.ok) return result

  revalidatePath('/tenants')
  return result
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

const codeSchema = z.object({
  /** Blank means "make one up", which is what the button next to it does. */
  code: z.string().trim().max(40),
  label: z.string().trim().max(120),
  campaign: z.string().trim().max(60),
  freeDays: z.coerce.number().int().min(1).max(365),
  /** 0 means no ceiling - an unlimited code, for a channel with no headcount. */
  maxUses: z.coerce.number().int().min(0).max(1_000_000),
  days: z.coerce.number().int().min(0).max(3650),
  /**
   * Which plan the free month is of.
   *
   * Defaulted rather than required, matching the column, so a caller that
   * predates tiers mints an xo code rather than failing validation. The
   * cautious direction: the mistake this can make is giving away €5, and the
   * one it cannot make is giving away €10.
   */
  tier: z.enum(TIERS).default(DEFAULT_TIER),
  /**
   * Bucks dropped in the redeemer's pocket on top of the month, and bearer
   * codes they can pass on. 0 and 0 for a plain code.
   *
   * The ceilings match the columns' checks rather than being looser here, so a
   * mistyped 500 is refused by the form with a sentence instead of by the
   * database with a constraint name. Both defaulted, so every caller that
   * predates them keeps minting the codes it always did.
   */
  bucks: z.coerce.number().int().min(0).max(50).default(0),
  vouchers: z.coerce.number().int().min(0).max(50).default(0),
  /**
   * Coins into the wallet. A far looser ceiling than the other two, matching
   * the column: bucks are priced in single digits and a coin is the small unit
   * of an economy where a match pays seven.
   */
  coins: z.coerce.number().int().min(0).max(100_000).default(0),
})

/**
 * Create a code.
 *
 * `days` is how long the *code* may be redeemed for, which is a different
 * number from `freeDays`, how long the free run lasts once redeemed. Conflating
 * them is the mistake this comment exists to prevent: a poster that is up for a
 * fortnight still promises a full month to whoever reads it on the last day.
 */
export async function createPromoCode(input: {
  code: string
  label: string
  campaign: string
  freeDays: number
  maxUses: number
  days: number
  tier?: Tier
  bucks?: number
  vouchers?: number
  coins?: number
}): Promise<PromoResult> {
  const parsed = codeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid code' }
  }

  const { user, admin } = await requireBackofficeSection('promos', 'write')

  const code = parsed.data.code
    ? normaliseCode(parsed.data.code)
    : mintPromoCode(parsed.data.campaign)

  if (!code) {
    return {
      ok: false,
      error: 'A code is 3–40 characters: letters, digits and hyphens.',
    }
  }

  const expires = parsed.data.days
    ? new Date(Date.now() + parsed.data.days * 86_400_000).toISOString()
    : null

  const { error } = await admin.from('promo_codes').insert({
    code,
    label: parsed.data.label || null,
    campaign: parsed.data.campaign || null,
    free_days: parsed.data.freeDays,
    max_uses: parsed.data.maxUses > 0 ? parsed.data.maxUses : null,
    tier: parsed.data.tier,
    bucks: parsed.data.bucks,
    vouchers: parsed.data.vouchers,
    coins: parsed.data.coins,
    expires_at: expires,
    created_by: user.id,
  })

  if (error) {
    // The unique constraint is the one failure with a useful sentence. Anything
    // else is genuinely unexpected and is worth reporting as-is.
    if (error.message.includes('promo_codes_code_key')) {
      return { ok: false, error: `${code} already exists.` }
    }
    return { ok: false, error: `Could not create the code: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'promos',
    action: 'code.create',
    summary: `Created promo code ${code}`,
    detail: {
      code,
      campaign: parsed.data.campaign || null,
      tier: parsed.data.tier,
      freeDays: parsed.data.freeDays,
      bucks: parsed.data.bucks,
      vouchers: parsed.data.vouchers,
      coins: parsed.data.coins,
      maxUses: parsed.data.maxUses > 0 ? parsed.data.maxUses : null,
      expiresAt: expires,
    },
  })

  revalidatePath('/ovaloffice/promos')
  return { ok: true }
}

const idSchema = z.uuid()

/**
 * Stop a code working.
 *
 * Revoked rather than deleted, for the same reason an invite is: the row is the
 * record of a campaign, and its redemptions point at it. Deleting it would
 * cascade away the very numbers the code was minted to produce.
 *
 * Months already granted are untouched. `granted_until` was written at
 * redemption time precisely so that pulling a code cannot reach backwards into
 * the promises it already made.
 */
export async function revokePromoCode(id: string): Promise<PromoResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid code' }

  const { user, admin } = await requireBackofficeSection('promos', 'write')

  const { error } = await admin
    .from('promo_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Could not revoke that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'promos',
    action: 'code.revoke',
    summary: `Revoked a promo code`,
    detail: { id: parsed.data },
  })

  revalidatePath('/ovaloffice/promos')
  return { ok: true }
}


/**
 * Put one account on a tier, without a code changing hands.
 *
 * ---------------------------------------------------------------------------
 * Why this mints a code rather than writing a redemption
 * ---------------------------------------------------------------------------
 * `promo_redemptions.code_id` is NOT NULL, so a grant has to have a code behind
 * it. That looked like an obstacle and is the better design: the code row is
 * the audit record. It carries who created it, when, and the campaign - which
 * is exactly what somebody asks six months later when they find an account on
 * xp that never paid for it. A nullable `code_id` would have bought a slightly
 * shorter function and lost the answer to that question.
 *
 * So this mints a single-use code nobody is ever shown and immediately redeems
 * it for the target account, through the same SECURITY DEFINER function every
 * ordinary redemption uses. `redeem_promo_code` takes an explicit `p_user_id` -
 * it was already written to act on somebody's behalf - so nothing here bypasses
 * the rules it enforces, including "one per account per tier".
 *
 * ---------------------------------------------------------------------------
 * Only xo and xp, and free is not an omission
 * ---------------------------------------------------------------------------
 * A grant only ever *raises*: `tenant_tier()` takes the best live grant any
 * owner holds. Granting free would therefore do nothing at all, and offering it
 * would be a control that appears to work and does not.
 *
 * Free is what an account has when nothing is granting it anything, so the way
 * back to free is `clearGrantsFor` below rather than a third button here.
 */
export async function grantTierToAccount(input: {
  email: string
  tier: string
  /**
   * How long for, or `null` for a grant with no end.
   *
   * Null rather than a very large number, all the way down to the column - see
   * the migration. A hundred-year grant would print "until 2126" on every
   * screen that shows one, and would answer "no" to *which accounts are comped
   * permanently* forever after.
   */
  days: number | null
  /**
   * How many of their spaces it covers, or `null` for all of them.
   *
   * The oldest that many, which is the rule `grant_covers_tenant` implements
   * and the migration argues for. Null is what every grant written before this
   * existed means, so the default is unchanged behaviour rather than a silent
   * narrowing.
   */
  spaces: number | null
  /**
   * Grant it even if this account has paid for the plan before.
   *
   * `account_has_had_tier` refuses that by default, which is right for a
   * voucher - one redeemed by a customer is a refund by another name - and
   * wrong for the backoffice, where "put this tester on xp" is most often said
   * about somebody who *has* been a customer.
   *
   * Per grant rather than a switch on the installation: left on, a global one
   * would quietly stop checking receipts for the marketing codes the rule was
   * written for. See the migration for the whole argument.
   */
  evenIfTheyPaid: boolean
  note: string
}): Promise<PromoResult> {
  const tier = asPaidTier(input.tier)
  if (!tier) {
    return {
      ok: false,
      error: 'Pick xo or xp. Free is what an account has when nothing grants it anything — use Clear for that.',
    }
  }

  /*
    A length or nothing, and nothing means forever. `null` is passed through
    deliberately rather than coerced to the 30-day default: the caller says
    which of the two it wants, and a falsy check here would turn "forever" into
    "a month" - the kind of quiet substitution somebody finds out about when an
    account they comped for good drops back to free.
  */
  const days =
    input.days === null
      ? null
      : Number.isFinite(input.days) && input.days > 0
        ? Math.floor(input.days)
        : 30

  const spaces =
    input.spaces === null || !Number.isFinite(input.spaces) || input.spaces < 1
      ? null
      : Math.floor(input.spaces)

  const { user, admin } = await requireBackofficeSection('promos', 'write')

  const found = await findAccountByEmail(admin, input.email)
  if (!found.ok) return { ok: false, error: found.error }

  /*
   * A code shaped like what it is, so the promos list reads as a log.
   *
   * `mintPromoCode` gives it the random tail; the campaign is what makes a
   * direct grant distinguishable from a marketing code at a glance, and it is
   * carried onto the redemption row by `redeem_promo_code`.
   */
  const code = mintPromoCode('grant')

  const { error: codeError } = await admin.from('promo_codes').insert({
    code,
    label: input.note.trim() || `Granted to ${input.email.trim()}`,
    campaign: 'grant',
    free_days: days,
    spaces,
    // One use, and it is spent below. A leftover use on an operator-minted code
    // is a free month sitting in a table for whoever finds the string.
    max_uses: 1,
    tier,
    expires_at: null,
    created_by: user.id,
  })

  if (codeError) {
    return { ok: false, error: `Could not create the grant: ${codeError.message}` }
  }

  const { data, error } = await admin.rpc('redeem_promo_code', {
    p_code: code,
    p_user_id: found.id,
    p_source: 'grant',
    p_campaign: 'grant',
    // The only caller that ever passes this. Everything else - the link, the
    // sign-up, the picker, the space - takes the default and keeps the rule.
    p_ignore_history: input.evenIfTheyPaid,
  })

  if (error) {
    /*
     * "One per account per tier" firing is the rule working, not a failure.
     *
     * The code is left behind deliberately when it does: it is the record that
     * somebody tried, and revoking it is one click in the list above. Deleting
     * it here would mean a grant that was refused leaves no trace of having
     * been attempted.
     */
    if (error.message.includes('promo_redemptions_user_tier_key')) {
      return { ok: false, error: `That account already has a ${tier} grant.` }
    }
    return { ok: false, error: `Could not grant it: ${error.message}` }
  }

  const outcome = data?.[0]?.outcome
  if (outcome && outcome !== 'ok') {
    /*
      The one refusal with a way out names it, because "not_new" on its own
      sends an operator to read a SQL function to find out that the account
      once paid - and the answer is a checkbox on the form they are already
      looking at.
    */
    if (outcome === 'not_new') {
      return {
        ok: false,
        error: `${input.email.trim()} has paid for ${tier} before, so the voucher rule refused it. Tick "even if they paid before" to grant it anyway.`,
      }
    }
    return { ok: false, error: `The grant was refused: ${outcome}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'promos',
    action: 'tier.grant',
    summary: `Granted ${input.email.trim()} the ${tier} tier`,
    detail: {
      email: input.email.trim(),
      tier,
      days,
      spaces,
      evenIfTheyPaid: input.evenIfTheyPaid,
      code,
    },
  })

  revalidatePath('/ovaloffice/promos')
  return { ok: true }
}

/**
 * Put an account back on free by taking its grants away.
 *
 * The counterpart to the note above: free is the absence of a grant, so this is
 * how you get there. Deletes the redemptions rather than expiring them, because
 * an operator undoing a grant they just made for testing wants it *gone* - an
 * expired row would keep the account off "one per account per tier" and make
 * the same grant unrepeatable, which is precisely what testing needs to do.
 *
 * The codes stay. They are the log of what was granted and by whom, and that
 * record should outlive the grant it created.
 */
export async function clearGrantsFor(email: string): Promise<PromoResult> {
  const { user, admin } = await requireBackofficeSection('promos', 'write')

  const found = await findAccountByEmail(admin, email)
  if (!found.ok) return { ok: false, error: found.error }

  const { error } = await admin
    .from('promo_redemptions')
    .delete()
    .eq('user_id', found.id)

  if (error) return { ok: false, error: `Could not clear the grants: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'promos',
    action: 'tier.clear',
    summary: `Cleared all tier grants for ${email.trim()}`,
    detail: { email: email.trim(), userId: found.id },
  })

  revalidatePath('/ovaloffice/promos')
  return { ok: true }
}
