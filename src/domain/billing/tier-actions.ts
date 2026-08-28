'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isTier, LIMIT_KEYS, type LimitKey } from '@/domain/billing/tiers'
import type { StoredLimits } from '@/domain/billing/tier-admin'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Editing the tier table.
 *
 * Kept out of `billing/actions.ts`, which is the customer's side of billing and
 * says at the top that nothing in it writes a payment fact. These write what a
 * plan *costs and holds*, for everybody, and they belong behind the backoffice
 * gate rather than beside a checkout button.
 *
 * Every action here goes through `requireBackofficeSection` and then writes with
 * the service-role client, because there is no insert or update policy on
 * either table - the migrations grant `select` to the world and nothing else,
 * deliberately, so that a narrow write policy is not the thing standing between
 * a stranger and the price of the product. A Server Action is a public POST
 * endpoint; the gate above is what makes these safe, and it is checked first.
 *
 * ---------------------------------------------------------------------------
 * Two things a price change is not
 * ---------------------------------------------------------------------------
 * `cents` on a tier is what the *page quotes*. What checkout *charges* is the
 * Stripe price behind `tier_prices`. Changing one without the other advertises
 * a number we do not take - see the note on xp's 1000 in `tiers.ts` - which is
 * why the two live on one page and why the editor says so out loud.
 */

export type TierResult = { ok: true } | { ok: false; error: string }

/**
 * One limit, as a row may state it.
 *
 * `null` is unlimited and is a value somebody chose. *Absent* is inherit, and
 * is expressed by the key not being here at all - the client sends a sparse
 * object, and `.strict()` below means a typo'd key is a refusal rather than a
 * silently ignored edit.
 */
const limitSchema = z.union([z.null(), z.number().int().min(0)])

const limitsSchema = z.strictObject(
  Object.fromEntries(LIMIT_KEYS.map((key) => [key, limitSchema.optional()])) as Record<
    LimitKey,
    z.ZodOptional<typeof limitSchema>
  >,
)

/** The words on a card. Trimmed, and never empty - a blank card is a bug on the landing page. */
const copySchema = z.string().trim().min(1).max(200)

const tierSchema = z.object({
  id: z.string().refine(isTier, 'Unknown tier'),
  /**
   * In minor units, and an integer for the reason the billing migration gives:
   * money is never a float. Capped at EUR 1000/month, which is not a business
   * rule so much as a fat-finger guard - the difference between 1000 and 100000
   * is one keystroke and one of them is on the public pricing table.
   */
  cents: z.number().int().min(0).max(100_000),
  sold: z.boolean(),
  shownOnLanding: z.boolean(),
  label: copySchema,
  tagline: copySchema,
  limits: limitsSchema,
})

/**
 * Save one tier row.
 *
 * The whole row at once rather than a field at a time, because the limits are
 * only meaningful together: "seats 6, guests 3" is a plan, and two independent
 * writes would have a window in which it was neither the old plan nor the new
 * one, on a table every space in the product resolves through.
 *
 * `rank` is not editable and is not in the schema. It orders the cards and
 * nothing else - `tierAtLeast` compares the compiled ranks - so an editable
 * field would look like it re-ordered the ladder while changing only the page.
 */
export async function saveTier(input: {
  id: string
  cents: number
  sold: boolean
  shownOnLanding: boolean
  label: string
  tagline: string
  limits: StoredLimits
}): Promise<TierResult> {
  const parsed = tierSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not a tier.' }
  }

  const { user, admin } = await requireBackofficeSection('pricing', 'write')

  const { error } = await admin
    .from('tiers')
    .update({
      cents: parsed.data.cents,
      sold: parsed.data.sold,
      shown_on_landing: parsed.data.shownOnLanding,
      label: parsed.data.label,
      tagline: parsed.data.tagline,
      /*
       * The parsed object, so an absent key stays absent. Spreading it over the
       * row's current limits would be the one mistake this whole file exists to
       * avoid: it would make "inherit" unreachable, and the first save would
       * freeze a sparse row into a snapshot of the product as it is today.
       */
      limits: parsed.data.limits,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: `Could not save the tier: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'pricing',
    action: 'tier.save',
    summary: `Saved the ${parsed.data.id} tier at ${parsed.data.cents} cents`,
    detail: {
      tier: parsed.data.id,
      cents: parsed.data.cents,
      sold: parsed.data.sold,
      shownOnLanding: parsed.data.shownOnLanding,
      label: parsed.data.label,
      tagline: parsed.data.tagline,
      limits: parsed.data.limits,
    },
  })

  revalidated()
  return { ok: true }
}

const priceSchema = z.object({
  // One value today, and constrained here as well as in the check constraint.
  // Failing at the form beats failing at the till - the argument on the column.
  provider: z.literal('stripe'),
  priceId: z
    .string()
    .trim()
    .min(1, 'Paste the price id')
    .max(255)
    // Stripe's own shape. A pasted *product* id (`prod_…`) is the commonest
    // wrong thing to put here and checkout would refuse it much later, in front
    // of somebody paying.
    .regex(/^price_[A-Za-z0-9]+$/, 'A Stripe price id looks like price_1AbC…'),
  tier: z.string().refine(isTier, 'Unknown tier'),
  sold: z.boolean(),
  note: z.string().trim().max(500).nullable(),
  limits: limitsSchema,
})

/**
 * Add a price, or change one that is already here.
 *
 * An upsert on (provider, price_id), because those two are the primary key and
 * because the two operations are the same act: an operator pastes an id off the
 * Stripe dashboard, and whether we have seen it before is not a thing they
 * should have to know before choosing a button.
 *
 * Marking one `sold` un-sells the tier's previous one first. The database has a
 * unique index that would otherwise refuse the write, and refusing would be the
 * wrong answer to what the operator plainly means: launching a new price *is*
 * grandfathering the old one, and making them two clicks means there is a
 * moment where a tier has no price on sale at all.
 */
export async function saveTierPrice(input: {
  provider: string
  priceId: string
  tier: string
  sold: boolean
  note: string | null
  limits: StoredLimits
}): Promise<TierResult> {
  const parsed = priceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not a price.' }
  }

  const { user, admin } = await requireBackofficeSection('pricing', 'write')
  const price = parsed.data

  if (price.sold) {
    const { error: demote } = await admin
      .from('tier_prices')
      .update({ sold: false })
      .eq('provider', price.provider)
      .eq('tier', price.tier)
      .eq('sold', true)
      .neq('price_id', price.priceId)

    if (demote) {
      return { ok: false, error: `Could not retire the old price: ${demote.message}` }
    }
  }

  const { error } = await admin.from('tier_prices').upsert(
    {
      provider: price.provider,
      price_id: price.priceId,
      tier: price.tier,
      sold: price.sold,
      note: price.note,
      limits: price.limits,
    },
    { onConflict: 'provider,price_id' },
  )

  if (error) return { ok: false, error: `Could not save the price: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'pricing',
    action: 'price.save',
    summary: `Saved ${price.tier} price ${price.priceId}${price.sold ? ' (on sale)' : ''}`,
    detail: {
      tier: price.tier,
      provider: price.provider,
      priceId: price.priceId,
      sold: price.sold,
      note: price.note,
      limits: price.limits,
    },
  })

  revalidated()
  return { ok: true }
}

/**
 * Forget a price.
 *
 * Rare and mostly wrong, which is why the editor asks first. A price somebody
 * is subscribed on resolves their limits through this row; deleting it does not
 * cancel anything, it makes `grantForPrice` answer "not one of ours" and their
 * space goes read-only. Retiring - `sold = false` - is the operation that is
 * almost always meant, and it is one checkbox above this button.
 *
 * The one honest use is a row typed in wrong: an id nobody has ever been
 * charged on, which should not be in the table at all.
 */
export async function deleteTierPrice(provider: string, priceId: string): Promise<TierResult> {
  const parsed = z
    .object({ provider: z.literal('stripe'), priceId: z.string().trim().min(1) })
    .safeParse({ provider, priceId })

  if (!parsed.success) return { ok: false, error: 'That is not a price.' }

  const { user, admin } = await requireBackofficeSection('pricing', 'write')

  const { error } = await admin
    .from('tier_prices')
    .delete()
    .eq('provider', parsed.data.provider)
    .eq('price_id', parsed.data.priceId)

  if (error) return { ok: false, error: `Could not delete the price: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'pricing',
    action: 'price.delete',
    summary: `Deleted price ${parsed.data.priceId}`,
    detail: { provider: parsed.data.provider, priceId: parsed.data.priceId },
  })

  revalidated()
  return { ok: true }
}

/**
 * The pages that quote these numbers.
 *
 * The landing page is the one that matters and the reason this table exists:
 * changing a price should show up on it without a deploy, and it is statically
 * rendered until something says otherwise. The rest of the product reads limits
 * per request.
 */
function revalidated(): void {
  revalidatePath('/', 'layout')
  revalidatePath('/ovaloffice/pricing')
}
