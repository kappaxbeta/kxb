/**
 * Skins: what is shared between the shop, the backoffice and the XP mounts.
 *
 * Client-safe on purpose, like promo/application.ts - the shop page renders
 * outcomes and thumbnails in the browser, so nothing in here may touch a
 * request, a secret, `node:crypto` or the database. The words for refusals
 * live here for the same reason the promo ones do: the SQL returns codes, and
 * the sentences belong with the rest of the copy.
 */

/** A row off the shelf, camel-cased for the components. */
export interface SkinView {
  id: string
  name: string
  tier: 'skin' | 'super'
  priceCents: number
  voucherCost: number
  backstory: string
  active: boolean
}

/** A voucher in your pocket: claimed, unspent. */
export interface VoucherView {
  id: string
  code: string
  /** `purchase` arrived with bucks: money buys these now, not skins. */
  source: 'backoffice' | 'subscription' | 'gift' | 'purchase'
  createdAt: string
}

/** What the shop page needs to draw itself for one person. */
export interface ShopView {
  open: boolean
  skins: SkinView[]
  /** skin id -> how it was gained. Empty for a browser with no session. */
  owned: Record<string, string>
  vouchers: VoucherView[]
  /** The equipped skin's id, or null for the dummy. */
  chosen: string | null
  /** False for the fully signed-out, who may browse but not buy. */
  signedIn: boolean
}

/**
 * The thumbnail the XP pipeline already draws for every model.
 *
 * `model` is a qualified catalogue id (`adventurers/Knight`), and the thumbs
 * tree is laid out as `/xp/thumbs/<pack>/<name>.webp` - so the id *is* the
 * path. No lookup table to drift; catalogue.test.ts is what guarantees the
 * file exists.
 */
export function skinThumbUrl(model: string): string {
  return `/xp/thumbs/${model}.webp`
}

/**
 * The refusals, as sentences.
 *
 * Every code either function can return is here, plus a default, because the
 * SQL will grow refusals before this file hears about it and "something went
 * wrong" is better than `undefined` in a toast.
 */
export function redeemOutcomeCopy(outcome: string): string {
  switch (outcome) {
    case 'ok':
      return 'The voucher is yours.'
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

export function claimOutcomeCopy(outcome: string): string {
  switch (outcome) {
    case 'ok':
      return 'The skin is yours.'
    case 'unknown_skin':
      return 'That skin is not on the shelf.'
    case 'inactive':
      return 'That skin is no longer on the shelf.'
    case 'owned':
      return 'You already own this skin.'
    case 'not_free':
      return 'That skin has a price.'
    default:
      return 'That did not work. Try again.'
  }
}

export function spendOutcomeCopy(outcome: string): string {
  switch (outcome) {
    case 'ok':
      return 'The skin is yours.'
    case 'unknown_skin':
      return 'That skin is not on the shelf.'
    case 'inactive':
      return 'That skin is no longer for sale.'
    case 'owned':
      return 'You already own this skin.'
    case 'short':
      return 'Not enough vouchers.'
    default:
      return 'That did not work. Try again.'
  }
}
