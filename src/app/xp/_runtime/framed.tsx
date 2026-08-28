'use client'

import { useMemo } from 'react'
import { backgroundOf, type XpDocument } from '@kxb/xp'
import { describeNeed, missingCapabilities, type HostCapability } from '@kxb/xp/host'

import { realtimeHost } from '@/app/xp/_hosts/realtime'
import { gameNamed } from '@/app/xp/_runtime/games/registry'

/**
 * A cartridge, mounted - whichever cartridge it turns out to be.
 *
 * ---------------------------------------------------------------------------
 * Where the engine stops and the platform starts
 * ---------------------------------------------------------------------------
 * `@kxb/xp` has a `frame` block that names a game by an opaque string and
 * deliberately keeps no list of what those strings mean - see
 * `packages/xp/src/document/frame.ts`. `./games/registry.ts` is that list, and
 * **this file names no game in it**.
 *
 * What it does instead is the four steps that are the same for every game: find
 * the entry, build the platform's facilities, check them against what was asked
 * for, and mount. Adding a second game is an entry in the registry and nothing
 * here.
 *
 * The payoff upstream is that nothing needed changing at all. The store lists a
 * cartridge because it is an XP; the battle wizard offers it because it is an XP
 * with `match`; the match room opens it because it opens XPs. One branch, at the
 * end, in `XpScene`.
 *
 * ---------------------------------------------------------------------------
 * Every refusal names what was missing
 * ---------------------------------------------------------------------------
 * Three ways this can decline a document and none of them is a blank canvas: a
 * game this deployment has never heard of, a capability the platform cannot
 * supply, and a person who is nobody. `@kxb/xp/host` already wrote the words for
 * the second - `NEEDS_EN` - and its own comment notes that `missingCapabilities`
 * was *"a refusal nothing ever reached"*. It reaches something now.
 *
 * ---------------------------------------------------------------------------
 * The XP system's transport, and only that one
 * ---------------------------------------------------------------------------
 * A cartridge is networked by `realtimeHost` - the same Supabase Realtime host
 * every XP room uses, keyed by the same room id - so a framed game is reached
 * the way every other XP is: a link to a room, or a battle that sent you there,
 * with real accounts on real machines.
 *
 * Boxing briefly had a transport of its own, a `BroadcastChannel`, so two tabs
 * of one browser were two players. That is removed rather than kept as a second
 * way in. Two tabs was never really playable: a hidden tab gets no
 * `requestAnimationFrame`, and because a framed game may well decide contact on
 * the *defender's* client, a backgrounded opponent could not be hit at all. It
 * looked like broken collision and was reported as such twice. A second
 * transport that only works when you squint is worse than not having one.
 */

export interface FramedProps {
  xp: XpDocument
  /**
   * Whoever is playing, when the host knows.
   *
   * `XpScene` is already handed this - a battle knows who it sent here, and the
   * workbench reads the session - so a cartridge gets it for free rather than
   * fetching it again from inside a canvas.
   */
  me?: { id: string; name: string } | null
  /**
   * The room everybody in this instance shares.
   *
   * The battle passes its own id, which is what makes everybody the lobby sent
   * here land in the same game. Absent is somebody opening the cartridge on the
   * workbench, which gets a room keyed by the document.
   */
  room?: string
  /**
   * When the match was started, if something outside this has a lobby.
   *
   * ---------------------------------------------------------------------------
   * Nothing passes this today, and the contract is kept anyway
   * ---------------------------------------------------------------------------
   * The battle room used to, and the result was two lobbies - its own panel and
   * the game's - neither listening to the other. That is settled the other way
   * now: the battle hides its panel for a framed XP and the *game* runs the
   * lobby, because the game is the one that can say "red corner, Boxer" rather
   * than "side 1".
   *
   * The prop stays because the three-state contract behind it is still right for
   * a host that genuinely does own the start - a tournament bracket, a scheduled
   * match. See `FrameProps.started`. What is wrong is having two, not having
   * the ability to defer.
   */
  startedAt?: string | null
  /**
   * What the host decided about this match, when something did.
   *
   * The battle wizard offers a time limit and a score limit, and until now they
   * reached the level and stopped: a host set three minutes, the lobby said
   * three minutes, and a framed game played its own default. A setting that is
   * displayed and ignored is worse than one that is not offered.
   */
  match?: { timeLimit: number | null; scoreLimit: number | null }
}

/**
 * Whether this document is a cartridge at all.
 *
 * Exported so `XpScene` can ask before it does any of its own work - building a
 * world, a camera and a physics step for a document that has none would be a lot
 * of machinery spun up to be thrown away.
 */
export const isFramed = (xp: XpDocument): boolean => xp.frame !== undefined

/** A refusal that says which thing was missing. Never a blank canvas. */
function Refused({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center p-6 text-center">
      <p className="max-w-sm text-sm leading-relaxed text-white/60">{children}</p>
    </div>
  )
}

export function Framed({ xp, room, me, startedAt, match }: FramedProps) {
  const frame = xp.frame
  const game = frame ? gameNamed(frame.game) : undefined

  /**
   * The platform's facilities, built once per room and player.
   *
   * `realtimeHost` opens a channel, so building one per render would open one
   * per render. It is also the clock a game's wire timings are measured against,
   * and a second host would start a second clock at a different zero.
   */
  const host = useMemo(
    () => (me ? realtimeHost(me, room ?? xp.id, xp.id) : null),
    [me, room, xp.id],
  )

  if (!frame) return null

  if (!game) {
    return (
      <Refused>
        This game is called <span className="font-mono text-white/80">{frame.game}</span>,
        and nothing here knows what that is. The document is fine; this deployment
        cannot run it.
      </Refused>
    )
  }

  /**
   * Somebody has to be signed in before a host can exist at all.
   *
   * Checked before `missing` below, because without a player there is no host to
   * check anything *against* - and because this is the one refusal the reader can
   * do something about.
   */
  if (!host) {
    return (
      <Refused>
        {xp.name} is played with other people, so it needs to know who you are. Sign
        in, or open it from an invite link.
      </Refused>
    )
  }

  /**
   * What the document asked for and what the game cannot start without, both.
   *
   * A union rather than either alone: a document may ask for more than its game
   * strictly requires - a cartridge wanting `persistence` so a result is kept -
   * and the platform has to satisfy all of it. Deduped, so a capability both of
   * them named is reported once.
   */
  const asked: HostCapability[] = [...new Set([...(xp.backend?.needs ?? []), ...game.needs])]
  const missing = missingCapabilities(host, asked)

  if (missing.length > 0) {
    return (
      <Refused>
        {xp.name} needs something this page cannot give it:{' '}
        <span className="text-white/80">
          {missing.map((need) => describeNeed(need).toLowerCase()).join(', ')}
        </span>
        .
      </Refused>
    )
  }

  /**
   * Transparent by default, and the default is the one that matters.
   *
   * A cartridge is nearly always opened *inside* something - a match room with
   * its own background, a header and a rail - and a game that paints its own
   * black rectangle in the middle of that is a hole cut in the page. Letting the
   * page show through wherever the game does not draw is what makes an embedded
   * game look embedded rather than pasted on.
   *
   * `own` is the escape hatch for a game whose picture goes to the edges. See
   * `XpFrame.background`.
   */
  const transparent = backgroundOf(frame) !== 'own'

  /**
   * Read off the registry rather than built here - see `FramedGame.mount` for
   * why creating this during render is a remount rather than a re-render.
   */
  const Game = game.mount

  return (
    <div className={`h-full w-full ${transparent ? 'bg-transparent' : 'bg-neutral-950'}`}>
      <Game
        host={host}
        /*
          The room *is* the instance, and the topic is the room's own name.

          Not prefixed: `realtimeHost` was handed this room and already scopes its
          channel by it, so a second name here would be a channel inside the room
          that nobody else is on.
        */
        topic={room ?? xp.id}
        /*
          Where a game's package publishes its art. One folder per game id, by
          convention rather than by configuration - a path in the document would
          be a document that can point at somebody else's files.
        */
        assets={`/${frame.game}`}
        transparent={transparent}
        /*
          Whether somebody else is running a lobby, and whether they have
          started. Three states rather than two - see `FrameProps.started`.

          `undefined` here means this was not opened inside anything that has
          one, so the game runs its own. A battle room always passes a value,
          `null` before the whistle and a time after it.
        */
        started={startedAt === undefined ? null : startedAt !== null}
        /*
          Nulls when nothing outside has an opinion - a shared link, the
          workbench - which every game is expected to read as "you decide".
        */
        match={match ?? { timeLimit: null, scoreLimit: null }}
        settings={frame.settings}
      />
    </div>
  )
}
