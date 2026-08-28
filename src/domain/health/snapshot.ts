import 'server-only'
import { hostname } from 'node:os'
import { readFile, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { readCounters, type Counters } from '@/domain/health/counters'

/**
 * What one replica can say about itself.
 *
 * Everything here is read from the running process, so it describes *this*
 * container and no other. That is the whole reason `replicas.ts` exists: the
 * app runs two of these behind Caddy, and a health page that rendered on
 * whichever one caught the request would report half the truth while looking
 * like it reported all of it.
 */

export interface DiskUsage {
  freeBytes: number
  totalBytes: number
  path: string
}

export interface ProcessSnapshot {
  /** Container hostname. Docker sets it to the short container id. */
  replica: string
  /** Next's build identifier, for detecting two replicas on different builds. */
  buildId: string | null
  nodeVersion: string
  /** Seconds since this process started. */
  uptimeSeconds: number
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  /**
   * Event loop delay in milliseconds, mean and p99 since process start.
   *
   * The saturation signal that matters here: Node is single-threaded and the
   * box has two cores, so a CPU-bound render leaves memory looking healthy
   * while every queued request waits behind it. Mean and p99 together because
   * a mean of 2ms hides a p99 of 800ms, and the p99 is the one somebody felt.
   */
  eventLoopLagMs: number | null
  eventLoopLagP99Ms: number | null
  counters: Counters
  disk: DiskUsage | null
}

/**
 * The event loop delay histogram, started at boot and left running.
 *
 * `monitorEventLoopDelay` is a libuv-level timer; enabling it costs essentially
 * nothing and, unlike scheduling a `setTimeout(0)` when somebody opens the
 * page, it has been watching the whole time. Measuring on demand would sample
 * the one moment the loop was free enough to serve the health request - the
 * observation would systematically miss the thing it is looking for.
 *
 * `startEventLoopMonitor()` is called from instrumentation.ts, which runs once
 * per server start. That matters more than it looks: creating the histogram
 * lazily on first read gives a mean of NaN and a p99 of 0 - the metric reads as
 * a perfectly idle process precisely because nothing had been measuring - and
 * every reading afterwards only covers the time since somebody first opened the
 * page. Starting at boot is what makes "lag over the last hour" true.
 */
/**
 * Held on globalThis, for the reason counters.ts explains at length.
 *
 * A module-level `let` here does not work, and fails in the most misleading way
 * possible. Next gives instrumentation.ts and the route handlers separate
 * instances of this module, so `register()` would enable a histogram that the
 * health endpoint never sees; the endpoint would then create its own, read it
 * in the same tick, and find zero samples - reporting a mean of NaN and a p99
 * of exactly 0. That is indistinguishable on the page from a perfectly idle
 * event loop, which is the one answer this metric must never give by accident.
 */
type Histogram = ReturnType<typeof monitorEventLoopDelay>
const LOOP_KEY = Symbol.for('unkown.t/health-loop-delay')
type GlobalWithHistogram = typeof globalThis & { [LOOP_KEY]?: Histogram }

function histogram(): Histogram | null {
  return (globalThis as GlobalWithHistogram)[LOOP_KEY] ?? null
}

export function startEventLoopMonitor(): void {
  const global = globalThis as GlobalWithHistogram
  if (global[LOOP_KEY]) return

  const created = monitorEventLoopDelay({ resolution: 20 })
  created.enable()
  global[LOOP_KEY] = created
}

/**
 * Nanoseconds to milliseconds, or null when there is nothing to convert.
 *
 * The histogram reports `NaN` for the mean until it has collected a sample, and
 * `NaN` serialises to `null` through JSON anyway - so it is made explicit here
 * rather than left to leak out as a number-typed field that is sometimes not a
 * number. Null means "not measured yet", which the UI renders as a dash rather
 * than as a healthy zero.
 */
function ms(nanos: number): number | null {
  if (!Number.isFinite(nanos)) return null
  return Math.round((nanos / 1e6) * 100) / 100
}

/**
 * Which build this process is serving.
 *
 * Read from `.next/BUILD_ID` rather than an environment variable because Next
 * does not publish the id as one, and the file is what the standalone server
 * itself reads. `distDir` is overridable (see next.config.ts), so the path
 * follows the same variable rather than hardcoding `.next`.
 *
 * This is the number that catches the failure mode this deployment has actually
 * hit: two replicas built independently get different ids, Caddy serves the
 * HTML from one and the chunks from the other, and the browser throws
 * ChunkLoadError while every health check passes. Cached after the first read -
 * a process cannot change the build it is running.
 *
 * Null in dev, where there is no build to have an id, and null is rendered as
 * "dev" rather than as a mismatch.
 */
let buildId: string | null | undefined

async function readBuildId(): Promise<string | null> {
  if (buildId !== undefined) return buildId
  try {
    const dist = process.env.NEXT_DIST_DIR || '.next'
    buildId = (await readFile(join(process.cwd(), dist, 'BUILD_ID'), 'utf8')).trim()
  } catch {
    buildId = null
  }
  return buildId
}

/**
 * Free space on the uploads volume.
 *
 * That directory is a bind mount from the host, so it fills up entirely
 * independently of the container's own filesystem - and it is the one place
 * this app writes unbounded data. Null when the path does not exist, which is
 * the normal case in dev and not worth an error.
 */
export async function diskUsage(): Promise<DiskUsage | null> {
  const path = process.env.UPLOAD_DIR || './uploads'
  try {
    const stats = await statfs(path)
    // bavail, not bfree: the latter counts blocks reserved for root, which this
    // process cannot use and must not be told it can.
    return {
      path,
      freeBytes: Number(stats.bavail) * Number(stats.bsize),
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
    }
  } catch {
    return null
  }
}

export async function processSnapshot(): Promise<ProcessSnapshot> {
  const memory = process.memoryUsage()
  // Ordinarily already running from instrumentation.ts. Called here too so a
  // snapshot taken in a context that never ran `register` - a script, a test -
  // still returns a reading rather than nulls forever.
  startEventLoopMonitor()
  const lag = histogram()
  const [build, disk] = await Promise.all([readBuildId(), diskUsage()])

  return {
    replica: hostname(),
    buildId: build,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    eventLoopLagMs: lag?.mean === undefined ? null : ms(lag.mean),
    /**
     * Only meaningful once there is something in the histogram.
     *
     * `percentile()` answers 0 for an empty histogram rather than NaN, so
     * unlike the mean it cannot report its own emptiness - and "p99 of 0ms"
     * reads as a flawless process. The count is checked so an empty histogram
     * says "not measured" instead.
     */
    eventLoopLagP99Ms:
      lag && lag.count > 0 ? ms(lag.percentile(99)) : null,
    counters: readCounters(),
    disk,
  }
}
