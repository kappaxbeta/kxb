/**
 * Turning seven readings into a sentence somebody can act on.
 *
 * The bench used to open with a seven-row table of words like `downloadable`,
 * which is the shape the browser answers in and the wrong shape to *lead* with:
 * it hands you the data and leaves the conclusion as an exercise. The question
 * anybody arrives with is "can I build on this, here, today", and that has a
 * one-line answer. So the answer goes first, the rows go under it, and the
 * remedy only appears when there is something to remedy.
 *
 * The browser's own words are kept, quietly, beside the plain ones. They are
 * what you will type into a search box when something is wrong, and dropping
 * them to sound friendly would cost more than it saved.
 */

import type { NanoName } from '@/app/experiment/nano/_nano/apis'
import type { NanoReading, NanoState } from '@/app/experiment/nano/_nano/availability'

/** What each state means, said the way a person would say it. */
export function wordFor(state: NanoState): string {
  switch (state) {
    case 'available':
      return 'Ready'
    case 'downloadable':
      return 'Downloads on first use'
    case 'downloading':
      return 'Downloading now'
    case 'unavailable':
      return 'Not on this machine'
    case 'missing':
      return 'Switched off'
    case 'error':
      return "Wouldn't say"
  }
}

/**
 * Three weights, not six colours.
 *
 * `available` and `downloadable` are both usable - one is simply slower the
 * first time - so they share the warm foreground and differ only in their
 * words. Everything else recedes. A row per colour would make the panel look
 * like a dashboard in trouble when nothing is wrong.
 */
export function toneFor(state: NanoState): string {
  if (state === 'available') return 'text-ink'
  if (state === 'downloadable' || state === 'downloading') return 'text-ink-muted'
  return 'text-ink-muted/60'
}

export type Verdict = {
  /** The line the page opens with. */
  headline: string
  /** The qualifier under it, or null when there is nothing to add. */
  aside: string | null
  ready: NanoName[]
  off: NanoName[]
}

const COUNT = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'all seven']

/** How many, in words - a numeral in a headline reads like a metric. */
function said(count: number, total: number): string {
  if (count === total) return 'all seven'
  return COUNT[count] ?? String(count)
}

export function verdictFrom(readings: Record<string, NanoReading> | null, names: NanoName[]): Verdict | null {
  if (!readings) return null
  const usable = (name: NanoName) => {
    const state = readings[name]?.state
    return state === 'available' || state === 'downloadable' || state === 'downloading'
  }
  const ready = names.filter(usable)
  const off = names.filter((name) => readings[name]?.state === 'missing')

  const headline =
    ready.length === 0
      ? 'Nothing here is ready to use.'
      : `${said(ready.length, names.length)} of the seven ${ready.length === 1 ? 'is' : 'are'} ready in this browser.`

  // Only said when it is true, and only ever one thing. A page that lists
  // every caveat every time teaches people to read none of them.
  const aside =
    off.length > 0
      ? `${said(off.length, names.length)} more ${off.length === 1 ? 'is' : 'are'} switched off, and can be turned on.`
      : ready.length > 0
        ? 'Nothing to install.'
        : null

  // Both lines are built from a spelled-out count, which is lower case where a
  // sentence wants a capital. Doing it here rather than in CSS because
  // `capitalize` would also touch `LanguageModel` if this string ever grew one.
  const open = (line: string) => line.charAt(0).toUpperCase() + line.slice(1)

  return { headline: open(headline), aside: aside ? open(aside) : null, ready, off }
}
