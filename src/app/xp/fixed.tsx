'use client'

import { useEffect } from 'react'

/**
 * The page held still, for the two routes that are not pages.
 *
 * ---------------------------------------------------------------------------
 * Why this is not in `globals.css` and not in the root layout
 * ---------------------------------------------------------------------------
 * `/xp/<id>` is a level you play with a thumbstick and `/xp/<id>/edit` is a tool
 * you drag gizmos around in. Both are full-screen surfaces sized to the viewport
 * with nothing below the fold, and on a phone both were being treated as
 * documents: a pinch zoomed the whole interface, a double-tap zoomed it further,
 * and once zoomed every drag panned the page under the fingers instead of
 * turning the camera or moving what was being held.
 *
 * Everything else on this domain **is** a document - the landing page, the
 * legals, the workspace - and pinch-zoom on a page of text is an accessibility
 * affordance, not a bug. So none of this belongs in the root layout or in a
 * global stylesheet, which is why `globals.css` only ever went as far as
 * `overscroll-behavior-y: none` (the rubber band, which is wrong everywhere) and
 * a `touch-action: none` block scoped to the HUD's own controls.
 *
 * The scoping is the whole design here. `export const viewport` in
 * `src/app/xp/layout.tsx` covers exactly these routes and nothing else; this
 * component is the part of the same decision that a meta tag cannot express.
 *
 * ---------------------------------------------------------------------------
 * What the meta tag cannot do, and why there is JavaScript at all
 * ---------------------------------------------------------------------------
 * `user-scalable=no` is honoured by Chrome and **ignored by Safari on iOS**,
 * deliberately and since iOS 10 - Apple decided a page may not take pinch-zoom
 * away from a reader, and they were right about pages. The only thing Safari
 * still offers is the `gesture*` events, which are WebKit's own and are what a
 * pinch actually fires there. Refusing `gesturestart` is the documented way, and
 * as far as we can tell the only way, to stop it.
 *
 * `touch-action: manipulation` on the root element is the other half: it kills
 * the double-tap-to-zoom without touching scrolling or panning, and unlike
 * `none` it leaves ordinary taps and any nested scroller working. Applied here
 * rather than in the stylesheet so it lifts again the moment somebody navigates
 * out of `/xp` - a class left on `<html>` by a route that has unmounted is the
 * kind of thing that makes an unrelated page mysteriously stop zooming.
 */
export function FixedSurface() {
  useEffect(() => {
    const root = document.documentElement
    const was = root.style.touchAction
    root.style.touchAction = 'manipulation'

    // Passive listeners cannot cancel, and cancelling is the entire point.
    // Safari makes touch-family listeners passive by default, so saying so is
    // not belt and braces - without it `preventDefault` is a no-op and a
    // console warning.
    const refuse = (event: Event) => event.preventDefault()
    const names = ['gesturestart', 'gesturechange', 'gestureend']
    for (const name of names) {
      document.addEventListener(name, refuse, { passive: false })
    }

    return () => {
      root.style.touchAction = was
      for (const name of names) document.removeEventListener(name, refuse)
    }
  }, [])

  return null
}
