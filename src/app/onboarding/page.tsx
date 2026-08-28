import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShootingStars } from '@/app/components/shooting-stars'
import { OnboardingScreen } from '@/app/onboarding/onboarding-screen'
import { readEntitlementRefreshingIfInactive } from '@/domain/billing/entitlement'
import { resolveFeatures } from '@/domain/flags/queries'
import { landingPath } from '@/domain/tenants/last-space'
import { listMyInvitations, listMyTenants } from '@/domain/tenants/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { readLocale } from '@/app/i18n/preference'

export const metadata: Metadata = {
  title: 'Welcome',
}

export const dynamic = 'force-dynamic'

/**
 * The first screen of an account with nowhere to go.
 *
 * Somebody who has just registered has a name and a peep - /welcome asked for
 * those - and then, until now, arrived at a workspace picker listing nothing, one
 * sentence of explanation and a form asking for a URL. That page answers "which
 * space" for people who have several; it was never an answer to "what is this",
 * which is the only question a brand new account has.
 *
 * So this is the tour, and the space is created at the end of it rather than
 * before it. Six panels about the six things a space is for, then either the
 * create form or the price - see <OnboardingScreen> for that fork - and a skip on
 * every one of them.
 *
 * Reached through `landingPath`, which sends anybody here who has no space to go
 * back to and has not seen it. Not a wall: the route stays open afterwards, and
 * the same panels live behind a row in every space's account menu (see
 * <TourWidget>), because "once, ever" is the wrong number of times to explain
 * what a café is for.
 */
export default async function OnboardingPage() {
  const { user, supabase } = await requireUser()

  /**
   * A visitor is not here to be sold a space.
   *
   * Same guard, and the same reason, as the one at the top of the workspace
   * picker: everything below reads rows a guest does not have - an entitlement
   * keyed on an email address they were never asked for, a membership list, a
   * form that starts a Stripe subscription. `landingPath` puts them back in the
   * room they were let into, or on the page that says the visit ended.
   */
  if (user.is_anonymous || !user.email) redirect(await landingPath(supabase, user))

  const [tenants, invitations, entitlement, features] = await Promise.all([
    listMyTenants(supabase, user.id),
    listMyInvitations(supabase),
    // Straight back from Stripe is exactly when somebody arrives here with a
    // seat the mirror has not heard about yet, and this page's whole last panel
    // is the question "may you create a space" - so refresh before reading it
    // rather than showing a paying customer the price again.
    readEntitlementRefreshingIfInactive(
      supabase,
      createAdminClient() as unknown as typeof supabase,
      user.id,
      user.email,
    ),
    resolveFeatures(supabase),
  ])

  /**
   * Anybody who already has somewhere to be goes there instead.
   *
   * The tour is for an empty account, and both of these mean it is not one. A
   * member of a live space arrives here only because their last-space cookie was
   * cleared - a new browser, mostly - and the picker is the right answer for
   * them. Somebody holding an invitation is one click from a space they were
   * asked to join, and selling them a subscription in front of that door would be
   * the worst possible first screen.
   *
   * Deliberately `/tenants` rather than `landingPath`, which would answer
   * `/tenants` for the first case and could answer *this route* for neither -
   * being explicit here keeps the redirect readable and cannot loop.
   */
  const active = tenants.filter((tenant) => !tenant.archived)
  if (active.length > 0 || invitations.length > 0) redirect('/tenants')

  // Has to agree with the gate in createTenant, which skips its Stripe check on
  // exactly this condition - see the same line, and the same warning, on the
  // workspace picker.
  const canCreate = entitlement.canCreate || !features.billing

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <ShootingStars />
      <OnboardingScreen
        features={features}
        canCreate={canCreate}
        entitlement={entitlement}
        // The reader's own, which is the day this comment was waiting for: the
        // saved preference, or their browser's, resolved by `readLocale`.
        locale={await readLocale()}
      />
    </main>
  )
}
