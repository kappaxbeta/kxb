import { redirect } from 'next/navigation'
import { readLocale } from '@/app/i18n/preference'
import { ShootingStars } from '@/app/components/shooting-stars'
import { WelcomeWizard } from '@/app/welcome/welcome-wizard'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { landingPath } from '@/domain/tenants/last-space'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * The first minute of an account.
 *
 * Two questions, both about *you* rather than about any workspace, which is why
 * this sits outside /t/[slug] entirely: a new account may not be in a space yet,
 * and the answers follow them into every space they ever join.
 *
 * Neither question is new - both live on the settings page too, and this is
 * emphatically not a second implementation of them. Same two server actions,
 * same validation, same error messages. What the wizard adds is the *asking*:
 * a handle derived from an email address and a default penguin are fine
 * defaults and terrible identities, and nobody goes looking in Settings for a
 * problem they have not noticed yet.
 *
 * Deliberately *not* guarded by the stamp that summons it, which is the one
 * subtle thing about this page. Both actions it calls end with
 * `revalidatePath('/', 'layout')` - they have to, because a name and an animal
 * show up on every page that draws you - and that refreshes this route as part
 * of the action's response. A "you have already chosen, go home" redirect here
 * would therefore fire the instant step one saved, throwing somebody out of the
 * wizard between its two questions.
 *
 * Nothing is lost by leaving it open. Being sent here is what is one-time, and
 * landingPath() owns that: it routes to /welcome only while the stamp is
 * missing, and the wizard's own exit asks it where to go. Somebody who types
 * the URL afterwards gets the settings page's two controls in a nicer coat.
 */
export default async function WelcomePage() {
  const { user, supabase } = await requireUser()

  /**
   * With one exception: a guest is not here to set up an account.
   *
   * The wizard asks a signed-in person to choose a handle and an animal that
   * follow them into every space. A visitor has neither - no `user_profiles`
   * row, because they never signed up, which is the entire premise of a guest
   * link - so the page asked somebody who was told "you don't need an account"
   * to start making one.
   *
   * Not a redirect back into their space, note. This is the exception to the
   * paragraph above about redirects here being harmful, and it is safe for the
   * same reason that one is not: a guest never saves anything through the
   * wizard, so there is no mid-flight save for this to interrupt.
   * `landingPath` puts them back in the room they were let into.
   */
  if (user.is_anonymous) redirect(await landingPath(supabase, user))

  // The derived handle is the field's starting value, not a placeholder. It is
  // very often the right answer - `jane-doe` from jane.doe@example.com - and
  // pre-filling it turns the step from a demand into a confirmation.
  const [suggestion, avatar] = await Promise.all([
    readDisplayName(supabase, user.id),
    readProfileAvatar(supabase, user.id),
  ])

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <ShootingStars />
      <WelcomeWizard
        suggestedUsername={suggestion}
        initialAvatar={avatar}
        locale={await readLocale()}
      />
    </main>
  )
}
