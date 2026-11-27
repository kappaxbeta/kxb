/**
 * Everything the pen says out loud, in one shape.
 *
 * Its own file so the panel does not have to import the layer to know what a
 * label is - the two would otherwise refer to each other, and a cycle between a
 * component and its own dialog is the kind that only shows up in a build.
 *
 * Words rather than dictionary keys: this module knows nothing about the app's
 * locales, so the scene that mounts it hands over the sentences already chosen.
 * See `src/app/i18n/world.ts` for where they actually live.
 */

import type { Word } from '@/app/world/_ink/words'

export interface InkLabels {
  /** The line along the top edge, which is also the way into the book. */
  hint: string
  /** The book's heading. */
  title: string
  close: string
  /** The soft button, and what it says while the pen is out. */
  pen: string
  away: string
  /**
   * Somebody else's word arriving in your room. `{name}` is replaced with
   * theirs - a placeholder rather than a formatter, because this module has no
   * business importing the app's i18n helpers for one sentence.
   */
  from: string
  /** A name and an instruction per word. The book is drawn from this. */
  spells: Record<Word, { name: string; how: string }>
}
