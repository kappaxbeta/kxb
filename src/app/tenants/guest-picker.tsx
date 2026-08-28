import Link from 'next/link'
import { spacesDict } from '@/app/i18n/spaces'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The workspace picker, for somebody who has no workspaces and no account.
 *
 * A guest reaches `/tenants` the same way a member does - the rail's "Switch
 * space" row, the 404's second button, `landingPath` falling back - and until
 * this existed they got the member's page with every sentence on it wrong.
 * "Signed in as " with nothing after it, because an anonymous session has no
 * email. An empty list under "No spaces yet. Create one below." A create form,
 * or a subscribe prompt, offering to sell a seat to somebody with no account to
 * attach it to. And a Sign out button.
 *
 * That last one is the reason this is a separate view rather than four
 * conditionals. Offering to sign out tells somebody they are signed *in* -
 * that we made them an account, that there is something to come back to. There
 * is not: the anonymous session behind a guest link is not something anybody
 * can return to, and pressing the button would have destroyed the only proof
 * they were admitted and left them staring at a room they could no longer
 * load. The rail already learned this and shows <GuestExit> instead; the picker
 * had not.
 *
 * So a visitor gets the one true sentence - you are here on a link - and the
 * things they can actually do with that: start an account and get a space of
 * their own for nothing, pick a plan instead, or go back to the room.
 */
export function GuestPicker({
  back,
  registrationOpen,
  locale,
}: {
  /** The room they came from, ready to walk back into. */
  back: string
  /** Whether the front door is open - decides which ask is honest. */
  registrationOpen: boolean
  /**
   * Resolved by the page rather than read here.
   *
   * A visitor on a guest link has no membership and no settings page, so their
   * only statement about language is the browser's - which `readLocale` already
   * falls back to. This page is the first thing they see that is about the
   * product rather than about the room, so it is worth getting right.
   */
  locale: Locale
}) {
  const t = spacesDict(locale)

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        {/* Not "signed in as", which is the sentence this page used to open
            with and the one thing a visitor must not be told. */}
        <p className="mt-1 text-sm text-ink-muted">{t.guest.body}</p>
      </header>

      <section className="rounded-lg border border-line bg-surface-raised px-4 py-4">
        <p className="text-sm">
          {t.guest.belong}{' '}
          {registrationOpen ? t.guest.open : t.guest.closed}
        </p>

        {/*
          The price used to be in the button, and it was the wrong number in the
          wrong place. "From €5/month" was true when a seat had to be bought
          before a space could exist; since tiers it is not - `free` is a real
          tier, `FREE_SPACES_PER_ACCOUNT` is one, and an email and a password
          get a working space with no card. /g/left already learned this and
          says "free"; this page was still quoting the old flow, which asks
          somebody standing in a borrowed room to decide about money before
          they have anything to spend it on.

          So both doors are named, in the order somebody would take them, and
          neither carries a number. The prices live on the landing page's
          pricing band, where they are read from the tiers table and cannot
          drift from what Checkout charges.
        */}
        {registrationOpen && (
          <p className="mt-2 text-sm text-ink-muted">{t.guest.freeNote}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {registrationOpen ? (
            <>
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition"
              >
                {t.guest.startFree}
              </Link>

              {/* The landing page's pricing band, not a page of our own: it is
                  already the one place the tiers are rendered from the table. */}
              <Link
                href="/#pricing"
                className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface"
              >
                {t.guest.pickPlan}
              </Link>
            </>
          ) : (
            // The same door the landing page's "Request an invite" leads to,
            // and the same branch /g/left picks. A CTA that leads to a closed
            // sign-up is worse than no CTA.
            <Link
              href="/waitlist"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition"
            >
              {t.guest.requestInvite}
            </Link>
          )}

          {/* Muted, and the third thing rather than the second. Three buttons
              in a row with the same border read as three equal offers; this is
              the way out, not an offer. */}
          <Link
            href={back}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            {t.guest.back}
          </Link>
        </div>
      </section>
    </div>
  )
}
