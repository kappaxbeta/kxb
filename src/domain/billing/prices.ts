import 'server-only'
import { env } from '@/lib/env'
import { FALLBACK_TIER, type PaidTier, type Tier } from '@/domain/billing/tiers'
import { grantForPrice, sellingPriceFor } from '@/domain/billing/tier-table'
import type { Client } from '@/es/store'

/**
 * Which Stripe price sells which tier.
 *
 * Separated from `tiers.ts` for one reason: this reads the environment, which
 * makes it `server-only`, and the pricing table on the landing page is a Client
 * Component that needs the labels. Splitting the copy from the price ids means
 * the marketing page can name a tier without a Stripe key being anywhere near
 * the bundle.
 *
 * ---------------------------------------------------------------------------
 * The legacy price
 * ---------------------------------------------------------------------------
 * `STRIPE_PRICE_ID` was the single EUR 20/month price this product had before
 * there were tiers. It is not sold any more - nothing in the app creates a
 * Checkout session on it - but subscriptions on it are still live and still
 * being collected, and those customers were paying twice the top tier. So it
 * maps to `xp`, which is a deliberate commercial decision written down here
 * rather than left to whatever `tierForPrice` happened to return:
 *
 *   - Mapping it to `xo` would take the XP suite away from the only people who
 *     paid enough to deserve it, silently, on the day this shipped.
 *   - Mapping it to `null` would make their spaces read-only, which is worse.
 *
 * They keep xp at the old price until they choose to change plan, at which
 * point they land on one of the two prices below and this branch stops applying
 * to them. When the last legacy subscription is gone, delete `legacyPriceId`
 * and this comment with it.
 */

/**
 * The price that sells a tier. Throws if it is not configured.
 *
 * `PaidTier` rather than `Tier`, so that building a checkout for `free` is a
 * compile error rather than a throw in front of somebody trying to pay us.
 * There is no Stripe price for free and there should never be one - a €0
 * subscription is a row that can lapse, and the free tier is what a space falls
 * back to when a subscription lapses.
 */
export async function priceForTier(supabase: Client, tier: PaidTier): Promise<string> {
  /*
   * The table first, the environment second, and never the other way round.
   *
   * `tier_prices` is where a price is *changed* now - it is how EUR 12 ships
   * without a deploy - so a row must win over a variable baked into the image
   * at build time. The env vars stay as the answer for a deployment that has
   * not filled the table in yet, which on the day this ships is every one of
   * them.
   */
  const sold = await sellingPriceFor(supabase, tier)
  if (sold) return sold

  return tier === 'xp' ? env.stripePriceXp() : env.stripePriceXo()
}

/**
 * Which tier this Stripe price sells, or null if it sells nothing of ours.
 *
 * `null` is a real answer and callers must handle it. An account can carry
 * subscriptions we did not sell - a one-off, another product on the same Stripe
 * account - and treating an unrecognised price as a tier is how an unrelated
 * purchase silently unlocks the product. The same care `fetchStripeEntitlement`
 * takes over counting only our own price.
 *
 * Reads the environment defensively rather than through the throwing accessors:
 * this runs inside the webhook, and a deployment missing one price id should
 * degrade to "not one of ours" rather than 500 on every Stripe delivery.
 */
export async function tierForPrice(
  supabase: Client,
  priceId: string | null | undefined,
): Promise<Tier | null> {
  if (!priceId) return null

  const grant = await grantForPrice(supabase, priceId)
  if (grant) return grant.tier

  /*
   * The environment, still, for anything the table has not been told about.
   *
   * These three lines are the old mapping and they are load-bearing until every
   * deployment has its rows filled in. The legacy EUR 20 price is the reason
   * the third exists: those customers were paying twice the top tier, mapping
   * them to xo would take the XP suite away on the day this shipped, and
   * mapping them to null would make their spaces read-only - which is worse.
   *
   * A row in `tier_prices` supersedes each of these the moment somebody writes
   * one, which is the migration path: fill the table, watch, delete the vars.
   */
  if (priceId === process.env.STRIPE_PRICE_XO) return 'xo'
  if (priceId === process.env.STRIPE_PRICE_XP) return 'xp'
  if (priceId === process.env.STRIPE_PRICE_ID) return 'xp'

  return null
}

/**
 * The tier a subscription grants, for a caller that must produce one.
 *
 * Only for the paths where we already know the subscription is ours and the
 * question is which half of the product it opens - the projection, mostly.
 * Anything deciding *whether* to honour a subscription must use
 * `tierForPrice` and deal with the null itself.
 *
 * `FALLBACK_TIER` and emphatically not `DEFAULT_TIER`, which is now `free`.
 * Everybody reaching this line *has a subscription we recognise as ours*; the
 * only thing we could not work out is which price it is on. Resolving that to
 * free would strip a paying space back to two seats over an unrecognised price
 * id, which is the one direction this function must never take.
 */
export async function tierForPriceOrDefault(
  supabase: Client,
  priceId: string | null | undefined,
): Promise<Tier> {
  return (await tierForPrice(supabase, priceId)) ?? FALLBACK_TIER
}

/**
 * Is this a price a new checkout may be built against?
 *
 * A column now rather than a comparison. `sold` on a `tier_prices` row is
 * exactly this question, and the grandfathered rows answer false - which is the
 * whole of §9 expressed as data instead of as an if.
 */
export async function isSoldPrice(
  supabase: Client,
  priceId: string | null | undefined,
): Promise<boolean> {
  if (!priceId) return false

  const grant = await grantForPrice(supabase, priceId)
  if (grant) return grant.sold

  return (
    priceId === process.env.STRIPE_PRICE_XO || priceId === process.env.STRIPE_PRICE_XP
  )
}

/** The legacy EUR 20 price, if this deployment still has one on file. */
export function legacyPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID ?? null
}

/**
 * Every price id that entitles a space, for the "is this ours" checks.
 *
 * Table and environment *unioned*, not one falling back to the other, and that
 * is the difference between this and the readers above. Those answer "what does
 * this one price grant", where the first hit is the answer. This answers "which
 * of a customer's subscriptions are ours at all" - and a price missing from
 * that set is a live subscription we stop counting, which reads to the customer
 * as their payment vanishing. A superset is the safe direction; the row and the
 * variable disagreeing costs nothing here.
 */
export async function ourPriceIds(supabase: Client): Promise<string[]> {
  const fromEnv = [
    process.env.STRIPE_PRICE_XO,
    process.env.STRIPE_PRICE_XP,
    process.env.STRIPE_PRICE_ID,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)

  const { data } = await supabase.from('tier_prices').select('price_id')

  return [...new Set([...fromEnv, ...(data ?? []).map((row) => row.price_id)])]
}
