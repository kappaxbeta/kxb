'use client'

import { isNetworkError } from '@/app/components/connection'
import { CRASH_ALT, CrashScreen, HomeLink } from '@/app/components/crash-screen'
import { ConnectionHold } from '@/app/components/hold-screen'
import { ReportCrash } from '@/app/components/report-crash'

/**
 * Something threw.
 *
 * Before this file existed the answer was Next's own error page, which on a
 * production build is a bare "Application error: a server-side exception has
 * occurred" on a white background - no way home, nothing to quote to support,
 * and no sign it belonged to this app at all.
 *
 * The message is not shown, and that is the framework's rule rather than a
 * choice: an error from a Server Component reaches the browser with its text
 * stripped, precisely so a database error cannot leak its way onto a stranger's
 * screen. The digest is what survives, and it is enough - it is the same string
 * in the backoffice list and in the container logs.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  /**
   * A dropped connection is not a crash, and must not be dressed as one.
   *
   * No `<ReportCrash>` on this branch either, and that is the point rather than
   * an omission: the backoffice list is meant to answer "what is broken", and a
   * row saying `TypeError: network error` on somebody's train journey is an
   * answer to a question nobody asked. It buried the real failures under it.
   */
  if (isNetworkError(error)) {
    return <ConnectionHold retry={unstable_retry} />
  }

  return (
    <>
      <ReportCrash
        source="client"
        message={error.message || 'Unknown client error'}
        digest={error.digest ?? null}
        stack={error.stack ?? null}
      />

      <CrashScreen
        code="500"
        tag="That did not work"
        title="Something broke on our side"
        avatar="penguin-front"
        hue={355}
        digest={error.digest}
        body={
          <>
            <p>
              This one is ours, not yours, and it has already been written down.
              Nothing needs reporting.
            </p>
            <p className="mt-3">
              Quite a few of these are momentary. Trying again is worth one
              click before going back.
            </p>
          </>
        }
      >
        {/* `unstable_retry`, not `reset`. reset only clears the boundary's own
            state and re-renders what it already has, which cannot recover from
            a Server Component that failed; retry re-fetches the segment, which
            is the thing that has to happen for a transient failure to clear. */}
        <button type="button" onClick={() => unstable_retry()} className={CRASH_ALT}>
          Try again
        </button>
        <HomeLink />
      </CrashScreen>
    </>
  )
}
