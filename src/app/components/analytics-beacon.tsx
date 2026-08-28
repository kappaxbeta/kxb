'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { renderedVariant } from '@/app/components/track'

/**
 * One line of client code, mounted once in the root layout.
 *
 * It lives here rather than in a proxy because App Router navigations do not
 * always reach the server - a client-side route change renders from the cache -
 * so a request-level counter would miss most of a session. `usePathname` fires
 * on every navigation, server-rendered or not.
 *
 * The referrer is only sent on the first view of a session: after that
 * `document.referrer` still holds the original external page, and reporting it
 * again would credit the same source once per click. The `?src=` tag on our own
 * posted links rides along on the same terms, and for the same reason.
 */
export function AnalyticsBeacon() {
  const pathname = usePathname()
  const sent = useRef<string | null>(null)
  const first = useRef(true)

  useEffect(() => {
    // React runs effects twice in development's strict mode; without this the
    // local numbers are exactly double, which is a confusing thing to debug in
    // a report whose whole job is to be counted on.
    if (sent.current === pathname) return
    const isFirst = first.current
    sent.current = pathname
    first.current = false

    /**
     * `window.location.search`, not `useSearchParams`.
     *
     * The hook opts every page that mounts this out of static rendering unless
     * it is wrapped in its own Suspense boundary - and this is mounted in the
     * root layout, so that is every page in the app. Reading the URL inside the
     * effect costs nothing and changes nothing: the effect only runs in the
     * browser, where `location` is the same value the hook would have returned.
     */
    const body = JSON.stringify({
      path: pathname,
      referrer: isFirst ? document.referrer || null : null,
      search: isFirst ? window.location.search || null : null,
      /**
       * The A/B arm this render was served, read off the DOM.
       *
       * Read here rather than passed in, because this component is mounted once
       * in the root layout and has no idea which page is under it. The page
       * stamps the attribute; the beacon finds it. Null on every page with no
       * experiment on it, which is most of them.
       */
      variant: renderedVariant(),
    })

    // keepalive, so the hit survives the navigation that triggered it.
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Analytics never breaks the page it measures.
    })
  }, [pathname])

  return null
}
