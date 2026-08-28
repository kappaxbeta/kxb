'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_HAND, type Hand } from '@/lib/controls/hand'
import { chooseHand, getServerHand, getStoredHand, subscribe } from '@/lib/controls/hand-store'

/**
 * The React face of the handedness store.
 *
 * In `src/lib` beside the store rather than under `src/app/components`, which is
 * where the audio hook lives, and for a reason that is about lint rather than
 * taste: `src/app/xp/**` is forbidden from importing `@/app/components/*`, and
 * an XP needs this exactly as much as the lounge does. The rule is there to stop
 * the prototype borrowing the product's *renderer* - four lines wrapping a
 * subscription is not that. `@/lib/telegram/use-telegram` is the same shape.
 */

export interface HandControls {
  /**
   * The layout to draw.
   *
   * Never null: an unanswered question still has to put the stick somewhere,
   * and `DEFAULT_HAND` is where. Ask `chosen` if you need to know whether this
   * is a real answer or a stand-in.
   */
  hand: Hand
  /** Whether they have actually been asked. False means show the question. */
  chosen: boolean
  /** Answer it, or change the answer. Applies immediately and persists. */
  choose: (hand: Hand) => void
  /** The other one, for a control that is a toggle rather than a pair. */
  flip: () => void
}

export function useHand(): HandControls {
  const stored = useSyncExternalStore(subscribe, getStoredHand, getServerHand)

  const choose = useCallback((hand: Hand) => chooseHand(hand), [])

  const flip = useCallback(() => {
    // Read through the store rather than closing over `stored`, so a tap that
    // lands in the same tick as another change flips the value that is actually
    // current instead of the one this render happened to see.
    chooseHand((getStoredHand() ?? DEFAULT_HAND) === 'right' ? 'left' : 'right')
  }, [])

  return { hand: stored ?? DEFAULT_HAND, chosen: stored !== null, choose, flip }
}
