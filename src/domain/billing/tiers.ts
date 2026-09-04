/**
 * The three things a space can be, and how much of the product each one holds.
 *
 * `xo` and `xp` used to be the whole model: two halves of the product, and the
 * price bought you which half. That is no longer true - every paid tier now
 * holds some of both, and the words describe two kinds of *place* rather than
 * two kinds of plan. `docs/product/pricing.md` is the argument; this file is
 * the numbers.
 *
 * Pure, and importable from a Client Component. That is the constraint that
 * shaped this file, and the reason the Stripe price ids are *not* here: they
 * come from the environment, which means `server-only`, which would put the
 * labels and the prices out of reach of the pricing table on the landing page.
 * Same split, and the same reason, as `promo/application.ts` and `promo/mint.ts`.
 * The price mapping lives next door in `prices.ts`.
 *
 * It is also why the limits below are constants rather than rows. Making them
 * editable at runtime would move them behind an async read, and the marketing
 * page - a Client Component that names every number - would need them threaded
 * through it. What a *tier* includes changes twice a year, moves the public
 * pricing table, and has to agree with what Stripe is charging; it wants a
 * commit and a review, not a text field. What *one space* gets is a different
 * question with a different answer - see `limits.ts`.
 *
 * The tier is a fact about a *space*, not about a person. One account may own a
 * quiet free space for a book club and an xp space for the thing it is actually
 * building, and neither should have to be the other. That is why it hangs off
 * `subscriptions_read_model` - the row that already exists per tenant - rather
 * than off `user_entitlements`, which counts seats per person.
 */

export type Tier = 'free' | 'xo' | 'xp'

/** A tier somebody can actually buy. `free` is arrived at, not purchased. */
export type PaidTier = Exclude<Tier, 'free'>

export const TIERS = ['free', 'xo', 'xp'] as const

/**
 * The tiers with a Stripe price behind them.
 *
 * Every list of *buttons* iterates this, not `TIERS`. A "choose free" button on
 * the billing page would be a checkout that cannot be built - `priceForTier`
 * takes a `PaidTier` precisely so that mistake is a compile error rather than a
 * throw in front of somebody trying to pay us.
 */
export const PAID_TIERS = ['xo', 'xp'] as const satisfies readonly PaidTier[]

// ---------------------------------------------------------------------------
// The limits
// ---------------------------------------------------------------------------

/**
 * Every capped quantity, per tier.
 *
 * **`null` means unlimited, and it is not a placeholder.** That convention is
 * borrowed from the valued flags in `flags/keys.ts`, where "off means
 * unlimited" already avoids a magic sentinel, and it has to match: these
 * numbers and those overrides are resolved against each other in `limits.ts`,
 * and two different spellings of "no cap" meeting in one `Math.max` is the kind
 * of bug that only shows up on a comped account.
 *
 * `0` is a real limit and means none at all - free holds no projects, and that
 * is different from holding unlimited ones.
 */
export interface TierLimits {
  /** Members who belong to the space. The owner occupies one. */
  seats: number | null
  /**
   * Strangers standing in the space at once - not invite links, and not visits.
   *
   * Concurrency rather than tokens, matching the `guest_limit` flag that
   * already ships. One link may bring thirty people across an afternoon and
   * never breach a cap of three, and a guest leaving frees the place. It is
   * also what makes the headline number honest: "9 people" is then literally
   * true, rather than six members plus three doors that might admit nobody.
   */
  guests: number | null
  /** Rooms that are not levels - `RoomView.xpRef === null`. The lobby is not one. */
  xoPlaces: number | null
  /** Rooms that are levels - `RoomView.xpRef !== null`. */
  xpPlaces: number | null
  /** XPs copied onto the space's own shelf. Unlimited wherever it exists. */
  magazine: number | null
  /**
   * XPs the whole space can see - `space_policy` of `view` or `edit`.
   *
   * This used to be "XPs this space may edit", one number regardless of who
   * could see it, and `docs/product/economy.md` §8.2 splits that into three:
   * private, team and public, priced differently because they cost different
   * things. This key is the *team* one.
   *
   * It keeps its old name deliberately. `LIMIT_FLAGS` maps it to a
   * `project_limit` flag row that exists in production with overrides hanging
   * off it, and renaming a key here would silently orphan every one of them -
   * a space that was comped extra projects would find the comp had stopped
   * applying, with nothing in any log to say why. The name is stale; the row is
   * real.
   */
  projects: number | null
  /** Open battles at once. Concurrency, never a monthly allowance. */
  matches: number | null
  /** Written pages the space may hold. */
  pages: number | null
  /**
   * Images uploaded into this space. Not the pictures that ship with the
   * product - those are a platform catalogue in `domain/pictures` and cost a
   * customer nothing.
   *
   * The only limit here counting bytes somebody sent us rather than rows in a
   * table, which is why it is the tightest number on the board. `uploads.ts`
   * caps one file at 10 MB and nothing caps how many, so a space on the old
   * model could hold a hundred gigabytes and pay €5 for it.
   */
  pictures: number | null
  /**
   * XPs only their owner can see - `space_policy = 'none'`, plus whoever they
   * named. `docs/product/economy.md` §8.2.
   *
   * Free holds none, and that is the tier's story rather than a gap: **free is
   * public by default, and paying is what buys privacy.** It reads as a bug in
   * the table, which is why it is written down here as well as there.
   */
  privateXps: number | null
  /** XPs in the catalogue - `state = 'published'`. */
  publicXps: number | null
  /**
   * Blueprints in the space's workshop. Vehicles are not counted here - they
   * are their own line, because they are priced two orders of magnitude apart.
   */
  blueprints: number | null
  /** Animator clips the space has saved. */
  clips: number | null
  /**
   * Vehicles. **Zero on every tier**, and that is a real limit meaning none
   * rather than a number nobody got round to setting.
   *
   * A vehicle has no allowance on any plan: every one of them is bought with
   * coins, at a price that differs by tier. It is in this table anyway so that
   * the counting path is the same for all five - a quantity enforced by a
   * different mechanism from its neighbours is the one that gets forgotten.
   */
  vehicles: number | null
}

/** Every limit there is, for iterating. */
export type LimitKey = keyof TierLimits

export const LIMIT_KEYS = [
  'seats',
  'guests',
  'xoPlaces',
  'xpPlaces',
  'magazine',
  'projects',
  'matches',
  'pages',
  'pictures',
  'privateXps',
  'publicXps',
  'blueprints',
  'clips',
  'vehicles',
] as const satisfies readonly LimitKey[]

/**
 * What each tier holds. The table in `docs/product/pricing.md` §1.
 *
 * Two numbers here are deliberately doing no work, and are written down rather
 * than quietly dropped:
 *
 *   - **free's 5 matches.** Three people can sustain one match, so the seat cap
 *     already enforces this and the number can never bind. It is a ceiling, not
 *     a feature, and the copy must not sell it as one.
 *   - **xoPlaces, 20 against 30.** Nine people cannot fill twenty rooms and
 *     twenty cannot fill thirty. Rooms exist to spread load - see the argument
 *     in `rooms/capacity.ts` - and at these seat counts nobody needs more than
 *     three. `docs/product/pricing.md` §4 recommends making both unlimited and
 *     letting seats and xp do all the arguing; until that is decided, the
 *     numbers as specified are what is here.
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    seats: 2,
    guests: 1,
    /**
     * Five rooms, where it used to be none.
     *
     * The old note said "the lobby, and nothing else", and the reasoning behind
     * it was sound for a plan whose free space was a demonstration: the lobby is
     * not a room row, so zero extra places still left somewhere to stand.
     *
     * What it missed is what a room *is* here. A room is not a premium feature;
     * it is how a group with more than one thing going on stops holding both in
     * the same space - and a free space that cannot make one is a free space
     * where the second conversation has nowhere to go. Nobody upgrades because
     * of that. They just stop.
     *
     * Five is the number that answers this without answering the next one:
     * enough that a small group never bumps into it, few enough that a busy
     * space still meets it - and rooms exist to spread realtime load, so the
     * cap is a real thing rather than a paywall (see `rooms/capacity.ts`).
     * `docs/product/pricing.md` §4's suggestion - make places unlimited and let
     * seats and xp do the arguing - is still the direction; this is the same
     * argument applied to the tier that had none.
     *
     * The seat cap keeps doing the work it always did: two seats and one guest
     * is not a community, however many rooms it has.
     */
    xoPlaces: 5,
    /**
     * One level to play, and one to edit. Both were zero.
     *
     * ---------------------------------------------------------------------------
     * Why free stopped holding none
     * ---------------------------------------------------------------------------
     * Zero here made the whole XP half of the product invisible to anybody who
     * had not paid, which sounds like the point of a free tier and was not: an
     * XP is the thing this platform is *for*, and a plan that lets you collect
     * levels forever and open none of them is a demo of a shelf. Somebody on
     * free could not find out whether they wanted the thing they were being
     * asked to buy.
     *
     * One of each was the smallest number that is still the product: one place
     * means a level can be stood in and played with a friend, one project means
     * a level can be made.
     *
     * Four places, now, for the same reason the rooms above went to five. One
     * place is a demonstration - you can play *a* level - and the thing being
     * demonstrated is a shelf you swap between. With one, every new level means
     * taking the last one down, which is the wall landing on the exact person
     * who is enjoying it most. Four is a small collection you can keep open.
     *
     * `projects` stays at one deliberately, and the asymmetry is the point:
     * playing is what invites people in, and *authoring* is what the paid tiers
     * are for. The wall stays where it was - on the second level somebody
     * wants to build.
     *
     * The seat cap does the rest of the work: two seats and one guest is not a
     * community, whatever it is playing.
     */
    xpPlaces: 4,
    /**
     * Unlimited, even here. The one thing free is not stingy with, and
     * deliberately.
     *
     * A shelved XP costs storage and nothing else, so metering it buys us
     * nothing. It used to be argued the other way round - free held no places
     * and no projects, so a shelf was a collection you could never play, and
     * the wall was moved to "load this into a place" on purpose. Free now holds
     * one of each, so the shelf is a shelf: collect everything, play one at a
     * time.
     */
    magazine: null,
    projects: 1,
    matches: 5,
    // One page. Enough to say what the space is and who is in it, which is the
    // whole job a free space's page has.
    pages: 1,
    pictures: 0,
    /**
     * None. Free is public by default and paying buys privacy - see the field's
     * own note. There is no price to lift this either: `EXTRA_PRICES` holds
     * `null` for free, so it is not "expensive here", it is not on offer.
     */
    privateXps: 0,
    /**
     * Ten, where authoring used to stop at one.
     *
     * The old `projects: 1` was the wall the whole free tier was built around,
     * and it stays exactly where it was for *team* levels. What moved is the
     * levels somebody publishes: those are content this platform wants, played
     * by people who are not in the space and do not have an account, and
     * charging the author for the privilege of giving them to us had the
     * incentive precisely backwards.
     */
    publicXps: 10,
    // Three. Enough to make a thing, put it somewhere, and want a fourth.
    blueprints: 3,
    clips: 5,
    vehicles: 0,
  },
  xo: {
    seats: 6,
    guests: 3,
    xoPlaces: 20,
    xpPlaces: 4,
    magazine: null,
    projects: 3,
    matches: 15,
    pages: null,
    pictures: 10,
    privateXps: 10,
    publicXps: 100,
    blueprints: 30,
    clips: 20,
    vehicles: 0,
  },
  xp: {
    seats: 12,
    guests: 8,
    xoPlaces: 30,
    xpPlaces: 10,
    magazine: null,
    projects: null,
    matches: 30,
    pages: null,
    pictures: 100,
    /**
     * A hundred private levels, and not unlimited - the only counter on this
     * tier that has a number at all where its neighbours have `null`.
     *
     * That asymmetry is deliberate. Public and team levels are unlimited here
     * because both are *shared*: somebody else can see them, so they are part
     * of what the space is doing. A hundred private drafts is already more than
     * anybody has, and the cap exists so that "unlimited storage, addressed by
     * nobody" is not a thing this plan quietly sells.
     */
    privateXps: 100,
    publicXps: null,
    blueprints: 100,
    clips: 100,
    vehicles: 0,
  },
}

/** What this tier alone allows, before any override. `null` is unlimited. */
export function tierLimit(tier: Tier, key: LimitKey): number | null {
  return TIER_LIMITS[tier][key]
}

/**
 * A tier's limits, read out of a row that only says what differs.
 *
 * `free` is the base and states all nine; every other row is sparse and merged
 * over it. Absent means *inherit*, `null` means *unlimited*, and the difference
 * is load-bearing - xp's `{"projects": null}` is "as many as you like", where
 * omitting the key would have meant "three, the same as xo". A plain spread
 * gets this right for free, which is most of why the encoding was chosen.
 *
 * Pure, and total over anything: this parses a `jsonb` column, which means it
 * parses whatever somebody typed into the backoffice. Every value that is not a
 * non-negative integer or an explicit null is *dropped* rather than coerced -
 * `"12"` becomes inherit rather than twelve. Coercing would let a string in a
 * form quietly become a cap, and a cap nobody meant is the one failure mode
 * this table adds that the constants never had.
 */
export function mergeLimits(base: TierLimits, patch: unknown): TierLimits {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return base

  const merged = { ...base }
  const source = patch as Record<string, unknown>

  for (const key of LIMIT_KEYS) {
    if (!Object.hasOwn(source, key)) continue

    const value = source[key]
    if (value === null) {
      merged[key] = UNLIMITED_LIMIT
      continue
    }

    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      merged[key] = value
    }
    // Anything else is left at the inherited value. See above.
  }

  return merged
}

/**
 * `null`, spelled once so the merge above reads as an answer rather than a hole.
 *
 * The same value `limits.ts` exports as `UNLIMITED`; not imported from there
 * because that module imports this one, and a cycle between the table and the
 * rule that reads it would be a poor trade for one constant.
 */
const UNLIMITED_LIMIT = null

// ---------------------------------------------------------------------------
// The one limit that is not about a space
// ---------------------------------------------------------------------------

/**
 * How many *free* spaces one account may own.
 *
 * The only cap in this file that hangs off a person rather than a space, and it
 * has to: every number above is a property of one tenant, and "how many tenants
 * may you have" cannot be. It resolves against a `user`-scoped override rather
 * than a `tenant`-scoped one - `FeatureScope` in `flags/keys.ts` already has
 * both - which is the whole reason that scope exists.
 *
 * Three rules, and the second and third are what stop this being mean:
 *
 *   - **Owning free spaces is capped at one.** Otherwise the free tier is not a
 *     free tier, it is unmetered hosting for anybody willing to click "new
 *     space" twice.
 *   - **Owning paid spaces is not capped at all.** A subscription is per space -
 *     the note at the top of this file - so a second space is not a loophole,
 *     it is a purchase. "You can buy another one" is a complete answer to
 *     somebody who has hit this, and it needs no new mechanism.
 *   - **Being a *member* of other people's spaces is never capped.** This is the
 *     one worth guarding in review. A cap on membership would mean somebody's
 *     free space stops them being invited to their friends' spaces, which
 *     punishes exactly the people who bring other people here, to save nothing:
 *     a member costs the space that invited them, and that space is already
 *     paying its own seat cap for the privilege.
 */
export const FREE_SPACES_PER_ACCOUNT = 1

/**
 * Does owning a space of this tier count against `FREE_SPACES_PER_ACCOUNT`?
 *
 * A function rather than `tier === 'free'` at four call sites, because the
 * question is "does this one pay for itself" and that is the thing a fourth
 * tier would have to answer too.
 */
export function countsAgainstFreeSpaces(tier: Tier): boolean {
  return !isPaidTier(tier)
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

export interface TierDefinition {
  /** What it costs a month, in minor units. Never a float - see the billing migration. */
  cents: number
  /** The name on the button. Lowercase on purpose: these are the product's own words. */
  label: string
  /** One line, for a card. */
  tagline: string
  /**
   * What you get, for the pricing table.
   *
   * Plain strings, with no "not built yet" marker on any of them. The landing
   * page does split xp's list into shipped and soon - see `pricing.monthly.xp`
   * in i18n/landing.ts - and that split deliberately lives there rather than
   * here. The landing page is read by strangers deciding whether to trust us;
   * the billing page is read by somebody who already has an account and is
   * picking a plan, and the honest thing on *that* page is the flag that stops
   * them buying xp at all. Two audiences, two answers, and folding them into
   * one list would give the wrong one to somebody.
   */
  includes: string[]
  /** What you do not get, so the cheaper card is honest about it. */
  excludes: string[]
}

export const TIER_DETAILS: Record<Tier, TierDefinition> = {
  free: {
    cents: 0,
    label: 'free',
    tagline: 'Your own space, for you and one other.',
    /*
     * Three lines are new here, and they are the copy catching up with the
     * table above rather than a change of plan.
     *
     * Free has held five rooms, four XP places and one project since
     * `xpPlaces` stopped being a rung and became a quantity - the notes on
     * `free.xoPlaces` and `free.xpPlaces` are the argument. Every surface that
     * quotes a plan was still describing the tier before that: a free space
     * that could shelve XPs and open none of them. Somebody reading it decided
     * against the product for a reason that had stopped being true, which is
     * the one kind of stale copy that costs money.
     */
    includes: [
      'The lounge, with emotes and chat',
      'Two of you, and one guest at a time',
      'Five rooms of your own, and an unlimited magazine',
      '4 XP places, and one XP you can edit',
      'Matches: all against all, teams, one against everyone, football, races',
      'One page',
      'It is yours, and it stays here',
    ],
    /*
     * `The XP suite` used to be the third of these, and dropping it is the
     * point of the change: what free is short of is *authoring* room - one
     * project against xo's three - not the suite. The wall is where
     * `projects: 1` put it, on the second level somebody wants to build, and
     * saying so is a better upgrade argument than a locked door was.
     *
     * `More rooms than the lobby` went with it, and for the same reason: free
     * holds five.
     */
    excludes: ['Uploading images', 'More than one XP you can edit'],
  },
  xo: {
    cents: 500,
    label: 'xo',
    tagline: 'Room for the group, and a shelf to build from.',
    includes: [
      'Six of you, and three guests at a time',
      '20 rooms of your own, plus worlds, scenes and radio',
      'An unlimited magazine — shelve any XP there is',
      '4 XP places, and 3 XPs you can edit',
      '15 matches at once',
      'Unlimited pages, and 10 images of your own',
    ],
    excludes: ['Unlimited XP projects'],
  },
  xp: {
    /*
     * €15, because that is what the live Stripe price charges.
     *
     * This constant sat at €10 for months against a comment saying it would
     * move on the day a €12 price existed. Neither number was ever true of
     * Stripe: `price_1U2PEG…` is *named* "kxb.team XP €10/mo" and its
     * `unit_amount` is 1500. So the page quoted €10, the till would have taken
     * €15, and only the `xp_sales` flag being off kept that from reaching
     * anybody.
     *
     * Resolved in the direction that costs nobody a surprise: the price object
     * people would actually be charged on is the fact, and the copy moves to
     * meet it. €12 is no longer the plan - see the row in `tiers`, which is
     * what the landing page reads and where this changes next time without a
     * deploy.
     *
     * This is the fallback, not the quote. `readTierTable` prefers the row and
     * lands here only when the query fails, which is exactly when the two must
     * not disagree.
     */
    cents: 1500,
    label: 'xp',
    tagline: 'Everything in xo, and room to build without counting.',
    includes: [
      'Twelve of you, and eight guests at a time',
      '30 rooms of your own',
      'An unlimited magazine',
      '10 XP places, and unlimited XPs you can edit',
      '30 matches at once',
      'Unlimited pages, and 100 images of your own',
      'XP story, XP in VR, and matches fought inside an XP',
    ],
    excludes: [],
  },
}

// ---------------------------------------------------------------------------
// Defaults, and the two different questions they answer
// ---------------------------------------------------------------------------

/**
 * The tier of a space that bought nothing.
 *
 * `free`, and this is a statement of fact rather than a safety choice:
 * `tenant_tier()` returns NULL when no subscription grants this space anything,
 * and a space in that state is now on the free tier rather than locked. Before
 * free existed this constant carried both jobs - "bought nothing" and "we could
 * not tell" - and they have different right answers, so they are now two
 * constants. See `FALLBACK_TIER`.
 */
export const DEFAULT_TIER: Tier = 'free'

/**
 * The tier to assume when the lookup *failed*.
 *
 * Not the same question as `DEFAULT_TIER`, and the difference is the whole
 * reason both exist. A NULL from `tenant_tier()` is an answer: this space has
 * no subscription. An error is the absence of an answer, and everybody who
 * reaches that path while paying us bought at least `xo`.
 *
 * So a lookup outage must not resolve to `free`. That would clamp a paying
 * space to two seats and shelve its rooms for the length of a database blip -
 * the app punishing customers for its own bad minute, which is exactly the
 * failure the flag fallbacks in `flags/keys.ts` are each argued to avoid.
 *
 * `xo` rather than `xp` because the direction still matters at the top end: an
 * outage that briefly hands out the XP suite opens Realtime topics on somebody
 * else's budget, and an outage that briefly hides it costs a support email.
 * Recoverable beats expensive.
 */
export const FALLBACK_TIER: PaidTier = 'xo'

export function isTier(value: unknown): value is Tier {
  return value === 'free' || value === 'xo' || value === 'xp'
}

/** A tier off a form, a URL or a database column, or null if it is not one. */
export function asTier(value: unknown): Tier | null {
  return isTier(value) ? value : null
}

export function isPaidTier(tier: Tier): tier is PaidTier {
  return tier !== 'free'
}

/**
 * A tier off a form that somebody is about to be charged for, or null.
 *
 * Separate from `asTier` because the two guard different things and `free`
 * splits them. `asTier` answers "is this one of our tiers", which `free` is;
 * this answers "is this something a Checkout session can be built for", which
 * it is not. Every path that ends at `priceForTier` parses with this one.
 *
 * Null is a refusal, never a fallback - the argument on `startCheckout`. A
 * request naming `free` at a checkout is a bug or a probe, and quietly selling
 * them xo instead would hide both. Downgrading *to* free is a real thing
 * somebody may want, and it is spelled `cancelSubscription`.
 */
export function asPaidTier(value: unknown): PaidTier | null {
  const tier = asTier(value)
  return tier && isPaidTier(tier) ? tier : null
}

/**
 * Does this tier include the XP suite at all?
 *
 * Was `tier === 'xp'`, and the change is the whole point of this rewrite: xo
 * now holds four XP places, so the question stopped being *which* tier and
 * became *how many*. Kept as a function because plenty of callers genuinely
 * want the yes/no - a rail deciding whether to draw the tab, a route deciding
 * whether it exists - and they should not each have to remember that zero is
 * the boundary and `null` is not zero.
 */
export function includesXp(tier: Tier): boolean {
  const places = tierLimit(tier, 'xpPlaces')
  return places === null || places > 0
}

/**
 * Is `candidate` at least as good as `required`?
 *
 * Written as a rank rather than `=== 'xp'` so that a third tier can be added
 * without hunting down every comparison. Callers ask `tierAtLeast(tier, 'xp')`,
 * which stays true when the ladder grows a rung above it - and a third tier is
 * exactly what happened, which is the argument paying off rather than a
 * coincidence.
 */
const RANK: Record<Tier, number> = { free: 0, xo: 1, xp: 2 }

export function tierAtLeast(candidate: Tier, required: Tier): boolean {
  return RANK[candidate] >= RANK[required]
}

/** "€5" - for a button. The full "€5.00 / month" belongs to `formatMoney`. */
export function tierPrice(tier: Tier): string {
  const cents = TIER_DETAILS[tier].cents
  if (cents === 0) return 'free'
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`
}

/**
 * "€5/month", the phrase that appears in most of the copy.
 *
 * Free reads as "free" rather than "free/month". "€0/month" would be worse
 * again - it invites the reader to wonder what happens in month two.
 */
export function tierPricePerMonth(tier: Tier): string {
  const price = tierPrice(tier)
  return TIER_DETAILS[tier].cents === 0 ? price : `${price}/month`
}
