'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { resolveFeatures } from '@/domain/flags/queries'
import { mintPromoCode } from '@/domain/promo/mint'
import { requireUser } from '@/lib/auth'
import { requireBackofficeSection } from '@/lib/backoffice'
import { env } from '@/lib/env'
import { stripe } from '@/lib/stripe'

/**
 * Buying, redeeming, gifting and wearing a skin.
 *
 * Same care as promo/actions.ts, stated once and honoured everywhere below:
 * the definer functions grant to whichever user id they are handed, so every
 * id passed to an RPC here comes off `requireUser()` - the verified session -
 * and no parameter exists through which a caller could name somebody else.
 *
 * The shop flag is checked on the server as well as hidden in the UI, for the
 * reason startCheckout spells out: a Server Action is a public POST endpoint,
 * and the other button is always readable in the source.
 */

export type SkinActionResult = { ok: false; error: string } | { ok: true; message?: string }

const SHOP_CLOSED = 'The skin shop is not open.'

// ---------------------------------------------------------------------------
// Wearing
// ---------------------------------------------------------------------------

/**
 * Equip a skin, or `null` to go back to the dummy.
 *
 * The ownership check lives in the row policy on profile_skins, not here - the
 * database refuses a skin you do not own, and this action only has to turn
 * that refusal into a sentence. Like choosing an animal, there is no
 * entitlement or flag check: wearing what you already own is not a sale.
 */
export async function chooseSkin(model: string | null): Promise<SkinActionResult> {
  const { user, supabase } = await requireUser()

  if (model === null) {
    const { error } = await supabase.from('profile_skins').delete().eq('user_id', user.id)
    if (error) return { ok: false, error: 'That change did not save. Try again.' }
    revalidatePath('/skins')
    return { ok: true }
  }

  const { error } = await supabase.from('profile_skins').upsert(
    {
      user_id: user.id,
      model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    return { ok: false, error: 'You can only wear a skin you own.' }
  }

  revalidatePath('/skins')
  return { ok: true }
}

/**
 * Wear a skin in the lounge, or take it off and be your peep again.
 *
 * One action rather than `chooseSkin` followed by `wearSkinInLounge`, because
 * the two together are one intent - "be the Knight in here" - and doing them
 * as two round trips leaves a visible middle state where somebody is wearing
 * a skin they did not ask to wear in the games yet.
 *
 * Passing null clears the lounge flag and leaves the skin equipped: taking the
 * Knight out of the café is not taking him out of the arcade.
 */
export async function wearLoungeSkin(model: string | null): Promise<SkinActionResult> {
  const { user, supabase } = await requireUser()

  if (model === null) {
    const { error } = await supabase
      .from('profile_skins')
      .update({ in_lounge: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    if (error) return { ok: false, error: 'That change did not save. Try again.' }
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  // The row policy is what refuses a skin you do not own - see the migration.
  const { error } = await supabase.from('profile_skins').upsert(
    {
      user_id: user.id,
      model,
      in_lounge: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: 'You can only wear a skin you own.' }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Wear your skin in the lounge too, or go back to the peep.
 *
 * A flag on the skin you already have on rather than a second choice of body:
 * there is nothing to decide until you own one, and taking the skin off should
 * take this with it. The animal is never touched, so switching back is
 * switching back rather than picking again.
 *
 * Refuses when there is no skin equipped, because a lounge told to draw
 * "nothing, but in the lounge" would draw nothing.
 */
export async function wearSkinInLounge(wear: boolean): Promise<SkinActionResult> {
  const { user, supabase } = await requireUser()

  const { data, error } = await supabase
    .from('profile_skins')
    .update({ in_lounge: wear, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('model')
    .maybeSingle()

  if (error) return { ok: false, error: 'That change did not save. Try again.' }
  if (!data) return { ok: false, error: 'Put a skin on first, then wear it here.' }

  // Everywhere a body is drawn from the server: the lounge, the rooms, the
  // lobby's podium.
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

export async function redeemSkinVoucher(code: string): Promise<SkinActionResult> {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: 'Type a code.' }

  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: SHOP_CLOSED }

  const { data, error } = await supabase.rpc('redeem_skin_voucher', {
    p_code: trimmed,
    p_user_id: user.id,
  })

  if (error) return { ok: false, error: 'That did not work. Try again.' }
  if (data !== 'ok') return { ok: false, error: redeemFailure(data) }

  revalidatePath('/skins')
  return { ok: true }
}

/** The SQL's refusal codes, as sentences. Kept beside the RPC call so a new
 *  outcome lands in both places in one edit. */
function redeemFailure(outcome: string | null): string {
  switch (outcome) {
    case 'unknown':
      return 'No voucher has that code.'
    case 'taken':
      return 'That code has already been redeemed.'
    case 'spent':
      return 'That voucher has already been spent.'
    default:
      return 'That did not work. Try again.'
  }
}

export async function spendVouchersOnSkin(skinId: string): Promise<SkinActionResult> {
  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: SHOP_CLOSED }

  const { data, error } = await supabase.rpc('spend_skin_vouchers', {
    p_skin_id: skinId,
    p_user_id: user.id,
  })

  if (error) return { ok: false, error: 'That did not work. Try again.' }

  switch (data) {
    case 'ok':
      revalidatePath('/skins')
      return { ok: true }
    case 'owned':
      return { ok: true, message: 'You already own this skin.' }
    case 'short':
      return { ok: false, error: 'Not enough vouchers.' }
    case 'inactive':
      return { ok: false, error: 'That skin is no longer for sale.' }
    default:
      return { ok: false, error: 'That skin is not on the shelf.' }
  }
}

/**
 * Release one of your vouchers as a code to send to somebody.
 *
 * The fresh code is minted here rather than in SQL so every code on the
 * platform comes off one alphabet - the promo mint's, chosen for surviving
 * being read aloud. Gifting works with the shop closed on purpose: the voucher
 * was already granted, and passing it on is not a sale.
 */
export async function giftSkinVoucher(
  voucherId: string,
): Promise<{ ok: false; error: string } | { ok: true; code: string }> {
  const { user, supabase } = await requireUser()

  const code = mintPromoCode('SKIN')

  const { data, error } = await supabase.rpc('gift_skin_voucher', {
    p_voucher_id: voucherId,
    p_user_id: user.id,
    p_code: code,
  })

  if (error || data !== 'ok') {
    return { ok: false, error: 'That voucher is not yours to give, or is already spent.' }
  }

  revalidatePath('/skins')
  return { ok: true, code }
}

// ---------------------------------------------------------------------------
// Taking a free one
// ---------------------------------------------------------------------------

/**
 * Take a skin that costs nothing.
 *
 * Its own door because Checkout will not sell nothing - Stripe refuses a
 * session for zero, and asking it to is asking a payment provider to process
 * the absence of a payment. The price rule lives in `claim_free_skin`, not
 * here: this action's whole job is turning its refusal into a sentence.
 *
 * Still an account's skin, like every other: `requireUser` is what makes it
 * bindable, so a free skin is free of *money* rather than free of signing in.
 */
export async function claimFreeSkin(skinId: string): Promise<SkinActionResult> {
  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: SHOP_CLOSED }

  const { data, error } = await supabase.rpc('claim_free_skin', {
    p_skin_id: skinId,
    p_user_id: user.id,
  })

  if (error) return { ok: false, error: 'That did not work. Try again.' }

  switch (data) {
    case 'ok':
      revalidatePath('/skins')
      return { ok: true }
    case 'owned':
      return { ok: true, message: 'You already own this skin.' }
    case 'inactive':
      return { ok: false, error: 'That skin is no longer on the shelf.' }
    case 'not_free':
      return { ok: false, error: 'That skin has a price.' }
    default:
      return { ok: false, error: 'That skin is not on the shelf.' }
  }
}

// ---------------------------------------------------------------------------
// Buying with money
// ---------------------------------------------------------------------------

/**
 * Buy a regular skin through Stripe Checkout.
 *
 * One-off `mode: 'payment'`, unlike the tier checkouts - a skin is not a
 * subscription. The price comes off the catalogue row inside this action;
 * nothing about money arrives from the form. The grant happens in the webhook
 * when `checkout.session.completed` comes back with our metadata, so an
 * abandoned checkout grants nothing and a paid one grants exactly once.
 *
 * Guests can browse but not buy: a skin is bound to the account, and an
 * anonymous session has no email for Stripe's receipt and no account for the
 * skin to be bound to beyond this browser. That refusal is a sentence, not a
 * redirect - the person is mid-shop, and "make an account" is the answer.
 */
export async function startSkinCheckout(skinId: string): Promise<SkinActionResult | never> {
  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: SHOP_CLOSED }

  if (!user.email) {
    return { ok: false, error: 'Skins are bound to an account. Create one to buy.' }
  }

  const { data: skin } = await supabase
    .from('skins')
    .select('id, name, tier, price_cents, active')
    .eq('id', skinId)
    .maybeSingle()

  if (!skin || !skin.active) return { ok: false, error: 'That skin is not on the shelf.' }
  if (skin.tier !== 'skin') return { ok: false, error: 'Super skins are bought with vouchers.' }

  const { data: owned } = await supabase
    .from('skin_ownership')
    .select('skin_id')
    .eq('user_id', user.id)
    .eq('skin_id', skinId)
    .maybeSingle()

  if (owned) return { ok: false, error: 'You already own this skin.' }

  const origin = env.appUrl()

  /**
   * The catalogue product, when there is one.
   *
   * Every skin is one line on one product rather than a product per skin: what
   * varies between them is a name and three euros, and a Stripe catalogue with
   * a row per costume is a report nobody can read. Which skin was bought is in
   * the metadata below, where the webhook already looks.
   *
   * Falling back to `product_data` keeps a deployment that never made the
   * product selling correctly - it just gets an ad-hoc product per session.
   */
  const product = env.stripeProductSkin()

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    managed_payments: { enabled: false },
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: skin.price_cents,
          ...(product
            ? { product }
            : { product_data: { name: `Skin · ${skin.name}` } }),
        },
      },
    ],
    // How the webhook knows this session is a skin and whose. The user id
    // rides in metadata because a one-off payment has no subscription for it
    // to live on.
    metadata: { kind: 'skin', skinId: skin.id, userId: user.id },
    success_url: `${origin}/skins?checkout=success`,
    cancel_url: `${origin}/skins?checkout=canceled`,
  })

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL' }
  }

  redirect(session.url)
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

const skinSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'A skin needs a name').max(60),
  tier: z.enum(['skin', 'super']),
  priceCents: z.number().int().min(0).max(100_000),
  voucherCost: z.number().int().min(1).max(10),
  backstory: z.string().trim().max(2000),
  active: z.boolean(),
})

/**
 * Rewrite one shelf row: the words, the price, the tier, the availability.
 *
 * A whole-row save, like saveWorld - the form posts every field, so omitting
 * one here would blank it there. The id is the XP catalogue's and is not
 * editable; a skin whose art moved is a new row, because the old id is what
 * ownership rows point at.
 */
export async function saveSkin(input: {
  id: string
  name: string
  tier: 'skin' | 'super'
  priceCents: number
  voucherCost: number
  backstory: string
  active: boolean
}): Promise<SkinActionResult> {
  const parsed = skinSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid skin' }
  }

  const { user, admin } = await requireBackofficeSection('skins', 'write')

  const { error } = await admin
    .from('skins')
    .update({
      name: parsed.data.name,
      tier: parsed.data.tier,
      price_cents: parsed.data.priceCents,
      voucher_cost: parsed.data.voucherCost,
      backstory: parsed.data.backstory,
      active: parsed.data.active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)

  if (error) {
    return { ok: false, error: `Could not save the skin: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'skins',
    action: 'skin.save',
    summary: `${parsed.data.name} (${parsed.data.id}): ${parsed.data.tier}, ${
      parsed.data.tier === 'super'
        ? `${parsed.data.voucherCost} vouchers`
        : `€${(parsed.data.priceCents / 100).toFixed(2)}`
    }, ${parsed.data.active ? 'on sale' : 'retired'}`,
  })

  revalidatePath('/ovaloffice/skins')
  revalidatePath('/skins')
  return { ok: true }
}

/**
 * Mint voucher codes, unclaimed, for handing out.
 *
 * Capped per call not because 200 would break anything but because a typo in
 * a count field should produce a refusal, not a drawer of confetti.
 */
export async function mintSkinVouchers(
  count: number,
): Promise<{ ok: false; error: string } | { ok: true; codes: string[] }> {
  const n = Math.floor(count)
  if (!Number.isFinite(n) || n < 1 || n > 50) {
    return { ok: false, error: 'Mint between 1 and 50 codes at a time.' }
  }

  const { user, admin } = await requireBackofficeSection('skins', 'write')

  const rows = Array.from({ length: n }, () => ({
    code: mintPromoCode('SKIN'),
    source: 'backoffice' as const,
    created_by: user.id,
  }))

  const { error } = await admin.from('skin_vouchers').insert(rows)

  if (error) {
    return { ok: false, error: `Could not mint: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'skins',
    action: 'voucher.mint',
    summary: `minted ${n} skin voucher${n === 1 ? '' : 's'}`,
  })

  revalidatePath('/ovaloffice/skins')
  return { ok: true, codes: rows.map((row) => row.code) }
}
