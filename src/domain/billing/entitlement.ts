import 'server-only'
import type Stripe from 'stripe'
import type { Client } from '@/es/store'
import { GRANT_SEATS } from '@/domain/promo/application'
import { ourPriceIds } from '@/domain/billing/prices'
import {
  asTier,
  DEFAULT_TIER,
  FREE_SPACES_PER_ACCOUNT,
  type Tier,
} from '@/domain/billing/tiers'
import { asEntitlementStatus } from '@/lib/supabase/types'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import type { EntitlementStatusName } from '@/lib/supabase/types'

/**
 * What a person has bought, and what that lets them do.
 *
 * ---------------------------------------------------------------------------
 * The rule changed with tiers, and the old one is worth stating to see why
 * ---------------------------------------------------------------------------
 * It used to be: one space per €20/month seat, bought in advance. You paid,
 * then you made a space. That worked while there was one price, and broke the
 * moment a space could be xo or xp - because the thing being bought is a
 * property of a *space*, and you cannot pick a space's tier before the space
 * exists. The old flow had already hit a soft version of this: see the deadlock
 * `startAccountCheckout` was written to escape.
 *
 * So it inverted. Making a space is free. A space with no subscription is
 * read-only - the same state a lapsed one is in, which the product has always
 * handled gracefully - and its owner picks xo or xp for it from its own billing
 * page. `MAX_UNPAID_SPACES` is the only thing left rationing creation, and it
 * is a spam guard rather than a commercial control.
 *
 * Membership of *other people's* spaces is still unlimited and still free. Only
 * spaces you own count, which is what makes "invite as many people as you like"
 * affordable to the person doing the inviting.
 *
 * ---------------------------------------------------------------------------
 * What stayed
 * ---------------------------------------------------------------------------
 * Entitlement is still read from Stripe rather than from our own event log, and
 * that is still the whole point. A customer created by hand in the Stripe
 * dashboard has never been through our Checkout flow, so no `SubscriptionStarted`
 * event exists and our read model has never heard of them. Stripe is the
 * authority on who has paid; our log is the authority on what happened in the
 * product.
 *
 * And when a subscription lapses the account is *not* closed. Every space, task
 * and block stays exactly where it is, readable forever; only writing stops.
 * Paying restores it with no migration and no restore step, because nothing was
 * ever removed.
 *
 * `seats` survives here because grandfathered accounts still have them - the
 * legacy €20 subscriptions are still being collected - and because
 * `tenant_is_entitled` still honours them. It is no longer what gates creating
 * a space.
 */

/**
 * How many spaces one account may have sitting there without a plan.
 *
 * A constant rather than a feature flag, deliberately. This is a guardrail
 * against somebody scripting a thousand empty spaces, not a dial anybody should
 * want to turn: the number that matters commercially is how many spaces are
 * *paid for*, and that has no limit at all. Making it a flag would invite the
 * question of what it should be per customer, which is a question with no
 * useful answer.
 *
 * Three, because one is not enough to try a second idea before committing to
 * the first, and ten would be worth scripting.
 */
/**
 * Superseded by `FREE_SPACES_PER_ACCOUNT` in `tiers.ts`, and kept only for the
 * event staff paths that still import it.
 *
 * It was a flat spam guard - three spaces waiting for a plan - written before
 * the free tier existed and when a space with no plan was read-only anyway. A
 * free space is now a working product, so how many of them one account may hold
 * is a *pricing* number rather than an anti-abuse one, it is one, and it
 * resolves against a user-scoped override. See `freeSpaceLimit` in `quota.ts`.
 */
export const MAX_UNPAID_SPACES = 3

/** Stripe statuses that grant seats right now. */
const PAYING_STATUSES = new Set(['active', 'trialing'])

export interface StripeEntitlement {
  customerId: string | null
  seats: number
  status: EntitlementStatusName
  currentPeriodEnd: string | null
  priceId: string | null
  /** Still active, but will not renew. */
  cancelAtPeriodEnd: boolean
}

const NO_SUBSCRIPTION: StripeEntitlement = {
  customerId: null,
  seats: 0,
  status: 'none',
  currentPeriodEnd: null,
  priceId: null,
  cancelAtPeriodEnd: false,
}

/**
 * Ask Stripe what this email is entitled to.
 *
 * Only counts items on the configured price. Counting every item regardless
 * would let an unrelated subscription - a one-off, a different product - silently
 * grant workspaces, which is the kind of billing bug that is only ever found by
 * an accountant.
 */
export async function fetchStripeEntitlement(
  supabase: Client,
  email: string,
): Promise<StripeEntitlement> {
  // Every price we have ever sold, not one: an account can hold an xo space, an
  // xp space and a legacy EUR 20 subscription at the same time, and counting
  // only one of them would under-report the seats of exactly the customers who
  // have paid us the most.
  const priceIds = new Set(await ourPriceIds(supabase))

  const customers = await stripe().customers.list({
    email: email.trim().toLowerCase(),
    limit: 20,
  })

  if (customers.data.length === 0) return NO_SUBSCRIPTION

  let seats = 0
  let latestEnd: number | null = null
  let status: EntitlementStatusName = 'none'
  let customerId: string | null = null
  let matchedPrice: string | null = null
  let cancelAtPeriodEnd = false

  for (const customer of customers.data) {
    // One person can accumulate several customer records - a Checkout session
    // with different email casing is enough - so this sums across all of them
    // rather than trusting the first.
    const subscriptions = await stripe().subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
    })

    for (const subscription of subscriptions.data) {
      const matched = matchOurPrices(subscription, priceIds)
      if (matched.quantity === 0) continue

      customerId ??= customer.id
      // The most recently seen of our prices, for the "which plan granted this"
      // readout. With tiers an account can legitimately hold two, so this is a
      // sample rather than the whole truth - the authoritative per-space answer
      // is `subscriptions_read_model.tier`, which is keyed on the space the
      // money was actually spent on.
      matchedPrice = matched.priceId ?? matchedPrice

      if (PAYING_STATUSES.has(subscription.status)) {
        seats += matched.quantity
        const end = subscriptionPeriodEnd(subscription)
        if (end !== null && (latestEnd === null || end > latestEnd)) latestEnd = end
        status = 'active'
        // If any paying subscription is winding down, say so. Someone with two
        // seats cancelling one should see that something is ending.
        if (subscription.cancel_at_period_end) cancelAtPeriodEnd = true
      } else if (status === 'none' || status === 'expired') {
        // Remember the most informative non-paying state, so the UI can say
        // "payment failed" rather than a flat "not subscribed".
        status = mapStatus(subscription.status)
      }
    }
  }

  return {
    customerId,
    seats,
    status,
    currentPeriodEnd: latestEnd ? new Date(latestEnd * 1000).toISOString() : null,
    priceId: matchedPrice,
    cancelAtPeriodEnd,
  }
}

/**
 * Seats this subscription grants on any price of ours, respecting quantity.
 *
 * Was `quantityForPrice`, taking the one price this product used to have. The
 * set is the only change, and it is the change that keeps the rule the original
 * comment argued for: count *our* items and ignore everything else, so an
 * unrelated purchase on the same Stripe account cannot silently grant spaces.
 * Widening it to two prices does not widen it to any price.
 */
function matchOurPrices(
  subscription: Stripe.Subscription,
  priceIds: ReadonlySet<string>,
): { quantity: number; priceId: string | null } {
  let quantity = 0
  let priceId: string | null = null

  for (const item of subscription.items.data) {
    const id = item.price?.id
    if (!id || !priceIds.has(id)) continue
    quantity += item.quantity ?? 1
    priceId ??= id
  }

  return { quantity, priceId }
}

function mapStatus(stripeStatus: Stripe.Subscription.Status): EntitlementStatusName {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    default:
      return 'expired'
  }
}

/**
 * Refresh one person's cached entitlement from Stripe.
 *
 * Needs a service-role client: `user_entitlements` has no write policy, because
 * a user who could write their own row could grant themselves any number of
 * workspaces.
 */
export async function syncUserEntitlement(
  admin: Client,
  userId: string,
  email: string,
): Promise<StripeEntitlement> {
  const entitlement = await fetchStripeEntitlement(admin, email)

  const { error } = await admin.from('user_entitlements').upsert(
    {
      user_id: userId,
      stripe_customer_id: entitlement.customerId,
      seats: entitlement.seats,
      status: entitlement.status,
      current_period_end: entitlement.currentPeriodEnd,
      price_id: entitlement.priceId,
      cancel_at_period_end: entitlement.cancelAtPeriodEnd,
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw new Error(`Failed to store entitlement for ${userId}: ${error.message}`)
  }

  return entitlement
}

export interface Entitlement {
  /**
   * Legacy account seats, from the retired €20 plan.
   *
   * No longer what lets somebody make a space. Still read, because these
   * subscriptions are still being collected and `tenant_is_entitled` still
   * honours them - see the grandfather note in the tiers migration.
   */
  seats: number
  /** Spaces this person owns. */
  used: number
  /** Of those, how many have no plan on them yet. */
  unpaid: number
  /** Room for another free space. See the note where this is set. */
  canCreate: boolean
  status: EntitlementStatusName
  currentPeriodEnd: string | null
  /** True while the subscription entitles this person to write. */
  active: boolean
  /** Active, but ending on currentPeriodEnd rather than renewing. */
  cancelAtPeriodEnd: boolean
  /**
   * A redeemed promo code is holding this account up, rather than a payment.
   *
   * Set when a live grant contributed seats. Worth surfacing separately from
   * `active` because the two end differently: a subscription renews unless
   * cancelled, a free month simply stops. Somewhere has to say so before it
   * does, and it cannot say so if the two are indistinguishable by then.
   */
  granted: boolean
  /** When the free month ends, ISO. NULL when no grant is involved. */
  grantUntil: string | null
  /** Which tier the free month is of. NULL when no grant is involved. */
  grantTier: Tier | null
}

/**
 * The cached entitlement, for rendering.
 *
 * Reads the mirror rather than Stripe, because this runs on every page load
 * behind a workspace and a Stripe round trip there would put their API on the
 * critical path of the whole app. The daily job keeps it fresh; the checks that
 * cost money go to Stripe directly.
 */
export async function readEntitlement(
  supabase: Client,
  userId: string,
): Promise<Entitlement> {
  const [{ data, error }, owned, grant] = await Promise.all([
    supabase
      .from('user_entitlements')
      .select('seats, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle(),
    countOwnedTenants(supabase, userId),
    /**
     * The redeemed free month, read alongside Stripe rather than merged into
     * it.
     *
     * `user_entitlements` is a mirror of somebody else's system - see its
     * migration - and the nightly sync overwrites every column in it from
     * Stripe. A granted seat written in there would survive until the next
     * sync and then silently vanish, which is the worst available failure: the
     * space works for a day and then does not, with nothing in any log saying
     * why. Keeping the grant in its own table means the mirror can be
     * overwritten as hard as it likes.
     */
    readPromoGrant(supabase, userId),
  ])

  if (error) {
    throw new Error(`Failed to read entitlement: ${error.message}`)
  }

  const paidSeats = data?.seats ?? 0
  const stripeStatus = asEntitlementStatus(data?.status)
  const granted = grant !== null

  // Additive, not a maximum. Somebody who redeemed a code and later subscribed
  // holds both until the month runs out, and taking the larger of the two would
  // quietly cost them the space they made with the free one.
  const seats = paidSeats + (granted ? GRANT_SEATS : 0)

  /**
   * A space is "unpaid" when nothing is holding it up but the owner's goodwill.
   *
   * Counted against the legacy seats and any live grant, because those *do*
   * hold spaces up - `tenant_is_entitled` says so - and a grandfathered account
   * that suddenly could not make a space would be this change breaking the
   * people it was written to protect.
   */
  const covered = seats
  const unpaid = Math.max(0, owned.total - owned.subscribed - covered)

  /**
   * A granted month reports as `trialing`, which is not a fudge: it is exactly
   * what Stripe calls a subscription that entitles you to everything and has
   * not been paid for yet, and every consumer of this status - the workspace
   * layout, `tenant_is_entitled`, the picker - already treats it as writable.
   * Inventing a sixth status would mean auditing each of them for a case they
   * have no reason to know about.
   *
   * Only when Stripe has nothing to say. A real subscription's own status wins,
   * so a past_due account that also holds a grant still shows the failed
   * payment it needs to do something about.
   */
  const status: EntitlementStatusName =
    granted && stripeStatus === 'none' ? 'trialing' : stripeStatus

  return {
    seats,
    used: owned.total,
    unpaid,
    /*
     * The hint, not the gate. `createTenant` resolves the real number - which
     * carries this account's own override - and re-asks; this is the summary a
     * page renders a button from, and it has no client to resolve with. Wrong
     * only for an account somebody has been generous to, and wrong in the
     * direction of hiding a button that would have worked rather than offering
     * one that would be refused.
     */
    canCreate: unpaid < FREE_SPACES_PER_ACCOUNT,
    status,
    // The paid period end stays Stripe's. The grant's end is its own field -
    // one date labelled "paid through" that sometimes means "free until" is a
    // date nobody can act on.
    currentPeriodEnd: data?.current_period_end ?? null,
    /**
     * "This person is paying us something."
     *
     * Now includes owning a subscribed space, which is the normal case under
     * tiers and produces no `user_entitlements` seats at all. Without that
     * clause the billing page would tell somebody paying €10 a month for their
     * space that they had no subscription, and
     * `readEntitlementRefreshingIfInactive` would hit Stripe on every load
     * trying to find one.
     */
    active:
      owned.subscribed > 0 ||
      (seats > 0 && (status === 'active' || status === 'trialing')),
    cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
    granted,
    grantUntil: grant?.until ?? null,
    grantTier: grant?.tier ?? null,
  }
}

/**
 * When this account's free month ends, if one is running.
 *
 * Deliberately narrow - one column, one row, filtered in the database - because
 * this sits inside `readEntitlement`, which runs on every page load behind a
 * workspace. The richer read that names the code lives in
 * `domain/promo/queries.ts`, where nothing is on a hot path.
 *
 * A failure reads as "no grant". That is the safe direction here in the sense
 * that matters: it can make a space read-only for as long as the query is
 * broken, but it can never hand out seats nobody redeemed, and a lost month is
 * recoverable while a granted one is not.
 */
async function readPromoGrant(
  supabase: Client,
  userId: string,
  // `until` is nullable because a grant can have no end: NULL is forever, and
  // the caller passes it straight through to `grantUntil`, which every screen
  // showing "how long is left" already has to handle.
): Promise<{ until: string | null; tier: Tier } | null> {
  /**
   * `maybeSingle` became `limit(1)` when vouchers went per-tier.
   *
   * One account may now hold two live grants - a free month of xo and a free
   * month of xp are separate entitlements under the rule in the tiers
   * migration - and `maybeSingle` throws outright on a second row. That would
   * have turned "redeemed both codes" into a 500 on every page load behind a
   * space, which is a spectacular way for a generous promotion to fail.
   *
   * Ordered so xp wins, for the same reason `tenant_tier()` orders its grant
   * branch: which of two grants applies must not depend on insertion order.
   */
  const { data } = await supabase
    .from('promo_redemptions')
    .select('granted_until, granted_tier')
    .eq('user_id', userId)
    /*
      Both halves of "live", because NULL is a grant with no end rather than a
      missing date - see the migration that made the column nullable. `gt` alone
      compares NULL to a timestamp, gets NULL, and drops exactly the grants that
      never expire.
    */
    .or(`granted_until.is.null,granted_until.gt.${new Date().toISOString()}`)
    .order('granted_tier', { ascending: false })
    .limit(1)

  const row = data?.[0]
  if (!row) return null

  return { until: row.granted_until, tier: asTier(row.granted_tier) ?? DEFAULT_TIER }
}

/**
 * How many spaces this user owns, and how many of those have a plan.
 *
 * One round trip rather than two counts, because the caller needs both numbers
 * together and they have to describe the same instant - a space subscribed
 * between two separate counts would show up as owned-but-not-subscribed and
 * eat one of somebody's three free slots.
 */
export async function countOwnedTenants(
  supabase: Client,
  userId: string,
): Promise<{ total: number; subscribed: number }> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('role', 'owner')

  if (error) {
    throw new Error(`Failed to count your spaces: ${error.message}`)
  }

  const ids = (data ?? []).map((row) => row.tenant_id)
  if (ids.length === 0) return { total: 0, subscribed: 0 }

  // Which of them are paid up. `in` on the ids the caller already owns, so RLS
  // on subscriptions_read_model - members only - can never widen this.
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions_read_model')
    .select('tenant_id')
    .in('tenant_id', ids)
    .in('status', ['pending', 'active', 'past_due'])

  if (subsError) {
    throw new Error(`Failed to read your subscriptions: ${subsError.message}`)
  }

  return { total: ids.length, subscribed: (subs ?? []).length }
}

/**
 * What to tell someone who cannot create another space.
 *
 * Kept, but no longer about seats bought in advance: a space is free to make
 * and picks its tier afterwards, so the only thing left to run out of is the
 * allowance of spaces standing around unpaid. See `MAX_UNPAID_SPACES`.
 */
export function entitlementMessage(freeLimit: number): string {
  /*
   * Says "buy a plan for the new one", and that phrasing is the whole job.
   *
   * This is the only wall in the product whose answer is a plan for a
   * *different* space than the one in front of you - every other cap is fixed
   * by upgrading the space you are standing in. Somebody who reads this as
   * "upgrade to make more free spaces" will pay us and still be unable to do
   * the thing they wanted, which is the worst outcome available here. See
   * `docs/product/pricing.md` §8.
   */
  const spaces = freeLimit === 1 ? 'one free space' : `${freeLimit} free spaces`

  return (
    `An account can own ${spaces}, and yours is in use. ` +
    `A new space needs a plan of its own — or give the one you have a plan, ` +
    `or archive it, and this one becomes free again.`
  )
}


/**
 * Read the cached entitlement, and re-check Stripe when it looks inactive.
 *
 * The mirror is refreshed nightly and at create-workspace time, which is fine
 * for someone who is already paying. It is exactly wrong for someone who has
 * *just* paid: they subscribe, land back in the product, and are told they have
 * no subscription until tomorrow morning.
 *
 * So when the cache says "nothing here", ask Stripe before believing it. The
 * asymmetry is deliberate - a false negative strands a paying customer, while a
 * false positive would only persist until the next sync. Only the expensive
 * direction gets the extra round trip.
 *
 * Used on the pages where someone is looking *at* their billing. The workspace
 * layout deliberately keeps the cheap cached read, or every page load for an
 * unsubscribed visitor would wait on Stripe.
 */
export async function readEntitlementRefreshingIfInactive(
  supabase: Client,
  admin: Client,
  userId: string,
  email: string | undefined,
): Promise<Entitlement> {
  const cached = await readEntitlement(supabase, userId)
  if (cached.active || !email) return cached

  try {
    await syncUserEntitlement(admin, userId, email)
  } catch {
    // Stripe being unreachable should not blank the page. The cached answer is
    // stale, not wrong, and the nightly job will catch up.
    return cached
  }

  return readEntitlement(supabase, userId)
}
