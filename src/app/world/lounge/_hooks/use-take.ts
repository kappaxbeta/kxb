'use client'

import { useCallback } from 'react'

import type { WorldDict } from '@/app/i18n/world'
import { pocketNow, putInPocket, takeFromPocket } from '@/app/world/_stores/pocket-store'
import { holdable } from '@/domain/thingiverse/hold'
import type { ThingView } from '@/domain/thingiverse/queries'

/**
 * Pick a thing up off the floor and put it in your pocket.
 *
 * ---------------------------------------------------------------------------
 * The other way into a pocket
 * ---------------------------------------------------------------------------
 * The first is a rack or a table - `Pulse.gave`, a slot handing over a word -
 * and until now it was the only one, which left a gap anybody could walk into:
 * the shelf lets you summon a pistol, the pistol stands on the floor with a
 * grip and a trigger, and G at it did nothing, because nothing standing on a
 * floor had ever been a thing you could *take*. You could sit on a bench you
 * summoned and drive a kart you summoned and not pick up a bat.
 *
 * What goes in is the blueprint's name, because a pocket holds words - see
 * `@/domain/thingiverse/pocket` - and the name is the word a slot resolves
 * against the shelf, so the same bun lands on the same pan whichever way it
 * was picked up. The row goes, over the same `dismiss` a rail button uses,
 * because an item in a coat is not an item on the floor: leaving the row would
 * draw a pistol for everybody that one person is also holding.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, in the machines' order
 * ---------------------------------------------------------------------------
 * Pocket first, then the world, and put back on a refusal - which is the one
 * case that needs the answer `dismiss` returns. A full pocket refuses *before*
 * anything moves, which is the honest failure: the thing is still standing
 * there, which is a thing you can see.
 *
 * Whose it was is not checked here, and not by the server either: a thing in a
 * room is the room's, and taking it is the same act as dismissing it from the
 * rail, which anybody standing here may do. A room that wants its furniture to
 * stay put makes it furniture - `keep` - and a pistol is not furniture in any
 * room anybody has built.
 *
 * Its own hook rather than thirty more lines in `use-things`, which is at the
 * lint rule's ceiling and is a file about rows and commands; this is a file
 * about a pocket.
 */
export function useTake({
  things,
  dismiss,
  refuse,
  dict,
}: {
  /**
   * The room. The list itself rather than the ref `use-things` keeps of it -
   * the compiler's memo rule cannot see through a ref handed in as a prop, and
   * the identity this callback gets from the list is the identity `interact`
   * in the scene already has from `nearThing`, so nothing rebuilds that was
   * not rebuilding already.
   */
  things: readonly ThingView[]
  /** Take the row out of the world. Resolves to whether the server agreed. */
  dismiss: (id: string) => Promise<boolean>
  /** Say why it was refused, in the reader's language. */
  refuse: (text: string) => void
  dict: WorldDict
}) {
  return useCallback(
    (id: string): boolean => {
      const thing = things.find((one) => one.id === id)
      const blueprint = thing?.blueprint
      if (!thing || !blueprint || !holdable(blueprint.spec)) return false

      const word = blueprint.name
      if (!putInPocket(word)) {
        refuse(dict.things.pocketFull)
        return false
      }

      void dismiss(id).then((ok) => {
        if (ok) return
        // The last one, because that is where `pocketed` put it; anything that
        // has gone in since sits after it and stays.
        const at = pocketNow().items.lastIndexOf(word)
        if (at >= 0) takeFromPocket(at)
      })
      return true
    },
    [things, dismiss, refuse, dict],
  )
}
