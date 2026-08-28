'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  admissionExpiry,
  DOORKEEPERS,
  guestArrival,
  guestLinkSchema,
  guestLinkUrl,
  linkExpiry,
  linkProblem,
  loungePath,
  mintGuestToken,
  mintJoinCode,
  normaliseJoinCode,
} from '@/domain/guests/application'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { guestsAdmittedBy, reapOrphanedGuests } from '@/domain/guests/orphans'
import { closeEndedVisit } from '@/domain/guests/session'
import { requireBackofficeSection } from '@/lib/backoffice'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasRole, requireTenant } from '@/lib/tenant'

/**
 * Handing out a way in, taking it back, and showing somebody the door.
 *
 * Three administrative acts on one space, gated the way everything else under
 * /t/[slug] is gated - `requireTenant()` proves membership, `hasRole()` proves
 * standing. Minting a link is not a member's act: it hands a stranger the
 * ability to walk into a room everybody else in the space is standing in, and
 * that is an owner's or an admin's decision to make.
 *
 * Every write runs through the service role, because `guest_links` has no write
 * policy at all. That is deliberate - see the migration - and it means these
 * functions are the only thing standing between a form and the table, so the
 * checks here are the authorization boundary rather than a convenience.
 */

export type GuestResult = { ok: true } | { ok: false; error: string }

/**
 * Minting also hands back the finished URL.
 *
 * The rail does not need it - it re-reads the list and renders the token from
 * there - but the in-match button does: mid-match, "create a link" and "copy
 * it" have to be one click, and a second round trip to find the token you just
 * made would be a pause in the middle of a game.
 *
 * It is the whole URL rather than the token so that the origin is decided on
 * the server, where the deployment is known. A client building it from
 * `window.location` would paste `localhost` links into a chat from a laptop
 * running against staging.
 */
export type MintResult =
  | { ok: true; url: string; /** The spoken form, for reading out. */ code: string | null }
  | { ok: false; error: string }

const idSchema = z.string().uuid()

/**
 * Where the two admin surfaces live, so a mutation refreshes whichever one the
 * caller is looking at without either needing to know about the other.
 */
function refresh(slug: string): void {
  // The space half, not `/settings` itself: that path is a redirect now, and
  // the banner form that lists these links renders one segment further down.
  revalidatePath(`/t/${slug}/settings/space`)
  revalidatePath('/ovaloffice/access')
}

/** Mint a link, and hand back the URL to paste. */
export async function createGuestLink(
  slug: string,
  input: {
    label?: string
    maxUses?: number | null
    days?: number
    requiresKnock?: boolean
    /** Where this link lets out. Confined to the space; null means the lounge. */
    destination?: string | null
  },
): Promise<MintResult> {
  const parsed = guestLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid link' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can create a guest link' }
  }

  const admin = createAdminClient()
  const token = mintGuestToken()

  /*
   * Confined here as well as on redemption, and both are meant.
   *
   * This one keeps a bad path out of the database, so an admin who mistypes
   * finds out now rather than through a guest landing in the wrong room. The
   * one in `enterAsGuest` is the check that counts - it is the only one that
   * runs on a row that might have been written before this line existed, or by
   * anything holding the service role.
   *
   * `guestArrival` answers with the lounge path for anything it refuses, so
   * that is normalised back to NULL: the lounge is what NULL already means, and
   * storing it spelled out would make every default look like a choice.
   */
  const arrival = guestArrival(parsed.data.destination, context.tenant.slug)
  const destination = arrival === loungePath(context.tenant.slug) ? null : arrival

  /*
   * The spoken form of the same door, minted with the row.
   *
   * Six characters is a small enough space that two live links can collide, so
   * this retries on the unique index rather than checking for a free code
   * first. Checking first is a race; the index is the thing that actually
   * decides. Three attempts, because a third collision means the generator is
   * broken rather than the caller unlucky - and the loop re-mints only the
   * code, so a token collision (32 random bytes) exhausts the attempts and
   * surfaces as an error instead of spinning.
   */
  let code = mintJoinCode()
  let error: { message: string; code: string } | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await admin.from('guest_links').insert({
      tenant_id: context.tenant.id,
      token,
      code,
      label: parsed.data.label || null,
      max_uses: parsed.data.maxUses,
      requires_knock: parsed.data.requiresKnock,
      destination,
      expires_at: linkExpiry(parsed.data.days),
      created_by: context.user.id,
    })

    error = result.error
    if (!error) break

    // 23505 is unique_violation.
    if (error.code !== '23505') break
    code = mintJoinCode()
  }

  if (error) return { ok: false, error: `Could not create the link: ${error.message}` }

  refresh(slug)
  return { ok: true, url: guestLinkUrl(env.appUrl(), token), code }
}

/**
 * Kill a link, and everybody it let in.
 *
 * The second half is the part worth being deliberate about. Revoking a link
 * that leaves its guests standing in the room is the behaviour nobody wants and
 * everybody assumes they are getting - an admin revokes a link *because* they
 * want the people it admitted gone, and discovering an hour later that the
 * strangers are still there is the bug that makes the feature untrustworthy.
 *
 * The link is revoked rather than deleted, for the reason the invite list gives:
 * the row is the record that access was granted, and a link that vanishes takes
 * the answer to "how did they get in" with it. The admissions underneath it are
 * deleted, because those are not a record of anything - they are a fact about
 * who is currently in a room, and that fact has just changed.
 */
export async function revokeGuestLink(
  slug: string,
  linkId: string,
): Promise<GuestResult> {
  if (!idSchema.safeParse(linkId).success) {
    return { ok: false, error: 'Invalid link' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can revoke a guest link' }
  }

  const admin = createAdminClient()

  // Scoped by tenant as well as id. The id came from a form, and a link id from
  // another space would otherwise be revocable by anybody who could guess one.
  const { error } = await admin
    .from('guest_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('tenant_id', context.tenant.id)

  if (error) return { ok: false, error: `Could not revoke the link: ${error.message}` }

  // Read before the delete: once the rows are gone there is nothing left to
  // say whose accounts they were. See `guestsAdmittedBy`.
  const admitted = await guestsAdmittedBy([linkId])

  const { error: ejectError } = await admin
    .from('tenant_guests')
    .delete()
    .eq('tenant_id', context.tenant.id)
    .eq('link_id', linkId)

  if (ejectError) {
    // The link is dead either way, which is the half that matters - nobody new
    // gets in. Say so rather than reporting a clean success, because an admin
    // who thinks the room is empty and finds it is not will trust nothing here
    // again.
    return {
      ok: false,
      error:
        'The link is revoked, but the guests it let in could not be removed. Try removing them individually.',
    }
  }

  /**
   * And the accounts behind them, if nothing else vouches for them.
   *
   * An anonymous account with no admission left refers to nobody - it cannot be
   * signed into and a new link mints a fresh one - so leaving it behind means a
   * permanent `auth.users` row per person every revoked link ever admitted. The
   * cron reaper never collected these: it looks for admissions that *expired*,
   * and a revoked one leaves no row to expire.
   */
  await reapOrphanedGuests(admitted)

  refresh(slug)
  return { ok: true }
}

/**
 * Show one guest the door.
 *
 * A delete, not a flag, and that is what makes it instant: `tenant_role()`
 * consults this table on every query, so the row going away is the ejection.
 * There is no session to invalidate and nothing to expire, because a guest's
 * standing was only ever this row.
 *
 * What it does not do is stop them coming back, if the link that let them in is
 * still live and still has uses on it. That is the honest behaviour rather than
 * an oversight - kicking somebody and revoking the way they got in are
 * different decisions, and an admin who wants both has both buttons.
 */
export async function removeGuest(slug: string, guestId: string): Promise<GuestResult> {
  if (!idSchema.safeParse(guestId).success) {
    return { ok: false, error: 'Invalid guest' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can remove a guest' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('tenant_guests')
    .delete()
    .eq('tenant_id', context.tenant.id)
    .eq('guest_id', guestId)

  if (error) return { ok: false, error: `Could not remove the guest: ${error.message}` }

  // If that was their last admission anywhere, the account behind it now refers
  // to nobody - see `reapOrphanedGuests`.
  await reapOrphanedGuests([guestId])

  refresh(slug)
  return { ok: true }
}

/**
 * Remove somebody and keep them out.
 *
 * `removeGuest` above throws somebody out; this is the version that survives
 * them clicking the link again. The difference matters at an event, where the
 * link is public in a Discord announcement and following it a second time mints
 * a brand new anonymous identity - so a plain removal lasts about ten seconds
 * against anybody who noticed.
 *
 * The eviction is not done here. Inserting the row fires `evict_on_ban`, which
 * deletes the admission and the occupancy in the same transaction - so a ban
 * written by any route at all takes effect, including the import at the end of
 * an event.
 *
 * ----------------------------------------------------------------------------
 * What to tell the admin
 * ----------------------------------------------------------------------------
 * This stops the same session, and it does not stop a private window. That is
 * a property of anything keyed to a browser and it is stated in the UI rather
 * than hidden, because an admin who believes a ban is absolute will not reach
 * for the control that actually is: revoking the link, which ejects everybody
 * it admitted and forces a new one to be handed out. See the migration header.
 */
export async function banGuest(
  slug: string,
  guestId: string,
  reason?: string,
): Promise<GuestResult> {
  if (!idSchema.safeParse(guestId).success) {
    return { ok: false, error: 'Invalid guest' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can remove a guest' }
  }

  const admin = createAdminClient()

  // Their door name, read before the trigger deletes the row that holds it.
  // Without it the ban list is a column of uuids, which is unreadable to the
  // person who has to decide whether to lift one.
  const { data: guest } = await admin
    .from('tenant_guests')
    .select('display_name')
    .eq('tenant_id', context.tenant.id)
    .eq('guest_id', guestId)
    .maybeSingle()

  const { error } = await admin.from('tenant_bans').upsert(
    {
      tenant_id: context.tenant.id,
      guest_id: guestId,
      display_name: guest?.display_name ?? null,
      banned_by: context.user.id,
      reason: reason?.trim() || null,
    },
    { onConflict: 'tenant_id,guest_id' },
  )

  if (error) return { ok: false, error: `Could not ban that guest: ${error.message}` }

  await reapOrphanedGuests([guestId])

  refresh(slug)
  return { ok: true }
}

/** Let somebody back in. The ban row goes; they still need a live link. */
export async function liftBan(slug: string, guestId: string): Promise<GuestResult> {
  if (!idSchema.safeParse(guestId).success) {
    return { ok: false, error: 'Invalid guest' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can lift a ban' }
  }

  const { error } = await createAdminClient()
    .from('tenant_bans')
    .delete()
    .eq('tenant_id', context.tenant.id)
    .eq('guest_id', guestId)

  if (error) return { ok: false, error: `Could not lift the ban: ${error.message}` }

  refresh(slug)
  return { ok: true }
}

export interface BanView {
  guestId: string
  displayName: string | null
  reason: string | null
  createdAt: string
}

/** Everybody currently kept out of this space. */
export async function listBans(slug: string): Promise<BanView[]> {
  const context = await requireTenant(slug)
  if (!hasRole(context, ['owner', 'admin'])) return []

  const { data } = await createAdminClient()
    .from('tenant_bans')
    .select('guest_id, display_name, reason, created_at')
    .eq('tenant_id', context.tenant.id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    guestId: row.guest_id as string,
    displayName: row.display_name as string | null,
    reason: row.reason as string | null,
    createdAt: row.created_at as string,
  }))
}


/**
 * A visitor ending their own visit.
 *
 * The counterpart to `removeGuest` above, with the roles reversed: that one is
 * a host showing somebody out, this one is the guest leaving of their own
 * accord - so it takes no slug from a form and trusts nothing the caller says
 * about who they are. The session's own id is the only id it touches.
 *
 * Why it deletes the account rather than just the admission row: an anonymous
 * account is not an account anybody has. Nobody signed up for it, nobody can
 * sign back into it - there is no password and no address to send one to - and
 * `enterAsGuest` mints a fresh one on the next click of a link. Leaving the
 * admission row behind would mean the reaper collects it hours later, and
 * leaving the *account* behind would mean a permanent row in `auth.users` for
 * every person who ever glanced at a lounge. So the honest thing is to take
 * both now, which is exactly what the reaper does on a timer.
 *
 * The `is_anonymous` guard is the same one the reaper makes, for the same
 * reason and with more at stake: this is reachable from a button. A member who
 * somehow reached it must not be able to delete their own paid account by
 * clicking "leave".
 *
 * Leaving a *match* is deliberately not this. A guest invited to the lounge who
 * wanders into a battle and leaves it again has not ended their visit - they
 * have walked out of a room - and evicting them from the space for it would be
 * a trap. The battle room navigates; only the space's own exit calls this.
 */
export async function leaveAsGuest(): Promise<GuestResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Nobody is signed in' }
  if (!user.is_anonymous) {
    // A member pressing this would be asking us to delete their account, which
    // is not what the button says.
    return { ok: false, error: 'Only a visitor can leave this way' }
  }

  const admin = createAdminClient()

  // The admissions first, so that a failure to delete the account still ends
  // the visit. The other order can leave somebody admitted to a space with no
  // account behind the id, which `tenant_role()` would go on honouring until
  // the row expired.
  const { error: rowError } = await admin
    .from('tenant_guests')
    .delete()
    .eq('guest_id', user.id)

  if (rowError) {
    return { ok: false, error: `Could not end the visit: ${rowError.message}` }
  }

  /**
   * Sign out before the account goes, so the browser is not left holding a
   * token for a user that no longer exists - which is what turns "leave" into
   * an unexplained error on the next navigation.
   *
   * Through `closeEndedVisit` rather than a bare `signOut()`, so that pressing
   * the button and being shown the door are the same act rather than two that
   * look alike. The admissions have just been deleted, so it finds nothing
   * vouching for this session and closes it - the identical condition the proxy
   * evaluates for somebody whose link merely ran out. That is what makes
   * leaving actually leave no matter which of the two happened.
   */
  await closeEndedVisit(supabase, user)

  // Through the same collector every other path uses, so the "is it anonymous,
  // does anything still vouch for it" pair of checks is written once. The visit
  // is over either way - the rows are gone and the session is closed - so a
  // failure here is housekeeping that failed, not the act failing.
  await reapOrphanedGuests([user.id])

  return { ok: true }
}

// ---------------------------------------------------------------------------
// The backoffice's copies
// ---------------------------------------------------------------------------
// Same two acts, reached by a different door. A backoffice admin is not
// necessarily a member of the space they are moderating - that is the whole
// point of a backoffice - so `requireTenant()` would refuse them, and these
// take the tenant id directly having proved platform-level standing instead.

export async function revokeGuestLinkAsAdmin(linkId: string): Promise<GuestResult> {
  if (!idSchema.safeParse(linkId).success) return { ok: false, error: 'Invalid link' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { data, error } = await admin
    .from('guest_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .select('tenant_id')
    .maybeSingle()

  if (error) return { ok: false, error: `Could not revoke the link: ${error.message}` }
  if (!data) return { ok: false, error: 'That link no longer exists' }

  // Before the delete, for the reason `guestsAdmittedBy` gives.
  const admitted = await guestsAdmittedBy([linkId])

  const { error: ejectError } = await admin
    .from('tenant_guests')
    .delete()
    .eq('tenant_id', data.tenant_id)
    .eq('link_id', linkId)

  if (ejectError) {
    return {
      ok: false,
      error: 'The link is revoked, but its guests could not be removed.',
    }
  }

  await reapOrphanedGuests(admitted)

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'guest-link.revoke',
    summary: `Revoked a guest link and ejected its guests`,
    detail: { linkId, tenantId: data.tenant_id },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Answering the door
// ---------------------------------------------------------------------------
// A link marked `requires_knock` leaves its holder standing outside with a row
// and no standing: `tenant_role()` answers null for them, so they can read
// nothing, join no Realtime topic and load no page in the space. These two
// functions are the only way out of that state, in either direction.
//
// Unlike everything above them, they are open to *any* member rather than to
// owners and admins. That is the point of a knock rather than an invitation -
// somebody is at the door of a room other people are already standing in, and
// requiring the owner to be online to answer would leave visitors waiting out
// their ten minutes in front of a room full of people who could see them.
//
// Guests cannot answer, which `hasRole` handles by omission: a visitor who was
// let in must not be able to hold the door open for the next one, or the first
// person through a forwarded link becomes the doorman.
//
// `DOORKEEPERS` itself lives in `./application.ts`, because the rail's poll -
// `src/app/api/t/[slug]/knocks/route.ts` - has to agree with these two about
// who may answer, and a `'use server'` module may export nothing but actions.

/**
 * Let somebody in.
 *
 * Two writes that have to happen in this order and mean different things.
 *
 * The admission itself is stamping `admitted_at` *and* pushing `expires_at` out
 * from the knock's ten minutes to a full visit - a knock that was answered has
 * to stop being a knock in both senses, or the visitor is let in and swept off
 * the floor by the reaper a few minutes later.
 *
 * Counting the use comes second and only now, which is the deliberate part. A
 * single-use knock link that spent its one use on somebody who was turned away
 * would be a link that can never admit anybody - the visitor is refused, the
 * link is dead, and the person who sent it has no idea why. So a use is what an
 * admission costs, not what an attempt costs.
 */
export async function admitGuest(slug: string, guestId: string): Promise<GuestResult> {
  if (!idSchema.safeParse(guestId).success) {
    return { ok: false, error: 'Invalid guest' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, DOORKEEPERS)) {
    return { ok: false, error: 'Only somebody in this space can answer the door' }
  }

  const admin = createAdminClient()

  const { data: knocking, error } = await admin
    .from('tenant_guests')
    .update({
      admitted_at: new Date().toISOString(),
      expires_at: admissionExpiry(),
    })
    .eq('tenant_id', context.tenant.id)
    .eq('guest_id', guestId)
    // Scoped to somebody actually waiting. Without it, this doubles as a way to
    // silently extend any guest's visit by pressing a button meant for a door.
    .is('admitted_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('link_id')
    .maybeSingle()

  if (error) return { ok: false, error: `Could not let them in: ${error.message}` }
  if (!knocking) {
    // Gave up, timed out, or somebody else answered first. All three are the
    // same thing to the person clicking, and none of them is an error worth
    // dressing up as one.
    return { ok: false, error: 'They are not waiting any more' }
  }

  if (knocking.link_id) {
    const { data: link } = await admin
      .from('guest_links')
      .select('uses')
      .eq('id', knocking.link_id)
      .maybeSingle()

    if (link) {
      // Read-then-write, with the same slack the door itself accepts on this
      // column - see the note on the race in enter.ts. Two admins answering two
      // knocks in the same instant can undercount by one, which costs a link one
      // extra admission and nothing else.
      await admin
        .from('guest_links')
        .update({ uses: link.uses + 1 })
        .eq('id', knocking.link_id)
    }
  }

  refresh(slug)
  return { ok: true }
}

/**
 * Turn somebody away.
 *
 * The row is deleted rather than marked refused, which is the same choice
 * `removeGuest` makes and has the same consequence: there is nothing left to
 * expire and nothing to clean up, and the waiting page finds no row and says
 * so. It also means a refusal is not a record - if the same person knocks again
 * on a link that still has uses, nothing here remembers the first time. That is
 * intended. A knock is a question about right now, and a permanent no is what
 * revoking the link is for.
 */
export async function refuseGuest(slug: string, guestId: string): Promise<GuestResult> {
  if (!idSchema.safeParse(guestId).success) {
    return { ok: false, error: 'Invalid guest' }
  }

  const context = await requireTenant(slug)
  if (!hasRole(context, DOORKEEPERS)) {
    return { ok: false, error: 'Only somebody in this space can answer the door' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('tenant_guests')
    .delete()
    .eq('tenant_id', context.tenant.id)
    .eq('guest_id', guestId)
    // Only somebody still outside. A refusal that could reach an admitted guest
    // would be an eject wearing the wrong label, and eject is `removeGuest`,
    // which is owner-and-admin only for good reason.
    .is('admitted_at', null)

  if (error) return { ok: false, error: `Could not turn them away: ${error.message}` }

  refresh(slug)
  return { ok: true }
}

/*
  Who is waiting, for whoever is looking at the rail, was a Server Action here.

  It is `GET /api/t/[slug]/knocks` now, and the route handler carries the whole
  reason. The short version: it is polled every eight seconds on every page, and
  a polled Server Action re-renders the page it is polled from.
*/


/**
 * The door a spoken code names, or a sentence saying why not.
 *
 * ---------------------------------------------------------------------------
 * Unauthenticated on purpose, and what that costs
 * ---------------------------------------------------------------------------
 * Whoever types a code has no account - that is the entire premise of a guest
 * link - so there is nobody to rate-limit by. Six characters is guessable, and
 * the migration says so out loud: a code is a *convenience*, not a credential.
 * What bounds the damage is that it names one link, dies when that link is
 * revoked, and that `LINK_TTL_DAYS` gives most of them a week. A door that must
 * not be guessed wants `requires_knock`, where somebody still has to be let in,
 * and that flag travels with the link the code resolves to.
 *
 * The refusals are deliberately one sentence, and the same one. "No such code"
 * and "that link is used up" would tell somebody guessing which half of the
 * space they had hit - the distinction is worth nothing to the person holding a
 * real code and worth something to the person trying every code.
 */
export type JoinResult = { ok: true; path: string } | { ok: false; error: string }

const NO_SUCH_DOOR = 'That code does not open anything. Check it and try again.'

export async function resolveJoinCode(input: string): Promise<JoinResult> {
  const code = normaliseJoinCode(input)
  // Refused without a query. A code that is not a code cannot be in the column,
  // and free text has no business reaching the database.
  if (!code) return { ok: false, error: NO_SUCH_DOOR }

  /*
   * Service role, because `guest_links` is not readable by anon and must not
   * become so. The row holds a token that opens a space; this reads it, checks
   * the link is live, and hands back only the path.
   */
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('guest_links')
    .select('token, uses, max_uses, expires_at, revoked_at')
    .eq('code', code)
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) return { ok: false, error: NO_SUCH_DOOR }

  /*
   * Expiry and uses checked here rather than in the query, because the partial
   * unique index cannot cover `now()` - see the migration. `linkProblem` is the
   * same function the door itself applies, so a code cannot admit somebody the
   * link would have turned away.
   */
  const problem = linkProblem({
    uses: data.uses,
    maxUses: data.max_uses,
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
  })
  if (problem) return { ok: false, error: NO_SUCH_DOOR }

  return { ok: true, path: `/g/${data.token}` }
}
