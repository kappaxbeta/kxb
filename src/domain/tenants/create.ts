import 'server-only'
import { randomUUID } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import {
  countOwnedTenants,
  entitlementMessage,
  readLiveGrants,
  syncUserEntitlement,
  unpaidSpaces,
} from '@/domain/billing/entitlement'
import { withinLimit } from '@/domain/billing/limits'
import { freeSpaceLimit } from '@/domain/billing/quota'
import { resolveFeatures } from '@/domain/flags/queries'
import { tenantDecider } from '@/domain/tenants/aggregate'
import { createTenantSchema } from '@/domain/tenants/commands'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Making a space, from either front door.
 *
 * All of `createTenant` except the two lines that are about being a browser -
 * the cache revalidation and the redirect into the new space. Everything that
 * decides *whether* a space may exist is here: the visitor-pass refusal, the
 * billing gate and its Stripe round trip, the slug claim that has to happen
 * before the events, and the release if the command then fails.
 *
 * It moved when the phone learned to make one. There is exactly one copy of
 * this reasoning and it would not have survived two: the ordering between the
 * claim and the log is subtle, the grant arithmetic was already wrong once in
 * exactly the way a second copy goes wrong, and the anonymous refusal is a
 * product decision rather than a validation.
 *
 * Not a `'use server'` file: it takes a client and a verified user, and a
 * client the caller can pass is not a thing a browser may name.
 */

export type CreateResult = { ok: true; slug: string } | { ok: false; error: string }

/** Postgres unique violation - the slug was claimed while we were deciding. */
const UNIQUE_VIOLATION = '23505'

function toResult(error: unknown): CreateResult {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return {
      ok: false,
      error: 'This space was changed elsewhere. Please try again.',
    }
  }
  throw error
}

/**
 * The caller is the owner, and the caller is the session.
 *
 * `user` comes off a verified session in both callers - `requireUser()` on the
 * web, `auth.getUser(token)` on the phone - and nothing in the arguments names
 * an account. A parameter through which somebody could create a space owned by
 * another person would be the whole authorization system, undone.
 */
export async function makeSpace(
  supabase: Client,
  user: User,
  input: { name: string; slug: string },
): Promise<CreateResult> {
  const parsed = createTenantSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid space' }
  }

  /**
   * A visitor pass cannot own a space.
   *
   * `/tenants` and `/onboarding` both redirect an anonymous session away
   * already, so this was reachable only by posting to the action directly - and
   * a Server Action is a public endpoint, so "the page redirects" is not a
   * gate. It *was* refused, but by accident: an anonymous user has no address,
   * so they fell into the check below and were told their account has no email.
   * True, unhelpful, and it describes a missing field rather than the actual
   * rule.
   *
   * The rule is worth stating plainly because the consequence is not obvious.
   * An anonymous session is a browser, not a person: it lives in one set of
   * cookies and there is no way to sign back into it. A space owned by one is a
   * space that becomes unreachable - along with anything anybody else put in it
   * - the moment that browser clears its storage. Refusing is kinder than the
   * alternative, which is somebody losing a room they invited friends into.
   */
  if (user.is_anonymous) {
    return {
      ok: false,
      error:
        'You are here on a visitor pass, which cannot own a space — there would be no way to sign back into it. Make an account first and the space will be waiting.',
    }
  }

  if (!user.email) {
    return { ok: false, error: 'Your account has no email address' }
  }

  // Outside any workspace, so only this person's override and the global
  // default apply.
  //
  // Skipping the block below is the whole of "free someone from paying" on this
  // path, and skipping it *entirely* is the point: with billing off there is
  // nothing to verify, and the Stripe round trip exists only to answer a
  // question that no longer has consequences. A comped account should not be
  // able to fail to create a workspace because Stripe was down.
  const { billing } = await resolveFeatures(supabase)

  if (billing) {
    // Entitlement, checked against Stripe rather than our cached mirror.
    //
    // This is the one moment where being a few hours stale actually costs money
    // - someone who cancelled this morning could still mint workspaces until
    // the nightly job noticed. So it asks Stripe, and refreshes the mirror on
    // the way past, which means the check pays for the sync rather than the
    // reverse.
    try {
      const owned = await countOwnedTenants(supabase, user.id)

      /**
       * The grant, which this gate used to leave out entirely.
       *
       * The summary behind the "new space" button counted one - `readEntitlement`
       * has always added `GRANT_SEATS` - and the button's own action counted
       * none, so an account comped for every space it owns could be offered a
       * space and then refused one by the thing the offer led to. Both sides
       * now call `unpaidSpaces` with the same coverage, and that function is
       * where the argument about what a grant is worth lives.
       */
      const grants = await readLiveGrants(supabase, user.id)

      /*
       * The number is resolved rather than constant now.
       *
       * It was a flat three - a spam guard from before the free tier, when a
       * space with no plan was read-only and therefore nearly worthless to
       * hoard. A free space is a working product, so this became a pricing
       * number: one per account, raisable for one person from the backoffice
       * without a deploy, and clamped by the installation's own ceiling.
       *
       * `withinLimit` rather than a comparison, so "unlimited" needs no
       * sentinel and the off-by-one is decided in one tested place: `unpaid` is
       * what they already hold, and this asks whether there is room for one
       * more.
       */
      const freeSpaces = await freeSpaceLimit(supabase)

      /**
       * The gate is now "too many spaces waiting for a plan", not "out of seats".
       *
       * Under tiers a space is free to make and picks xo or xp for itself
       * afterwards, so there is no seat to spend here - see the note at the top
       * of `billing/entitlement.ts`. What is left to prevent is somebody
       * scripting a thousand empty spaces, and the things that legitimately
       * hold a space up all count against that: its own subscription, a legacy
       * seat, a granted month.
       *
       * Asked without Stripe first, and answered here when the grant alone is
       * enough. Stripe seats can only ever *reduce* what is left unpaid, so
       * skipping the round trip can never admit somebody it should have turned
       * away - and it means a comped account is not one Stripe outage away from
       * being unable to make the space it was comped for. The mirror misses a
       * refresh in that case; the nightly job is what keeps it fresh, and this
       * was only ever paying for it opportunistically.
       */
      const onGrantAlone = unpaidSpaces({
        owned,
        stripeSeats: 0,
        grantCovers: grants.covers,
      })

      if (!withinLimit(onGrantAlone, freeSpaces)) {
        // Only now is it worth asking - and it is worth asking, because this is
        // the one moment where a stale mirror actually costs money: someone who
        // cancelled this morning could otherwise mint spaces until the nightly
        // job noticed. The sync refreshes the mirror on the way past.
        const admin = createAdminClient() as unknown as typeof supabase
        const entitlement = await syncUserEntitlement(admin, user.id, user.email)

        const unpaid = unpaidSpaces({
          owned,
          stripeSeats: entitlement.seats,
          grantCovers: grants.covers,
        })

        if (!withinLimit(unpaid, freeSpaces)) {
          return { ok: false, error: entitlementMessage(freeSpaces ?? unpaid) }
        }
      }
    } catch (error) {
      // A Stripe outage must not silently hand out free workspaces, and must
      // not pretend the person is unsubscribed either. Say what actually
      // happened.
      const message = error instanceof Error ? error.message : 'unknown error'
      return {
        ok: false,
        error: `Could not verify your subscription just now (${message}). Please try again in a moment.`,
      }
    }
  }

  const tenantId = randomUUID()

  const { error: claimError } = await supabase.from('tenant_slugs').insert({
    slug: parsed.data.slug,
    tenant_id: tenantId,
    claimed_by: user.id,
  })

  if (claimError) {
    if (claimError.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `The URL "${parsed.data.slug}" is already taken` }
    }
    return { ok: false, error: `Could not reserve that URL: ${claimError.message}` }
  }

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command: {
        type: 'CreateTenant',
        actorId: user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    await releaseSlug(supabase, parsed.data.slug)
    return toResult(error)
  }

  // Guarded, and it has to be. The events are committed and the membership
  // trigger has already run, so the space is real and the caller is its owner -
  // but a throw here would escape the action as a generic error, and by then
  // the slug can no longer be released (`tenant_slugs_delete_unused` allows a
  // delete only while the tenant has no events). Retrying the form would say
  // "that URL is already taken" about a space the person owns and cannot see:
  // /tenants drops memberships with no projected row, and nothing on that page
  // runs this projection.
  //
  // So: succeed, and send them in. `loadTenant` re-projects on a read miss, so
  // arriving at the space is itself the repair.
  return { ok: true, slug: parsed.data.slug }
}

/** Best-effort cleanup of a claim whose TenantCreated never landed. */
async function releaseSlug(supabase: Client, slug: string): Promise<void> {
  // The delete policy only permits this while the tenant has no events, so a
  // partially-created workspace keeps its URL rather than being half-freed.
  await supabase.from('tenant_slugs').delete().eq('slug', slug)
}
