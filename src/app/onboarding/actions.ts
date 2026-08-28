'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { landingPath } from '@/domain/tenants/last-space'
import { TOUR_COOKIE, TOUR_MAX_AGE, TOUR_VERSION } from '@/lib/onboarding'
import { requireUser } from '@/lib/auth'

/**
 * Remember that this account has been shown around.
 *
 * Written from a server action rather than during the render of /onboarding,
 * because a render may not set cookies - and because the honest moment is not
 * "the page loaded" but "somebody got to the end of it or said no thanks".
 *
 * The stamp is a cookie rather than a column on `user_profiles`, unlike the
 * username stamp this flow sits next to. The two are different kinds of fact:
 * a chosen handle is a property of the account that has to survive a new laptop,
 * whereas having read an explanation is a property of a browser, and a migration
 * plus a backfill is a lot of machinery to avoid showing somebody six panels
 * they can close in one click. Losing it costs one skippable screen.
 */
async function stamp(): Promise<void> {
  const jar = await cookies()
  jar.set(TOUR_COOKIE, TOUR_VERSION, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOUR_MAX_AGE,
  })
}

/**
 * Reached the last panel. Records it and stays where it is.
 *
 * No redirect: the person is still reading, and the panel they are on is the
 * one asking them to create a space. This exists so that closing the tab there
 * is not punished with the same tour on the next sign-in.
 */
export async function markOnboardingSeen(): Promise<void> {
  await requireUser()
  await stamp()
}

/**
 * No thanks.
 *
 * Records the stamp first, so that skipping actually skips - without it the next
 * navigation home would route straight back here, and the button would read as
 * broken. Where it goes afterwards is `landingPath`'s answer rather than a
 * hardcoded `/tenants`, for the reason `finishWelcome` gives: somebody who
 * accepted an invitation on the way in belongs in that space, not in a picker.
 */
export async function skipOnboarding(): Promise<never> {
  const { user, supabase } = await requireUser()
  await stamp()
  redirect(await landingPath(supabase, user))
}
