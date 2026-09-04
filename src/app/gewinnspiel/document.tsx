import Link from 'next/link'
import { MarketingShell } from '@/app/components/marketing-shell'
import { isLocale } from '@/app/i18n/locales'
import { LanguageChooser } from '@/app/gewinnspiel/chooser'
import { contestCopy, CONTEST_SECTIONS } from '@/app/gewinnspiel/copy'
import { contestFacts } from '@/app/gewinnspiel/facts'
import { LanguageHint } from '@/app/gewinnspiel/hint'
import { ContestIntro } from '@/app/gewinnspiel/intro'
import type { ContestLocale } from '@/app/gewinnspiel/locales'
import { readContestBucks } from '@/domain/contest/offer'
import { readContestSettings } from '@/domain/contest/settings'

/**
 * The contest page in one language: chrome, pictures, conditions.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `LegalShell`
 * ---------------------------------------------------------------------------
 * It was, and it stopped fitting in three places at once. That shell draws a
 * two-language switch (this page has five), it types its `locale` as
 * `PublicLocale` (this page speaks three languages the site does not), and it
 * renders nothing between the heading and the first clause (this page has a
 * poster and three steps there). Bending it to cover all three would have put
 * four optional props into the frame the Impressum and the Datenschutzerklärung
 * share - a frame whose whole value is that it is the same on every page it
 * draws.
 *
 * What *is* still shared is the machinery: `Section`, `Bullets`,
 * `ControllerBlock` and `CONTROLLER` come from `legal/shell` and are used by
 * the copy files. The address on this page cannot drift from the address on the
 * Impressum, which is the part that actually matters.
 */
/**
 * Where the back link goes, per language. See the note at the call site.
 *
 * A table rather than a conditional because it is a fact about the *site* -
 * which front pages exist - and a ternary hides that behind a default that
 * quietly becomes wrong the day a fourth landing page ships.
 */
const BACK_HREF: Record<ContestLocale, string> = {
  de: '/de',
  bg: '/bg',
  en: '/',
  fr: '/',
  es: '/',
  pl: '/',
}

export async function ContestDocument({ locale }: { locale: ContestLocale }) {
  /*
    The contest's facts, read once and turned into this language's prose.

    Two database reads, and they are why both routes that draw this document
    are `force-dynamic`. The note on `gewinnspiel/page.tsx` has the argument;
    the part that matters here is that these are the calls the build cannot
    make, so a prerendered version of this component is a version quoting
    `CONTEST_DEFAULTS` at somebody who is being asked to agree to it.

    Neither read can throw - both fall back - so a database that is briefly
    unreachable costs the page its freshness, not its existence.
  */
  const settings = await readContestSettings()
  const facts = contestFacts(settings, locale, await readContestBucks(settings.code))
  const copy = contestCopy(locale, facts)
  const { chrome } = copy

  return (
    /*
      The site's header, over the document.

      This page went out in a post and is where people arrive from outside, and
      it had no way back into the product except one text link - somebody who
      read the conditions and wanted to see what they were entering had to
      guess. The header is the way in.

      `locale` is passed only when the contest's language is one the site
      speaks. The other three - French, Spanish, Polish - exist here and
      nowhere else, so there is no header to draw in them; the shell falls back
      to the reader's own cookie, which is a better guess than pinning their
      nav to a language the site has no pages in.

      The document keeps its own `max-w-3xl` inside the shell's wider column.
      Conditions are read, not scanned, and the measure is the reason they are
      readable - it should not stretch just because the frame around it can.
    */
    <MarketingShell locale={isLocale(locale) ? locale : undefined}>
    <div lang={locale} className="mx-auto min-h-screen max-w-3xl p-8 text-ink">
      {/*
        Back to a landing page in a language the reader has, where there is one.

        German and Bulgarian both have a front page - `/de` and `/bg` - and get
        it. French, Spanish and Polish do not and never will (see the note in
        `i18n/locales` about why the site's locales stop where they do), so they
        get the English root rather than a German page they cannot read.
      */}
      <Link href={BACK_HREF[locale]} className="text-accent hover:underline">
        {chrome.back}
      </Link>

      <h1 className="mb-4 mt-8 text-4xl font-bold">{chrome.title}</h1>

      <div className="mb-8 space-y-4 rounded-lg border border-line bg-surface-raised p-4 text-sm text-ink-muted">
        <p>{chrome.deadline}</p>
        {/*
          Null in German, and only in German. Every translation says on its own
          face that it is one - a reader deciding whether to rely on a sentence
          needs to know that before the sentence, not in § 16 after it.
        */}
        {chrome.binding ? <p>{chrome.binding}</p> : null}
        <div className="space-y-3 border-t border-line pt-4">
          <LanguageChooser current={locale} label={chrome.chooserLabel} />
          <LanguageHint current={locale} template={chrome.hint} />
        </div>
      </div>

      <ContestIntro copy={copy} facts={facts} />

      <div className="mt-10 space-y-8 leading-relaxed text-ink-muted">
        {CONTEST_SECTIONS.map((key, i) => {
          const section = copy.sections[key]
          return (
            <section key={key}>
              {/*
                The number comes from the array index, not from the heading, so
                the five languages cannot disagree about which clause is § 11.
                See the note on `CONTEST_SECTIONS`.
              */}
              <h2 className="mb-4 text-2xl font-semibold text-ink">
                {chrome.sectionMark} {i + 1} {section.heading}
              </h2>
              <div className="space-y-4">{section.body}</div>
            </section>
          )
        })}
      </div>
    </div>
    </MarketingShell>
  )
}
