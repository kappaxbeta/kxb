'use client'

import Image from 'next/image'
import Link from 'next/link'

/**
 * The page you get when there is no page.
 *
 * One component for both dead ends - the 404 and the crash - because they are
 * the same moment from the visitor's side: something they expected is not
 * there, and the only useful thing on the screen is the way back. Two separate
 * designs for that would drift, and the one that drifted would be the one
 * nobody looks at until it is already in front of a customer.
 *
 * A client component so `error.tsx` can import it, which error boundaries
 * require. `not-found.tsx` is a Server Component and renders it perfectly well
 * anyway.
 *
 * No `<ShootingStars />`. The sky is mounted by the landing page and the
 * workspace shell and deliberately not by the pages that are just text - and
 * weather behind an apology reads as a screensaver. The horizon and floor are
 * enough to say this is still the same room.
 */
export function CrashScreen({
  code,
  tag,
  title,
  body,
  avatar,
  hue,
  digest,
  children,
}: {
  /** The big pixel numeral: `404`, `500`. */
  code: string
  tag: string
  title: string
  body: React.ReactNode
  /** One of the renders in `public/xo/shots`, as `<animal>-<angle>`. */
  avatar: string
  hue: number
  /**
   * Next's identifier for this crash, when there is one.
   *
   * Shown rather than hidden, because it is the only string that connects what
   * the visitor is looking at to the row in the backoffice and the line in the
   * container logs. Somebody who quotes it in a support message has handed over
   * a complete bug report without knowing it.
   */
  digest?: string | null
  /** The way out. Always at least one link home. */
  children: React.ReactNode
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <section
        className="box relative w-full max-w-xl overflow-hidden text-center"
        style={
          {
            '--box-hue': hue,
            // Down out of the prose. The default puts the horizon through the
            // second paragraph on a card this short - see the note in
            // globals.css - and this drops it into the gap above the buttons,
            // which is where a horizon reads as one anyway.
            '--box-horizon': '22%',
          } as React.CSSProperties
        }
      >
        <span className="neon-horizon" />
        <span className="neon-floor" />

        <p className="box-tag justify-center">{tag}</p>

        {/* The numeral is the illustration, so it is set at the size of one -
            and in the pixel face, which is the app's own voice rather than a
            framework's default sans. */}
        <p
          aria-hidden
          className="font-pixel mt-6 text-7xl leading-none text-accent sm:text-8xl"
        >
          {code}
        </p>

        <h1 className="font-pixel mt-6 text-2xl uppercase leading-[1.25] sm:text-3xl">
          {title}
        </h1>

        <div className="mx-auto mt-4 max-w-[42ch] text-sm leading-relaxed text-ink-muted">
          {body}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>

        {digest ? (
          // Selectable, monospaced and quiet. It is for copying, not for
          // reading, and it must not look like part of the apology.
          <p className="mt-8 select-all font-mono text-[0.6875rem] text-ink-muted/70">
            {digest}
          </p>
        ) : null}

        {/* Decorative: the heading already says what happened, and "a render of
            a fox" adds nothing to a screen reader but noise. */}
        <Image
          src={`/xo/shots/${avatar}.webp`}
          alt=""
          width={512}
          height={512}
          className="box-peep"
          priority
        />
      </section>
    </main>
  )
}

/** The filled pill, for the one action that is always right: go home. */
export const CRASH_CTA =
  'rounded-full bg-accent px-7 py-3 font-medium text-white transition'

/** The outlined pill, for the optional second action. */
export const CRASH_ALT =
  'rounded-full border border-line px-7 py-3 font-medium transition hover:bg-surface-raised'

/** Both dead ends offer the same front door. */
export function HomeLink({ label = 'Back to the start' }: { label?: string }) {
  return (
    <Link href="/" className={CRASH_CTA}>
      {label}
    </Link>
  )
}
