'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import type { FrameProps } from '@kxb/xp'
import type { HostCapability } from '@kxb/xp/host'

/**
 * The games this deployment can run, by the name a document uses.
 *
 * ---------------------------------------------------------------------------
 * Why the list is here and not in the engine
 * ---------------------------------------------------------------------------
 * `@kxb/xp` keeps `frame.game` as an opaque string on purpose - see
 * `packages/xp/src/document/frame.ts`. Which games exist is a fact about a
 * *deployment*, exactly like which transport it has, and an engine that owned
 * the list would need editing to add one.
 *
 * ---------------------------------------------------------------------------
 * An entry is a name, a list of needs, and a promise of a component
 * ---------------------------------------------------------------------------
 * Nothing else. `../framed.tsx` builds `FrameProps` out of the document and the
 * platform's own facilities and hands them over, so adding a second game is an
 * entry in this array rather than a branch anywhere.
 *
 * `needs` is checked against the host *before* the component is loaded, so a
 * game that cannot run says so instead of downloading three megabytes to find
 * out. It is the same vocabulary a document uses in `backend.needs`, and the
 * two are checked together: the document says what the level asks of the
 * platform, this says what the *code* cannot start without.
 */
export interface FramedGame {
  /** Matches `frame.game`. Lower-case, dashes - the parser enforces it. */
  id: string
  /** For a refusal that names the game rather than the id. */
  label: string
  /**
   * What this game's code cannot start without.
   *
   * Separate from the document's `backend.needs` and both are enforced. A
   * document can ask for *more* than the game strictly requires - a boxing
   * cartridge that wanted `persistence` so a result is kept - and the platform
   * has to satisfy the union.
   */
  needs: readonly HostCapability[]
  /**
   * The component itself, code-split, built once when this module loads.
   *
   * ---------------------------------------------------------------------------
   * At module scope, and that is not a style preference
   * ---------------------------------------------------------------------------
   * The first version called `dynamic()` inside a `useMemo` in `../framed.tsx`,
   * so the component was *created during render*. React's compiler refuses it
   * outright and is right to: a component identity built during render is a new
   * type every time the memo invalidates, and a new type remounts - which here
   * would tear down a live WebGL canvas and a joined socket mid-match.
   *
   * Built here, it is one type for the life of the tab.
   *
   * Still code-split, which is the reason it is `dynamic` at all: a static
   * import would put every game in the bundle of every route that can mount an
   * `XpScene` - the editor, the workbench, and every battle room including the
   * ones playing an ordinary level that will never touch one.
   */
  mount: ComponentType<FrameProps>
}

/**
 * One `dynamic` for every entry, so an entry is three fields and a path.
 *
 * `ssr: false` because a framed game is a canvas and a socket, and there is no
 * useful server rendering of either.
 */
const loaded = (label: string, load: () => Promise<{ default: ComponentType<FrameProps> }>) =>
  dynamic(load, {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-sm text-white/40">
        Loading {label}…
      </div>
    ),
  })

export const GAMES: readonly FramedGame[] = [
  {
    id: 'boxing',
    label: 'Boxing',
    /**
     * Both, and the transport is why.
     *
     * `realtimeHost`'s topic is `private: true` against a policy of `to
     * authenticated`, so a client with nobody behind it is refused at the
     * socket. Declaring it here means the refusal arrives as a sentence before
     * anything loads rather than as a channel that never connects.
     */
    needs: ['identity', 'network'],
    mount: loaded('Boxing', () =>
      import('./boxing').then((module) => ({ default: module.BoxingFrame })),
    ),
  },
  {
    id: 'maumau',
    label: 'Mau-Mau',
    /**
     * Three, and the third is the one that makes this game possible at all.
     *
     * `arbiter` is not a nicety here the way it is for boxing, which uses one
     * only to record a result. A hand of cards is a *secret*, and there is no
     * version of this game where the deck lives on a player's machine and the
     * game is still worth playing - see
     * `packages/maumau/src/net/arbiter.ts`. Declaring it means a host with no
     * authority - a room with no instance behind it - refuses with a sentence
     * before anything loads, rather than dealing to somebody who can read every
     * hand.
     *
     * `identity` follows from it directly: `xp_arbitrate` reads `auth.uid()`
     * and refuses a caller it cannot name, because an authority that cannot
     * tell two players apart cannot keep a secret from either of them.
     */
    needs: ['identity', 'network', 'arbiter'],
    mount: loaded('Mau-Mau', () =>
      import('./maumau').then((module) => ({ default: module.MaumauFrame })),
    ),
  },
  {
    id: 'dream-restaurant',
    label: 'Peepz My Dream Restaurant',
    /**
     * One, and the two it does not ask for are the interesting half.
     *
     * `identity` because everything this game does is written to *your*
     * homestead: the stream id is derived from the session's own user, and a
     * café opened by nobody has no purse to put a lunch service into.
     *
     * Not `network`, though people can stand in it together. The café's
     * multiplayer is the space's own presence channel - who is standing in *my*
     * café - rather than the frame's topic, because whose café it is decides who
     * is in the room, not which cartridge you opened. See `./cafe.tsx`.
     *
     * Not `persistence` either, and that is not an oversight: `xpStore` is keyed
     * by an XP and this game's saving is keyed by a *member*, in an aggregate
     * that predates the port. A café whose money lived in `xp_store` would be a
     * café whose money the house could not spend.
     */
    needs: ['identity'],
    mount: loaded('Peepz My Dream Restaurant', () =>
      import('./dream-restaurant').then((module) => ({ default: module.DreamRestaurantFrame })),
    ),
  },
  {
    id: 'peepz-world',
    label: 'Peepz World',
    /**
     * The restaurant's argument exactly, and the same purse behind it.
     *
     * The two are one world entered by two doors - see `./homestead.tsx` - so
     * they cannot want different things of a host. Two entries rather than one
     * because they are two cartridges: two things on a shelf, two rooms you can
     * keep, two places to start.
     */
    needs: ['identity'],
    mount: loaded('Peepz World', () =>
      import('./peepz-world').then((module) => ({ default: module.PeepzWorldFrame })),
    ),
  },
]

export const gameNamed = (id: string): FramedGame | undefined =>
  GAMES.find((game) => game.id === id)
