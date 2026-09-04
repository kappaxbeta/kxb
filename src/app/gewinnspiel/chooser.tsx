import Link from 'next/link'
import {
  CONTEST_LANGUAGE_NAME,
  CONTEST_LOCALES,
  contestHref,
  type ContestLocale,
} from '@/app/gewinnspiel/locales'

/**
 * All five languages, always in the markup, always in the same order.
 *
 * Not a `<select>`, and that is the whole of the design. A select needs
 * JavaScript to navigate anywhere, hides four of the five options behind a tap,
 * and is a control a crawler cannot follow - so the page would exist in five
 * languages and be discoverable in one. Five links are five links: they work on
 * the first paint, they are the `hreflang` graph search wants, and somebody who
 * only reads Polish can see the word "Polski" without opening anything.
 *
 * The current language is a `<span>` rather than a link to the page you are on.
 * `aria-current="page"` is what says "this one", and a link that goes nowhere is
 * a promise the chooser does not keep.
 */
export function LanguageChooser({
  current,
  label,
}: {
  current: ContestLocale
  /** The chooser's name, in the language being read. */
  label: string
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {CONTEST_LOCALES.map((locale) => {
        const name = CONTEST_LANGUAGE_NAME[locale]
        if (locale === current) {
          return (
            <span
              key={locale}
              aria-current="page"
              className="rounded-full border border-accent px-3 py-1 text-sm text-accent"
            >
              {name}
            </span>
          )
        }
        return (
          <Link
            key={locale}
            href={contestHref(locale)}
            hrefLang={locale}
            // The link's own text is in the language it points at, so it needs
            // the language it points at - otherwise a German screen reader
            // pronounces "Français" as German and it is not a word.
            lang={locale}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted transition hover:border-accent hover:text-ink"
          >
            {name}
          </Link>
        )
      })}
    </nav>
  )
}
