'use client'

import { createContext, useContext, useMemo } from 'react'

import { BOXING_EN, wordsFor, type BoxingWords } from './words'

/**
 * The words, put in context once rather than threaded through the HUD.
 *
 * The same argument the app makes for its own locale context, and it applies
 * harder here: the copy that matters is inside a `<Canvas>`, in components four
 * and five deep, and a `words` prop on each of them would be a prop every future
 * panel has to remember to accept. It would be forgotten, and the way it shows
 * is a single English sentence in the middle of a translated screen.
 *
 * A context of this package's own rather than the host's. `@kxb/boxing` names no
 * app and imports no `@/` - that is the property that makes it liftable - so the
 * *locale* crosses the boundary as a two-letter string on `BoxingGameProps` and
 * everything downstream of it is ours.
 *
 * English by default rather than a throw, for the reason `wordsFor` takes a
 * loose string: a component rendered outside the provider - a test, a probe page
 * - should print words rather than crash.
 */
const WordsContext = createContext<BoxingWords>(BOXING_EN)

export function WordsProvider({
  locale,
  children,
}: {
  locale: string | null | undefined
  children: React.ReactNode
}) {
  // Memoised on the string, not the object: `wordsFor` returns one of three
  // module constants, but building the value inline would still hand every
  // consumer a new context value on each render of the game's root.
  const words = useMemo(() => wordsFor(locale), [locale])
  return <WordsContext.Provider value={words}>{children}</WordsContext.Provider>
}

export function useWords(): BoxingWords {
  return useContext(WordsContext)
}
