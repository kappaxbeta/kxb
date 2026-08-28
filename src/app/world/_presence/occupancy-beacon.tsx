'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * How often to say "still here".
 *
 * Half of `occupancy_ttl()` in the migration, so one dropped beat on a bad
 * connection does not evict somebody from a room they are standing in. The two
 * numbers are a pair: raising this without raising that is how a room starts
 * losing people who never left.
 */
const BEAT_MS = 10_000

/**
 * Tells the server which world this person is standing in.
 *
 * ----------------------------------------------------------------------------
 * Why this exists at all
 * ----------------------------------------------------------------------------
 * Presence already knows who is in a room - it is what draws the nameplates -
 * but it lives on a Realtime channel that the server cannot read on a
 * self-hosted stack. Room caps are enforced at the door, on the server, so they
 * need a source of truth the server can query. This is the cheapest one that
 * tells the truth: one upsert per person per ten seconds, which at eighty
 * people is eight writes a second against a room already broadcasting
 * thousands of messages.
 *
 * ----------------------------------------------------------------------------
 * Why it is not part of the presence channel
 * ----------------------------------------------------------------------------
 * It could have been folded into the movement tick in presence-core, and that
 * would have been worse in a way worth recording: the movement tick is gated on
 * actually moving, with a two-second keepalive floor, precisely so that
 * standing still is nearly free. Somebody standing still is still occupying a
 * place in the room, so a heartbeat that inherited that gate would slowly empty
 * every room of the people not walking around in it.
 *
 * ----------------------------------------------------------------------------
 * Leaving
 * ----------------------------------------------------------------------------
 * The row is deleted on unmount and on `pagehide`, so a place frees the moment
 * somebody walks out rather than twenty seconds later. Neither is load-bearing:
 * the count honours the clock, so a browser that crashes without firing either
 * still frees its place on schedule. They are what make walking between two
 * rooms feel immediate.
 *
 * `pagehide` rather than `beforeunload`, because the latter does not fire on
 * mobile Safari when the tab is backgrounded - which is most of how a phone
 * leaves a page.
 */
export function OccupancyBeacon({
  tenantId,
  worldId,
}: {
  tenantId: string
  /** The room's id, or the tenant's id for the space's own lounge. */
  worldId: string
}) {
  useEffect(() => {
    const supabase = createClient()
    let alive = true

    const beat = () => {
      if (!alive) return
      // Fire and forget. A missed beat costs nothing until the TTL runs out,
      // and surfacing an error here would put a toast in front of somebody for
      // a write they never asked for.
      void supabase.rpc('touch_occupancy', {
        p_tenant_id: tenantId,
        p_world_id: worldId,
      })
    }

    const leave = () => {
      void supabase
        .from('world_occupancy')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('world_id', worldId)
    }

    beat()
    const timer = setInterval(beat, BEAT_MS)
    window.addEventListener('pagehide', leave)

    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [tenantId, worldId])

  return null
}
