'use client'

import type { FrameProps } from '@kxb/xp'
import { MaumauGame } from '@kxb/maumau/play'
import { tongueFor } from '@kxb/maumau/words'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * `@kxb/maumau`, wearing the platform's frame contract.
 *
 * ---------------------------------------------------------------------------
 * What this adapter injects, and why it has to be here
 * ---------------------------------------------------------------------------
 * One thing: the language. `FrameProps` is the same six fields for every game -
 * which is what makes the registry a list rather than a switch - and it has no
 * locale, deliberately: the platform's own locale lives in a cookie and a React
 * context that `@kxb/xp` has never heard of and must not.
 *
 * A card game is the first framed game that needs one. Boxing draws four words
 * and a countdown; this one draws sentences, and it is a *German* game - see
 * `packages/maumau/src/play/words.ts`, where the German is written first and
 * the English written to match it.
 *
 * So the general props come through untouched and the locale is read here, in
 * the one file that is allowed to know both sides. That is exactly the escape
 * hatch `./boxing.tsx` uses for its audio port, and the alternative - widening
 * `FrameProps` until it covers every game - is how a contract stops being one.
 *
 * ---------------------------------------------------------------------------
 * `settings` is passed through, and it means something here
 * ---------------------------------------------------------------------------
 * Boxing has none and says why: a document that could retune a punch could make
 * a match unfair. A house rule is symmetric - sevens stack for everybody or for
 * nobody - so this game reads its `frame.settings` as the table's rules. The
 * argument in full is in `packages/maumau/src/rules/house.ts`; what matters
 * here is that they are only ever a *proposal*. The authority reads them again,
 * pins whichever arrives first, and refuses a second player who names a
 * different set.
 */
export function MaumauFrame({
  host,
  topic,
  assets,
  transparent,
  started,
  match,
  settings,
}: FrameProps) {
  const locale = useLocale()

  return (
    <MaumauGame
      host={host}
      topic={topic}
      assets={assets}
      transparent={transparent}
      /*
        The app's locale, narrowed to one this game has actually been written
        in. `LOCALES` is the app's list and has already grown past two; the game
        ships English and German, and `tongueFor` falls back to English for
        anything else rather than drawing a blank.

        Narrowed here rather than inside the game, because *which* locale the
        reader has is the app's fact - the package is handed an answer, like
        everything else on `FrameProps`.
      */
      tongue={tongueFor(locale)}
      /*
        Whose lobby, and whose clock. Both are dropped easily and both failures
        are silent - see the same comment in `./boxing.tsx`, which is where the
        cost of forgetting them was paid.
      */
      started={started}
      match={match}
      settings={settings}
    />
  )
}
