import {
  isTopper,
  prop as cafeProp,
  refundOf as cafeRefund,
} from '@/domain/cafe/catalog'
import { homeProp, refundOf as homeRefund } from '@/domain/home/catalog'
import type { PlaceId } from '@/domain/homestead/events'
import { recipe } from '@/domain/cafe/recipes'

/**
 * One aggregate, two catalogues.
 *
 * The café and the house were built separately and price things separately -
 * different packs, different props, different refund rules - and neither should
 * have to know the other exists. This is the seam: the decider asks "what does
 * this cost here", and the dispatch on `place` lives in exactly one file.
 *
 * The alternative was a merged catalogue, which would have meant editing two
 * games to add one sofa.
 */

/** What a purchase costs, or undefined when the id is not in that place's shop. */
export function priceOf(place: PlaceId, propId: string): number | undefined {
  if (place === 'cafe') return cafeProp(propId)?.price
  return homeProp(propId)?.price
}

/** What selling it back pays. Each catalogue has its own opinion. */
export function refundOf(place: PlaceId, propId: string): number | undefined {
  if (place === 'cafe') {
    const def = cafeProp(propId)
    return def ? cafeRefund(def) : undefined
  }
  const def = homeProp(propId)
  return def ? homeRefund(def) : undefined
}

/** The height of its worktop, or undefined when it has nothing to stand on. */
export function surfaceOf(place: PlaceId, propId: string): number | undefined {
  if (place === 'cafe') return cafeProp(propId)?.surfaceY
  return homeProp(propId)?.surfaceY
}

/**
 * Whether this is small enough to stand on somebody else's worktop.
 *
 * Café only, and not by oversight: `HomeProp` has no equivalent flag, so the
 * house and the garden refuse every worktop purchase. That is the honest
 * answer rather than a guess - inferring it from `comfort` or from being
 * non-solid would let a bath onto a bedside table.
 */
export function topperOf(place: PlaceId, propId: string): boolean {
  if (place !== 'cafe') return false
  const def = cafeProp(propId)
  return def ? isTopper(def) : false
}

/**
 * A dish's menu price, used only as the ceiling on what a client may claim a
 * customer paid. See `ServeCustomer` in the decider for why a ceiling rather
 * than an exact figure.
 */
export function dishPrice(dish: string): number | undefined {
  return recipe(dish as Parameters<typeof recipe>[0])?.price
}
