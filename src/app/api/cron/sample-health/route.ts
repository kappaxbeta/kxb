import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Client } from '@/es/store'
import { depsJson, probeDependencies, rollup } from '@/domain/health/probe'
import { readReplicas } from '@/domain/health/replicas'
import { pruneSamples, readDbStats, writeSamples, type SampleInsert } from '@/domain/health/queries'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * One sweep of everything, written down.
 *
 * ---------------------------------------------------------------------------
 * Why a cron job and not a page that records what it renders
 * ---------------------------------------------------------------------------
 * The obvious shortcut is to have /backbitch/health save a sample every time
 * somebody opens it. That produces a history with readings only from the
 * moments an admin was already watching - dense during an incident, empty for
 * the week beforehand - which is exactly backwards, because the value of the
 * history is the part nobody was looking at. A fixed interval also makes the
 * deltas comparable; samples taken whenever a human refreshed are not.
 *
 * ---------------------------------------------------------------------------
 * It samples the replicas, it is not sampled by them
 * ---------------------------------------------------------------------------
 * This route runs on whichever replica the caller reached, and fans out to all
 * of them over the compose network - the same fan-out the page uses. So the
 * schedule needs exactly one caller hitting the public URL, not a timer inside
 * every container, and adding a third replica changes nothing here.
 *
 * ---------------------------------------------------------------------------
 * Scheduling it
 * ---------------------------------------------------------------------------
 * Nothing installs this automatically; like the other two cron routes it wants
 * a line in the host's crontab on the Hetzner box. Five minutes is the interval
 * the retention in `health_prune` is sized for:
 *
 *   *5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *                 https://kxb.team/api/cron/sample-health >/dev/null
 *
 * Until that line exists the page still works - it probes live on every load -
 * and simply has no history to chart, which it says rather than showing an
 * empty graph.
 */
export const dynamic = 'force-dynamic'

/**
 * Fourteen days at a five minute interval across two replicas is roughly eight
 * thousand rows: small enough never to become a thing to think about, long
 * enough to answer "it was fine last week, what changed".
 */
const KEEP_DAYS = 14

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient() as unknown as Client

  /**
   * Everything at once.
   *
   * These are independent measurements of independent machines, and the whole
   * sweep has to fit inside the gap between two runs. Run in sequence, a sweep
   * during an outage would be the sum of every timeout.
   */
  const [replicas, probes, dbStats] = await Promise.all([
    readReplicas(),
    probeDependencies(),
    readDbStats(admin),
  ])

  const deps = depsJson(probes)
  const backend = rollup(probes)

  const samples: SampleInsert[] = replicas.map((replica) => {
    const snapshot = replica.snapshot

    return {
      replica: replica.name,
      /**
       * A replica that did not answer is 'down'; one that answered while its
       * dependencies are failing is 'degraded'.
       *
       * The distinction is the one that decides what you do next. A down
       * replica is something to restart. A degraded one is serving fine and
       * pointing at a different machine, and restarting it makes things worse.
       */
      status: !replica.reachable ? 'down' : backend === 'ok' ? 'ok' : 'degraded',
      rssBytes: snapshot?.rssBytes ?? null,
      heapUsedBytes: snapshot?.heapUsedBytes ?? null,
      heapTotalBytes: snapshot?.heapTotalBytes ?? null,
      uptimeSeconds: snapshot?.uptimeSeconds ?? null,
      eventLoopLagMs: snapshot?.eventLoopLagMs ?? null,
      buildId: snapshot?.buildId ?? null,
      requestsTotal: snapshot?.counters.requests ?? null,
      errorsTotal: snapshot?.counters.errors ?? null,
      diskFreeBytes: snapshot?.disk?.freeBytes ?? null,
      diskTotalBytes: snapshot?.disk?.totalBytes ?? null,
      // The same backend numbers on every replica's row. Denormalised on
      // purpose so a chart of database size needs no join - see the migration.
      dbSizeBytes: dbStats?.sizeBytes ?? null,
      dbConnections: dbStats?.connections ?? null,
      deps,
    }
  })

  await writeSamples(admin, samples)

  /**
   * Pruned on the same schedule as the writes.
   *
   * Keeping retention here rather than in a database cron means there is one
   * thing to install on the box instead of two, and no way to end up with a
   * sampler running against a table nothing is trimming.
   */
  const pruned = await pruneSamples(admin, KEEP_DAYS)

  return Response.json({
    sampled: samples.length,
    replicas: samples.map((sample) => ({ name: sample.replica, status: sample.status })),
    backend,
    pruned,
  })
}
