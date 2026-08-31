'use client'

import { useEffect, useMemo, useState } from 'react'
import type { XpDocument } from '@kxb/xp'
import {
  describeNeed,
  missingCapabilities,
  type HostCapability,
  type XpSocket,
} from '@kxb/xp/host'

import { realtimeHost } from '@/app/xp/_hosts/realtime'
import { SketchStage } from '@/app/xp/_sketch/stage'

/**
 * A sketch, mounted - the document-carried sibling of `./framed`.
 *
 * The shape is `Framed`'s on purpose: one fork in `XpScene`, the same
 * `realtimeHost` on the same room topic, the same refusals with the same
 * words. What differs is trust - a framed game is our code and gets the whole
 * `XpHost`; a sketch is the *author's* code and gets nothing directly. The
 * stage keeps the socket on this side of the membrane and relays messages
 * through a validated protocol (see `../_sketch/protocol.ts`).
 *
 * One capability short of `Framed`, deliberately: a sketch with no
 * `backend.needs` runs entirely alone - the editor's preview, a solo toy on
 * the public host - so "nobody is signed in" only refuses documents that
 * asked for the wire.
 */

export interface SketchProps {
  xp: XpDocument
  me?: { id: string; name: string } | null
  room?: string
  onLog?: (level: 'log' | 'warn' | 'error', line: string) => void
  touch?: boolean
  /** What the host decided about this match - the battle wizard's limits.
   * Same contract as `FrameProps.match`; null means the sketch decides. */
  match?: { timeLimit: number | null; scoreLimit: number | null }
  /** When something outside has a lobby and blew the whistle. Same
   * three-state contract `FrameProps.started` documents. */
  startedAt?: string | null
}

/** Whether this document is a sketch at all. Same job as `isFramed`: asked
 * before `XpScene` spins up a world the document does not have. */
export const isSketch = (xp: XpDocument): boolean => xp.sketch !== undefined

/** A refusal that says which thing was missing. Never a blank canvas. */
function Refused({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center p-6 text-center">
      <p className="max-w-sm text-sm leading-relaxed text-white/60">{children}</p>
    </div>
  )
}

export function Sketch({ xp, room, me, onLog, touch, match, startedAt }: SketchProps) {
  const asked: readonly HostCapability[] = useMemo(
    () => xp.backend?.needs ?? [],
    [xp.backend?.needs],
  )

  /**
   * A host only when there is somebody to be and somewhere to be it - the
   * same rule `Framed` wrote into its shape, for the same reason: a level id
   * is not a secret, so it must never become the topic.
   */
  const host = useMemo(
    () => (me && room ? realtimeHost(me, room, xp.id) : null),
    [me, room, xp.id],
  )

  /**
   * The one socket this instance holds, joined once the host exists.
   *
   * Joined here rather than inside the stage so the stage stays a pure
   * relay - and so leaving is tied to this component's life, not to the
   * iframe's, which the editor remounts on every run.
   */
  const [socket, setSocket] = useState<XpSocket | null>(null)
  useEffect(() => {
    if (!host || !room) return
    let gone = false
    let joined: XpSocket | null = null
    void host.network.join(room).then((one) => {
      if (gone) {
        one.leave()
        return
      }
      joined = one
      setSocket(one)
    })
    return () => {
      gone = true
      joined?.leave()
      setSocket(null)
    }
  }, [host, room])

  if (!xp.sketch) return null

  const needsWire = asked.length > 0
  if (needsWire && !host) {
    return (
      <Refused>
        {xp.name} is played with other people, so it needs to know who you are. Sign
        in, or open it from an invite link.
      </Refused>
    )
  }

  if (host) {
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
  }

  // Joining is a round trip; the sketch can boot meanwhile. The roster
  // arrives the moment the socket does, as a join event like any other.
  return (
    <SketchStage
      xp={xp}
      socket={socket}
      me={me ?? null}
      {...(onLog ? { onLog } : {})}
      {...(touch !== undefined ? { touch } : {})}
      match={{
        started: startedAt === undefined ? null : startedAt !== null,
        timeLimit: match?.timeLimit ?? null,
        scoreLimit: match?.scoreLimit ?? null,
      }}
    />
  )
}
