'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ClipView } from '@/domain/thingiverse/queries'

/**
 * The one clip the body at the top of the page is playing.
 *
 * ---------------------------------------------------------------------------
 * Why a context rather than a prop
 * ---------------------------------------------------------------------------
 * The two halves of this are on opposite sides of a server boundary. `Showcase`
 * draws the body; the clips list is a panel the hub switches to, rendered by the
 * page as a server component and handed to `Hub` as a `ReactNode` - so there is
 * no client component that owns both and could hold the state between them. A
 * provider around the pair is the smallest thing that does, and it costs one
 * `useState` in a component with no markup of its own.
 *
 * ---------------------------------------------------------------------------
 * One at a time, and it is the whole `ClipView`
 * ---------------------------------------------------------------------------
 * Not an id: the body needs the baked samples *and* the rig they were keyed
 * against, because which of the two bodies is standing there is decided by the
 * clip rather than by what the account wears - see `Showcase`. Passing the row
 * that was pressed carries all three facts and saves the stage a lookup through
 * a list it does not have.
 *
 * Null is "back to the gait", which is what stop and a second press of the same
 * row both mean. A second press being stop rather than restart is the behaviour
 * every play control in this product has, and a clip that loops has no visible
 * "again" to offer anyway.
 */
export interface Rehearsal {
  /**
   * Whether there is a body to play on at all.
   *
   * False outside a provider, and the clips list reads it to leave the play
   * button off rather than draw one that does nothing. A control that is present
   * and inert is the failure this flag exists to make impossible: the list is a
   * panel, it can be dropped onto a page with no mirror on it, and nothing about
   * that page would look wrong until somebody pressed play.
   */
  possible: boolean
  /** What the body is playing, or null for whatever the chips last said. */
  clip: ClipView | null
  /** Press a row. Pressing the one that is already playing stops it. */
  play: (clip: ClipView) => void
  stop: () => void
}

const Context = createContext<Rehearsal>({
  possible: false,
  clip: null,
  play: () => {},
  stop: () => {},
})

/** Read the shared state. Outside a provider this is an inert stub. */
export function useRehearsal(): Rehearsal {
  return useContext(Context)
}

export function RehearsalProvider({ children }: { children: React.ReactNode }) {
  const [clip, setClip] = useState<ClipView | null>(null)

  const play = useCallback((next: ClipView) => {
    setClip((current) => (current?.id === next.id ? null : next))
  }, [])

  const stop = useCallback(() => setClip(null), [])

  const value = useMemo(() => ({ possible: true, clip, play, stop }), [clip, play, stop])

  return <Context.Provider value={value}>{children}</Context.Provider>
}
