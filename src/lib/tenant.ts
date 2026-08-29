import 'server-only'
import type { User } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { getSubscription, type SubscriptionView } from '@/domain/billing/queries'
import {
  asTier,
  DEFAULT_TIER,
  FALLBACK_TIER,
  tierAtLeast,
  tierLimit,
  type Tier,
} from '@/domain/billing/tiers'
import type { EventSurface } from '@/domain/events/presets'
import { type EventView, getEvent, guestCanReach } from '@/domain/events/queries'
import { GUEST_LEFT_PATH } from '@/domain/guests/session'
import type { SpaceCapability } from '@/domain/tenants/events'
import { resolveFeatures } from '@/domain/flags/queries'
import type { FeatureKey, Features } from '@/domain/flags/keys'
import { findTenantIdBySlug } from '@/domain/tenants/queries'
import type { Client } from '@/es/store'
import { requireUser } from '@/lib/auth'
import { asTenantRole, type TenantRoleName } from '@/lib/supabase/types'

export interface TenantContext {
  user: User
  supabase: Client
  tenant: {
    id: string
    slug: string
    name: string
    archived: boolean
    /**
     * The caller's standing here. Guaranteed non-null - somebody with no
     * relationship to this space never gets here.
     *
     * May be `guest`, which is not a membership: somebody who followed a link,
     * holds a `tenant_guests` row, and will stop holding one. Anything deciding
     * what to *show* can treat it as a very limited member; anything deciding
     * what may be *written* should ask `canWrite()`, which refuses guests
     * outright.
     */
    role: TenantRoleName
    /**
     * May this workspace be used right now, as far as billing is concerned?
     *
     * Normally this is "does an owner have a live subscription", answered by a
     * SECURITY DEFINER function - a member cannot read the owner's entitlement
     * row, and should not be able to, so all that crosses the boundary is this
     * boolean.
     *
     * It is forced true when the `billing` flag is off for this caller or this
     * workspace. See the note in requireTenant on why the flag is applied there
     * rather than at each of the eleven call sites that ask.
     */
    entitled: boolean
    /**
     * Is this space shut?
     *
     * The one gate on writing, and only ever because a person decided so -
     * archiving is the owner's action or an admin's. **Billing never sets
     * this.** A space that stops paying lands on `free`, open and capped, which
     * is the whole premise of the free tier: no bank's timing and no webhook's
     * ordering can take a space away from the people using it.
     *
     * Ask this rather than `entitled` for "may they act". `entitled` means *on
     * a paid tier* and is for the upgrade offer, not for the door.
     */
    deactivated: boolean
    /**
     * Which half of the product this space bought: xo or xp.
     *
     * A companion to `entitled` and a different question. `entitled` is "may
     * this space be written to at all"; this is "how much of it is there". A
     * space can be entitled and on xo, which is the normal case.
     *
     * Answered by the `tenant_tier` SECURITY DEFINER function for the same
     * reason `entitled` is: a member has no business reading the owner's
     * subscription row, but does need to know whether the XP section exists.
     * One word crosses the boundary - not who pays, not how much, not until
     * when.
     *
     * Never null. `tenant_tier()` returns NULL for a space with no tier from
     * any source, and that is resolved to DEFAULT_TIER here so that no caller
     * has to invent a policy for it. The argument for which direction that
     * default runs is on DEFAULT_TIER itself.
     *
     * **Never rewritten by the `billing` flag.** It was, and the argument for
     * it - a comped space that could use the lounge but not the XP editor is a
     * half-comped support ticket - was a good argument for the wrong lever.
     * See the note at the assignment for what that cost.
     */
    tier: Tier
    /** Battle (free sparring, the default) or creative (building, admin-gated). */
    loungeMode: 'creative' | 'battle'
    /**
     * Has this space turned its lounge chat on? On unless it said no.
     *
     * Only half the answer, and deliberately the raw half: this is what the
     * space decided, not whether chat is actually available. The other half is
     * the `chat` feature flag, and the two are combined in `chatOpen()` rather
     * than here, so that a surface can still tell "we have not shipped this to
     * you" apart from "you have not switched it on" - which is exactly what
     * Space Settings has to say out loud.
     */
    chatEnabled: boolean
    /**
     * The host's day-to-day switches, as far as they have touched them.
     *
     * Sparse on purpose - an absent key means on. Read it through
     * `capabilityOn()` rather than directly, so the default is written once.
     */
    capabilities: Partial<Record<SpaceCapability, boolean>>
  }
  subscription: SubscriptionView
  /** Every feature flag, resolved for this caller in this workspace. */
  features: Features
  /**
   * The event this space is, or null for an ordinary space - which is what
   * almost every space is, so every reader has to handle null.
   *
   * Resolved here rather than fetched per page because three separate things
   * need it on nearly every request behind a workspace: the guest gate below,
   * the banner in the layout, and the sidebar deciding what to list.
   */
  event: EventView | null
}

/**
 * Guard for anything inside /t/[slug]. Resolves the slug, proves membership,
 * and hands back everything a page or action needs.
 *
 * Every entry point into a tenant goes through this. The proxy cannot do it -
 * it only knows whether you are signed in, and checking membership there would
 * mean a database round trip on every request for a decision the page has to
 * make again anyway.
 *
 * A non-member gets notFound(), not a 403. "This workspace exists and you are
 * not in it" is information, and it is the same information the membership
 * error in the decider is careful not to leak.
 */
export interface TenantOptions {
  /**
   * May a guest load this surface?
   *
   * Three answers, not two. `'event'` is the middle one: open to a guest when
   * this space is an event whose terms list this surface, and closed
   * everywhere else. It is what makes one anonymous link open a whole
   * hackathon without opening every workspace in the product.
   *
   * Defaults to false, and the default is the point. A guest is a stranger on
   * a link, and the set of pages that should be open to one is small and
   * knowable - the lounge, and a match. Everything else is the workspace:
   * the board, pages, tasks, members, billing, settings.
   *
   * Written as opt-*in* so that a page added next year is closed to guests
   * without its author having thought about guests at all. The opposite
   * default - open unless refused - would mean every new surface is a
   * disclosure waiting for somebody to notice, and the rail hiding a link is
   * not a boundary, because URLs are bookmarkable and guests can type.
   *
   * Note what `'event'` does *not* do: it is still an explicit list, written
   * surface by surface. Inverting the default for event spaces - open unless
   * refused - was the obvious shortcut and would have thrown away exactly the
   * property this comment argues for, because the page added next year would
   * then be open to every stranger in every event without its author having
   * thought about it.
   */
  guests?: boolean | 'event'
  /**
   * Which surface this is, for the `'event'` answer to check against the
   * event's `surfaces` list.
   *
   * Required when `guests` is `'event'` and meaningless otherwise. Not derived
   * from the URL, because a surface's identity is a decision rather than a
   * path - `/t/[slug]/shots` and the dashboard both live under routes that
   * would have to be pattern-matched, and a pattern that stopped matching
   * after a rename would silently open a door.
   */
  surface?: EventSurface
}

export async function requireTenant(
  slug: string,
  options: TenantOptions = {},
): Promise<TenantContext> {
  const { user, supabase } = await requireUser()

  const tenantId = await findTenantIdBySlug(supabase, slug)
  if (!tenantId) notFound()

  // Asked through `tenant_role()` rather than by reading `tenant_members`
  // directly, because that function is the one place that knows a guest is also
  // somebody who may be here. Reading the table would have been correct right
  // up until guest links existed and would then have 404'd every guest at the
  // door, with nothing in the stack trace to say why.
  //
  // It is also the same function every RLS policy consults, which is the real
  // reason: the page and the database now answer "who is this to us" from one
  // definition instead of two that can drift.
  const { data: role, error } = await supabase.rpc('tenant_role', {
    p_tenant_id: tenantId,
  })

  if (error) {
    throw new Error(`Failed to check membership: ${error.message}`)
  }

  /**
   * Nobody to this space. Which of two very different people?
   *
   * An anonymous session only ever exists because somebody walked through a
   * guest door - it is the one thing `enterAsGuest` creates and nothing else in
   * the app makes one. So an anonymous user with no role is not a stranger
   * guessing URLs; it is a visitor whose admission has just ended, and the row
   * that proved it is gone precisely because it ended.
   *
   * That distinction is worth a redirect because the two deserve opposite
   * pages. A stranger gets `notFound()` for the reason argued below. A guest
   * whose afternoon just finished gets told so, and asked whether they want one
   * of these - see `/g/left`.
   *
   * `is_anonymous` comes off the verified JWT, not from anything the caller
   * sends, so it cannot be claimed by somebody who was never let in. And the
   * page it leads to is public and reveals nothing: the slug in the URL is one
   * they already had.
   */
  if (!role && user.is_anonymous) {
    /**
     * Unless they have not been let in yet.
     *
     * Somebody standing at a door they knocked on is also an anonymous session
     * with no role - `tenant_role()` refuses them until `admitted_at` is set,
     * which is the whole mechanism knocking is built on. Telling them their
     * visit had ended would be the most confusing sentence in the app: they
     * have not had one.
     *
     * One query, and only ever on this path - a member never reaches it, and a
     * guest reaches it once, on the click after their admission ends. The
     * select policy lets somebody read their own row, so this needs no
     * privilege.
     */
    const { data: knocking } = await supabase
      .from('tenant_guests')
      .select('guest_id')
      .eq('tenant_id', tenantId)
      .eq('guest_id', user.id)
      .is('admitted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    // Still waiting: the doormat is where they belong, and the waiting page
    // will carry them through on its own. `notFound()` here rather than a
    // redirect because the token that names their doormat is not knowable from
    // this side - and they already have that page open.
    // The proxy closes the session on the way in to that page, unless this
    // guest is still admitted somewhere else - which is exactly what `?from=`
    // is for, and why the check lives there rather than here.
    if (!knocking) redirect(`${GUEST_LEFT_PATH}?from=${encodeURIComponent(slug)}`)
  }

  if (!role) notFound()

  const tenant = await loadTenantRow(supabase, tenantId)
  if (!tenant) notFound()

  const [subscription, entitled, tier, features, event] = await Promise.all([
    getSubscription(supabase, tenantId),
    isTenantEntitled(supabase, tenantId),
    readTenantTier(supabase, tenantId),
    resolveFeatures(supabase, tenantId),
    getEvent(supabase, tenantId),
  ])

  // ---------------------------------------------------------------------------
  // The guest gate
  // ---------------------------------------------------------------------------
  // notFound(), not a "guests cannot see this" page, and for the same reason a
  // non-member gets notFound(): a page explaining what it would have been is an
  // advertisement for something the reader cannot have.
  //
  // Moved below the loads rather than kept above them, because `'event'` cannot
  // be answered without the event record. The cost is that a refused guest has
  // paid for four queries before being turned away, which is the right trade -
  // that path is rare, and the alternative was fetching the event twice or
  // hand-rolling a narrower query that would drift from `getEvent`.
  if (role === 'guest') {
    const allowed =
      options.guests === true ||
      (options.guests === 'event' &&
        options.surface !== undefined &&
        guestCanReach(event, options.surface))

    if (!allowed) notFound()
  }

  // ---------------------------------------------------------------------------
  // The billing flag is applied once, here
  // ---------------------------------------------------------------------------
  // Turning `billing` off has to mean the workspace behaves *exactly* as if it
  // were paid up - not "mostly", and not "except for the one check nobody
  // remembered". There are two independent billing gates, `entitled` and
  // `subscription.writable`, and roughly a dozen call sites that consult them
  // through canWrite() and writeBlockedReason().
  //
  // So the flag is resolved into both values at the single point where the
  // context is built, rather than being checked alongside them everywhere. A
  // comped customer who could edit tasks but not upload an image would be a
  // support ticket nobody could reproduce, and that is the failure mode of
  // spreading the check out.
  //
  // Two values, and it used to be three. The tier is no longer one of them -
  // see the note where it is assigned. The rule the other two still satisfy and
  // the tier did not: this flag may relax what *the person holding it* is
  // charged or blocked for, and may not restate what *the space* is. `entitled`
  // draws a banner and `writable` gates that person's own writes; a tier
  // decides what everybody else in the room can open.
  const billed = features.billing

  return {
    user,
    supabase,
    tenant: {
      id: tenantId,
      slug: tenant.slug,
      name: tenant.name,
      archived: tenant.archived,
      role: asTenantRole(role),
      entitled: billed ? entitled : true,
      /**
       * Is this space shut?
       *
       * Only ever because a person decided so. Archiving is the owner's own
       * action or an admin's, and it is the single path to this being true.
       *
       * **Billing never shuts a space.** That is the rule the free tier is
       * built on, and it holds all the way down: no subscription, a cancelled
       * one, a failed debit, a reversed payment - every one of them lands on
       * `free`, open and writable and capped. A space that stops paying becomes
       * the space it would have been if it had never started, which is a real
       * product rather than a locked door.
       *
       * Shutting somebody out is therefore a moderation decision and looks like
       * one: a human does it, deliberately, and it leaves a trail. Nothing
       * automatic can take a space away from the people using it, which also
       * means no bank's timing and no webhook's ordering ever can.
       *
       * Named rather than inlined as `archived` even though it is exactly that
       * today, because the callers are asking "is this space shut" and not "did
       * somebody press archive". If a moderation suspension ever joins it, it
       * joins here and every caller is already right.
       */
      deactivated: tenant.archived,
      /**
       * The space's plan, and *not* rewritten by the billing flag.
       *
       * This used to be `billed ? tier : 'xp'`, and that line is how an `xo`
       * space came to hold a match nobody in it could open.
       *
       * `billing` resolves user-first - `resolve_features` checks a `user`
       * override before a `tenant` one - so an account comped this way was the
       * only person in the room seeing `xp`. They summoned a match inside a
       * level, which `createBattle` allowed because their context said xp, and
       * everybody else's context said xo and dropped them in the lounge. One
       * person was looking at a different space than everybody standing in it.
       *
       * A tier is a fact about a *space*; a per-account switch must not be able
       * to restate one. keys.ts already draws exactly this line for the valued
       * flags - `tenant_feature_limit()` reads tenant-scope overrides and
       * ignores user ones - and this is the same rule applied to the most
       * space-shaped value there is.
       *
       * Comping is unaffected and has a mechanism that is already shared:
       * `/ovaloffice/promos` grants a tier to an owner, it lands in
       * `promo_redemptions`, and `tenant_tier()` hands the same answer to
       * everybody in the space. That is what "this space is comped" should
       * mean, and it is one row rather than one flag per person.
       */
      tier,
      loungeMode: tenant.lounge_mode === 'creative' ? 'creative' : 'battle',
      chatEnabled: tenant.chat_enabled === true,
      capabilities: (tenant.capabilities ?? {}) as Partial<
        Record<SpaceCapability, boolean>
      >,
    },
    subscription: billed ? subscription : { ...subscription, writable: true },
    features,
    event,
  }
}

/**
 * Which tier this space is on.
 *
 * A failure falls back rather than throwing, matching `resolveFeatures` and for
 * the same reason: this is infrastructure for deciding what to render, and if a
 * lookup outage takes down every page behind a workspace then having tiers has
 * made the app less reliable than not having them.
 *
 * The two ways of not getting a tier take *different* fallbacks, and the split
 * is the point:
 *
 *   - **NULL is an answer.** `tenant_tier()` returns it when no subscription
 *     grants this space anything, which is now a real state with a name -
 *     `free` - rather than a hole. DEFAULT_TIER.
 *   - **An error is the absence of one.** Everybody who reaches that line while
 *     paying us bought at least xo, and resolving a database blip to `free`
 *     would clamp a paying space to two seats and shelve its rooms for the
 *     length of the outage. FALLBACK_TIER.
 *
 * Both constants argue their own direction in `tiers.ts`.
 */
async function readTenantTier(supabase: Client, tenantId: string): Promise<Tier> {
  const { data, error } = await supabase.rpc('tenant_tier', { p_tenant_id: tenantId })

  if (error) return FALLBACK_TIER
  return asTier(data) ?? DEFAULT_TIER
}

/** Does an owner of this workspace have a live subscription? */
async function isTenantEntitled(supabase: Client, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('tenant_is_entitled', {
    p_tenant_id: tenantId,
  })

  if (error) {
    throw new Error(`Failed to check entitlement: ${error.message}`)
  }

  return data === true
}

/**
 * May this workspace record new events right now?
 *
 * One question now, where it used to be three. `archived`, `writable` and
 * `entitled` were checked together because before the free tier they were three
 * ways of asking whether a space was shut - and two of them have stopped
 * meaning that. A space with no live subscription is on `free` and writes
 * perfectly well; it writes *less of everything*, which is a cap rather than a
 * lock, and caps are enforced where the counting happens.
 *
 * What is left is the only thing that was ever really a lock: somebody shut it.
 * See `deactivated`.
 */
export function canWrite(context: TenantContext): boolean {
  return !isGuest(context) && !context.tenant.deactivated
}

/**
 * Is the caller here on a link rather than a membership?
 *
 * Worth a named function rather than `role === 'guest'` scattered about,
 * because it is asked in two very different moods: "hide the edit button" and
 * "refuse this write". The second is `canWrite()`, and the database refuses it
 * again underneath - a guest's insert policy allows the battle stream and
 * nothing else, so this is the polite layer, not the boundary.
 */
export function isGuest(context: TenantContext): boolean {
  return context.tenant.role === 'guest'
}

/**
 * Why a write is refused, or null if it is allowed.
 *
 * `guestsAllowed` is the battle exception, and it needs to be explicit rather
 * than implied. A guest may not change anything *about the space* - no
 * building, no pages, no tasks - but taking part in a match is the entire point
 * of letting them in, and a match is recorded by appending events like
 * everything else.
 *
 * Without the flag this function blocked guests from joining a battle or
 * picking a side, which looked like the team buttons being broken rather than a
 * permission decision. The database agrees with the flag: a guest's insert
 * policy permits the battle stream and refuses every other, so passing
 * `guestsAllowed` where it does not belong fails at the boundary rather than
 * silently widening anything.
 */
export function writeBlockedReason(
  context: TenantContext,
  options: { guestsAllowed?: boolean } = {},
): string | null {
  // Ahead of the billing reasons, because it is the true one for a guest in a
  // lapsed space and "resume the subscription" is advice they cannot act on.
  if (isGuest(context) && !options.guestsAllowed) {
    return 'You are visiting as a guest. You can look around, use emotes and join a match, but not change anything here.'
  }
  if (context.tenant.deactivated) return 'This space has been archived'

  /*
   * No billing branch here at all any more, and that is the change.
   *
   * Every one of them - no subscription, cancelled, a failed debit, a reversed
   * payment - now lands on `free` rather than on a wall. The space keeps
   * working with fewer seats and no XP suite, and being over the caps on the
   * way down is handled by shelving rather than by locking:
   * `docs/product/pricing.md` §6 and §7. Nothing is deleted and nobody is
   * removed.
   *
   * `archived` above is the whole gate, and it is somebody's decision.
   */
  return null
}

/**
 * Read the tenant's read-model row.
 *
 * This used to catch a projection up first, and the comment here described the
 * window it was closing: membership was written synchronously by the database
 * trigger while the name and slug were projected asynchronously in TypeScript,
 * so you could be demonstrably a member of a workspace that had no row yet.
 *
 * There is no such window any more. 20270102000000 moved the row under the same
 * trigger, so it is written in the transaction that appends `TenantCreated` -
 * the space and its membership arrive together or not at all. A missing row now
 * means no `TenantCreated`, which is not a space, and the caller's `notFound()`
 * is the right answer rather than a repair.
 *
 * The four fields after the name are why that mattered: `archived`,
 * `lounge_mode`, `chat_enabled` and `capabilities` are all gated on, so this
 * row is authorization state and had no business being user-writable. See the
 * migration, and the audit entry it closes.
 */
async function loadTenantRow(supabase: Client, tenantId: string) {
  const { data, error } = await supabase
    .from('tenants_read_model')
    .select('slug, name, archived, lounge_mode, chat_enabled, capabilities')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load space: ${error.message}`)
  }

  return data
}

/**
 * Is there a chat in this lounge?
 *
 * Two switches, and both have to be on. They are not redundant and they are not
 * the same decision:
 *
 *   * `features.chat` is ours. It says whether this installation has chat at
 *     all, defaults on, and is flipped in the backoffice - globally, or for one
 *     space, or for one person we are withdrawing it from.
 *
 *   * `tenant.chatEnabled` is theirs. It says whether this space wants one. It
 *     also defaults on now, so in practice this switch is the one an owner or
 *     admin reaches for in Space Settings to make a lounge quiet.
 *
 * Worth a named function rather than `&&` at each call site, because it is asked
 * in three moods that must not drift apart - "render the tab", "load the
 * scrollback", and "accept this message" - and the third is the one that has to
 * be right when the first two were rendered a while ago.
 *
 * Deliberately says nothing about *who* is asking. A guest may read a chat they
 * cannot write to; that is `writeBlockedReason`'s question, not this one.
 */
export function chatOpen(context: TenantContext): boolean {
  return context.features.chat && context.tenant.chatEnabled
}

/**
 * May this space use the XP suite?
 *
 * Two independent conditions, combined here for the reason `chatOpen` combines
 * its two: they answer different questions and both have to be yes.
 *
 *   * `features.xp` is ours. It says whether this installation has shipped XPs
 *     to this space at all - an operator's switch, argued in flags/keys.ts,
 *     and the one that keeps eight-messages-a-second Realtime traffic out of
 *     the budget of spaces that never asked for it.
 *
 *   * the **plan** is theirs, and it is now read as a *quantity* rather than as
 *     a rung. This used to be `hasTier(context, 'xp')`, which was a leftover
 *     from the model where the tier name was the feature: `xo` meant no XP at
 *     all. That has not been true since every tier started holding some of
 *     both halves - see the header of `billing/tiers.ts` - and the two
 *     disagreed, with this winning. An `xo` space is written down as holding
 *     four XP places and could not open one, and the way that surfaced was the
 *     worst available: a match summoned inside a level dropped everybody into
 *     the lounge instead, silently, because the battle page fell through this
 *     gate into its other branch.
 *
 *     So the question is asked of the number that already answers it. Zero
 *     places is no XP; anything else, including `null` for unlimited, is yes.
 *     A tier's XP allowance now lives in exactly one table, and moving it there
 *     is what makes "free gets one" a two-character change rather than an
 *     audit.
 *
 * Order matters to the *callers*, not to this function: a space without the
 * flag should see nothing, while a space that has run out of places should see
 * its cap and the way past it. Anything rendering an upsell therefore has to
 * ask the two separately - see the match wizard. This helper is for the many
 * places that only need the plain yes or no.
 *
 * Worth naming what this deliberately does *not* protect: a match already
 * running inside an XP when the space's allowance drops to zero. Plan changes
 * land on a billing boundary and a match lasts minutes, so the window is
 * theoretical - and the alternative, a grandfather clause on live matches, is
 * more moving parts than the case is worth.
 */
export function xpOpen(context: TenantContext): boolean {
  return context.features.xp && tierLimit(context.tenant.tier, 'xpPlaces') !== 0
}

/**
 * May this space *make* an XP?
 *
 * The other half, and a genuinely different question - `/t/[slug]/studio`
 * already says so in prose: playing a level and authoring one are metered by
 * two different numbers, and a plan can hold one without the other. It reads
 * `projects` for the same reason `xpOpen` reads `xpPlaces`, and both are `!== 0`
 * rather than `> 0` because `null` in that table is *unlimited*.
 *
 * No feature flag of its own. `worlds` is the flag over the workbench and the
 * callers that have it already ask it; inventing a second one here would be a
 * switch with no backoffice row behind it, which is how a flag becomes
 * invisible - see the note in flags/keys.ts.
 */
export function projectsOpen(context: TenantContext): boolean {
  return tierLimit(context.tenant.tier, 'projects') !== 0
}

/**
 * Refuse a surface that only exists for a space which may hold projects.
 *
 * `notFound()`, matching `requireFeature` and `requireTier`, and it replaces a
 * `requireTier(context, 'xo')` that the page it guards had already argued its
 * way out of in prose: projects stopped being a half of the product and became
 * a quantity, so the number is the gate and the rung is not. Free holds one.
 */
export function requireProjects(context: TenantContext): void {
  if (!projectsOpen(context)) notFound()
}

/**
 * Does this space run matches?
 *
 * The same two-switch shape as `chatOpen`, and the second half is a switch that
 * already existed and could only be reached during an event:
 *
 *   * `features.battle` is ours. It says whether this installation has the
 *     battle system at all, and is flipped in the backoffice.
 *
 *   * the `battle` **space capability** is theirs, spelled "Matches" in the
 *     console. It was built for the event desk - a host closing a surface to
 *     guests for the afternoon - and `space_capability_on()` in SQL only
 *     consults it for guest writes inside an event window. So an ordinary space
 *     that turned Matches off got a switch that changed nothing.
 *
 * Named rather than inlined for the reason `chatOpen` gives: it is asked in
 * three moods that must not drift - render the tab, open the hub, accept a
 * `CreateBattle` - and the third is the one that has to be right when the first
 * two were rendered ten minutes ago.
 *
 * **Absent means on**, through `capabilityOn`: these are surfaces the platform
 * has already sold a space, and arriving with them switched off would make the
 * console a liar. Only a decision somebody actually made is stored.
 *
 * What this deliberately does not do is end a match that is already running.
 * Turning the surface off closes the door; the people inside a fixture finish
 * it, or the backstop does a day later - which is the same choice `xpOpen`
 * makes about a tier change, and for the same reason.
 */
export function battleOpen(context: TenantContext): boolean {
  return context.features.battle && (context.tenant.capabilities.battle ?? true)
}

/**
 * Does this space show its people the performance readout?
 *
 * Two conditions again, and here they are unusually far apart in what they
 * mean:
 *
 *   * `features.perf` is ours. It says whether anything in this space's rooms
 *     is measuring at all - and if nothing is, there is nothing to display, so
 *     this half is a precondition rather than a policy. See flags/keys.ts.
 *   * `capabilities.perf_display` is theirs. It says whether the space wants
 *     the numbers on screen while they play.
 *
 * `?? false`, and it is the only capability that defaults off - every other one
 * follows `capabilityOn`'s "absent means on" rule, because every other one
 * describes something spaces have always been able to do and a missing row must
 * not take it away. This describes something no space has ever had, and a
 * default of on would put a readout into every room the moment an operator
 * switched a flag they turned on to look at *one* space. The switch is how a
 * space asks for it.
 *
 * Nothing about collection depends on this. An operator measuring a room gets
 * the same rows whether or not the space is looking at them; this decides only
 * whether the people in the room are shown the same numbers.
 */
export function perfDisplayOn(context: TenantContext): boolean {
  return context.features.perf && (context.tenant.capabilities.perf_display ?? false)
}

/**
 * Assert the caller holds one of `allowed` before doing something.
 *
 * This is a *fast path*, not the authorization boundary. The real check is in
 * the tenant decider, which re-derives every role from the event log before it
 * agrees to emit anything. Having it here too means the UI can fail politely
 * instead of round-tripping to Postgres to be told no.
 */
export function hasRole(
  context: TenantContext,
  allowed: readonly TenantRoleName[],
): boolean {
  return allowed.includes(context.tenant.role)
}

/**
 * Refuse to render a surface whose flag is off.
 *
 * notFound(), not a "this feature is disabled" page, and for the same reason a
 * non-member gets notFound(): a page that explains what it would have been is
 * an advertisement for something the reader cannot have. Hiding the nav link is
 * what makes the app coherent; this is what makes it true, because a link is
 * not a permission and people bookmark URLs.
 */
export function requireFeature(context: TenantContext, key: FeatureKey): void {
  if (!context.features[key]) notFound()
}

/**
 * Is this space on `required` or better?
 *
 * The polite half of the tier check, for hiding a control or rendering it as an
 * upsell. `requireTier` below is the half that refuses.
 *
 * Worth a helper rather than `context.tenant.tier === 'xp'` scattered about,
 * because the comparison is a ladder and not an equality - see `tierAtLeast`.
 * A third tier above xp would otherwise silently lock its owners out of the
 * things xp can do.
 */
export function hasTier(context: TenantContext, required: Tier): boolean {
  return tierAtLeast(context.tenant.tier, required)
}

/**
 * Refuse to render a surface the space's tier does not include.
 *
 * notFound(), matching `requireFeature`, and the argument is *almost* the same
 * one - with one deliberate difference in how the two are used. A flag being
 * off means the feature does not exist for this space and there is nothing to
 * say about it. A tier being too low means the feature exists and is for sale,
 * which is worth saying - so the surfaces that can afford to say it (the match
 * wizard, the battle lobby) render a locked card via `hasTier` instead, and
 * this is reserved for routes somebody reached by typing the URL.
 *
 * Both gates apply where both are relevant, and in that order: a space that has
 * not been given the `xp` flag must not be sold an upgrade to reach it.
 */
export function requireTier(context: TenantContext, required: Tier): void {
  if (!hasTier(context, required)) notFound()
}
