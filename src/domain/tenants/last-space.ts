import 'server-only'
import { cookies } from 'next/headers'
import { guestArrival } from '@/domain/guests/application'
import { GUEST_LEFT_PATH, liveAdmission } from '@/domain/guests/session'
import { hasChosenUsername } from '@/domain/profile/username-queries'
import { findTenantIdBySlug } from '@/domain/tenants/queries'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { LAST_SPACE_COOKIE } from '@/lib/last-space'
import { hasSeenTour, TOUR_COOKIE } from '@/lib/onboarding'

/**
 * Where a signed-in person should land.
 *
 * The cookie says where they were; this says whether they may still go there.
 * Both questions have to be asked, because the cookie outlives the membership
 * that justified it - somebody who left a workspace, or was removed from one,
 * would otherwise be redirected out of the app into a 404 with no obvious way
 * back to the picker.
 *
 * Falls back to `/tenants` on anything doubtful, which is the answer the app
 * gave before this existed. Archived spaces count as doubtful: landing straight
 * in a read-only workspace is a confusing thing to happen to you without asking.
 */
export async function landingPath(
  supabase: Client,
  /**
   * The session, not just its id.
   *
   * `is_anonymous` is what separates "a visitor whose afternoon ended" from "a
   * member who has not finished signing up", and those two want opposite pages
   * - see the branch after `guestLanding` below.
   */
  user: { id: string; is_anonymous?: boolean },
): Promise<string> {
  const userId = user.id

  /**
   * A visitor goes back to the room they were let into. Before anything else.
   *
   * This has to be the first question because every check below it is written
   * about members and gives a guest the wrong answer twice over. They have no
   * `user_profiles` row - they never signed up, so nothing ever wrote one - so
   * the wizard gate sent them to `/welcome` and asked a visitor to choose a
   * username. And they have no `tenant_members` row either, so surviving that
   * would have landed them on `/tenants`, a picker listing nothing.
   *
   * That is the bug behind "reload and you are back at the welcome screen": a
   * guest's session is perfectly good and outlives the tab, but the one
   * function that decides where a session lands did not know guests existed.
   */
  const visiting = await guestLanding(supabase, userId)
  if (visiting) return visiting

  /**
   * An anonymous session with nowhere to visit is a visit that has ended.
   *
   * This is the bug behind landing on `/welcome` after leaving a match. An
   * anonymous session only ever exists because somebody walked through a guest
   * door - `enterAsGuest` is the one thing in the app that makes one - so when
   * `guestLanding` finds no live admission, the visit is over. Every check
   * below this line is written about members and gives that person the wrong
   * answer: they have no `user_profiles` row, so `hasChosenUsername` is false,
   * so they were sent to `/welcome` and asked to choose a username.
   *
   * And `/welcome` sends anonymous users straight back here (see its page), so
   * the two bounced off each other - which is why it looked like the app simply
   * *was* the welcome screen for them rather than like a redirect gone wrong.
   *
   * `/g/left` is the page that says the visit ended, and it is the same place
   * `requireTenant` sends a lapsed guest who asks for a workspace page. Both
   * doors now lead to the same room - and that room is where the proxy closes
   * the session, so this redirect happens once rather than on every visit
   * forever. Before it did, this line was one half of a loop with no way out of
   * it: here to `/g/left`, and `/g/left`'s own buttons back to here.
   */
  if (user.is_anonymous) return GUEST_LEFT_PATH

  /**
   * Before anywhere, the welcome wizard - once, ever.
   *
   * This function is already the one answer to "where does a signed-in person
   * go", asked by the root page, by password sign-in and by everything the auth
   * routes bounce through, so the check belongs here rather than copied into
   * each of them. It is a *landing* gate, not a wall: somebody who bookmarks a
   * workspace still gets in. Making it a wall would mean the proxy enforcing it
   * on every request, which is a database round trip on every navigation
   * forever to catch a case that resolves itself the first time anyone follows
   * a link home.
   *
   * It cannot loop: the wizard's own page is not reached through here, and its
   * last step writes the stamp this reads.
   */
  if (!(await hasChosenUsername(supabase, userId))) return '/welcome'

  const slug = await readLastSpace()

  /**
   * Nowhere to go back to, and never shown around: the tour.
   *
   * This is the branch that used to hand a brand new account the workspace
   * picker - a page listing nothing, above a form asking for a URL. It answers
   * "which space" for somebody who has several and has nothing to say to
   * somebody who has none.
   *
   * The cookie is the only thing checked here, deliberately: whether this person
   * has a space, an invitation or a seat are three database questions, and
   * /onboarding has to ask all three anyway to decide what its last panel says.
   * So it asks them once and redirects onward itself - which is also what keeps
   * a member whose cookie was merely cleared out of a tour they do not need.
   *
   * It cannot loop. /onboarding is not reached through this function, and both
   * of its exits - the skip button and the created space - write the stamp or a
   * membership before coming back here.
   */
  if (!slug && !hasSeenTour((await cookies()).get(TOUR_COOKIE)?.value)) {
    return '/onboarding'
  }

  if (!slug) return '/tenants'

  const tenantId = await findTenantIdBySlug(supabase, slug)
  if (!tenantId) return '/tenants'

  const [{ data: membership }, { data: tenant }] = await Promise.all([
    supabase
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('tenants_read_model')
      .select('archived')
      .eq('id', tenantId)
      .maybeSingle(),
  ])

  if (!membership || !tenant || tenant.archived) return '/tenants'

  return `/t/${slug}`
}

/**
 * Where a guest belongs right now, or null if the caller is not one.
 *
 * Reads under the caller's own client, which is the point: the
 * `tenant_guests` select policy shows somebody their own row and nothing else,
 * so a member asking this question reads back nothing and falls through to the
 * member path below. There is no "are you a guest" flag to check first.
 *
 * The expiry filter is what makes this a *live* admission rather than a memory
 * of one. A guest whose twelve hours are up, or who has been shown the door,
 * has no row and gets null - and lands wherever a signed-in stranger lands,
 * which is the honest answer.
 */
async function guestLanding(supabase: Client, userId: string): Promise<string | null> {
  // Through `liveAdmission` rather than a query written out here, because the
  // proxy has to ask the identical question before it closes a session and the
  // two disagreeing is how somebody gets signed out of a room they are standing
  // in. See the header on that module.
  //
  // A failed read is treated as "not a guest", which is what this function did
  // before it had a way to tell the two apart. Deciding where to send a page is
  // not the same act as ending somebody's session, and only the second one has
  // to be careful - see `closeEndedVisit`.
  const row = await liveAdmission(supabase, userId).catch(() => null)

  if (!row) return null

  const { data: tenant } = await supabase
    .from('tenants_read_model')
    .select('slug, archived')
    .eq('id', row.tenant_id)
    .maybeSingle()

  if (!tenant || tenant.archived) return null

  /**
   * The same destination the link admitted them to in the first place, so a
   * reload inside a match puts them back in the match rather than in the
   * lounge. `guestArrival` confines it to this space and falls back on its own.
   *
   * Through the service role, because `guest_links` has no policy for anybody
   * holding a session - deliberately, see the migration: the rows carry live
   * tokens. Only `destination` is selected, and only for the id already sitting
   * on this caller's own admission row, so nothing is read that the caller did
   * not already prove they were let in by.
   */
  const { data: link } = row.link_id
    ? await createAdminClient()
        .from('guest_links')
        .select('destination')
        .eq('id', row.link_id)
        .maybeSingle()
    : { data: null }

  return guestArrival(link?.destination, tenant.slug)
}

/** The remembered slug, or null. Shape is validated where it is written. */
async function readLastSpace(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(LAST_SPACE_COOKIE)?.value?.trim() || null
}

/**
 * Forget it, on the way out.
 *
 * Not a security measure - the value proves nothing - but the next person to
 * sign in on a shared machine should not be told where the last one was.
 */
export async function forgetLastSpace(): Promise<void> {
  const jar = await cookies()
  jar.delete(LAST_SPACE_COOKIE)
}
