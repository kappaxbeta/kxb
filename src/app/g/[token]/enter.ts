'use server'

import { redirect } from 'next/navigation'
import { tenantLimitStrict, UNKNOWN_LIMIT } from '@/domain/billing/quota'
import {
  admissionExpiry,
  capacityProblem,
  guestArrival,
  guestDisplayName,
  knockExpiry,
  linkProblem,
} from '@/domain/guests/application'
import { isKnownAvatar } from '@/domain/lounge/avatars'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Walking through the door.
 *
 * The one place a stranger becomes somebody the app will let into a room, so
 * the order of operations here is the whole security story and is worth reading
 * as a sequence rather than as five independent checks.
 *
 *   1. Find the link. Through the service role, necessarily - the caller holds
 *      no session for this space, so there is no policy that could show it to
 *      them without being open to the world.
 *   2. Ask whether it is usable at all, and whether there is room.
 *   3. *Then* mint an identity, and not before. Signing in first would leave an
 *      anonymous user behind for every mistyped URL and every bounce off a full
 *      room, which is exactly the litter this feature is trying not to create.
 *   4. Admit them, and count the use.
 *
 * Steps 2 and 4 are not atomic, and that is a deliberate acceptance rather than
 * an oversight - see the note on the race further down.
 */

export type DoorResult = { ok: false; error: string }

export async function enterAsGuest(
  token: string,
  formData: FormData,
): Promise<DoorResult> {
  const admin = createAdminClient()

  const { data: link, error } = await admin
    .from('guest_links')
    .select(
      'id, tenant_id, max_uses, uses, expires_at, revoked_at, requires_knock, destination',
    )
    .eq('token', token)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'Something went wrong opening that link. Try again.' }
  }

  const problem = linkProblem(
    link
      ? {
          maxUses: link.max_uses,
          uses: link.uses,
          expiresAt: link.expires_at,
          revokedAt: link.revoked_at,
        }
      : null,
  )
  if (problem || !link) return { ok: false, error: problem ?? 'That link is not valid.' }

  // Is there room? Both numbers come from the database rather than being
  // recomputed here, so the cap agrees with `tenant_role()` about who counts as
  // being inside - which means an expired guest frees their place whether or
  // not the reaper has run.
  const [limit, { data: current, error: countError }] = await Promise.all([
    // `tenantLimitStrict` and not `tenant_guest_limit`, which read the flag
    // alone: it answered with the installation's number and never with the one
    // this space bought, so a free space and a EUR 12 space were handed the
    // same guest cap. The strict variant exists for this door specifically -
    // see the note below, and the one on the function.
    tenantLimitStrict(admin, link.tenant_id, 'guests'),
    admin.rpc('tenant_guest_count', { p_tenant_id: link.tenant_id }),
  ])

  /**
   * A failed read is not "no cap".
   *
   * `null` is how a resolved limit says "unlimited", so a failure that came
   * back as null would be indistinguishable from one - and this check is the
   * *only* place the cap is enforced, since the admission below is written with
   * the service role and bypasses RLS. Failing open here would lift a billed
   * ceiling at exactly the moment it matters: a statement timeout or an
   * exhausted pool is what a full event looks like from in here.
   *
   * `UNKNOWN_LIMIT` is what keeps the two apart. Every other caller of
   * `quota.ts` deliberately fails *open*, because there a bad lookup costs a
   * seat an admin can see and correct; this one is the exception the strict
   * variant was written for.
   *
   * So it fails closed, and says so as a "try again" rather than as a "this
   * event is full" - the second would be a lie, and the person would stop
   * trying.
   */
  if (limit === UNKNOWN_LIMIT || countError) {
    return {
      ok: false,
      error: 'Could not check whether there is room right now. Try again in a moment.',
    }
  }

  // `limit` is already `number | null` here - UNKNOWN_LIMIT was handled above,
  // and null is the resolved answer for "no cap".
  const full = capacityProblem(limit, current ?? 0)
  if (full) return { ok: false, error: full }

  const { data: tenant } = await admin
    .from('tenants_read_model')
    .select('slug, archived')
    .eq('id', link.tenant_id)
    .maybeSingle()

  if (!tenant) return { ok: false, error: 'That space no longer exists.' }
  if (tenant.archived) {
    return { ok: false, error: 'That space has been archived and cannot be visited.' }
  }

  /**
   * An event that is over, or has not started.
   *
   * Asked of the database rather than computed from the row, so this and the
   * write policies cannot disagree about what time it is - `event_open()` is
   * the same function `event_guest_may_write()` consults, and a door that
   * admitted somebody the log would then refuse every write from would be a
   * worse experience than being turned away.
   *
   * Worded as the event rather than as the link, and that is the whole reason
   * this is a separate check instead of leaning on the link's own expiry. Both
   * would refuse; only this one says something true. "That link has expired"
   * sends somebody hunting for a newer link that does not exist, and the person
   * who sent it a fielding a message they cannot do anything about.
   */
  const { data: eventIsOpen } = await admin.rpc('event_open', {
    p_tenant_id: link.tenant_id,
  })

  if (eventIsOpen === false) {
    return {
      ok: false,
      error: 'This event has ended. The room is still there, but the doors are closed.',
    }
  }

  // ---------------------------------------------------------------------------
  // Whoever is already here keeps their account
  // ---------------------------------------------------------------------------
  /**
   * Three people can be standing at this door, and only one of them needs an
   * identity minting.
   *
   *   - A member of this space. They are sent in as themselves and nothing is
   *     written: no guest row, and no use taken off the link. Signing them in
   *     anonymously - which is what used to happen - swapped a member's own
   *     account for a guest pass to their own room, and the only way back was
   *     to notice and log in again.
   *   - Somebody signed in who is *not* a member. They come in as a guest,
   *     under the account they already have. Their session is untouched, they
   *     appear in the room as a guest like anybody else, and when the admission
   *     lapses they are simply themselves again.
   *   - A stranger with no session at all, which is the case this door was
   *     built for and the only one that mints anything.
   */
  const supabase = await createClient()
  const { data: signedIn } = await supabase.auth.getUser()

  /**
   * Somebody who was thrown out of this space.
   *
   * Checked against whatever session is standing here - anonymous or not -
   * because the identity a ban is recorded against is exactly the one an evicted
   * guest still holds. `evict_on_ban` deletes their admission and their
   * occupancy, so they vanish from the room, but their session survives and
   * this link is still live. Without this the ban lasted until they clicked
   * again: the door asked about the link, the capacity, the archive flag and the
   * window, and never once about the ban, and `is_guest_banned()` had no callers
   * at all. The admission below is written with the service role, so RLS is not
   * going to catch it either - this is the only place that can.
   *
   * What this does and does not buy is set out in the migration and has not
   * changed: it stops the same session coming back, which is the overwhelmingly
   * common case, and it does not stop somebody who clears their site data. The
   * recourse against a determined person is still to revoke the link.
   *
   * Worded as the space rather than as the ban. There is nothing for them to do
   * about it here, and an admin who wants to explain has a person to talk to.
   */
  if (signedIn.user) {
    const { data: banned } = await admin.rpc('is_guest_banned', {
      p_tenant_id: link.tenant_id,
      p_guest_id: signedIn.user.id,
    })

    if (banned) {
      return { ok: false, error: 'You cannot enter this space.' }
    }
  }

  const existing =
    signedIn.user && !signedIn.user.is_anonymous ? signedIn.user : null

  if (existing) {
    const { data: role } = await supabase.rpc('tenant_role', {
      p_tenant_id: link.tenant_id,
    })

    // Any role at all means they are already inside - including `guest`, which
    // is somebody holding a live admission from an earlier link. Handing them a
    // second one should put them back in the room, not through the door again.
    if (role) redirect(guestArrival(link.destination, tenant.slug))
  }

  // ---------------------------------------------------------------------------
  // Only now is an identity created
  // ---------------------------------------------------------------------------
  // An anonymous user is a real, permanent row in auth.users. Creating one is
  // the single irreversible thing this function does, so it happens after every
  // question that could have sent the visitor away, and never before - and not
  // at all for somebody who arrived with an account of their own.
  const session = existing
    ? { user: existing }
    : await (async () => {
        const { data, error: authError } = await supabase.auth.signInAnonymously()
        if (authError || !data.user) return null
        return { user: data.user }
      })()

  if (!session) {
    // The most likely cause by far is anonymous sign-ins being switched off on
    // the auth server, which is a deployment mistake rather than anything the
    // visitor did - so it says so plainly instead of blaming their link.
    return {
      ok: false,
      error: 'Guest access is not switched on for this deployment.',
    }
  }

  // The avatar arrives from a hidden field, so it is checked rather than
  // trusted - `isKnownAvatar` is the same guard the profile picker uses. An
  // unknown value becomes NULL and the scene falls back, which is better than
  // storing a string that resolves to a missing model and renders as nothing.
  const chosen = formData.get('avatar')?.toString() ?? ''

  /**
   * A knock link writes the same row, unadmitted.
   *
   * `admitted_at` null is the whole of the difference, and it is enough:
   * `tenant_role()` refuses to call them a guest until it is set, so they can
   * read nothing, join no Realtime topic and load no page in the space. The
   * name and animal they just chose are kept, which is the point of doing this
   * after the form rather than before - being let in should not mean filling it
   * in again.
   *
   * The expiry is the knock's ten minutes rather than the visit's twelve hours.
   * An unanswered knock is swept by the same reaper that sweeps a finished
   * visit, and `admitGuest` pushes it back out on the way in.
   */
  const knocking = link.requires_knock === true

  const { error: admitError } = await admin.from('tenant_guests').insert({
    tenant_id: link.tenant_id,
    guest_id: session.user.id,
    link_id: link.id,
    display_name: guestDisplayName(formData.get('name')?.toString()),
    avatar: isKnownAvatar(chosen) ? chosen : null,
    admitted_at: knocking ? null : new Date().toISOString(),
    expires_at: knocking ? knockExpiry() : admissionExpiry(),
  })

  if (admitError) {
    return { ok: false, error: 'Could not let you in. Ask for a fresh link.' }
  }

  /**
   * And onto the account, which is where everything that *draws* them looks.
   *
   * `tenant_guests.avatar` is this visit's record - who came in, as what - and
   * it is read by the guest list and the nameplate. It is not what puts a body
   * in a world: the lounge, the café and every XP resolve an animal through
   * `profile_avatars`, so a guest who carefully picked a crab at the door was
   * drawn as the default penguin the moment they arrived. Reported as "the
   * peeps choose in guests dont work", and it was two columns that had never
   * been introduced.
   *
   * Written through the admin client, like the row above: the session exists
   * but the guest is not a member of anything yet, and the row's own policy is
   * self-scoped rather than public.
   *
   * `ignoreDuplicates` is wrong here and `merge` is right - somebody visiting a
   * second space with a second link is choosing again, and the newer answer is
   * the one they just gave. A failure is *not* fatal: being let in matters more
   * than being let in as the right animal, and the rail's picker is a second
   * way to fix it.
   */
  if (isKnownAvatar(chosen)) {
    await admin.from('profile_avatars').upsert(
      { user_id: session.user.id, model: chosen, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }

  /**
   * Somebody at the door has not used the link yet.
   *
   * The use is counted by `admitGuest` instead. Counting it here would mean a
   * single-use knock link spends its one use on a visitor who is then turned
   * away - leaving a dead link, a refused stranger, and an owner with no idea
   * why the link they sent stopped working.
   */
  if (knocking) {
    redirect(`/g/${token}/waiting`)
  }

  // ---------------------------------------------------------------------------
  // Counting the use, and the race under it
  // ---------------------------------------------------------------------------
  // Two people opening a single-use link in the same second can both pass the
  // check above and both be admitted, because the check and this increment are
  // not one transaction. Left as is, knowingly: the failure is one extra
  // visitor in a room, both of whom were sent the link by the same person, and
  // the fix is a locking read on every redemption to prevent something with no
  // real consequence. The cap is enforced the same way and accepts the same
  // slack.
  //
  // What is *not* left to chance is the link dying afterwards - the increment
  // is unconditional, so a spent link stops admitting anybody even if it
  // briefly admitted one too many.
  await admin
    .from('guest_links')
    .update({ uses: link.uses + 1 })
    .eq('id', link.id)

  // Into whatever room the link was written for, which is the lounge unless
  // somebody said otherwise - `guestArrival` confines the answer to this space
  // and falls back to the lounge for anything it will not follow. The link made
  // from inside a match is why this is not simply the lounge any more: being
  // pulled into a game and landing in an empty room is not an invitation.
  //
  // `redirect` throws, so nothing below it runs and the caller never sees a
  // success value - hence the return type being failures only.
  redirect(guestArrival(link.destination, tenant.slug))
}
