'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSpace } from '@/app/t/[slug]/space-context'
import { CafeGame } from '@/app/world/cafe/cafe-scene'
import { HomeGame } from '@/app/world/home/home-scene'
import {
  type HomesteadFrame,
  openHomesteadFrame,
} from '@/domain/homestead/frame-actions'
import type { PlaceId } from '@/domain/homestead/events'
import type { PlaceId as WorldPlace } from '@/domain/world/places'

/**
 * The three rooms of a homestead, as the list a scene is handed.
 *
 * Deliberately not `PLACE_IDS` from `@/domain/world/places`, which has the
 * lounge in it: the commons is not part of anybody's homestead and there is no
 * door from a garden onto it.
 */
const PLACES_HERE: readonly WorldPlace[] = ['cafe', 'home', 'outdoor']

/** What is being opened, said in the words of the room being opened. */
const OPENING: Record<PlaceId, string> = {
  cafe: 'Opening the café…',
  home: 'Opening the house…',
  outdoor: 'Going outside…',
}

/**
 * What the café and the house cartridges both have to do before they can draw.
 *
 * ---------------------------------------------------------------------------
 * Two cartridges, one purse, one loader
 * ---------------------------------------------------------------------------
 * `dream-restaurant.xp.json` and `peepz-world.xp.json` are two games and are meant to be: you
 * cook in one and you decorate in the other, and neither knows the other's
 * rules. What they share is the thing that makes them a pair - **one purse**,
 * per member per space, in the `homestead` stream. A lunch service earns the
 * coins that buy the sofa.
 *
 * That sharing is not arranged here. It is arranged by the aggregate, which has
 * kept the café's, the house's and the garden's money in a single stream since
 * before any of this was a cartridge - see `domain/homestead/events.ts` on why
 * a balance split across three streams could be spent twice at once. Both
 * cartridges opening through the same door is what keeps that true; a second
 * loader would be a second place for one of them to start reading somebody
 * else's balance.
 *
 * ---------------------------------------------------------------------------
 * Loaded on mount rather than handed down
 * ---------------------------------------------------------------------------
 * Every other surface that opens a homestead is a page, and a page fetches on
 * the server before it renders - see `src/app/t/[slug]/visit.ts`. A cartridge
 * is mounted from a registry, inside a canvas, by a component that was handed
 * `FrameProps` and nothing else, so there is no server render to hang this on.
 * One round trip on mount is the honest cost of that, and it is why `pending`
 * is a state a caller has to draw rather than a flash of an empty room.
 */
export type HomesteadLoad =
  | { state: 'pending' }
  | { state: 'refused'; error: string }
  | { state: 'open'; frame: HomesteadFrame }

/**
 * No space, no homestead - and that is a sentence rather than a spinner.
 *
 * The public `/xp/<id>` host renders no space around a cartridge, so there is no
 * purse to spend from and no roster to stand in. The document also declares
 * `identity`, which that host refuses on its own; this is the refusal for the
 * case where somebody *is* signed in and still nowhere.
 */
const NOWHERE: HomesteadLoad = {
  state: 'refused',
  error: 'The café and the house are rooms of a space. Open this one from inside yours.',
}

/** What is being waited for, before anything has come back. */
const PENDING: HomesteadLoad = { state: 'pending' }

export function useHomesteadPlace(place: PlaceId): HomesteadLoad {
  const space = useSpace()
  const slug = space?.slug ?? null

  /**
   * The answer, and which place it is the answer *to*.
   *
   * Stamped rather than cleared, and that is not bookkeeping. The house
   * cartridge swaps between the house and the garden by changing this argument,
   * and the obvious shape - set `pending` when the place changes, then set the
   * result - is a `setState` in the body of an effect: a second render every
   * time, and the thing React's own rule asks you not to do. Pending is not a
   * fact that has to be recorded, it is what "no answer for *this* place yet"
   * means, so it is derived below instead.
   */
  const [answer, setAnswer] = useState<{ place: PlaceId; load: HomesteadLoad } | null>(null)

  useEffect(() => {
    // Nothing to fetch, and nothing to record: being nowhere is a fact about
    // where this is rendered rather than an answer that came back, so it is
    // returned below instead of being put into state.
    if (!slug) return

    /**
     * Dropped when the place changes under an answer still in flight.
     *
     * The stamp above would already keep a stale answer from being *shown* -
     * it is for the wrong place - but a resolved promise writing into a
     * component that has moved on is a render nobody needed, and the flag is
     * one line.
     */
    let current = true

    openHomesteadFrame(slug, place)
      .then((result) => {
        if (!current) return
        setAnswer({
          place,
          load: result.ok
            ? { state: 'open', frame: result.frame }
            : { state: 'refused', error: result.error },
        })
      })
      .catch(() => {
        if (!current) return
        setAnswer({
          place,
          load: { state: 'refused', error: 'That did not open. Try again in a moment.' },
        })
      })

    return () => {
      current = false
    }
  }, [slug, place])

  if (!slug) return NOWHERE
  return answer?.place === place ? answer.load : PENDING
}

/**
 * A sentence in the middle of the frame, in the voice `framed.tsx` refuses in.
 *
 * Deliberately the same shape as `Refused` there rather than an import of it:
 * that one is the *platform* declining to mount a game, this is a game
 * declining to open, and the two are free to say different things in different
 * places. What they must not do is differ in how a refusal looks.
 */
export function FrameNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center p-6 text-center">
      <p className="max-w-sm text-sm leading-relaxed text-white/60">{children}</p>
    </div>
  )
}

/**
 * The homestead, drawn - whichever door you came in by.
 *
 * ---------------------------------------------------------------------------
 * Two cartridges, one world, one live id
 * ---------------------------------------------------------------------------
 * `dream-restaurant.xp.json` and `peepz-world.xp.json` are two games and stay two: two entries on
 * a shelf, two cartridges to keep as a room, two things to press. What they are
 * not is two *worlds*. The café's front door has always led to the garden and
 * the garden's front door has always led back into the house - that is one plot
 * of land with three rooms on it, and the only reason it was ever three pages
 * is that the router made it three.
 *
 * So the cartridge decides where you **start** and nothing else. Walk out of the
 * kitchen and you are in the garden; walk down the garden and you are in the
 * café, in the same canvas, on the same purse, in the same instance. Nothing
 * navigates, because there is nowhere to navigate to: the live id is the room
 * this cartridge was opened in, and it does not change when you cross a
 * doorway.
 *
 * That is why this component exists rather than one per game. Two of them, each
 * owning its own half, would have to hand a player to each other across a
 * mount - and a handover between two React trees is a new canvas, a new socket
 * and a new session, which is precisely the page navigation this was meant to
 * stop being.
 *
 * ---------------------------------------------------------------------------
 * A different place is a different world, and gets a key
 * ---------------------------------------------------------------------------
 * Both scenes seed their furniture, their plan and their balance in lazy
 * `useState` initialisers, which run on mount and never again - which is the
 * same reason the world routes keyed them on whose homestead it was. A swap
 * without a key would put you in the garden holding the living room's floor
 * plan.
 */
export function HomesteadWorld({ start }: { start: PlaceId }) {
  const [place, setPlace] = useState<PlaceId>(start)

  const load = useHomesteadPlace(place)

  /**
   * Take a doorway.
   *
   * Every exit in this world leads to another part of it, so this is total -
   * and it is narrowed rather than cast because `Exit.to` is a `PlaceId` from
   * `@/domain/world/places`, which has a fourth member: the lounge is the
   * commons and no homestead has a door onto it. A plan that grew one would
   * arrive here and do nothing, which is the right answer to a door nobody
   * built the room behind.
   */
  const go = useCallback((to: WorldPlace) => {
    if (to === 'cafe' || to === 'home' || to === 'outdoor') setPlace(to)
  }, [])

  /**
   * Everywhere you can get to from here, which is everywhere.
   *
   * Passed rather than defaulted, because absent means something else to both
   * scenes: it means *the router owns the journey*, which is what the world
   * routes wanted and what a cartridge must never do. See `travel` on
   * `HomeGame`.
   */
  const travel = useMemo(() => ({ to: PLACES_HERE, go }), [go])

  if (load.state === 'pending') return <FrameNote>{OPENING[place]}</FrameNote>
  if (load.state === 'refused') return <FrameNote>{load.error}</FrameNote>

  const { frame } = load

  if (place === 'cafe') {
    return (
      <CafeGame
        key="cafe"
        slug={frame.slug}
        initial={frame.initial}
        avatar={frame.avatar}
        presence={frame.presence}
        owner={frame.owner}
        agents={frame.agents}
        travel={travel}
      />
    )
  }

  return (
    <HomeGame
      key={place}
      place={place}
      slug={frame.slug}
      initial={frame.initial}
      avatar={frame.avatar}
      presence={frame.presence}
      owner={frame.owner}
      agents={frame.agents}
      travel={travel}
    />
  )
}
