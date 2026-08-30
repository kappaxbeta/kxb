import Image from 'next/image'
import Link from 'next/link'
import Logo from '@/app/components/logo'
import { type MarkName, Mark } from '@/app/components/marketing-icons'
import { ShootingStars } from '@/app/components/shooting-stars'
import { EN, landingDict } from '@/app/i18n/landing'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The header, the footer and the section vocabulary the three deep pages share.
 *
 * ---------------------------------------------------------------------------
 * English only, and that is a decision rather than an omission
 * ---------------------------------------------------------------------------
 * `/`, `/de` and this shell all read their nav and footer labels out of `EN` /
 * `DE` in `i18n/landing`, but /play, /create and /share exist in English alone
 * and so this file names `EN` directly. The landing page is the surface that
 * gets pasted into a German Discord; these are the pages somebody clicks
 * *after* deciding to read on, their copy has not settled, and translating a
 * page mid-edit means paying twice for every sentence. `/create/xp` has shipped
 * on the same terms since it was written.
 *
 * When they do get translated, the fix is this file taking a `dict` prop and
 * the three pages taking a locale - not a second copy of the header.
 *
 * The nav labels still come from the dictionary rather than being typed here,
 * so renaming "Play" renames it in four places at once. Only the strings this
 * shell owns outright - a heading, a caption - are literals.
 *
 * ---------------------------------------------------------------------------
 * Why there is a vocabulary here at all
 * ---------------------------------------------------------------------------
 * The first version of these pages had one section component, `Band`, and every
 * subject on every page was one: a full-width card with a heading and prose in
 * it. Eight of those down a page is a ladder with eight equal rungs, and a
 * reader cannot tell from the shape of it which two subjects are the ones they
 * came for.
 *
 * So the page now says what kind of thing each section *is*. A comparison is a
 * `Spec` and looks like a table. Four behaviours of one thing are `Traits` and
 * look like four marked items. Three measured numbers are `Figures` and look
 * like figures. A procedure is `Steps` and is numbered, because the order is the
 * information. A closed vocabulary is a `TagField` and looks like a field of
 * chips.
 *
 * That is the whole layout thesis: the shape of a section is a claim about its
 * content, and a page of identical shapes makes no claims at all.
 */

/** Where the pill points. The same three the landing page's header carries. */
const SECTIONS = [
  { key: 'play', href: '/play' },
  { key: 'create', href: '/create' },
  { key: 'share', href: '/share' },
] as const

export function MarketingShell({
  active,
  locale = 'en',
  children,
}: {
  /**
   * Which language the header is in.
   *
   * Defaulted to English, which is the note above made into a parameter: the
   * three pages this shell was written for exist in English alone, and this is
   * how a page that *has* been translated hands over. `/browse` is the first —
   * it was German inside an English header for exactly one commit.
   */
  locale?: Locale
  /**
   * Which of the three pages this is, so the pill can mark its own tab.
   *
   * Optional, because the shell is now also worn by a page that is not one of
   * the three - `/browse`. Left out of `SECTIONS` deliberately: a fifth pill
   * changes the header on the landing page and both German ones, which is a
   * decision about the nav rather than about the store, and the store is
   * reachable from `/worlds` and `/create/xp` without it.
   */
  active?: 'play' | 'create' | 'share'
  children: React.ReactNode
}) {
  // `EN` stays imported and stays the default, so nothing about the three
  // untranslated pages changes.
  const t = landingDict(locale)
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <ShootingStars />
      <header className="flex items-center justify-between gap-3 py-4 sm:py-6">
        <Link href="/" className="enter-mark flex items-center gap-3">
          <Logo badge />
        </Link>
        <nav className="enter nav-pill" style={{ '--i': 1 } as React.CSSProperties}>
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              /* `aria-current="page"` rather than only a colour: the pill's
                 active rule is a style, and somebody on a screen reader should
                 be told which of four links is the page they are on. */
              aria-current={section.key === active ? 'page' : undefined}
              className={`nav-pill-link ${section.key === active ? 'text-ink font-medium' : ''}`}
            >
              {t.nav[section.key]}
            </Link>
          ))}
          <Link href="/#pricing" className="nav-pill-link">
            {t.nav.pricing}
          </Link>
          {/* Literal, like the landing header: the word is the same in every
              page language, and the handbook itself handles the locale. */}
          <Link href={locale === 'de' ? '/de/community' : '/community'} className="nav-pill-link">
            Community
          </Link>
          <Link href="/login" className="nav-pill-link nav-pill-quiet">
            {t.nav.signIn}
          </Link>
          <Link href="/signup" className="nav-pill-cta">
            {t.nav.join}
          </Link>
        </nav>
      </header>

      {children}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line/50 pt-6 text-sm text-ink-muted">
        <span>κXβ · unkown.t</span>
        <nav className="flex flex-wrap gap-5">
          <Link href="/events" className="nav-link">
            {t.footer.events}
          </Link>
          <Link href="/impressum/en" className="nav-link">
            {t.footer.impressum}
          </Link>
          <Link href="/agb/en" className="nav-link">
            {EN.footer.terms}
          </Link>
          <Link href="/datenschutz/en" className="nav-link">
            {EN.footer.privacy}
          </Link>
          <Link href="/contact" className="nav-link">
            {EN.footer.contact}
          </Link>
        </nav>
      </footer>
    </main>
  )
}

/**
 * The label every section wears: a drawing, then the word.
 *
 * `.box-tag` already existed and drew a glowing dot in the section's own hue.
 * The dot is now a 16px line drawing of the actual subject, which is the one
 * change that makes a page of sections skimmable rather than merely divided -
 * a reader scanning for the football finds a ball, not the fourth identical
 * dot down a column.
 *
 * The word stays. An icon on its own is a guessing game, and these subjects
 * include "modes" and "not yet", which no drawing carries alone.
 */
function SectionTag({ mark, children }: { mark?: MarkName; children: React.ReactNode }) {
  return (
    <p className={`box-tag ${mark ? 'box-tag-mark' : ''}`}>
      {mark && <Mark name={mark} />}
      {children}
    </p>
  )
}

/**
 * A subject: a tag, a heading, and whatever the caller puts under it.
 *
 * `id` is required rather than optional because every one of these is a link
 * target: the hero chips on the landing page point at `/play#football`, and a
 * section that forgot its id is a chip that scrolls to the top of the page and
 * looks broken.
 *
 * `span` is the layout decision, and it is the reason the pages have a cadence.
 * `full` claims the whole six-column row; `half` claims three, so two short
 * subjects sit side by side and the eye reads them as a pair rather than as two
 * more rungs. Below 900px the bento collapses both to one column - see the
 * span-restating rules on `.bento`.
 *
 * A `half` band takes no peep. At three columns the render's corner and the text
 * column are fighting over the same 9rem, and the loser is the paragraph.
 */
export function Band({
  id,
  kicker,
  mark,
  title,
  hue,
  index,
  span = 'full',
  children,
  peep,
}: {
  id: string
  kicker: string
  /** The line drawing in the tag. */
  mark?: MarkName
  title: string
  hue: number
  index: number
  span?: 'full' | 'half'
  children: React.ReactNode
  /**
   * The animal leaning on the corner.
   *
   * Two per page now rather than one per section. Eight of them down a page is
   * wallpaper: the peep stops being the thing that makes a card feel inhabited
   * and becomes the thing every card has. Give it to the section somebody came
   * for and to one late one, and it lands both times.
   */
  peep?: { avatar: string; angle: string }
}) {
  return (
    <section
      id={id}
      className={`box band rise ${span === 'half' ? 'col-span-3 band-half' : 'col-span-6'}`}
      style={{ '--box-hue': hue, '--i': index } as React.CSSProperties}
    >
      <SectionTag mark={mark}>{kicker}</SectionTag>
      <h2 className="band-title band-prose">{title}</h2>
      {/* `band-prose` reserves the corner the peep is anchored in and holds the
          measure to something readable - see the note on the class. Applied to
          the heading as well as the body, because a two-line heading reaches
          further right than a paragraph does and is the thing most likely to
          collide. */}
      <div className="band-prose band-body">{children}</div>
      {peep && span === 'full' && (
        <Image
          src={`/xo/shots/${peep.avatar}-${peep.angle}.webp`}
          alt=""
          width={512}
          height={512}
          className="box-peep"
        />
      )}
    </section>
  )
}

/**
 * A comparison: term on the left, what it means on the right.
 *
 * For the five battle modes, the two world modes, the three studios, the five
 * room settings. Every one of those is a question of the form "which of these
 * do I want", and prose makes a reader hold four options in their head while
 * they read the fifth. A ruled two-column list lets them read down one side.
 *
 * `<dl>` because that is what this is, and the rows are ruled rather than boxed:
 * a border between rows is the cheapest thing that says "these are the same kind
 * of thing", and it costs no container.
 */
export function Spec({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="spec">
      {rows.map(([term, meaning]) => (
        <div key={term} className="spec-row">
          <dt>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Several behaviours of one thing, each with its own drawing.
 *
 * Where `Spec` is "pick one of these", this is "all of these are true at once":
 * how the ball behaves, what xp is made of, what a guest link can be set to.
 * Two columns on a wide band, one on a narrow one, and the mark is what stops
 * four titles in a row reading as a bulleted list with delusions.
 */
export function Traits({
  items,
}: {
  items: readonly { mark: MarkName; title: string; body: string }[]
}) {
  return (
    <ul className="traits">
      {items.map((item) => (
        <li key={item.title} className="trait">
          <span className="trait-mark">
            <Mark name={item.mark} />
          </span>
          <div>
            <p className="trait-title">{item.title}</p>
            <p className="trait-body">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Measured numbers, set as numbers.
 *
 * The only sections on these pages that are allowed one of these are the ones
 * whose numbers come out of the code or a benchmark - `bun run xp:bench` for the
 * level limits, `domain/guests/application` for the link's clocks,
 * `AVATARS.length` and `EMOTE_COUNT` for the lounge. There is no audience metric
 * anywhere on this site and there is not going to be one until there is an
 * audience: a figure this size is a claim, and the claim has to be checkable.
 *
 * `unit` is split off the value so "7" and "days" can be set at two sizes
 * without a nested span at every call site, and so the figure stays tabular.
 */
export function Figures({
  items,
}: {
  items: readonly { value: string; unit?: string; label: string; note?: string }[]
}) {
  return (
    <ul className="figures">
      {items.map((item) => (
        <li key={item.label} className="figure">
          <p className="figure-value">
            {item.value}
            {item.unit && <span className="figure-unit">{item.unit}</span>}
          </p>
          <p className="figure-label">{item.label}</p>
          {item.note && <p className="figure-note">{item.note}</p>}
        </li>
      ))}
    </ul>
  )
}

/**
 * A capture of the running app, inside a band, with a line under it.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `usecase-art`
 * ---------------------------------------------------------------------------
 * The pictures on these pages are renders: a pitch, a club, three animals on an
 * island, shot in `/world/shots` off the models the lounge loads. They are
 * cut-outs, they are 8:5, and `usecase` puts them beside their caption in a
 * 1.25fr column. That is the right frame for a picture of the *world*.
 *
 * A screenshot is none of those things. It is opaque edge to edge, it is 2:1
 * because the app is 2:1, and the left rail in it stops being a rail and becomes
 * grey texture at half a content column. So it takes the band's full width and
 * gets a caption under it rather than beside it - the same argument the landing
 * page's `.screen-beat-wide` makes, made once more here so the subpages do not
 * each invent their own.
 *
 * The `<figcaption>` is not decoration and is not optional. Every one of these
 * is a photograph of something that exists, and the line under it is where the
 * page says which running thing it is a photograph of.
 */
export function Shot({
  src,
  alt,
  width,
  height,
  caption,
  /** How much of the right edge fades, where the capture cut through a panel. */
  cutRight,
}: {
  src: string
  alt: string
  width: number
  height: number
  caption: React.ReactNode
  cutRight?: string
}) {
  return (
    <figure className="band-shot">
      <div className="band-shot-plate" style={{ '--screen-cut-right': cutRight } as React.CSSProperties}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="band-shot-img"
          sizes="(max-width: 900px) 100vw, 60vw"
        />
      </div>
      <figcaption className="band-shot-note">{caption}</figcaption>
    </figure>
  )
}

/**
 * A procedure, numbered, because the order is the information.
 *
 * The one place on these pages where 01/02/03 earns itself: "how a match
 * actually runs" is four things that happen in sequence, and a reader checking
 * whether guests can pick a side needs to know it happens before the start and
 * after the setup. A rule down the left hand side and a plate per step - the
 * cue sheet `/events` introduced, which is the house pattern for a document that
 * runs top to bottom and changes hands partway.
 */
export function Steps({ steps }: { steps: readonly { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="steps">
      {steps.map((step, i) => (
        <li key={step.title} className="step">
          <span className="step-n" aria-hidden>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <p className="step-title">{step.title}</p>
            <p className="step-body">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * A closed vocabulary, as a field of chips.
 *
 * The twelve world tags, imported from the domain by the caller. It is a field
 * rather than a list because the point being made is that there are exactly this
 * many and no more - a reader should be able to see the whole vocabulary at once
 * and count it if they want to.
 */
export function TagField({
  tags,
}: {
  tags: readonly { id: string; label: string; hint?: string }[]
}) {
  return (
    <ul className="tagfield">
      {tags.map((tag) => (
        <li key={tag.id} title={tag.hint} className="tagfield-chip">
          {tag.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * The hero these three pages share: eyebrow, pixel headline, one paragraph, and
 * the heap.
 *
 * Deliberately much quieter than the landing page's - no stage, no peeps, no
 * drifting blocks. Somebody reading /share has already been sold the room and
 * clicked through to find out how the links work; a second full production
 * number in front of that is a page asking to be admired rather than read.
 *
 * Quieter is not empty, though, which is what it was: with the heap hidden in
 * the bento look the three heroes were three centred paragraphs on black, and
 * the one image the page had already downloaded was being thrown away. The heap
 * now shows in both looks and is composed differently in each - see
 * `.page-pile` and the `[data-look]` rules.
 */
export function PageHero({
  eyebrow,
  mark,
  title,
  sub,
  hue,
  cta,
  art,
}: {
  eyebrow: string
  mark?: MarkName
  title: string
  sub: string
  hue: number
  cta?: { href: string; label: string }
  /**
   * The sculptural heap beside the headline, as a path under `public`.
   *
   * A path rather than a name because there are two sets of this art and each
   * page gets exactly one of them, not both:
   *
   * - `/xo/piles/*` are the real block models, stacked - shot by
   *   `scripts/render-pile.ts`. /play wears these, because /play is about the
   *   things in the world and these *are* the things in the world.
   * - `/xo/shapes/*` are generated abstract primitives - fluted spheres, coils,
   *   jacks - by `scripts/render-shapes.ts`. /create and /share wear these,
   *   because both pages are about what has not been made yet, and a heap of
   *   crates says "here is the catalogue" where a heap of impossible objects
   *   says "here is the room to work in".
   *
   * Shown in both looks, so it is `priority`: it is now the largest thing in the
   * first viewport on every one of these pages, and a lazy hero image is a hero
   * that arrives after the fold has been read.
   */
  art?: string
}) {
  return (
    <section
      className="page-hero col-span-6"
      style={{ '--box-hue': hue } as React.CSSProperties}
    >
      <div className="page-hero-type">
        <span className="enter" style={{ '--i': 2 } as React.CSSProperties}>
          <SectionTag mark={mark}>{eyebrow}</SectionTag>
        </span>
        <h1 className="page-hero-title enter" style={{ '--i': 3 } as React.CSSProperties}>
          {title}
        </h1>
        <p className="page-hero-sub enter" style={{ '--i': 4 } as React.CSSProperties}>
          {sub}
        </p>
        {cta && (
          <div className="enter mt-7" style={{ '--i': 5 } as React.CSSProperties}>
            <Link
              href={cta.href}
              className="summon-cta inline-block rounded-full px-8 py-3.5 text-lg font-semibold transition"
            >
              {cta.label}
            </Link>
          </div>
        )}
      </div>

      {art && (
        <div className="page-pile-stage">
          <span className="neon-floor" />
          <Image
            src={art}
            alt=""
            width={1024}
            height={1024}
            className="page-pile"
            priority
            sizes="(max-width: 820px) 20rem, 34vw"
          />
        </div>
      )}
    </section>
  )
}

/**
 * Which of the two art directions a page is wearing.
 *
 * `bento` is the site's existing look - neon cards on the starfield. `dusk` is
 * the violet ground with pastel washes instead of cards. Everything that differs
 * between them is in globals.css under `[data-look=...]`; nothing in this file
 * or in the three pages branches on it beyond passing the string through.
 *
 * That is the whole design of the pair, and it is what makes it testable: an
 * A/B test whose arms are two component trees is a test of two codebases, where
 * the arm that loses is also the arm that quietly stopped getting copy fixes.
 */
export type Look = 'bento' | 'dusk'

/** Anything that is not `dusk` is `bento` - a typo'd param lands on the
 *  shipped look rather than on a half-styled page. */
export function readLook(value: string | undefined): Look {
  return value === 'dusk' ? 'dusk' : 'bento'
}

/**
 * The closing pair of buttons, identical on all three pages.
 *
 * The demo leads on every one of them for the reason it leads in the landing
 * hero: it is the only control on the site that costs the reader nothing to
 * press, and a page that ends on a sign-up form has spent its last line asking
 * rather than offering.
 */
export function PageOutro({
  title,
  hue,
  secondary,
}: {
  title: string
  hue: number
  /** The second button, when the page has somewhere better to send people. */
  secondary?: { href: string; label: string }
}) {
  return (
    <section
      className="box page-outro col-span-6"
      style={{ '--box-hue': hue } as React.CSSProperties}
    >
      <span className="neon-horizon" />
      <span className="neon-floor" />
      <h2 className="page-outro-title">{title}</h2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        <Link
          href="/demo"
          className="summon-cta w-full max-w-xs rounded-full px-8 py-3 text-center font-semibold transition sm:w-auto sm:max-w-none"
        >
          {EN.closing.ctaDemo}
        </Link>
        <Link
          href={secondary?.href ?? '/signup'}
          className="w-full max-w-xs rounded-full border border-line bg-surface-raised/70 px-7 py-3 text-center font-medium backdrop-blur-sm transition hover:bg-surface-raised sm:w-auto sm:max-w-none"
        >
          {secondary?.label ?? EN.closing.ctaJoin}
        </Link>
      </div>
    </section>
  )
}

/**
 * The honesty section, which every one of these pages ends with.
 *
 * Its own component so it cannot quietly be dropped from one of them. A page
 * that lists only what works is one nobody trusts the second time, and the
 * cheapest way for that rule to erode is for the third page to be written in a
 * hurry without it.
 */
export function NotYet({ items, hue }: { items: readonly string[]; hue: number }) {
  return (
    /* `not-yet` is the one section the dusk look keeps a real panel around - see
       the rule in globals.css. It is inert in the bento look, where every
       section already has one. */
    <section
      className="box band not-yet col-span-6"
      style={{ '--box-hue': hue, '--i': 9 } as React.CSSProperties}
    >
      <SectionTag mark="notYet">Not yet</SectionTag>
      <h2 className="band-title">What it doesn’t do yet</h2>
      <p className="band-body max-w-2xl">Said here rather than found out later.</p>
      <ul className="not-yet-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
