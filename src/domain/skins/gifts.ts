'use server'

/**
 * Buying a skin for somebody else.
 *
 * Two halves of one present: `giftSkin` spends your bucks and hands back a
 * code, `claimSkinGift` turns that code into somebody's skin. Both refusals
 * come back as sentences rather than codes, for the reason the promo module
 * gives at length - the SQL knows what went wrong, and the copy for it belongs
 * with the rest of the words.
 *
 * The code is minted here rather than in SQL so every code on the platform
 * comes off one alphabet: the promo mint's, chosen for surviving being read
 * aloud down a phone.
 */

import { revalidatePath } from 'next/cache'
import { mintPromoCode } from '@/domain/promo/mint'
import { resolveFeatures } from '@/domain/flags/queries'
import { requireUser } from '@/lib/auth'

export type GiftResult =
  | { ok: false; error: string }
  | { ok: true; code: string }

export type ClaimResult =
  | { ok: false; error: string }
  | { ok: true; message: string }

export async function giftSkin(skinId: string, message: string): Promise<GiftResult> {
  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: 'The skin shop is not open.' }

  const code = mintPromoCode('SKIN')

  const { data, error } = await supabase.rpc('gift_skin', {
    p_skin_id: skinId,
    p_user_id: user.id,
    p_code: code,
    p_message: message.trim().slice(0, 200),
  })

  if (error) return { ok: false, error: 'That did not work. Try again.' }

  switch (data) {
    case 'ok':
      revalidatePath('/skins')
      return { ok: true, code }
    case 'short':
      return { ok: false, error: 'Not enough bucks for that one.' }
    case 'inactive':
      return { ok: false, error: 'That skin is no longer for sale.' }
    case 'unknown_skin':
      return { ok: false, error: 'That skin is not on the shelf.' }
    default:
      return { ok: false, error: 'That did not work. Try again.' }
  }
}

export async function claimSkinGift(code: string): Promise<ClaimResult> {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: 'Type a code.' }

  const { user, supabase } = await requireUser()

  const { data, error } = await supabase.rpc('claim_skin_gift', {
    p_code: trimmed,
    p_user_id: user.id,
  })

  if (error) return { ok: false, error: 'That did not work. Try again.' }

  switch (data) {
    case 'ok':
      revalidatePath('/skins')
      return { ok: true, message: 'Opened — the skin is yours.' }
    // The gift is consumed either way, so this is a message rather than a
    // refusal: telling somebody their present was a duplicate is kinder than
    // telling them their code was rejected.
    case 'owned':
      revalidatePath('/skins')
      return { ok: true, message: 'A lovely thought — you already own that one.' }
    case 'taken':
      return { ok: false, error: 'That present has already been opened.' }
    case 'yours':
      return { ok: false, error: 'That is the one you sent. Pass the code on.' }
    case 'unknown':
      return { ok: false, error: 'No present has that code.' }
    default:
      return { ok: false, error: 'That did not work. Try again.' }
  }
}
