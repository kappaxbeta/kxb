'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { GUEST_LEFT_PATH } from '@/domain/guests/left-path'
import { createClient } from '@/lib/supabase/client'

/**
 * How often a guest's tab asks whether it is still admitted.
 *
 * The same ten seconds as the occupancy beacon, and for a related reason: a
 * person thrown out of a room should be gone before the next person notices
 * them, and ten seconds is the granularity the room already works at.
 */
const PULSE_MS = 10_000

/**
 * A guest's tab noticing that the visit is over.
 *
 * ----------------------------------------------------------------------------
 * The gap this closes
 * ----------------------------------------------------------------------------
 * Removing a guest is a delete on `tenant_guests`, and `tenant_role()` reads
 * that table on every query, so as far as the database is concerned the
 * ejection is instant. The *tab* is another matter. The anonymous session
 * behind it holds an access token that is good for an hour, PostgREST and
 * Realtime verify that token by signature rather than by asking anybody, and
 * the private channels a lounge is built on re-check their policies only when
 * the token rotates. So somebody kicked while standing in a 3D room kept
 * standing there - seeing, being seen, hearing chat - until their token
 * happened to refresh or they happened to click something that went through
 * `requireTenant`. Up to an hour of ghost.
 *
 * Nothing the server does can shorten that on its own, because a JWT that has
 * been issued cannot be un-issued. The tab has to leave. This is what makes it.
 *
 * ----------------------------------------------------------------------------
 * What it asks, and why not something else
 * ----------------------------------------------------------------------------
 * `tenant_role()` over PostgREST with the guest's own token - the exact function
 * every policy consults, so the tab and the database cannot disagree about
 * whether the visit is over. Null is the answer for a kicked, banned, refused
 * or simply expired admission alike; the tab does not need to know which.
 *
 * Not a Server Action. `requireTenant` writes cookies, and a polled action
 * re-renders the whole route on every beat (see `/api/t/[slug]/knocks` for the
 * day that was learned). Not the occupancy beacon either, which is mounted per
 * world and fires-and-forgets by design - this wants to run for the whole time
 * somebody is anywhere inside the space, and it wants the answer.
 *
 * Checked again the moment the tab comes back to the foreground, because a
 * backgrounded tab's timers are throttled to a minute or worse, and the person
 * returning to a room they were removed from an hour ago should find the
 * goodbye page, not a frozen frame of the room.
 *
 * ----------------------------------------------------------------------------
 * Failing towards staying
 * ----------------------------------------------------------------------------
 * Only an unambiguous null moves anybody. A network error, a timeout, a 5xx -
 * anything that is "could not tell" rather than "no" - does nothing, and the
 * next beat asks again. The cost of a wrong "stay" is one more beat of ghost;
 * the cost of a wrong "go" is throwing somebody out of a room they are allowed
 * in, into a session nobody can sign back in to. `closeEndedVisit` makes the
 * same call for the same reason.
 *
 * `router.replace` to the same page `requireTenant` would have sent them to on
 * their next click, with the same `?from=` - the proxy closes the session on
 * the way in, unless they are still admitted somewhere else, and the page says
 * goodbye. Replace rather than push, because Back should not offer the room.
 */
export function GuestPulse({ tenantId, slug }: { tenantId: string; slug: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    let asking = false

    const ask = async () => {
      if (!alive || asking) return
      asking = true
      try {
        const { data, error } = await supabase.rpc('tenant_role', { p_tenant_id: tenantId })
        if (!alive || error) return
        if (data === null) {
          alive = false
          router.replace(`${GUEST_LEFT_PATH}?from=${encodeURIComponent(slug)}`)
        }
      } catch {
        // Could not tell. Stay, and ask again on the next beat.
      } finally {
        asking = false
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void ask()
    }

    const timer = setInterval(() => void ask(), PULSE_MS)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tenantId, slug, router])

  return null
}
