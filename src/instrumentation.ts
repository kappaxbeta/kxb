import type { Instrumentation } from 'next'
import { countError } from '@/domain/health/counters'

/**
 * Runs once, when the server process starts.
 *
 * The event loop delay histogram is started here rather than the first time
 * somebody opens the health page, because a histogram created on demand has
 * only ever watched the moment it was asked - and that moment is, by
 * definition, one where the loop was free enough to serve a request. It would
 * report a healthy process no matter what the process had been doing.
 *
 * The import is dynamic for the same reason `recordError` below is: this module
 * is loaded before the app's own modules are, and pulling in anything that
 * reaches `@/lib/env` at the top level would drag its throw-on-missing checks
 * into server start-up.
 */
export async function register(): Promise<void> {
  // The proxy runs on its own; only the Node server has an event loop worth
  // watching, and `perf_hooks` does not exist on the other runtimes.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startEventLoopMonitor } = await import('@/domain/health/snapshot')
  startEventLoopMonitor()
}

/**
 * Every server error, written down where somebody can find it.
 *
 * Before this, the only record of a production failure was `docker logs` on
 * whichever of the two replicas happened to serve the request - and the digest
 * Next shows the visitor was printed on one container while the person holding
 * it was talking to the other. This is the hook that closes that gap: it fires
 * for every render, action, route handler and proxy error, with the route and
 * the digest attached, and `recordError` puts it in a table the backoffice
 * reads.
 *
 * The import is dynamic on purpose. This module is loaded during server
 * start-up, before the app's own modules are, and pulling the Supabase admin
 * client in at the top level would drag `@/lib/env` - and its throw-on-missing
 * checks - into that window. Importing it here means the reporter is built the
 * first time something actually breaks.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  /**
   * Counted before the runtime check, and before anything that can fail.
   *
   * The health page divides this by the proxy's request count to get an error
   * rate, so the two have to be counted under the same rule - and the rule is
   * "it happened", not "we managed to write it down". An error thrown on a
   * runtime with no database client, or one whose insert fails because the
   * database is exactly what is broken, is still an error the replica served,
   * and is precisely the one an error rate exists to make visible.
   */
  countError()

  // Anything but Node is the proxy running on a runtime with no service-role
  // client to write with. Those errors still reach stdout; they just cannot be
  // stored from here.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { recordError } = await import('@/domain/observability/record')

  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : null

  await recordError({
    source: 'server',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    digest,
    // The route file rather than the URL - `/t/[slug]/lounge` is the thing that
    // is broken, and `/t/acme/lounge` is one visit to it. Both are stored; the
    // grouping prefers the first.
    route: context.routePath || null,
    path: request.path,
    method: request.method,
    userAgent: headerValue(request.headers['user-agent']),
  })
}

/** Headers arrive as a string or a list of them, depending on the header. */
function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
