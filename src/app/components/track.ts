'use client'

import type { PropValue } from '@/domain/analytics/events'

/**
 * Firing one event, from anywhere in the browser.
 *
 * A plain function rather than a hook or a context, because the call site is
 * almost always an `onClick` on a button that has no other reason to be a
 * client component's concern. `track('cta_click', { id: 'hero-demo' })` is the
 * whole API, and it is deliberately not awaited by anybody - see below.
 *
 * ---------------------------------------------------------------------------
 * Never throws, never blocks, never breaks the thing it measures
 * ---------------------------------------------------------------------------
 * The promise is swallowed and the errors with it. A button whose handler is
 * `track(); doTheThing()` must do the thing whether or not the beacon lands,
 * and an analytics failure that surfaces as a broken control is worse than no
 * analytics at all. `keepalive` is what lets the request survive the navigation
 * the click usually causes.
 */

/** Where the page put the arm it rendered, if it is under test. */
const VARIANT_ATTRIBUTE = 'data-variant'

/**
 * The A/B arm this page was rendered in, read off the DOM.
 *
 * The server draws the arm during render and stamps it on an element; the
 * beacon is a separate request that knows nothing about that render, so the
 * only place the two meet is the document itself. Reading it here rather than
 * threading it through every call site means a button deep in a page does not
 * have to know an experiment is running above it.
 *
 * Returns null off a page with no experiment on it, which is most of them.
 */
export function renderedVariant(): string | null {
  if (typeof document === 'undefined') return null
  return document.querySelector(`[${VARIANT_ATTRIBUTE}]`)?.getAttribute(VARIANT_ATTRIBUTE) ?? null
}

export function track(name: string, props?: Record<string, PropValue>): void {
  if (typeof window === 'undefined') return

  const body = JSON.stringify({
    path: window.location.pathname,
    event: name,
    variant: renderedVariant(),
    props: props ?? {},
  })

  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    // So the hit survives the navigation the click is about to cause.
    keepalive: true,
  }).catch(() => {
    // Analytics never breaks the page it measures.
  })
}
