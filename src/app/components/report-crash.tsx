'use client'

import { useEffect, useRef } from 'react'
import { reportBrowserError } from '@/domain/observability/actions'

/**
 * Tells the backoffice that somebody just hit this dead end. Draws nothing.
 *
 * Server errors do not need this: instrumentation.ts already caught those on
 * the way out, with a stack the browser was never given. What this adds is the
 * half the server cannot see - that the boundary actually rendered, on which
 * URL, for whom - joined to the server's row by the digest they share. It is
 * also the only side that knows the URL, since `not-found.tsx` receives no
 * params and cannot ask.
 *
 * ---------------------------------------------------------------------------
 * What this does and does not catch
 * ---------------------------------------------------------------------------
 * Measured, not assumed. A 404 from a *route that rendered* - requireTenant()
 * refusing a non-member, requireFeature() on a flag that is off - hydrates
 * normally and reports. A 404 from a URL that matched no route at all does not:
 * Next serves that one without a client runtime, so no effect here runs. The
 * layout's own Contact button is dead on that page too, which is how it was
 * confirmed rather than guessed.
 *
 * That split is a fair one to live with. The 404s worth chasing are the ones a
 * member hits inside the app - the case this catches - and the ones it misses
 * are typos and scanners probing for `/wp-login.php`, which would be noise in
 * the list rather than signal.
 */
export function ReportCrash({
  source,
  message,
  digest,
  stack,
}: {
  source: 'client' | 'not-found'
  message: string
  digest?: string | null
  stack?: string | null
}) {
  /**
   * One report per dead end, not one per render.
   *
   * Effects run twice in development's strict mode, and an error boundary can
   * re-render for reasons that are not new occurrences. The key is what makes
   * two of these the *same* dead end, so a genuine second crash on another page
   * still gets through.
   */
  const reported = useRef<string | null>(null)

  useEffect(() => {
    /**
     * `window.location`, not `usePathname()`.
     *
     * This component also renders inside `global-error.tsx`, which replaces the
     * root layout when the app shell itself failed - there is no guarantee of a
     * router context that far out, and a crash reporter that crashes leaves a
     * white page where the apology was. The effect runs after navigation, so it
     * reads the same value the hook would have.
     */
    const path = window.location.pathname

    const key = `${source}|${path}|${digest ?? message}`
    if (reported.current === key) return
    reported.current = key

    // Deliberately unawaited and deliberately swallowed. The visitor is already
    // looking at a broken page; a failure to file the paperwork about it is not
    // something to put on the screen as well.
    void reportBrowserError({ source, message, digest, stack, path }).catch(() => {})
  }, [source, message, digest, stack])

  return null
}
