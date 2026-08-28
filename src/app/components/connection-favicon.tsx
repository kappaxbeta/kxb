'use client'

import { useEffect } from 'react'
import { useConnectionLost } from './connection'
import { ALERT, faviconDataUri } from '@/lib/brand'

/**
 * The tab as a status light: the mark's cyan wire turns red when this client
 * cannot reach anybody.
 *
 * The case this is for is somebody who has tabbed away. A room they are still
 * "in" goes quiet whether the connection dropped or the room did, and the
 * banner saying which is on a page they are not looking at. The favicon is the
 * one piece of a page that is still visible from another tab.
 *
 * Renders nothing. Next writes the `<link rel="icon">` tags itself from
 * `src/app/icon.svg`, and there is no metadata API for changing them after the
 * fact, so this reaches for them directly and puts back what it found.
 *
 * The red icon is a data URI, not a route. The whole point is a browser that
 * cannot fetch anything - an `/icon-offline.svg` would be a request that never
 * completes, and the tab would keep its old icon exactly when it should not.
 *
 * Restoring the original `href` rather than generating a cyan one costs nothing
 * and means recovery cannot leave a subtly different icon behind: whatever Next
 * put there, hashed query string and all, is what goes back.
 */
export function ConnectionFavicon() {
  const lost = useConnectionLost()

  useEffect(() => {
    if (!lost) return

    // `rel~=` and not `rel=`: the attribute is a space-separated list, and a
    // plain equality check misses `rel="shortcut icon"`.
    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    )

    const alert = faviconDataUri(ALERT)

    // A page that somehow has no icon link gets one, so the indicator does not
    // silently do nothing on a route Next did not emit tags for.
    if (links.length === 0) {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      link.href = alert
      document.head.appendChild(link)
      return () => link.remove()
    }

    const original = links.map((link) => ({
      link,
      href: link.getAttribute('href'),
      type: link.getAttribute('type'),
      // Chrome picks one icon by size and can keep painting a 32x32 PNG while
      // an SVG sibling changes underneath it. Dropping `sizes` for the duration
      // makes every candidate the same SVG, so whichever it picks is red.
      sizes: link.getAttribute('sizes'),
    }))

    for (const { link } of original) {
      link.setAttribute('type', 'image/svg+xml')
      link.removeAttribute('sizes')
      link.setAttribute('href', alert)
    }

    return () => {
      for (const { link, href, type, sizes } of original) {
        if (href === null) link.removeAttribute('href')
        else link.setAttribute('href', href)
        if (type === null) link.removeAttribute('type')
        else link.setAttribute('type', type)
        if (sizes === null) link.removeAttribute('sizes')
        else link.setAttribute('sizes', sizes)
      }
    }
  }, [lost])

  return null
}
