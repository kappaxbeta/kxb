'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Type `xo` anywhere on a public page and the store opens.
 *
 * The pen in the rooms reads XO as a word; this is the same word on a keyboard,
 * for the pages that have no pen on them. Two letters is short enough to be
 * found by accident, which is the point of an easter egg, and short enough to be
 * *typed* by accident too - so it is deliberately narrow about when it listens:
 *
 * - not while a field, a textarea or anything editable has the focus, or the
 *   `x` and `o` of somebody's search would navigate out from under them;
 * - not with a modifier held, where `x` belongs to the browser;
 * - and only when the two letters land within a second of each other, so a page
 *   somebody typed an `x` into an hour ago is not one keystroke from leaving.
 *
 * Mounted in the marketing shell, which is every page a stranger sees and no
 * page inside a space - the rooms have the real thing.
 */

/** How long the `x` waits for its `o`, in milliseconds. */
const WINDOW = 1000

export function XoShortcut() {
  const router = useRouter()

  useEffect(() => {
    let sawX = 0

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const key = event.key.toLowerCase()
      if (key === 'x') {
        sawX = event.timeStamp
        return
      }
      if (key !== 'o' || !sawX || event.timeStamp - sawX > WINDOW) {
        sawX = 0
        return
      }

      sawX = 0
      router.push('/browse')
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  return null
}
