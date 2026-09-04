import type { ContestLocale } from '@/app/gewinnspiel/locales'
import type { ContestFacts } from '@/app/gewinnspiel/facts'
import { deCopy } from '@/app/gewinnspiel/copy/de'
import { enCopy } from '@/app/gewinnspiel/copy/en'
import { esCopy } from '@/app/gewinnspiel/copy/es'
import { frCopy } from '@/app/gewinnspiel/copy/fr'
import { bgCopy } from '@/app/gewinnspiel/copy/bg'
import { plCopy } from '@/app/gewinnspiel/copy/pl'

/**
 * The shape of the contest page in one language, and the barrel of the six.
 *
 * ---------------------------------------------------------------------------
 * Why this is a typed document and the other legal pages are not
 * ---------------------------------------------------------------------------
 * `legal/shell.tsx` argues - correctly, for what it covers - that a privacy
 * notice should be written out per language rather than pulled from a
 * dictionary, because templating two legal documents together invites a
 * translation to quietly change what was promised. That argument holds at two
 * languages. At six it inverts: the risk stops being "a translation says
 * something the original does not" and becomes "a translation is missing § 11
 * and nobody noticed", which is the worse failure and the one a human reviewer
 * will not catch by eye across six files.
 *
 * So the sections are a `Record<ContestSectionKey, …>`: leaving one out is a
 * build error, and the numbering is generated from `CONTEST_SECTIONS` rather
 * than typed into sixteen headings six times over. The *prose* is still
 * written per language and is still free-form JSX - nothing here templates a
 * sentence, and no clause is assembled out of fragments.
 *
 * German remains the binding version. Every other language says so at the top,
 * out of `chrome.binding`.
 */

/**
 * The sections, in order. The § number is this array's index plus one.
 *
 * Numbering the sections here rather than in the headings is the whole point:
 * the German text cross-references "§ 5 dieser Teilnahmebedingungen", and a
 * translation that quietly renumbered would be pointing at the wrong clause in
 * its own document. Inserting a section renumbers all six languages at once,
 * which is right - but check the cross-references in the prose by hand, because
 * those are written into sentences and nothing here can move them.
 */
export const CONTEST_SECTIONS = [
  'organiser',
  'what',
  'window',
  'eligibility',
  'entry',
  'free',
  'prizes',
  'draw',
  'notice',
  'yourEntry',
  'exclusion',
  'ending',
  'privacy',
  'noAffiliation',
  'liability',
  'final',
] as const

export type ContestSectionKey = (typeof CONTEST_SECTIONS)[number]

/** One step of "how to enter", beside its picture. The picture is in `intro.tsx`. */
export type ContestStep = {
  title: string
  body: string
  /** What the picture shows, for anybody who cannot see it. */
  alt: string
}

export type ContestCopy = {
  locale: ContestLocale

  meta: {
    title: string
    description: string
    ogTitle: string
    ogDescription: string
    /** The poster's alt text, in the unfurl and on the page. */
    posterAlt: string
  }

  /** The frame: back link, heading, the two lines under it, the chooser. */
  chrome: {
    back: string
    title: string
    /** Names the chooser for a screen reader. */
    chooserLabel: string
    /** The deadline line under the heading. */
    deadline: string
    /**
     * "This is a courtesy translation, the German version binds." Null for
     * German, which is the version being deferred to.
     */
    binding: string | null
    /** `§` where legal drafting uses it natively; `Art.`/`чл.` where it does not. */
    sectionMark: string
    /**
     * Offered by the client-side hint when the browser asks for a language this
     * page has and is not currently showing. `{language}` is the endonym.
     */
    hint: string
  }

  /** The picture band above the conditions: what the game is, and how to enter. */
  intro: {
    kicker: string
    /** One sentence, over the poster: what is being given away, for what. */
    lead: string
    game: {
      title: string
      /** Two or three short paragraphs. What kxb.team actually is. */
      body: readonly string[]
      shotAlt: string
      cta: string
    }
    steps: {
      title: string
      /** Exactly three, and the tuple says so: `intro.tsx` has three pictures. */
      items: readonly [ContestStep, ContestStep, ContestStep]
    }
    prizes: {
      title: string
      /** Under the three amounts. Says the draw is blind, before § 8 says it. */
      note: string
      /** Screen-reader label for each amount, `{n}` being the place. */
      place: string
    }
    /**
     * The two buttons under the steps: the beta, and the repository.
     *
     * Two, and in that order, because they are two different asks of two
     * different people - somebody who wants to build a room tonight, and
     * somebody who wants to see how the thing is made. Putting the second one
     * first would be flattering to us and useless to the contest.
     */
    cta: { signup: string; github: string }
    /** The line that hands the reader from the pictures to the small print. */
    handover: string
  }

  sections: Record<ContestSectionKey, { heading: string; body: React.ReactNode }>
}

/**
 * Every language of the page, keyed the way the routes are - as builders now,
 * not as finished documents.
 *
 * The dates, the prizes, the code and the handle are an operator's row rather
 * than constants in this repository (see `@/domain/contest/settings`), so a
 * language is a function of them. The `Record` still does the job it was
 * written for: a language missing from this table is a build error, not a page
 * that quietly falls back to German.
 */
export const CONTEST_COPY: Record<ContestLocale, (facts: ContestFacts) => ContestCopy> = {
  de: deCopy,
  en: enCopy,
  fr: frCopy,
  es: esCopy,
  pl: plCopy,
  bg: bgCopy,
}

/** The page in one language, with this contest's facts in it. */
export function contestCopy(locale: ContestLocale, facts: ContestFacts): ContestCopy {
  return CONTEST_COPY[locale](facts)
}
