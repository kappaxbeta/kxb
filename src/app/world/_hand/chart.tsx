import { ALPHABET, handFor, LETTERS } from '@/app/world/_hand/alphabet'
import { OPEN, poseName } from '@/app/world/_hand/fingers'
import { HandGlyph } from '@/app/world/_hand/hand-glyph'
import type { HandLabels } from '@/app/world/_hand/labels'
import { PHRASES, wordingOf } from '@/app/world/_hand/phrases'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The chart: every hand, and everything the hands can say.
 *
 * The pen has a spellbook that opens itself once and teaches five words. This
 * has more to teach and so it works the other way round - it is a *reference*,
 * something you leave open beside you for a week and then never look at again,
 * which is how every alphabet anybody ever learned was learned.
 *
 * The phrasebook half is the part worth looking at twice. Each row prints the
 * hands on the left and the words on the right **in the reader's own
 * language** - the same call the room makes when somebody signs at you. So the
 * chart is not describing the translation, it is doing it, and a German reader
 * learning `th` learns it as Danke because that is what they will see when
 * somebody signs it.
 *
 * No `'use client'`: it is props in, markup out, and it renders on the server
 * with whatever page is holding it.
 */

export function HandChart({
  labels,
  locale,
  className,
}: {
  labels: HandLabels
  locale: Locale
  className?: string
}) {
  return (
    <div className={className}>
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{labels.title}</h2>
      <p className="mt-1 text-sm opacity-70">{labels.translated}</p>

      <h3 className="mt-6 text-xs font-semibold tracking-widest uppercase opacity-60">
        {labels.alphabet}
      </h3>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {LETTERS.map((letter) => (
          <li
            key={letter}
            className="flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.02] p-2"
          >
            <HandGlyph pose={handFor(letter)} className="h-12 w-10" title={letter} />
            <span className="mt-1 text-sm font-semibold text-[var(--color-ink)] uppercase">
              {letter}
            </span>
            {/* The initials as well as the picture: a hand you can say out loud
                is a hand somebody can tell somebody else about. */}
            <span className="text-[0.6rem] tracking-widest opacity-45">{ALPHABET[letter]}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-xs font-semibold tracking-widest uppercase opacity-60">
        {labels.phrasebook}
      </h3>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {PHRASES.map(({ phrase, letters }) => (
          <li
            key={phrase}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="flex shrink-0 gap-1">
              {letters.map((letter, index) => (
                <HandGlyph
                  // Two hands of the same letter can appear in one phrase, so
                  // the position is part of the key.
                  key={`${letter}${index}`}
                  pose={handFor(letter)}
                  className="h-9 w-7"
                  title={letter}
                />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-[var(--color-ink)]">
                {wordingOf(phrase, locale)}
              </span>
              <span className="text-[0.6rem] tracking-widest uppercase opacity-45">
                {letters.join('')}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 flex items-center gap-3 text-sm opacity-70">
        <HandGlyph pose={OPEN} className="h-10 w-8 shrink-0" />
        <span>
          {labels.send}
          <span className="ml-2 text-[0.6rem] tracking-widest uppercase opacity-60">
            {poseName(OPEN)}
          </span>
        </span>
      </p>
    </div>
  )
}
