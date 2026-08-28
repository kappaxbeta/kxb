'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE, type Locale, localeFromPath } from '@/domain/i18n/locale'

/**
 * Which language the client half of the app is in.
 *
 * The server half reads `readLocale()` and hands the answer to whatever it is
 * rendering. That works right up until the copy is inside a client component -
 * and in this app most of the copy that matters is: the lounge HUD, the rail,
 * every dialog, the whole XP editor. Threading a `locale` prop from a layout
 * down into a control that lives eight components inside a `<Canvas>` would
 * touch every file between the two and would be undone by the next component
 * somebody adds without knowing about it.
 *
 * So the locale is put in context once, at the top of each shell that has one,
 * and read by name wherever a dictionary is needed:
 *
 *     const t = loungeDict(useLocale())
 *
 * The dictionaries themselves stay per-surface modules, exactly as the public
 * pages do it - a component imports the one dictionary it prints, and the rest
 * are not in its bundle. This context carries the two-letter answer and nothing
 * else, which is why it can sit above surfaces that share no copy at all.
 *
 * The default is English rather than a throw. A component rendered outside a
 * provider - a test, a Storybook-ish probe page, the day one of these is reused
 * on a public route - should print words rather than crash, and English is what
 * it would have printed before any of this existed.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/**
 * The locale for a component that is mounted above every page rather than
 * inside one - the contact launcher, the tour, anything in the root layout.
 *
 * Two sources, and the URL wins. A path that says `/de` is a statement made by
 * the address bar: that page is German, and a launcher floating over it must be
 * German too even if the person's saved preference is English - the alternative
 * is a German page with an English dialog hanging off it, which looks like a
 * bug rather than like a preference being honoured.
 *
 * Everywhere else there is no locale in the path, and the answer is whatever
 * shell the component is inside. Outside any shell - the English public pages,
 * which have no provider on purpose - that is English, which is what those
 * pages are written in.
 */
export function usePageLocale(pathname: string): Locale {
  const fromShell = useLocale()
  const fromPath = localeFromPath(pathname)
  return fromPath === DEFAULT_LOCALE ? fromShell : fromPath
}
