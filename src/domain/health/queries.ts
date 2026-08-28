import 'server-only'
import type { Client } from '@/es/store'
import type { ProbeStatus } from '@/domain/health/probe'
import type { RealtimeTenantLimits } from '@/domain/health/realtime-limits'

/**
 * The database's own account of itself, and the history of everything else.
 *
 * Takes an admin client for the same reason `listErrorGroups` does: these
 * functions are reachable by backoffice admins only, and the caller is expected
 * to have passed `requireBackofficeAdmin()` first. That guard is the gate, not
 * anything in this file.
 */

export interface TableStat {
  name: string
  bytes: number
  /** Planner estimate, not a count. See the migration. */
  rows: number
}

export interface DbStats {
  sizeBytes: number
  connections: number
  maxConnections: number
  tables: TableStat[]
}

export interface HealthSample {
  sampledAt: string
  replica: string
  status: string
  rssBytes: number | null
  heapUsedBytes: number | null
  eventLoopLagMs: number | null
  uptimeSeconds: number | null
  buildId: string | null
  dbSizeBytes: number | null
  dbConnections: number | null
  diskFreeBytes: number | null
  diskTotalBytes: number | null
  /** Null on the first sample of a replica, where there is nothing to subtract. */
  requestsDelta: number | null
  errorsDelta: number | null
  deps: Record<string, { status: ProbeStatus; ms: number }>
}

/**
 * Size, connections and the biggest tables.
 *
 * Returns null rather than throwing when the call fails. This is the one query
 * on the health page whose subject is also its transport: if Postgres is
 * unreachable, the probe beside it already says so in the language of an
 * outage, and a page that throws a 500 instead of rendering that probe is a
 * monitoring page that goes down whenever there is something to monitor.
 */
export async function readDbStats(admin: Client): Promise<DbStats | null> {
  const { data, error } = await admin.rpc('health_db_stats')
  if (error || !data?.[0]) return null

  const row = data[0]
  if(row && row?.tables) {
    row.tables = []
  }
  return {
    sizeBytes: Number(row.db_size_bytes ?? 0),
    connections: Number(row.connections ?? 0),
    maxConnections: Number(row.max_conns ?? 0),
    tables: ((row.tables ?? []) as unknown as TableStat[]).map((table) => ({
      name: String(table.name),
      bytes: Number(table.bytes ?? 0),
      rows: Number(table.rows ?? 0),
    })),
  }
}

/**
 * The recorded window, oldest first.
 *
 * Empty rather than throwing, on the same reasoning as `readDbStats`: a health
 * page with no chart is worth more than no health page. An empty array is also
 * the honest answer before the sampler has ever run, and the UI says which of
 * the two it is by looking at whether anything else on the page worked.
 */
export async function readHealthSeries(
  admin: Client,
  hours = 24,
): Promise<HealthSample[]> {
  const { data, error } = await admin.rpc('health_series', { p_hours: hours })
  if (error || !data) return []

  return data.map((row) => ({
    sampledAt: row.sampled_at,
    replica: row.replica,
    status: row.status,
    rssBytes: nullableNumber(row.rss_bytes),
    heapUsedBytes: nullableNumber(row.heap_used_bytes),
    eventLoopLagMs: nullableNumber(row.event_loop_lag_ms),
    uptimeSeconds: nullableNumber(row.uptime_seconds),
    buildId: row.build_id,
    dbSizeBytes: nullableNumber(row.db_size_bytes),
    dbConnections: nullableNumber(row.db_connections),
    diskFreeBytes: nullableNumber(row.disk_free_bytes),
    diskTotalBytes: nullableNumber(row.disk_total_bytes),
    requestsDelta: nullableNumber(row.requests_delta),
    errorsDelta: nullableNumber(row.errors_delta),
    deps: (row.deps ?? {}) as HealthSample['deps'],
  }))
}

export interface SweepRun {
  ranAt: string
  pending: number
  swept: number
  applied: number
  /** Still behind when the deadline arrived. The number this table exists for. */
  remaining: number
  failed: number
  ms: number
  spaces: number
  projections: number
  errors: string[]
}

/**
 * Recent runs of the projection sweep, newest first.
 *
 * Empty rather than throwing, on the same reasoning as `readDbStats`: a health
 * page with one missing chart is worth more than no health page. Empty is also
 * the honest answer before the sweep has ever run, and before the migration has
 * been applied - the card says which by looking at whether the cron is expected
 * to have run by now.
 */
export async function readSweepHistory(admin: Client, hours = 24): Promise<SweepRun[]> {
  const { data, error } = await admin.rpc('projection_sweep_history', { p_hours: hours })
  if (error || !data) return []

  return data.map((row) => ({
    ranAt: row.ran_at,
    pending: Number(row.pending ?? 0),
    swept: Number(row.swept ?? 0),
    applied: Number(row.applied ?? 0),
    remaining: Number(row.remaining ?? 0),
    failed: Number(row.failed ?? 0),
    ms: Number(row.ms ?? 0),
    spaces: Number(row.spaces ?? 0),
    projections: Number(row.projections ?? 0),
    errors: Array.isArray(row.errors) ? (row.errors as string[]) : [],
  }))
}

/**
 * The Realtime ceilings as the box currently has them.
 *
 * **Null means unknown, and unknown is not fine.** Three different states come
 * back as null here - the RPC missing because the migration has not been
 * applied, the `_realtime` schema absent, and the tenant row deleted without
 * being recreated - and the page must not render any of them as healthy. The
 * last one in particular is the worst state available: no tenant row is
 * `TenantNotFound`, where Realtime refuses connections outright.
 *
 * An empty array would have been the wrong shape for exactly that reason. It
 * reads as "checked, nothing wrong" at a glance, which is the opposite of the
 * truth.
 */
export async function readRealtimeLimits(
  admin: Client,
): Promise<RealtimeTenantLimits[] | null> {
  const { data, error } = await admin.rpc('health_realtime_limits')
  if (error || !data) return null

  return data.map((row) => ({
    externalId: String(row.external_id),
    maxEventsPerSecond: Number(row.max_events_per_second ?? 0),
    maxConcurrentUsers: Number(row.max_concurrent_users ?? 0),
    maxBytesPerSecond: Number(row.max_bytes_per_second ?? 0),
    maxJoinsPerSecond: Number(row.max_joins_per_second ?? 0),
    maxChannelsPerClient: Number(row.max_channels_per_client ?? 0),
    updatedAt: row.updated_at ?? null,
  }))
}

/**
 * Zero and "not measured" are different readings and must not collapse.
 *
 * A down replica writes nulls, and `Number(null)` is 0 - which would draw a
 * replica using no memory rather than a gap where a replica used to be.
 */
function nullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** One reading of one replica, as the sampler writes it. */
export interface SampleInsert {
  replica: string
  status: 'ok' | 'degraded' | 'down'
  rssBytes: number | null
  heapUsedBytes: number | null
  heapTotalBytes: number | null
  uptimeSeconds: number | null
  eventLoopLagMs: number | null
  buildId: string | null
  requestsTotal: number | null
  errorsTotal: number | null
  diskFreeBytes: number | null
  diskTotalBytes: number | null
  dbSizeBytes: number | null
  dbConnections: number | null
  deps: Record<string, { status: ProbeStatus; ms: number }>
}

/**
 * Write one sweep.
 *
 * All replicas in a single insert so they share a transaction and therefore a
 * consistent view of the sweep - two inserts could interleave with a prune and
 * leave a window half-written, which shows up on a chart as one replica
 * mysteriously vanishing for a single tick.
 */
export async function writeSamples(
  admin: Client,
  samples: SampleInsert[],
): Promise<void> {
  if (samples.length === 0) return

  const { error } = await admin.from('health_samples').insert(
    samples.map((sample) => ({
      replica: sample.replica,
      status: sample.status,
      rss_bytes: sample.rssBytes,
      heap_used_bytes: sample.heapUsedBytes,
      heap_total_bytes: sample.heapTotalBytes,
      uptime_seconds: sample.uptimeSeconds,
      event_loop_lag_ms: sample.eventLoopLagMs,
      build_id: sample.buildId,
      requests_total: sample.requestsTotal,
      errors_total: sample.errorsTotal,
      disk_free_bytes: sample.diskFreeBytes,
      disk_total_bytes: sample.diskTotalBytes,
      db_size_bytes: sample.dbSizeBytes,
      db_connections: sample.dbConnections,
      deps: sample.deps,
    })),
  )

  if (error) throw new Error(`Failed to write health samples: ${error.message}`)
}

/** Retention. Returns how many rows went. */
export async function pruneSamples(admin: Client, keepDays = 14): Promise<number> {
  const { data, error } = await admin.rpc('health_prune', { p_keep_days: keepDays })
  if (error) return 0
  return Number(data ?? 0)
}
