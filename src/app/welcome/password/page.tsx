import { ShootingStars } from '@/app/components/shooting-stars'
import { PasswordSetup } from '@/app/welcome/password/password-setup'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Where an invite lands.
 *
 * The invite mail points here rather than at /welcome, and the difference is the
 * password: accepting an invite signs you in without ever asking for one, so
 * this is the only moment the account can be given a way back in that does not
 * depend on another email arriving.
 *
 * `requireUser` is the whole guard. Getting here means /auth/confirm verified an
 * invite token minutes ago; without that there is no session and this redirects
 * to /login, which is also what makes the URL safe to leave lying in an inbox.
 *
 * Skippable on purpose. Somebody who would rather sign in by link every time is
 * not wrong, and a wall between them and the app would be a strange thanks for
 * accepting an invitation.
 */
export default async function WelcomePasswordPage() {
  const { user } = await requireUser()

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <ShootingStars />
      <PasswordSetup email={user.email ?? ''} />
    </main>
  )
}
