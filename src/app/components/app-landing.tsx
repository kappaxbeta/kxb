import Link from 'next/link'
import { redirect } from 'next/navigation'
import Logo from '@/app/components/logo'
import { PeepStage } from '@/app/components/peep-stage'
import { appLandingDict } from '@/app/i18n/app-landing'
import { fill } from '@/app/i18n/fill'
import { stance } from '@/app/i18n/stance'
import { type EventDoorView, listFeaturedDoors } from '@/domain/events/door'
import { isRegistrationOpen } from '@/domain/flags/queries'
import type { Locale } from '@/domain/i18n/locale'
import { landingPath } from '@/domain/tenants/last-space'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * The front page, as the installed app sees it.
 *
 * ===========================================================================
 * Why the app gets its own front page at all
 * ===========================================================================
 * The marketing landing page is a good page and it is aimed at somebody who has
 * never heard of this. It opens with a position, carries four rows of proof, a
 * plan and a price, and asks for a decision at the bottom. Somebody who has
 * installed the app has already made that decision - they are holding the
 * outcome of it - and being pitched to on every cold start is the software
 * equivalent of a shop assistant introducing the shop to a regular.
 *
 * There is a second reason and it is not about tone. A page written to sell has
 * prices on it, and prices are what may not be in an App Store build at all
 * (guideline 3.1.1). `.not-in-app` hides those on the marketing page, and it
 * works - but a page whose spine is a pricing table with the pricing table
 * removed is a page with a hole in it. Better to write the page the app
 * actually wants than to subtract from one that wanted something else.
 *
 * ===========================================================================
 * What it keeps from the marketing page, and what it drops
 * ===========================================================================
 * Keeps: **the stance**, in pixel, from `@/app/i18n/stance` - the one line the
 * product repeats verbatim everywhere, and the reason to keep it here is the
 * reason the sign-in card keeps it. **The stage**, because three peeps on a lit
 * podium is what the product looks like and no sentence does that job. **What
 * is on right now** - the chapter on air and any event with its doors open -
 * because that is the only part of the front page that is different today from
 * yesterday, and it is the part somebody opening the app twice a week is
 * actually checking.
 *
 * Drops: the price, the plan table, the four proof rows, the chip strip, the
 * three doors, the intro video, the shooting stars and the rotating panels.
 * Nothing here is sold and nothing links to the website to be sold there -
 * steering out of the app is its own guideline and its own rejection, see
 * `NOT_FOR_SALE_IN_APP`.
 *
 * ===========================================================================
 * Softer, concretely
 * ===========================================================================
 * The word was "softer" and it is worth writing down what that turned into,
 * because "make it calmer" is the kind of note that gets undone by the next
 * person who has a good idea for this screen:
 *
 *  - **One column, one thing per line.** Nothing overlaps, nothing is angled.
 *    The stage is the one exception and it is a picture, not a layer.
 *  - **No animation beyond the stage's own.** The marketing page has shooting
 *    stars and rotating holograms; a cold start on a phone is the worst
 *    possible moment to spend a frame budget on decoration.
 *  - **Warm grey and one accent.** The accent appears on the stance and on the
 *    button somebody most likely wants, and nowhere else.
 *  - **Generous vertical rhythm and a bounded measure.** It is read at arm's
 *    length, one-handed, often in the dark.
 */

export interface AppLandingTerms {
  registrationOpen: boolean
  /** Events with their doors open. Empty most weeks, and then nothing draws. */
  doors: EventDoorView[]
}

/**
 * Signed-in people never see this, exactly as they never see the marketing
 * page: they go back to the space they were last in.
 *
 * The check is a redirect rather than a branch because the shell opens `/` on
 * every cold start. Without it, somebody who is signed in would meet a "create
 * an account" button every time they opened their own app.
 *
 * Two reads after that, and both degrade to silence: a failed door query is an
 * empty array, and an empty array draws nothing at all rather than an empty
 * shelf.
 *
 * The channel is *not* read here. It comes in as props from the route, for the
 * portability reason spelled out on `universe` below.
 */
export async function appLandingTerms(): Promise<AppLandingTerms> {
  const supabase = await createClient()
  const user = await getUser()
  if (user) redirect(await landingPath(supabase, user))

  const [registrationOpen, doors] = await Promise.all([
    isRegistrationOpen(supabase),
    // The admin client, exactly as the marketing page does it: a featured door
    // is meant to be readable by a stranger with no session at all.
    listFeaturedDoors(createAdminClient() as unknown as Client),
  ])

  return { registrationOpen, doors }
}

export function AppLanding({
  locale,
  registrationOpen,
  doors,
  universe = false,
  episode = null,
}: {
  locale: Locale
  /**
   * Whether Project Oasis exists at all, and what is on air.
   *
   * Props with defaults rather than a read, and this is the same arrangement
   * `landing.tsx` makes for exactly the same reason: `src/domain/xo-universe/`
   * is held back from the public repository (see the DENY list in
   * `.sync-to-public.sh`), so a file that may ship there must not import it.
   * This one lives in `src/app/components/`, where most of its neighbours are
   * synced, which makes it a file that *will* be one day.
   *
   * The defaults are what make that safe rather than merely uncommitted: over
   * there nothing passes these, `universe` is false, and the row that links to
   * `/xo-universe` - a route the public tree does not have - is never drawn.
   * Absent channel, absent link. `page.tsx` and `de/page.tsx` are not synced
   * and are where `landingChannel` is actually called.
   */
  universe?: boolean
  episode?: { number: number; title: string } | null
} & AppLandingTerms) {
  const t = appLandingDict(locale)
  const position = stance(locale)

  /*
   * The same fork the marketing page makes, and for the same reason: when
   * sign-ups are closed, "create an account" is a button that leads to a
   * refusal. `/waitlist` is not a purchase and not a steer - it is the same
   * product asking to be let in later.
   */
  const joinHref = registrationOpen ? '/signup' : '/waitlist'
  const joinLabel = registrationOpen ? t.signUp : t.waitlist

  return (
    <main
      /*
       * `min-h-dvh`, not `min-h-screen`. In a web view `100vh` is the viewport
       * without the browser chrome that is nonetheless on screen, so a page
       * centred in it sits slightly too low and the last line hides under the
       * home indicator. `dvh` is the one that means what this needs.
       *
       * `justify-start` rather than centred, now that there is a stage and a
       * band under it: a column taller than the screen centred in it is a
       * column whose top is cut off, and the greeting is the part that must
       * not be.
       */
      className="relative flex min-h-dvh flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-16 text-center"
    >
      {/*
        Two layers, and the first one is subtraction.

        The document paints a starfield and a faint grid behind every page in
        the product - see `globals.css`. It is right for the marketing pages and
        it is the loudest thing on this one, so this veils it rather than
        removing it: 82% of the surface colour leaves a suggestion of the grid
        and takes the sparkle off it. Removing it outright would make this the
        one page in the app that is not the same room as the others.

        Over that, one still gradient. Two stops rather than an image, because
        an image is a download on a cold start for a screen somebody looks at
        for four seconds, and this is the same warmth for nothing.

        Both at `z-0` rather than a negative index, which is where this started
        and where it did nothing at all: `body::before` paints the starfield at
        `z-index: -2`, so anything behind zero is behind *that* and the veil was
        veiling the page's own background colour. The content below is lifted to
        `z-10` instead, which is the same arrangement said the right way round.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[color-mix(in_oklch,var(--color-surface)_82%,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklch,var(--color-accent)_12%,transparent)_0%,transparent_62%)]"
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <Logo />
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted/70">
            {t.greeting}
          </p>
        </div>

        <div className="space-y-4">
          {/*
            The stance, in pixel, exactly as the landing page and the sign-in
            card set it - down to the `inline-block` on the second clause.

            That span is not decoration. Left to wrap on its own the line splits
            mid-phrase on a narrow screen: line one ends "…CHAT <3 HERE TO" and
            line two is the single word "PLAY.", which puts the position on one
            line and the punchline on another and reads as a widow rather than
            as a turn. As a block it either fits beside the first clause or
            moves down whole, so the break always falls on the divider.

            Smaller than the marketing page's, which clamps up to `text-6xl`.
            This one is read on a phone and has a stage under it that has to fit
            on the same screen.
          */}
          <h1 className="font-pixel text-[clamp(1.25rem,5.6vw,1.75rem)] uppercase leading-[1.25]">
            {position.lead}{' '}
            <span className="ignite neon-breathe text-accent inline-block">
              {position.accent}
            </span>
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-ink-muted">{t.sub}</p>
        </div>

        {/*
          The room, made of pictures.

          `<PeepStage>` is static renders shot off the same GLBs the lounge
          loads - see the note in that file for why the front page does not
          mount three.js to show what three.js looks like. That reasoning is
          twice as true here: this is the first paint of a cold start on a
          phone, and the alternative is a few hundred kilobytes before anybody
          has seen a word.

          The horizon and the floor belong to the stage rather than to the
          section, so the podium stands on the floor rather than floating over
          it - one wrapper, one perspective, one room. Without the two `<span>`s
          the podium is a cut-out on a gradient.

          The holograms that flank it on the marketing page are left out: they
          need the whole landing dictionary passed in, and two angled panes are
          the first thing to go from a page whose brief was "softer".

          The extra top margin is not spacing for its own sake, and it is
          larger than it looks like it should be. The speech bubbles are
          positioned above the podium and overflow the wrapper by about eighty
          pixels, so the flex column's own gap is nowhere near enough: at `mt-6`
          the first bubble landed on the last line of the paragraph above, which
          reads as the layout having broken rather than as a peep saying
          something.
        */}
        <div className="hero-scene mt-20 w-full" aria-hidden>
          <span className="neon-horizon" />
          <span className="neon-floor" />
          <PeepStage />
        </div>

        <div className="flex w-full flex-col gap-3">
          {/*
            Sign in first and filled, create second and outlined - the opposite
            of the marketing page, and deliberately so. On the web the common
            visitor has no account; in an installed app the common visitor has
            one and is coming back. The order follows who is actually holding
            the phone.
          */}
          <Link
            href="/login"
            /*
             * The one filled control on the page, and it is dialled back from
             * the marketing page's full-strength pill. `90%` of the accent over
             * the surface keeps it unmistakably the primary action without
             * being the brightest thing in a dark room somebody just opened
             * their phone in.
             */
            className="w-full rounded-full bg-[color-mix(in_oklch,var(--color-accent)_90%,var(--color-surface))] px-6 py-3.5 text-sm font-semibold text-black transition active:scale-[0.99]"
          >
            {t.signIn}
          </Link>
          <Link
            href={joinHref}
            className="w-full rounded-full border border-line px-6 py-3.5 text-sm font-medium text-ink transition active:scale-[0.99]"
          >
            {joinLabel}
          </Link>
        </div>

        {/*
          The third door, and the quiet one. A room somebody can stand in
          without an account is the strongest thing this screen has to say, and
          it says it in the smallest type on the page - because somebody who
          came here to sign in should not have to read past it.
        */}
        <div className="space-y-1">
          <Link
            href="/demo"
            className="text-sm font-medium text-ink underline decoration-line underline-offset-4"
          >
            {t.lookAround}
          </Link>
          <p className="text-xs leading-relaxed text-ink-muted/70">{t.lookAroundHint}</p>
        </div>

        {/*
          Below the fold on purpose, and below a rule.

          Everything above this is about getting into a room. These two are
          reading rather than playing - they are what the app is for on the
          evenings nobody else is about - and putting them above the sign-in
          would be answering a question nobody opened the app to ask.
        */}
        <nav className="w-full space-y-3 border-t border-line/50 pt-8 text-left">
          <Doorway
            href="/xo-universe"
            title={t.universe}
            /*
             * The chapter on air, when there is one, in place of the standing
             * description. This is the only line on the screen that is
             * different this week from last week, which is exactly why it wins
             * the slot: somebody who opens the app twice a week is checking it.
             */
            hint={
              episode
                ? fill(t.universeNow, { number: episode.number, title: episode.title })
                : t.universeHint
            }
            live={Boolean(episode)}
            // The whole row goes when the channel is switched off - and in the
            // public repository, where it is switched off by never being
            // passed. A link to a page that 404s is worse than one fewer link.
            show={universe}
          />
          <Doorway
            href="/community"
            title={t.community}
            hint={t.communityHint}
            live={false}
            show
          />
        </nav>

        {/*
          What is open right now.

          Last, and absent most weeks - which is the important property. A front
          page must not carry a permanent empty shelf labelled "events", so this
          band exists only while there is something on it. Same rule, and same
          source, as `<FeaturedEvents>` on the marketing page; drawn plainly
          here because that component wants the whole landing dictionary and
          this screen has thirty words of its own.
        */}
        {doors.length > 0 && (
          <section className="w-full space-y-3 text-left" aria-label={t.onNow}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted/70">
              {t.onNow}
            </p>
            <ul className="space-y-2">
              {doors.map((door) => (
                <li key={door.slug}>
                  <Link
                    href={`/e/${door.slug}`}
                    aria-label={fill(t.openDoor, { name: door.name })}
                    className="block rounded-xl border border-line bg-surface-raised/40 px-4 py-3 transition active:scale-[0.99]"
                  >
                    <span className="block truncate text-sm font-medium text-ink">
                      {door.name}
                    </span>
                    {/* The host's own headline when they wrote one. No dates:
                        a door in this list is open now by construction, and a
                        timestamp would be a second thing to read to learn
                        what the heading already said. */}
                    {door.headline && (
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {door.headline}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="relative z-10 mt-12 text-[11px] text-ink-muted/50">{t.footer}</p>
    </main>
  )
}

/**
 * One row in the pair under the rule: a name, a line under it, and an arrow.
 *
 * A component rather than two copies because the pair has to look identical -
 * the moment one of them grows a chevron or a different padding they read as
 * two unrelated controls rather than as a list of two places.
 *
 * `show` is a prop rather than a condition at the call site so the reason a row
 * is missing stays next to the row. A channel that is switched off is a fact
 * about the channel, not about this nav.
 */
function Doorway({
  href,
  title,
  hint,
  live,
  show,
}: {
  href: string
  title: string
  hint: string
  /** Whether the hint is news rather than a description. Lit if it is. */
  live: boolean
  show: boolean
}) {
  if (!show) return null

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line/70 px-4 py-3 transition active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span
          className={`mt-0.5 block truncate text-xs ${
            live ? 'text-accent-2' : 'text-ink-muted'
          }`}
        >
          {hint}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-ink-muted">
        →
      </span>
    </Link>
  )
}
