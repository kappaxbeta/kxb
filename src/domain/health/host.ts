import 'server-only'
import type { Client } from '@/es/store'

/**
 * The machines themselves.
 *
 * Separate from queries.ts because the subject is different: that file is about
 * the app's own processes and the database's contents, both of which the app
 * can observe directly. This one is about two Linux boxes it cannot see at all,
 * and everything here is a reading somebody else took and sent in.
 */

/** The names the UI uses for the two machines. */
export const HOST_LABELS: Record<string, string> = {
  app: 'App server (Hetzner)',
  db: 'Database server (Strato)',
}

export interface HostSampleInput {
  host: 'app' | 'db'
  hostname?: string
  cpuCores: number
  load1: number
  load5: number
  load15: number
  cpuTotal: number
  cpuIdle: number
  memTotalBytes: number
  memAvailableBytes: number
  swapTotalBytes: number
  swapFreeBytes: number
  diskTotalBytes: number
  diskFreeBytes: number
  uptimeSeconds: number
}

export interface HostSample {
  sampledAt: string
  host: string
  hostname: string | null
  cpuCores: number | null
  load1: number | null
  load5: number | null
  load15: number | null
  /** Fraction busy across the interval, or null on a first sample or reboot. */
  cpuBusy: number | null
  memTotalBytes: number | null
  memAvailableBytes: number | null
  swapTotalBytes: number | null
  swapFreeBytes: number | null
  diskTotalBytes: number | null
  diskFreeBytes: number | null
  uptimeSeconds: number | null
}

export async function writeHostSample(
  admin: Client,
  sample: HostSampleInput,
): Promise<void> {
  const { error } = await admin.from('host_samples').insert({
    host: sample.host,
    hostname: sample.hostname ?? null,
    cpu_cores: sample.cpuCores,
    load1: sample.load1,
    load5: sample.load5,
    load15: sample.load15,
    cpu_total: sample.cpuTotal,
    cpu_idle: sample.cpuIdle,
    mem_total_bytes: sample.memTotalBytes,
    mem_available_bytes: sample.memAvailableBytes,
    swap_total_bytes: sample.swapTotalBytes,
    swap_free_bytes: sample.swapFreeBytes,
    disk_total_bytes: sample.diskTotalBytes,
    disk_free_bytes: sample.diskFreeBytes,
    uptime_seconds: sample.uptimeSeconds,
  })

  if (error) throw new Error(`Failed to write host sample: ${error.message}`)
}

/**
 * The window, oldest first, with CPU already turned into a percentage.
 *
 * Empty rather than throwing, matching `readHealthSeries`: a health page
 * missing one panel beats a health page that 500s, and this panel is missing
 * for a perfectly ordinary reason - nobody has installed the agent yet.
 */
export async function readHostSeries(
  admin: Client,
  hours = 24,
): Promise<HostSample[]> {
  const { data, error } = await admin.rpc('host_series', { p_hours: hours })
  if (error || !data) return []

  return data.map((row) => ({
    sampledAt: row.sampled_at,
    host: row.host,
    hostname: row.hostname,
    cpuCores: numberOrNull(row.cpu_cores),
    load1: numberOrNull(row.load1),
    load5: numberOrNull(row.load5),
    load15: numberOrNull(row.load15),
    cpuBusy: numberOrNull(row.cpu_busy),
    memTotalBytes: numberOrNull(row.mem_total_bytes),
    memAvailableBytes: numberOrNull(row.mem_available_bytes),
    swapTotalBytes: numberOrNull(row.swap_total_bytes),
    swapFreeBytes: numberOrNull(row.swap_free_bytes),
    diskTotalBytes: numberOrNull(row.disk_total_bytes),
    diskFreeBytes: numberOrNull(row.disk_free_bytes),
    uptimeSeconds: numberOrNull(row.uptime_seconds),
  }))
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function pruneHostSamples(admin: Client, keepDays = 14): Promise<number> {
  const { data, error } = await admin.rpc('host_prune', { p_keep_days: keepDays })
  if (error) return 0
  return Number(data ?? 0)
}

/**
 * The most recent reading for each host.
 *
 * The live page wants "what is the database box doing right now", and the
 * series is ordered oldest-first for charting, so the last entry per host is
 * the current one.
 */
export function latestPerHost(series: HostSample[]): Map<string, HostSample> {
  const latest = new Map<string, HostSample>()
  for (const sample of series) latest.set(sample.host, sample)
  return latest
}

/**
 * How hard a box is working, relative to how many cores it has.
 *
 * Load average is only interpretable against the core count: 4.0 is a busy
 * two-core box and a half-idle eight-core one. Normalising here means the UI
 * can use one threshold for both machines, which have different core counts
 * (the Hetzner box has 2, the Strato box 6).
 */
export function loadPerCore(sample: HostSample): number | null {
  if (sample.load1 === null || !sample.cpuCores) return null
  return sample.load1 / sample.cpuCores
}

/**
 * Memory pressure as the fraction of RAM that is *not* available.
 *
 * Against MemAvailable rather than MemFree, for the reason the migration
 * gives - free memory is small on every healthy Linux box, and a gauge built on
 * it reads as a permanent emergency.
 */
export function memoryUsed(sample: HostSample): number | null {
  if (!sample.memTotalBytes || sample.memAvailableBytes === null) return null
  return 1 - sample.memAvailableBytes / sample.memTotalBytes
}

/**
 * Swap in use, as a fraction of swap that exists.
 *
 * Worth its own reading because swap filling on a box with a database on it is
 * the shape of trouble that precedes everything getting slow at once - and
 * unlike memory, it does not recover on its own.
 */
export function swapUsed(sample: HostSample): number | null {
  if (!sample.swapTotalBytes || sample.swapFreeBytes === null) return null
  return 1 - sample.swapFreeBytes / sample.swapTotalBytes
}
