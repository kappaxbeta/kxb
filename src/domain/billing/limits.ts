import {
  type LimitKey,
  type Tier,
  tierLimit,
} from '@/domain/billing/tiers'

/**
 * How many of a thing this space may have, once everything has had its say.
 *
 * Three rungs, and they are three genuinely different controls rather than
 * three copies of one. `docs/product/pricing.md` §10 is the argument; this is
 * the rule.
 *
 *   1. **The tier** - what they bought. Always has an opinion. Constants in
 *      `tiers.ts`, changed by a commit, because it moves the public pricing
 *      table and has to agree with Stripe.
 *   2. **The override** - what an operator granted *this space*. A comp, a
 *      partner, a beta tester, an event that needs the room for a weekend. A
 *      per-tenant valued flag, changed from the backoffice, no deploy.
 *   3. **The ceiling** - what the installation will tolerate at all. A capacity
 *      valve, not a commercial control: "nothing over 200 seats while we are on
 *      one box". The flag's global default.
 *
 * `docs/product/pricing.md` §10 sketches this as `override ?? tier ?? global`,
 * which is the shape but not the rule. `??` asks which rung has an *opinion*,
 * and that is the wrong question here: the tier always has one, and `null`
 * means unlimited rather than "no answer". So the worked version is:
 *
 *     effective = min(max(tier, override), ceiling)
 *
 * which says the two things the sketch was reaching for and one it missed:
 * an override can only ever *raise* what was bought, and a platform ceiling
 * clamps everybody including the comped.
 *
 * Pure, and deliberately so. Every subtlety here - what beats what, which way
 * `null` goes, whether zero is a limit or an absence - is decided in this file
 * and tested in `limits.test.ts`. Fetching the numbers is plumbing and lives
 * apart, in the same split `capacity.ts` draws from `occupancy.ts`.
 */

/**
 * No cap at all, spelled the way the whole codebase spells it.
 *
 * `null`, matching both `TierLimits` and the valued flags, where "off means
 * unlimited" already avoids a sentinel. Worth an exported name because
 * `limit === null` at a call site reads like a missing value rather than an
 * answer, and the two mean opposite things here.
 */
export const UNLIMITED = null

export type Limit = number | null

/**
 * The more generous of two limits, where unlimited beats every number.
 *
 * This is where the `null` convention earns itself. Written with numbers and a
 * sentinel - say `-1` for unlimited - `Math.max` would be correct by accident
 * for that spelling and catastrophically wrong for `0`, which is a real limit
 * meaning none. Naming the case makes both behave.
 */
export function maxLimit(a: Limit, b: Limit): Limit {
  if (a === UNLIMITED || b === UNLIMITED) return UNLIMITED
  return Math.max(a, b)
}

/** The stricter of two limits. Unlimited loses to any number. */
export function minLimit(a: Limit, b: Limit): Limit {
  if (a === UNLIMITED) return b
  if (b === UNLIMITED) return a
  return Math.min(a, b)
}

export interface LimitInput {
  /** What this space bought. */
  tier: Tier
  /** Which quantity is being asked about. */
  key: LimitKey
  /**
   * An operator's number for this space, or undefined when none is set.
   *
   * `undefined` and `UNLIMITED` are different answers and both are meaningful:
   * no override at all leaves the tier alone, while an override of `UNLIMITED`
   * is somebody deliberately taking the cap off this one space.
   */
  override?: Limit | undefined
  /**
   * The installation's own ceiling, or undefined when it imposes none.
   *
   * Applied after the override on purpose - see the note on `resolveLimit`.
   */
  ceiling?: Limit | undefined
}

/**
 * The limit in force.
 *
 * The ceiling is applied *last*, after the override, and that ordering is the
 * only interesting decision in this function. It means a platform ceiling
 * clamps a comped space too, which is the point: the ceiling exists because a
 * box has a size, and a customer we were generous to does not make the box
 * bigger. An operator who genuinely needs to exceed it is asking for a capacity
 * change, and should have to notice that.
 */
export function resolveLimit({ tier, key, override, ceiling }: LimitInput): Limit {
  const bought = tierLimit(tier, key)
  const granted = override === undefined ? bought : maxLimit(bought, override)
  return ceiling === undefined ? granted : minLimit(granted, ceiling)
}

/**
 * Is a space holding `count` of these allowed one more?
 *
 * The question every create path actually asks, rather than making each one
 * remember that `null` is unlimited and that the comparison is `<` and not
 * `<=`. Both of those have exactly one right answer and no call site should be
 * the place it gets decided again.
 */
export function withinLimit(count: number, limit: Limit): boolean {
  return limit === UNLIMITED || count < limit
}

/**
 * How many more they may have, or null for "as many as they like".
 *
 * Never negative. A space can sit *over* its cap perfectly legitimately - a
 * downgrade leaves members in place rather than removing anybody, see
 * `docs/product/pricing.md` §7 - and "-3 remaining" is not something any caller
 * wants to reason about or any interface wants to render.
 */
export function remaining(count: number, limit: Limit): number | null {
  if (limit === UNLIMITED) return null
  return Math.max(0, limit - count)
}

/**
 * Is this space over a cap it used to be under?
 *
 * The downgrade question, and separate from `withinLimit` because the answers
 * differ in the case that matters. A space at exactly its cap is not over it
 * but may not add; a space above its cap after a downgrade is over it and is
 * still not asked to remove anything. The two callers are the shelving rule and
 * the create path, and conflating them is how a downgrade starts deleting.
 */
export function overLimit(count: number, limit: Limit): boolean {
  return limit !== UNLIMITED && count > limit
}

/**
 * Which valued flag carries the override for each limit.
 *
 * The mapping is here rather than in `flags/keys.ts` because it is a fact about
 * *billing* - the flags module has no business knowing that a tier exists. Two
 * of these predate tiers entirely: `seat_limit` and `guest_limit` shipped as
 * platform ceilings with per-space overrides, which is exactly rungs 2 and 3
 * above, so they are adopted rather than replaced.
 */
export const LIMIT_FLAGS = {
  seats: 'seat_limit',
  guests: 'guest_limit',
  xoPlaces: 'xo_place_limit',
  xpPlaces: 'xp_place_limit',
  projects: 'project_limit',
  matches: 'match_limit',
  pages: 'page_limit',
  pictures: 'picture_limit',
} as const satisfies Partial<Record<LimitKey, string>>

/**
 * The magazine has no flag, and that is deliberate.
 *
 * It is unlimited on every tier that has one at all, so there is no number for
 * an operator to raise. If free ever gets a magazine - open question 3 in
 * `docs/product/pricing.md` - it becomes unlimited there too, and this stays
 * true. A flag guarding a cap nobody can reach is a control panel for nothing.
 */
export type FlaggedLimitKey = keyof typeof LIMIT_FLAGS
