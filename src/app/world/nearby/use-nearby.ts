'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Member } from '@/domain/nearby/wire'
import { createMesh, MAX_GUESTS, type Mesh, type Role } from './mesh'
import { acceptAnswer, answerLink, offerLink, type PeerLink } from './peer-link'

/**
 * The nearby room, as a component sees it.
 *
 * Holds the mesh in a ref and mirrors only what a render needs into state -
 * the roster and the role, which change when somebody arrives and not when
 * somebody walks. Positions never come through here.
 */

/** Where an invite is shown: a code for a QR, and a link to send. */
export interface Invite {
  code: string
  link: string
}

export interface Nearby {
  self: Member
  members: Member[]
  role: Role
  full: boolean
  /** Host: make an invite to show. One guest per invite. */
  invite(): Promise<Invite | null>
  /** Host: take the answer the guest showed back. */
  admit(answer: string): Promise<boolean>
  /** Guest: take an offer, return the answer to show the host. */
  join(offer: string): Promise<Invite | null>
  send(event: string, payload: unknown): void
  on(event: string, handler: (payload: unknown, from: string) => void): () => void
}

/** How the invite is written into a URL. A fragment, never a query. */
export const INVITE_KEY = 'j'

/**
 * The link for a code.
 *
 * A **fragment**, deliberately. A query string is sent to the server on every
 * navigation and lands in access logs; a fragment never leaves the browser.
 * The handshake is not a secret worth much - it is useless to anybody not on
 * the same network - but a room that needs no server should not be quietly
 * telling one who is joining it.
 */
export function inviteLink(code: string): string {
  const base = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`
  return `${base}#${INVITE_KEY}=${code}`
}

/** The offer somebody arrived holding, if they did. */
export function readInvite(): string | null {
  if (typeof window === 'undefined') return null
  const found = new RegExp(`[#&]${INVITE_KEY}=([A-Za-z0-9_~-]+)`).exec(window.location.hash)
  return found ? found[1] : null
}

export function useNearby(name: string, avatar: string): Nearby {
  /**
   * Who we are, made once.
   *
   * A fresh id per tab rather than anything remembered: two tabs of the same
   * person are two bodies here, which is right, because they are two people as
   * far as a room of strangers is concerned.
   */
  const [self] = useState<Member>(() => ({
    id: typeof crypto === 'undefined' ? `p${Math.floor(Math.random() * 1e9)}` : crypto.randomUUID(),
    name,
    avatar,
  }))

  const mesh = useRef<Mesh | null>(null)
  if (mesh.current === null) mesh.current = createMesh(self)

  const [members, setMembers] = useState<Member[]>([self])
  const [role, setRole] = useState<Role>('alone')

  /** Host: the invite that has been shown but not yet answered. */
  const pending = useRef<PeerLink | null>(null)

  useEffect(() => {
    const current = mesh.current
    if (!current) return
    const stop = current.watch(() => {
      setMembers(current.members())
      setRole(current.role())
    })
    return () => {
      stop()
      current.close()
      pending.current?.close()
    }
  }, [])

  const invite = useCallback(async (): Promise<Invite | null> => {
    // One pending invite at a time. A second offer while the first is unanswered
    // would leave a connection nobody ever completes, holding a port open.
    pending.current?.close()
    pending.current = null

    try {
      const link = await offerLink(`nearby-${self.id.slice(0, 8)}`)
      pending.current = link
      return { code: link.code, link: inviteLink(link.code) }
    } catch {
      return null
    }
  }, [self.id])

  const admit = useCallback(async (answer: string): Promise<boolean> => {
    const link = pending.current
    if (!link) return false

    const took = await acceptAnswer(link, answer)
    if (!took) return false

    /**
     * Hand the channel over once it is actually open.
     *
     * `setRemoteDescription` resolving only means the answer parsed. The
     * channel opens a moment later when DTLS and SCTP have finished, and a
     * guest added before that is a guest every send silently drops.
     */
    const channel = link.channel
    if (channel.readyState === 'open') {
      mesh.current?.addGuest(channel)
    } else {
      channel.onopen = () => mesh.current?.addGuest(channel)
    }

    // Handed to the mesh, which owns closing it from here.
    pending.current = null
    return true
  }, [])

  const join = useCallback(async (offer: string): Promise<Invite | null> => {
    const link = await answerLink(offer)
    if (!link) return null

    void link.channelReady.then((channel) => {
      if (channel.readyState === 'open') {
        mesh.current?.attachHost(channel)
        return
      }
      channel.onopen = () => mesh.current?.attachHost(channel)
    })

    return { code: link.code, link: inviteLink(link.code) }
  }, [])

  const send = useCallback((event: string, payload: unknown) => {
    mesh.current?.send(event, payload)
  }, [])

  const on = useCallback(
    (event: string, handler: (payload: unknown, from: string) => void) =>
      mesh.current?.on(event, handler) ?? (() => {}),
    [],
  )

  return useMemo(
    () => ({
      self,
      members,
      role,
      full: members.length > MAX_GUESTS,
      invite,
      admit,
      join,
      send,
      on,
    }),
    [self, members, role, invite, admit, join, send, on],
  )
}
