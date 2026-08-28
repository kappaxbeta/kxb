import 'server-only'
import { fingerprintOf, isControlFlow } from '@/domain/observability/fingerprint'
import { createAdminClient } from '@/lib/supabase/admin'

export type ErrorSource = 'server' | 'client' | 'not-found'

export interface IncomingError {
  source: ErrorSource
  message: string
  digest?: string | null
  stack?: string | null
  /** The route file, e.g. `/t/[slug]/lounge`. */
  route?: string | null
  /** The URL path, e.g. `/t/acme/lounge`. */
  path?: string | null
  method?: string | null
  userId?: string | null
  userAgent?: string | null
}

/**
 * How many of one fingerprint may be written in a minute.
 *
 * A crash inside a component that retries is a loop, and a loop with a
 * database write in it is an outage of its own making. Twenty is high enough
 * that a genuine burst still reads as a burst on the page - the group shows the
 * count and the window - and low enough that a runaway boundary cannot fill the
 * table faster than anybody notices.
 */
const PER_MINUTE = 20

/** Long enough to debug from, short enough that no single row is a payload. */
const MESSAGE_LIMIT = 2_000
const STACK_LIMIT = 8_000

/**
 * Write one crash down.
 *
 * Never throws, and that is the whole contract. Every caller is already
 * handling a failure - onRequestError, an error boundary, a 404 page - and an
 * error reporter that can itself fail turns one broken page into a broken
 * page with a broken explanation. A report that cannot be stored is dropped
 * with a line on stdout, which is where it would have been anyway.
 */
export async function recordError(incoming: IncomingError): Promise<void> {
  try {
    // The framework's redirects and 404s arrive here looking like crashes. See
    // isControlFlow(): recording them would bury every real failure under one
    // row per sign-in.
    if (isControlFlow(incoming.digest)) return

    const message = clip(incoming.message, MESSAGE_LIMIT) ?? 'Unknown error'
    const fingerprint = fingerprintOf({ ...incoming, message })

    const admin = createAdminClient()

    if (await isFlooding(admin, fingerprint)) return

    const { error } = await admin.from('error_reports').insert({
      fingerprint,
      digest: incoming.digest ?? null,
      message,
      stack: clip(incoming.stack, STACK_LIMIT),
      source: incoming.source,
      route: incoming.route ?? null,
      path: incoming.path ?? null,
      method: incoming.method ?? null,
      user_id: incoming.userId ?? null,
      user_agent: clip(incoming.userAgent, 500),
    })

    if (error) {
      console.error('[error-reports] could not store a report:', error.message)
    }
  } catch (failure) {
    console.error('[error-reports] reporter itself failed:', failure)
  }
}

/** Has this fingerprint already had its minute's worth? */
async function isFlooding(
  admin: ReturnType<typeof createAdminClient>,
  fingerprint: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString()

  const { count, error } = await admin
    .from('error_reports')
    .select('*', { count: 'exact', head: true })
    .eq('fingerprint', fingerprint)
    .gte('created_at', since)

  // A throttle that cannot read its own counter lets the report through. The
  // failure it is guarding against is a flood; the failure it must never cause
  // is losing the first report of something new.
  if (error) return false

  return (count ?? 0) >= PER_MINUTE
}

/** Trims to a length the table can hold, and keeps "nothing" as null. */
function clip(value: string | null | undefined, limit: number): string | null {
  if (!value) return null
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}
