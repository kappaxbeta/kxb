import Link from 'next/link'
import { redirect } from 'next/navigation'
import Logo from '@/app/components/logo'
import { type Locale, localePath } from '@/app/i18n/locales'
import { waitlistDict } from '@/app/i18n/waitlist'
import { WaitlistForm } from '@/app/waitlist/waitlist-form'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * The queue.
 *
 * Reachable whatever the door is doing, and it says which. When registration is
 * open there is no reason to queue, so the page says so and points at /signup
 * rather than quietly taking an application that nobody will ever need to
 * approve - a waiting list that collects rows while the door stands open is a
 * list that teaches its admin to ignore it.
 *
 * `?email=` is filled in by the OAuth callback after it turns somebody away, so
 * a person who just clicked through Google does not have to remember which of
 * their addresses it used. `?reason=` distinguishes "the door is shut" from
 * "your invite was no good", which are different things to be told.
 */
export async function WaitlistPanel({
  searchParams,
  locale,
}: {
  searchParams: Promise<{ email?: string; reason?: string }>
  locale: Locale
}) {
  const { email, reason } = await searchParams
  const dict = waitlistDict(locale)

  // Somebody already signed in has, by definition, got in.
  if (await getUser()) redirect('/tenants')

  const supabase = await createClient()
  const open = await isRegistrationOpen(supabase)

  return (
    <main lang={locale} className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/*
          The way back, and it has to be here rather than only after the form is
          sent.

          This page is a destination in its own right: it is where the landing
          page's own button goes, where the OAuth callback lands somebody it has
          just turned away, and where every "request an invite" link in a post
          points. So a good share of the people reading it have never seen the
          front page and have no idea what they are queueing for - and until
          now, the only link home was inside the confirmation that replaces the
          form once you have already committed an address to it.

          The mark rather than a "← Back" link: this is the first screen of the
          product for these visitors, so the thing that takes them to the pitch
          should also be the thing that tells them whose pitch it is.
        */}
        <Link
          href={localePath(locale, '/')}
          className="mb-8 inline-flex items-center gap-3 text-sm text-ink-muted transition hover:text-ink"
        >
          <Logo />
          <span className="uppercase tracking-widest font-pixel">team</span>
        </Link>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          {open ? dict.openTitle : dict.closedTitle}
        </h1>

        {open ? (
          <>
            <p className="mb-6 text-sm text-ink-muted">{dict.openBody}</p>
            <Link
              href={localePath(locale, '/signup')}
              className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-white transition hover:opacity-90"
            >
              {dict.openCta}
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-ink-muted">{dict.closedBody}</p>

            {reason === 'invite' && (
              <p
                role="alert"
                className="mb-5 rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm"
              >
                {dict.invalidInvite}
              </p>
            )}

            <WaitlistForm defaultEmail={email ?? ''} locale={locale} />
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          {dict.haveAccount}{' '}
          <Link
            href={localePath(locale, '/login')}
            className="font-medium text-accent hover:underline"
          >
            {dict.signIn}
          </Link>
        </p>
      </div>
    </main>
  )
}
