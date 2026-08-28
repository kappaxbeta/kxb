'use client'

import { useEffect } from 'react'
import { track } from '@/app/components/track'

/**
 * Records a `cta_click` when somebody clicks through to the arcade or the door.
 *
 * ---------------------------------------------------------------------------
 * One delegated listener, not a wrapper round every link
 * ---------------------------------------------------------------------------
 * The obvious build is a `<TrackedLink>` and swapping every CTA over to it.
 * That is a worse design here for two reasons.
 *
 * The first is ordinary: it turns every marketing page into a client component
 * tree at each of its call sites, on pages whose whole merit is that they are
 * server-rendered.
 *
 * The second is the one that decided it. These links live in files that get
 * rewritten every time the layout changes, and a wrapper is a thing a redesign
 * quietly drops - somebody rebuilds the hero, writes a plain `<Link>`, and the
 * only symptom is a number that stops going up. Nobody notices a metric that
 * merely stagnates. A delegated listener keyed on the *destination* survives
 * every rewrite, because the destination is the thing that cannot change
 * without the CTA ceasing to be that CTA.
 *
 * ---------------------------------------------------------------------------
 * What counts as a call to action
 * ---------------------------------------------------------------------------
 * Where the link goes, not what it says. A link to the demo is a click-through
 * whether its label is "Come and play" or "Walk into the demo", and a redesign
 * that renames every button changes none of the numbers.
 *
 * `data-cta` overrides the derived id, for the one case the rule cannot cover:
 * two links to the same place on one page that are worth telling apart.
 */

/** Destinations worth counting, and the id each is recorded under. */
const DESTINATIONS: { prefix: string; id: string }[] = [
  { prefix: '/demo', id: 'demo' },
  { prefix: '/signup', id: 'signup' },
  { prefix: '/waitlist', id: 'waitlist' },
  { prefix: '/events', id: 'events' },
  { prefix: '/play', id: 'play' },
  { prefix: '/create', id: 'create' },
  { prefix: '/share', id: 'share' },
]

function ctaFor(anchor: HTMLAnchorElement): string | null {
  const explicit = anchor.dataset.cta
  if (explicit) return explicit

  // `pathname` rather than the raw href, so a query string or a hash cannot
  // stop a link matching - `/play#football` is still the play CTA.
  const path = anchor.pathname
  return DESTINATIONS.find((d) => path === d.prefix || path.startsWith(`${d.prefix}/`))?.id ?? null
}

export function CtaTracker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Modified clicks open a tab and leave this one where it is. They are
      // still interest, but they are not a click-through in the sense the
      // funnel means, and counting them inflates the step below.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return

      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!(anchor instanceof HTMLAnchorElement)) return
      // Same-origin only: an outbound link is not a step in our funnel.
      if (anchor.origin !== window.location.origin) return

      const id = ctaFor(anchor)
      if (!id) return

      track('cta_click', { id, from: window.location.pathname })
    }

    // Capture, so a handler that stops propagation on its way up - the battle
    // wizard's buttons do - cannot silence the count.
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  return null
}
