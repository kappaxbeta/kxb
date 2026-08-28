'use client'

import { isNetworkError } from '@/app/components/connection'
import { CRASH_ALT, CrashScreen, HomeLink } from '@/app/components/crash-screen'
import pixelMillennium from '@/app/components/fonts/pixel'
import { ConnectionHold } from '@/app/components/hold-screen'
import { ReportCrash } from '@/app/components/report-crash'
import '@/app/globals.css'

/**
 * The last line of defence: the root layout itself threw.
 *
 * This file *replaces* the root layout when it renders, which is why it carries
 * its own `<html>`, `<body>`, stylesheet and font variable - none of the usual
 * chrome exists at this point. `metadata` cannot be exported from an error
 * boundary either, so the tab is titled with React's `<title>`.
 *
 * Rare enough that it is tempting to skip, and exactly the case where skipping
 * costs the most: with no `global-error.tsx`, a root-layout failure in
 * production is an unstyled browser error page with the app's name nowhere on
 * it.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  /* Same rule as the segment boundary in error.tsx: a failed fetch is the
     connection, not the app, so it waits instead of apologising. It reaches
     this far out when the shell itself was the thing in flight. */
  const held = isNetworkError(error)

  return (
    <html lang="en" className={pixelMillennium.variable}>
      <body className="min-h-screen antialiased">
        <title>{held ? 'Waiting for your connection · kxb.team' : 'Something broke · kxb.team'}</title>

        {held ? (
          <ConnectionHold retry={unstable_retry} />
        ) : (
          <>
            <ReportCrash
              source="client"
              message={error.message || 'Root layout failed'}
              digest={error.digest ?? null}
              stack={error.stack ?? null}
            />

            <CrashScreen
              code="500"
              tag="That did not work"
              title="The whole page fell over"
              avatar="penguin-front"
              hue={355}
              digest={error.digest}
              body={
                <>
                  <p>
                    Not just the part you were looking at. The shell around it
                    went too. It has been written down.
                  </p>
                  <p className="mt-3">
                    A reload fixes most of these. If it does not, the front page
                    is served separately and should still be there.
                  </p>
                </>
              }
            >
              <button
                type="button"
                onClick={() => unstable_retry()}
                className={CRASH_ALT}
              >
                Try again
              </button>
              <HomeLink />
            </CrashScreen>
          </>
        )}
      </body>
    </html>
  )
}
