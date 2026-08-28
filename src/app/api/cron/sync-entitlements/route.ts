import type { NextRequest } from 'next/server'
import { syncUserEntitlement } from '@/domain/billing/entitlement'
import { selectForSync, type EntitlementRow } from '@/domain/billing/reconcile'
import type { Client } from '@/es/store'
import { mapWithConcurrency } from '@/lib/concurrency'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * Daily entitlement sync.
 *
 * Subscriptions expire without anyone visiting the site. A renewal that fails
 * at 3am is a fact about the account whether or not its owner logs in, so
 * something has to go and ask - webhooks alone are not enough, because a missed
 * or mis-signed delivery leaves the mirror permanently wrong with no way to
 * notice. This job is the reconciliation pass that makes webhook delivery a
 * performance optimisation rather than a correctness requirement.
 *
 * Runs as the service role, which is why it is behind a shared secret rather
 * than a session: there is no user here, and the endpoint can read and write
 * every account's entitlement.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a plain loop over every user
 * ---------------------------------------------------------------------------
 * It was, and it does not survive growth. Two Stripe requests per account at a
 * couple of hundred milliseconds each, one after another, is half an hour at ten
 * thousand accounts - past the `--max-time 300` on the crontab line, so the run
 * is killed mid-list every night with no error anywhere. See the module comment
 * on `reconcile.ts` for the banding that replaced it.
 *
 * Three bounds now, and each is load-bearing:
 *
 *   - **`MAX_SYNCS`** caps the work list. It eats into the least urgent band.
 *   - **`CONCURRENCY`** puts several Stripe calls in flight without becoming a
 *     thundering herd against somebody else's rate limit.
 *   - **`DEADLINE_MS`** stops *starting* new work before the curl gives up, so a
 *     slow Stripe degrades into a short run that reports itself rather than a
 *     long run that gets killed. This is the one that actually guarantees the
 *     job always returns, because the other two bound the count and not the
 *     clock.
 */

export const dynamic = 'force-dynamic'

/**
 * How many accounts one run is willing to reconcile.
 *
 * Sized against the deadline rather than against the user table: at
 * `CONCURRENCY` in flight and roughly 400 ms of Stripe per account, two
 * thousand is a little over two minutes, which fits inside `DEADLINE_MS` with
 * room for a bad night. Bands 0 and 1 are far smaller than this in any
 * realistic account mix, so in practice the cap only ever trims band 2.
 */
const MAX_SYNCS = 2000

/**
 * Stripe calls in flight at once.
 *
 * Five, not fifty. `fetchStripeEntitlement` costs about two requests per
 * account, so this sits near 50 requests/second against Stripe's 100/second
 * read limit - fast enough that the cap above is reachable, slow enough that a
 * retry storm never starts. Raising it trades the whole job's reliability for
 * minutes it does not need.
 */
const CONCURRENCY = 5

/**
 * Stop starting new work after this long.
 *
 * Under the `--max-time 300` on the cron line, deliberately: a job that returns
 * a short honest report at four minutes is worth more than one killed at five
 * with nothing written down. In-flight work is allowed to finish, so the real
 * ceiling is this plus one Stripe round trip.
 */
const DEADLINE_MS = 240_000

/**
 * How long a non-paying account's answer stays good enough.
 *
 * Under 24h so a daily cron never skips a band-2 account for being "fresh" from
 * yesterday's run - at exactly 24h, clock drift decides, and half the tail
 * silently stops rotating.
 */
const STALE_AFTER_MS = 20 * 60 * 60 * 1000

/** Auth admin page size. This walk is cheap; it is Stripe that is not. */
const PER_PAGE = 200

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()
  const startedAt = Date.now()

  // ---------------------------------------------------------------------------
  // 1. Who exists, and what we last knew about them
  // ---------------------------------------------------------------------------
  // Both of these are cheap - a paged admin call and one table scan - and both
  // are needed in full before anything can be prioritised. The expensive part is
  // downstream.
  const users: { id: string; email?: string }[] = []

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) {
      return new Response(`Failed to list users: ${error.message}`, { status: 500 })
    }

    const batch = data?.users ?? []
    if (batch.length === 0) break

    for (const user of batch) users.push({ id: user.id, email: user.email })
    if (batch.length < PER_PAGE) break
  }

  const rows: EntitlementRow[] = []

  // PostgREST caps a response, so this pages too. Selecting three columns rather
  // than the row: the decision needs the status and the clock, and nothing else.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('user_entitlements')
      .select('user_id, status, synced_at')
      .order('user_id', { ascending: true })
      .range(from, from + 999)

    if (error) {
      return new Response(`Failed to read entitlements: ${error.message}`, { status: 500 })
    }

    const batch = data ?? []
    rows.push(...(batch as EntitlementRow[]))
    if (batch.length < 1000) break
  }

  // ---------------------------------------------------------------------------
  // 2. Decide who is worth a Stripe request tonight
  // ---------------------------------------------------------------------------
  const candidates = selectForSync(users, rows, {
    now: startedAt,
    staleAfterMs: STALE_AFTER_MS,
    max: MAX_SYNCS,
  })

  // ---------------------------------------------------------------------------
  // 3. Ask Stripe, a few at a time
  // ---------------------------------------------------------------------------
  let skipped = 0

  const results = await mapWithConcurrency(candidates, CONCURRENCY, async (candidate) => {
    // Checked per item rather than once up front: the point is to stop the run
    // growing, and only a check inside the loop can do that.
    if (Date.now() - startedAt > DEADLINE_MS) {
      skipped++
      return false
    }

    await syncUserEntitlement(admin as unknown as Client, candidate.userId, candidate.email)
    return true
  })

  // One person's broken Stripe record must not stop the other 999 from being
  // reconciled - the same rule as before, now enforced by the helper rather
  // than by a try/catch in the loop.
  const synced = results.filter((r) => r.ok && r.value === true).length
  const failed = results.filter((r) => !r.ok).length
  const errors = results
    .flatMap((r) => (r.ok ? [] : [r.error.message]))
    .slice(0, 5)

  return Response.json({
    synced,
    failed,
    // Selected but not attempted, because the deadline arrived. A non-zero value
    // here every night means the run no longer fits and the cap or the schedule
    // needs looking at - which is precisely what the old version could not say.
    skipped,
    users: users.length,
    candidates: candidates.length,
    /** How the work list broke down, so a run can be read at a glance. */
    bands: {
      neverSynced: candidates.filter((c) => c.band === 0).length,
      atRisk: candidates.filter((c) => c.band === 1).length,
      rotating: candidates.filter((c) => c.band === 2).length,
    },
    ms: Date.now() - startedAt,
    errors,
  })
}
