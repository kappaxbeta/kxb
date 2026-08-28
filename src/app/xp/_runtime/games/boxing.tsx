'use client'

import type { FrameProps } from '@kxb/xp'
import { BoxingGame } from '@kxb/boxing/play'
import { ears } from '@/app/xp/_runtime/framed-ears'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * `@kxb/boxing`, wearing the platform's frame contract.
 *
 * ---------------------------------------------------------------------------
 * Why there is an adapter at all
 * ---------------------------------------------------------------------------
 * `FrameProps` is the same five things for every game, which is what makes the
 * registry a list. A game is entitled to want something the platform has no
 * general notion of - here it is `ears`, an audio port whose events are
 * *boxing's* events and could not be typed generically without inventing a
 * lowest common denominator nobody wants.
 *
 * So the general props come through untouched and the game-specific one is
 * injected here, in the one file that is allowed to know both sides. The
 * alternative - widening `FrameProps` until it covers every game - is how a
 * contract stops being one.
 *
 * It is also where a game's `settings` would be read. Boxing has none yet: its
 * rounds and frame data are in the package, and a document that could retune a
 * punch would be a document that can make a match unfair.
 */
export function BoxingFrame({
  host,
  topic,
  assets,
  transparent,
  started,
  match,
}: FrameProps) {
  /**
   * The reader's language, read here rather than carried on `FrameProps`.
   *
   * This is the second thing this file exists for, and it is the same shape as
   * `ears`: a fact the platform holds, injected by the one module allowed to
   * know both sides. `FrameProps` could carry a locale and deliberately does
   * not - the app already puts it in context precisely so a component inside a
   * `<Canvas>` need not have it threaded to it, and widening the contract for
   * something every game can already reach is how a contract stops being one.
   *
   * The words themselves are the game's - see `@kxb/boxing/words`. All that
   * crosses here is two letters.
   */
  const locale = useLocale()

  return (
    <BoxingGame
      host={host}
      topic={topic}
      assets={assets}
      transparent={transparent}
      ears={ears}
      /*
        Whose lobby, and whose clock. Both were being dropped here, and both
        failures are silent in a way that reads as the game being broken rather
        than as this file forgetting a prop.

        Without `started` the game sees `null` - "nobody outside has a lobby" -
        so a match room got *two*: the battle's own ready panel, and boxing's
        drawn over the top of it, neither listening to the other. That is
        exactly the failure `FrameProps.started` was given a third state to
        prevent.

        Without `match` the wizard's time limit reached the lobby, was displayed
        there, and then the fight played the package's own default - a setting
        that is shown and not obeyed.
      */
      started={started}
      match={match}
      locale={locale}
    />
  )
}
