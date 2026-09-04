import Link from 'next/link'
import { LOCALES, type Locale, switchHref } from '@/app/i18n/locales'

/**
 * The language selector: a flag, a code, and a dropdown of the three.
 *
 * ---------------------------------------------------------------------------
 * `<details>` rather than the dropdown primitive
 * ---------------------------------------------------------------------------
 * `src/components/ui/dropdown-menu.tsx` exists and nothing in the app uses it.
 * This is not the place to start, for the reason the landing page's FAQ gives
 * about its own `<details>`: the disclosure is the browser's own, so it works
 * before hydration, it is keyboard-operable without anybody writing that, and
 * the links are in the DOM for a crawler whether or not the menu was opened.
 *
 * The panel, the chevron and the item are the shared `.menu-*` vocabulary in
 * `globals.css`, worn by `xo-menu.tsx` too: two disclosures in one header row
 * that drop two differently-drawn panels read as two controls from two sites.
 *
 * That matters more here than it does for an FAQ. This control sits in the
 * header of pages that are statically rendered and ship no client JavaScript
 * at all - `/play`, `/share`, `/coins`. A base-ui menu would make every one of
 * them hydrate a component so that three links can be behind a chevron.
 *
 * The cost is honest: with no script, the menu closes when you press a second
 * time or pick something, not when you click elsewhere on the page. Every item
 * navigates away, so it resolves itself in the case that actually happens.
 *
 * ---------------------------------------------------------------------------
 * Flags are decoration, and the endonym is the label
 * ---------------------------------------------------------------------------
 * A flag is a country and not a language, and the two come apart immediately:
 * German is read in Vienna and Zurich under other flags, and English has no
 * flag at all that is not somebody's national claim on it. So the flag sits
 * beside the name rather than standing in for it, and the name is written the
 * way that language writes it - `Deutsch`, `Български` - which is the one
 * label a reader looking for their own language can always find.
 *
 * `aria-hidden` on every flag: a screen reader announcing "flag of Germany,
 * Deutsch" is reading out the decoration and then the answer.
 */

/** What each language calls itself, and the flag drawn beside it. */
const LANGUAGES: Record<Locale, { endonym: string; flag: string }> = {
  en: { endonym: 'English', flag: '🇬🇧' },
  de: { endonym: 'Deutsch', flag: '🇩🇪' },
  bg: { endonym: 'Български', flag: '🇧🇬' },
}

export function LanguageMenu({ locale }: { locale: Locale }) {
  const current = LANGUAGES[locale]

  return (
    <details className="menu lang-menu">
      <summary
        className="menu-trigger nav-pill-link"
        /* The control has no visible text label - it is a flag and a code - so
           the accessible name has to be written here. */
        aria-label="Language"
      >
        <span aria-hidden="true">{current.flag}</span>
        {/* The code, which a phone does without: "DE" beside a German flag is
            the same fact twice, and 375px of German header has better uses
            for those pixels - see `.lang-code` in globals.css. */}
        <span className="lang-code uppercase">{locale}</span>
        <span className="menu-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>

      <ul className="menu-panel">
        {LOCALES.map((code) => {
          const { endonym, flag } = LANGUAGES[code]
          const active = code === locale

          return (
            <li key={code}>
              <Link
                href={switchHref(code)}
                /* `hrefLang` and `lang` both: the first tells a crawler what is
                   on the other end, the second tells a screen reader which
                   language to pronounce this item in - without it "Български"
                   is read with an English voice. */
                hrefLang={code}
                lang={code}
                aria-current={active ? 'true' : undefined}
                className={`menu-item ${active ? 'is-current' : ''}`}
              >
                <span aria-hidden="true">{flag}</span>
                {endonym}
              </Link>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
