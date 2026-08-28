'use client'

import { useMemo } from 'react'
import { useLocale } from '@/app/i18n/locale-context'
import { refusalIn } from '@/app/i18n/refusals'

/**
 * The function that words a server's refusal, for whoever is reading it.
 *
 * A hook rather than a call, because a panel that shows a refusal shows it from
 * inside a `startTransition` or an `onSubmit` - somewhere with no props and no
 * arguments to thread a locale through. One line at the top of the component
 * and the refusal is worded wherever it is caught.
 *
 * Memoised because `refusalIn` closes over a table lookup and the result is
 * usually named in a `useCallback`'s dependency list; a new function every
 * render would re-create every callback that words anything.
 */
export function useRefusal(): (text: string) => string {
  const locale = useLocale()
  return useMemo(() => refusalIn(locale), [locale])
}
