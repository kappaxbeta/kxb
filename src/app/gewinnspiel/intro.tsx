import Image from 'next/image'
import Link from 'next/link'
import { GithubMark } from '@/app/components/github-mark'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import type { ContestFacts } from '@/app/gewinnspiel/facts'

/**
 * The pictures above the small print.
 *
 * ---------------------------------------------------------------------------
 * Why a legal page grew a shop window
 * ---------------------------------------------------------------------------
 * This page has one job the other three legal documents do not: it is the
 * destination of a *post*. Somebody arriving at the Impressum came looking for
 * an address and knows what the site is; somebody arriving here saw a picture
 * of four voxel animals and a number, and has no idea what they are being asked
 * to build. Sixteen numbered clauses answer "what are the rules" for a reader
 * who never got an answer to "what is this".
 *
 * So the conditions are unchanged and unshortened - they are still the document
 * - and everything a newcomer needs before reading them sits above: what the
 * thing is, what the three steps are, what is being given away. The handover
 * line at the bottom is deliberate: it says the small print starts here, rather
 * than letting the page slide from advertising into terms without telling
 * anybody.
 *
 * ---------------------------------------------------------------------------
 * The pictures are in this file, the words are not
 * ---------------------------------------------------------------------------
 * Which image illustrates "build a room" is a layout decision, checked by
 * looking at the page, and it is the same decision in all five languages. The
 * sentence beside it is not. So the sources live here and the copy - including
 * every alt text - comes from `ContestCopy`, which is the only way a Polish
 * reader gets a Polish description of the picture.
 */

/**
 * The poster. The same image the announcement post carries - see `metadata.ts`.
 *
 * A *new* filename rather than an overwrite of `og-gewinnspiel.webp`, which is
 * still in `public/` and still unreferenced on purpose. X, Slack and every other
 * unfurler caches an Open Graph image by its URL: replacing the bytes under the
 * old name would leave the previous card on every post already scraped and give
 * no way to force a re-fetch, while deleting it would break any card already
 * live. A new name is fetched fresh, and the old file costs sixty kilobytes.
 */
export const POSTER_URL = '/og-gewinnspiel-play.webp'
const POSTER = { src: POSTER_URL, width: 1600, height: 900 }

/** The app itself, under "what is kxb.team". The one screenshot on the page. */
const APP_SHOT = { src: '/img/lounge-room.webp', width: 2200, height: 1064 }

/**
 * One picture per step, in step order.
 *
 * Two cut-out renders and one screenshot, which is a mismatch the plate exists
 * to hide: every step gets the same bordered box and the same 4:3 window, so
 * the row reads as three of a kind rather than as two floating animals beside a
 * framed photograph. `object-contain` because the renders are the wrong shape
 * for the box on purpose - cropping a cut-out to fill would cut through it.
 */
const STEP_SHOTS = [
  { src: '/xo/scenes/venue-3-fitout.webp', width: 1400, height: 1000 },
  { src: '/xo/scenes/party-club.webp', width: 862, height: 564 },
  { src: '/xo/scenes/crew.webp', width: 1600, height: 900 },
] as const

export function ContestIntro({
  copy,
  facts,
}: {
  copy: ContestCopy
  /*
    The amounts come in beside the words rather than out of a constant, for the
    same reason § 7 builds its list from them: how many prizes there are, and
    what they are worth, is set in the backoffice. The poster above this row is
    a picture and still says €50/€25/€25 - if those ever stop matching, the
    picture is what needs replacing.
  */
  facts: ContestFacts
}) {
  const { intro, meta } = copy
  return (
    // `space-y-10` rather than the shell's `space-y-8`: this band is pictures
    // and headings, and at the shell's rhythm a picture sits close enough to
    // the paragraph below it to read as its caption.
    <div className="space-y-10">
      <section>
        <p className="font-pixel text-sm uppercase tracking-widest text-accent">{intro.kicker}</p>
        {/* The poster is the page's own art, so it is eager and carries
            `priority`: it is the largest contentful paint on every one of the
            five routes, and lazily loading the thing somebody clicked a post to
            see is the wrong trade. */}
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <Image
            src={POSTER.src}
            alt={meta.posterAlt}
            width={POSTER.width}
            height={POSTER.height}
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="w-full"
          />
        </div>
        <p className="mt-5 text-lg leading-relaxed text-ink">{intro.lead}</p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold text-ink">{intro.game.title}</h2>
        <div className="space-y-4 leading-relaxed text-ink-muted">
          {intro.game.body.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-line">
          <Image
            src={APP_SHOT.src}
            alt={intro.game.shotAlt}
            width={APP_SHOT.width}
            height={APP_SHOT.height}
            sizes="(max-width: 768px) 100vw, 768px"
            className="w-full"
          />
        </div>
        {/*
          The demo lounge rather than the sign-up. Entering the contest needs an
          account, but *deciding whether you want to* does not, and sending
          somebody to a form before they have seen the thing is how a curious
          reader becomes a closed tab. The conditions below are where the
          account is asked for.
        */}
        <a
          href="/demo"
          className="mt-4 inline-block font-medium text-accent transition hover:opacity-80"
        >
          {intro.game.cta} →
        </a>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold text-ink">{intro.steps.title}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {intro.steps.items.map((step, i) => (
            <li
              key={step.title}
              className="overflow-hidden rounded-xl border border-line bg-surface-raised"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-line bg-black/20">
                <Image
                  src={STEP_SHOTS[i].src}
                  alt={step.alt}
                  width={STEP_SHOTS[i].width}
                  height={STEP_SHOTS[i].height}
                  sizes="(max-width: 640px) 100vw, 240px"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="p-4">
                <h3 className="text-base font-medium text-ink">
                  {/* The step number is drawn, not read out: the `<ol>` has
                      already told a screen reader this is item two of three,
                      and a pixel "2" in front of the heading would say it
                      twice. */}
                  <span className="mr-2 font-pixel text-accent" aria-hidden>
                    {i + 1}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold text-ink">{intro.prizes.title}</h2>
        {/*
          A list, not a row of divs. Three amounts in descending order is a
          list of prizes whichever way it is drawn, and a screen reader that
          announces "list, 3 items" has said something true that a flex
          container has not. The visual order is the ranking, so `place` names
          which is which for anybody who cannot see that they descend.
        */}
        <ol className="flex flex-wrap gap-3">
          {facts.prizes.map((amount, i) => (
            <li
              key={i}
              className={`rounded-lg border px-5 py-3 font-pixel text-xl ${
                // The first prize wears the accent, as it does on the poster.
                // Same picture, same emphasis - the page and the post agree.
                i === 0 ? 'border-accent text-accent' : 'border-line text-ink'
              }`}
            >
              <span className="sr-only">{intro.prizes.place.replace('{n}', String(i + 1))}: </span>
              &euro;{amount}
            </li>
          ))}
        </ol>
        <p className="mt-4 leading-relaxed text-ink-muted">{intro.prizes.note}</p>
      </section>

      {/*
        The two doors out of this page, and they are not equals.

        The primary one wears `.summon-cta` - the battle wizard's shimmering
        button, borrowed rather than copied, the same treatment the front page
        gives its own first ask. It shimmers, which is what makes it read as the
        live thing on a page that is otherwise sixteen numbered clauses.

        `?src=gewinnspiel` is the campaign tag from `domain/analytics/campaign`.
        It is the only way to answer "did the contest bring anybody" - a link
        pasted into a post arrives with no referrer at all, indistinguishable
        from somebody typing the domain. See that file for why the tag exists.

        Not a `<Link>` for GitHub: it leaves the site, so it is an anchor, and
        the mark rather than only the word is the fastest way a row of two
        buttons says which of them goes somewhere else. Both carry a `data-cta`
        so the two are told apart in the report, and so the outbound one is
        counted at all.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Link
          href="/signup?src=gewinnspiel"
          // The site-wide `CtaTracker` already counts `/signup` as `signup`;
          // naming it here separates *this* page's button from the front page's
          // in the report, which is the whole question the contest is asking.
          data-cta="gewinnspiel-signup"
          className="summon-cta cta-pixel w-full max-w-xs rounded-full px-8 py-3.5 text-center transition sm:w-auto sm:max-w-none"
        >
          {intro.cta.signup}
        </Link>
        <a
          href="https://github.com/kappaxbeta/kxb"
          // Outbound, so it is counted only because it is labelled - see the
          // origin check in `CtaTracker`.
          data-cta="gewinnspiel-github"
          className="flex w-full max-w-xs items-center justify-center gap-2.5 rounded-full border border-line bg-surface-raised/70 px-7 py-3.5 text-center backdrop-blur-sm transition hover:bg-surface-raised sm:w-auto sm:max-w-none"
        >
          <GithubMark className="h-[1.05em] w-[1.05em] shrink-0" />
          {intro.cta.github}
        </a>
      </div>

      {/* Says out loud that the advertising has stopped and the document
          starts. A page that slides from a picture of a panda into § 1 without
          marking the join is a page that hid its terms in plain sight. */}
      <p className="border-t border-line pt-8 leading-relaxed text-ink-muted">{intro.handover}</p>
    </div>
  )
}
