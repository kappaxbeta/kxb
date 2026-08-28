import type { NextRequest } from 'next/server'
import { resolveFeatures } from '@/domain/flags/queries'
import { ALL_PROJECTIONS } from '@/domain/projections'
import type { Client } from '@/es/store'
import { checkpointKey, pendingWork, sweep, type TenantHead } from '@/es/worker'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * The projection sweep.
 *
 * Reads every space's log as the service role and brings the read models up to
 * the head, on its own cursor, behind the inline projections that run in each
 * request. See `src/es/worker.ts` for why there are two projectors and why that
 * is safe.
 *
 * Runs as the service role behind a shared secret, on the same terms as the
 * other four jobs: there is no user here, and it writes every space's read
 * models.
 *
 * ---------------------------------------------------------------------------
 * Schedule
 * ---------------------------------------------------------------------------
 * Every minute is the intent - this is a repair pass, not the freshness path,
 * and the inline projections mean nobody is waiting on it. Add to the crontab
 * on the app host only (see docs/architecture/scaling.md §3.4 - cron is a
 * property of one designated host, never of the image):
 *
 *   * * * * * curl -fsS --max-time 50 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/project >/dev/null 2>&1 # kxb-cron
 *
 * `--max-time 50` under a minute, and DEADLINE_MS under that, so two runs can
 * never overlap. Overlapping runs would be two projectors on one cursor, which
 * is the thing this exists to stop.
 */

export const dynamic = 'force-dynamic'

/**
 * Events per batch.
 *
 * 200 is small on purpose. The checkpoint is written per batch, so this is also
 * how much work a crash repeats - and `runProjection` loops until the tenant is
 * caught up, so a small batch costs an extra round trip rather than leaving
 * anything undone.
 */
const BATCH_SIZE = 200

/**
 * Stop starting new work after this long.
 *
 * Comfortably under the curl's `--max-time 50` and under the minute between
 * runs. Whatever is not swept this minute is swept next minute, and because the
 * work list is ordered worst-first, the backlog that matters is always what
 * gets the time.
 */
const DEADLINE_MS = 40_000

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  /**
   * A deployment can refuse to be a sweeper.
   *
   * `compose.dev.yaml` sets this, and the reason is worth stating where the
   * code is rather than only where the config is: **develop runs against
   * production's database**, by way of `env_file: /opt/app/.env`. It therefore
   * also holds production's CRON_SECRET, so this route on dev.kxb.team
   * authenticates perfectly and drains production's projections - two sweepers
   * on the one cursor this whole design exists to keep single.
   *
   * 200 rather than 403, deliberately: a deployment that is not supposed to
   * sweep and did not sweep has behaved correctly, and a cron that logged an
   * error every minute for doing the right thing would train somebody to
   * ignore it.
   */
  if ((process.env.PROJECTION_SWEEP ?? '').toLowerCase() === 'off') {
    return Response.json({ skipped: 'PROJECTION_SWEEP=off' })
  }

  const admin = createAdminClient()
  const startedAt = Date.now()

  /**
   * The operator's switch, which is a different thing from the one above.
   *
   * `PROJECTION_SWEEP=off` is a property of a *deployment* - develop must never
   * sweep because it shares production's database, and no page should be able
   * to change that. This flag is a property of the *installation*, and exists so
   * that stopping the sweep during an incident is a click rather than an ssh
   * session and `crontab -e` on a box somebody has to remember the name of.
   *
   * Checked after the secret and before any work: a run that is switched off
   * should cost one query, not a full scan of every space's log head.
   *
   * `fallback: true` in the flag definition, so a resolver outage leaves the
   * sweep running. See the comment there for why that is the opposite direction
   * to every other flag in the file.
   */
  const features = await resolveFeatures(admin as unknown as Client, null)
  if (!features.projection_sweep) {
    return Response.json({ skipped: 'projection_sweep flag is off' })
  }

  // ---------------------------------------------------------------------------
  // Where every space's log currently ends
  // ---------------------------------------------------------------------------
  // `tenant_event_sequences` is exactly this and nothing else - one row per
  // space holding the last number handed out - so the head is a table scan of a
  // table with one row per space rather than a max() over the event log.
  const heads: TenantHead[] = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('tenant_event_sequences')
      .select('tenant_id, last_seq')
      .order('tenant_id', { ascending: true })
      .range(from, from + 999)

    if (error) {
      return new Response(`Failed to read log heads: ${error.message}`, { status: 500 })
    }

    const batch = data ?? []
    for (const row of batch) {
      heads.push({ tenantId: row.tenant_id, lastSeq: Number(row.last_seq ?? 0) })
    }
    if (batch.length < 1000) break
  }

  // ---------------------------------------------------------------------------
  // Where the sweep got to last time
  // ---------------------------------------------------------------------------
  // Every checkpoint, not only the worker's. Filtering to `@worker` here would
  // be one more place that has to know the naming convention; `pendingWork`
  // already looks up the key it wants and ignores the rest.
  const checkpoints = new Map<string, number>()

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('projection_checkpoints')
      .select('projection, tenant_id, last_seq')
      .order('projection', { ascending: true })
      .range(from, from + 999)

    if (error) {
      return new Response(`Failed to read checkpoints: ${error.message}`, { status: 500 })
    }

    const batch = data ?? []
    for (const row of batch) {
      checkpoints.set(checkpointKey(row.projection, row.tenant_id), Number(row.last_seq ?? 0))
    }
    if (batch.length < 1000) break
  }

  // ---------------------------------------------------------------------------
  // Drain, worst backlog first
  // ---------------------------------------------------------------------------
  const work = pendingWork(heads, checkpoints, ALL_PROJECTIONS)

  const result = await sweep(admin as unknown as Client, work, {
    batchSize: BATCH_SIZE,
    deadlineAt: startedAt + DEADLINE_MS,
  })

  const remaining = result.pending - result.swept
  const ms = Date.now() - startedAt

  /**
   * Leave a trace, because nobody reads the reply.
   *
   * The crontab sends this response to /dev/null - it has to, there is no one
   * there - so without this row the one number that says the sweep has stopped
   * keeping up is computed every minute and seen by no one.
   *
   * Failure here is swallowed on purpose, and the ordering says why: the sweep
   * has already done its work by this point. Losing a monitoring row is a gap in
   * a chart; throwing would turn a successful run into a 500 that the cron
   * silently retries a minute later, which is monitoring making the thing it
   * monitors worse.
   */
  const { error: recordError } = await admin.rpc('record_projection_sweep', {
    p_pending: result.pending,
    p_swept: result.swept,
    p_applied: result.applied,
    p_remaining: remaining,
    p_failed: result.failed,
    p_ms: ms,
    p_spaces: heads.length,
    p_projections: ALL_PROJECTIONS.length,
    p_errors: result.errors.length > 0 ? result.errors : null,
  })

  if (recordError) console.error('projection sweep not recorded', recordError.message)

  return Response.json({
    ...result,
    spaces: heads.length,
    projections: ALL_PROJECTIONS.length,
    /**
     * Pairs still behind when the deadline arrived. Zero is the steady state;
     * a number that climbs run after run means the sweep no longer keeps up and
     * wants either a shorter interval or its own process.
     *
     * The same values that were recorded, not recomputed - so the row and the
     * reply can never disagree about the run they both describe.
     */
    remaining,
    ms,
  })
}
