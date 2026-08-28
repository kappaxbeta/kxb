import { createHmac } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  iceServers,
  TURN_TTL_SECONDS,
  turnExpiry,
  turnUrls,
  turnUsername,
} from '@/domain/world/turn'
import { getUser } from '@/lib/supabase/server'

/**
 * Where to gather ICE candidates, for somebody who is signed in.
 *
 * A route rather than a `NEXT_PUBLIC_` variable, and rather than a server
 * action. The variable is out because that prefix inlines the value into the
 * JavaScript sent to every visitor, which for a relay credential is a bandwidth
 * account published on the internet. The action is out for a smaller reason:
 * `requireTenant` writes cookies, so calling one makes Next re-render the whole
 * route in reply - fine once, wrong for something a client refreshes on a timer.
 * See `polled-server-actions-rerender-the-page`.
 *
 * ---------------------------------------------------------------------------
 * Signed in, and that is the whole of the gate
 * ---------------------------------------------------------------------------
 * Not tenant-scoped, deliberately. A relay carries bytes; it has no idea which
 * space they belong to and could not enforce an answer if it did. What this has
 * to stop is an anonymous internet using the box as free transit, and a session
 * cookie stops exactly that. Which *room* somebody may be in is already decided
 * by the Realtime policy on the topic, several steps before anything here is
 * reached - a credential is no use without a peer to connect to.
 *
 * A guest counts. They hold a real anonymous account by the same door
 * `enterAsGuest` uses, and a guest standing in a lounge is as entitled to be
 * seen in it as anybody else there.
 */
export const dynamic = 'force-dynamic'

/**
 * coturn's `use-auth-secret` scheme.
 *
 * The password is the HMAC of the username, and the username is the expiry - so
 * the server verifies both from the shared secret alone, with no per-user row
 * to store, expire or revoke. SHA-1 because that is what the scheme specifies
 * and what coturn computes; it is a MAC with a secret key rather than a digest
 * of anything, so its collision weakness is not the property being relied on.
 */
function signTurn(secret: string, username: string): string {
  return createHmac('sha1', secret).update(username).digest('base64')
}

export async function GET() {
  const urls = turnUrls(process.env.WORLD_ICE_URLS)

  /**
   * No servers configured is a normal answer, not an error.
   *
   * It is the state every developer machine is in, and the state production was
   * in when faces first shipped: host candidates only, which connects two
   * people on one network and two people who both have IPv6, and nobody else.
   * Answering 500 here would turn "no relay yet" into a broken room.
   */
  if (urls.length === 0) return NextResponse.json({ iceServers: [] })

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  const secret = process.env.WORLD_TURN_SECRET
  const relay = urls.some((one) => one.startsWith('turn'))

  // A relay listed with no secret to sign for it would hand out URLs that
  // cannot authenticate, and ICE would spend its gathering budget failing
  // against them. STUN needs no secret and is still worth having.
  if (relay && !secret) {
    return NextResponse.json({
      iceServers: iceServers(urls.filter((one) => one.startsWith('stun'))),
    })
  }

  const expiresAt = turnExpiry(Date.now())
  const username = turnUsername(user.id, expiresAt)

  const servers = iceServers(
    urls,
    secret
      ? { username, credential: signTurn(secret, username) }
      : undefined,
  )

  return NextResponse.json(
    { iceServers: servers, expiresAt },
    {
      // Private and short. It is minted per person and it expires; a shared
      // cache holding one copy for everybody would be handing one person's
      // credential to the next caller.
      headers: {
        'cache-control': `private, max-age=${Math.floor(TURN_TTL_SECONDS / 2)}`,
      },
    },
  )
}
