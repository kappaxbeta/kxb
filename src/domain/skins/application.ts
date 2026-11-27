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
  /**
   * The skin this row is a *colour* of, or null for one sold in its own right.
   *
   * Set means it is never a card of its own: the shop draws it as a swatch on
   * its parent's card, and whoever owns the parent may wear it. See the
   * migration that added the column for why paint is not a second purchase.
   */
  variantOf: string | null
}

/**
 * The colours of one skin: the skin itself first, then whatever is painted
 * from it.
 *
 * Ordered rather than sorted, and the parent leads on purpose - it is the one
 * on the shelf, the one the price belongs to and the one somebody bought, so a
 * card that opened on a colour would be showing a thing nobody chose. Every
 * caller wants the same list, which is why it is here and not three `filter`s
 * in the shop.
 */
export function coloursOf(skin: SkinView, all: readonly SkinView[]): SkinView[] {
  return [skin, ...all.filter((entry) => entry.variantOf === skin.id)]
}

/**
 * Do you own this - counting a colour of it as the same purchase?
 *
 * The client-side twin of the `profile_skins` write policy, and it must keep
 * saying the same thing: the policy is what actually adjudicates, this is only
 * what stops the page offering a button the database will refuse.
 */
export function ownsSkin(skin: SkinView, owned: Record<string, string>): boolean {
  return Boolean(owned[skin.id] ?? (skin.variantOf ? owned[skin.variantOf] : undefined))
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
