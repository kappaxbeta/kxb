import 'server-only'
import { extraPrice, type Purchasable } from '@/domain/bank/prices'
import { economyOn } from '@/domain/bank/purse'
import { hasRoomFor } from '@/domain/billing/quota'
import type { Tier } from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

/**
 * What the next one costs, before anybody presses anything.
 *
 * ---------------------------------------------------------------------------
 * One answer, asked twice
 * ---------------------------------------------------------------------------
 * A create path has to know whether to charge, and the control that starts it
 * has to know whether to print a price. Those are the same question and they
 * must never disagree - a button that says "free" and a server that takes sixty
 * coins is the worst failure this economy can have, and it is exactly the shape
 * a second implementation produces. So both call this.
 *
 * It is a *read*: nothing here charges, records or refuses. `drawBlueprint`
 * turns a `costs` into a `buyExtra`, and the panel turns the same `costs` into
 * a number on a tile.
 *
 * ---------------------------------------------------------------------------
 * Three answers, because `extraPrice` has two kinds of `null`
 * ---------------------------------------------------------------------------
 * There is room; there is no room but this tier may buy one; there is no room
 * and it may not - unlimited already (no next one to sell) or forbidden outright
 * (free's private levels). The last two are the same `null` out of `prices.ts`
 * and the same outcome for a caller: no button. They are one variant here.
 *
 * ---------------------------------------------------------------------------
 * The economy being off means nothing is metered, not that the cap bites
 * ---------------------------------------------------------------------------
 * **This is a deliberate departure from `docs/product/economy.md` §2**, which
 * says that with the economy off "a quota is whatever the tier says with no way
 * to buy past it". That sentence was written about quotas that were already
 * enforced - projects, rooms, pages - where it changes nothing. Applied to the
 * two this file was written for it would change a great deal: blueprints and
 * clips have never been capped by a tier at all, only by the platform ceilings
 * in `blueprint.ts`. Enforcing the tier under an off economy would take every
 * existing free space from two hundred blueprints to three, overnight, with no
 * way to buy past it and nothing in any release note - which is the precise
 * failure §2 exists to prevent, pointed the other way.
 *
 * So: off means unmetered, here as everywhere else. A space opts into being
 * charged *and* into being capped in the same act, and switching the flag off
 * again puts both back. The ceiling in `blueprint.ts` is untouched either way -
 * it is a limit on a real box and was never a paywall.
 */
export type NextPrice =
  /** There is room in the plan. Costs nothing, print nothing. */
  | { kind: 'included' }
  /** Past the plan, and this tier may buy one more at this price. */
  | { kind: 'costs'; coins: number }
  /** Past the plan, and there is no next one to sell on this tier. */
  | { kind: 'refused'; limit: number | null }

export async function nextPrice(
  supabase: Client,
  tenantId: string,
  tier: Tier,
  what: Purchasable,
  /**
   * How many the space already has. The caller's, because counting differs per
   * resource - the same argument `hasRoomFor` makes about its own `count`.
   */
  count: number,
): Promise<NextPrice> {
  if (!(await economyOn(supabase, tenantId))) return { kind: 'included' }

  const { allowed, limit } = await hasRoomFor(supabase, tenantId, tier, what, count)
  if (allowed) return { kind: 'included' }

  const price = extraPrice(tier, what)
  return price === null ? { kind: 'refused', limit } : { kind: 'costs', coins: price }
}

/**
 * The same answer as a number, for a control that only wants to print one.
 *
 * Zero for both of the other two answers, which looks lossy and is not: a tile
 * that cannot be pressed at all is a *refusal*, and a refusal is a sentence
 * rather than a price. `CoinPrice` draws nothing at zero, so a caller passing
 * this through gets the right picture in every case it can draw.
 */
export function coinsOf(next: NextPrice): number {
  return next.kind === 'costs' ? next.coins : 0
}
