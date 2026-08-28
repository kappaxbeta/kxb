/**
 * Turning readings into the words and shapes the page uses.
 *
 * Pure and free of `server-only` on purpose: these are the decisions worth
 * testing - when a disk counts as nearly full, what a health rollup says when
 * one replica is gone - and they should be testable without a database, a
 * process to measure or a network.
 */

import type { ProbeStatus } from '@/domain/health/probe'

/** Bytes as the unit a person would say out loud. */
export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Math.abs(value)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }

  // One decimal below 10 so 1.4 GB does not read as 1 GB, none above it so a
  // column of numbers stays a column.
  const rounded = size >= 10 || unit === 0 ? Math.round(size) : Math.round(size * 10) / 10
  return `${value < 0 ? '-' : ''}${rounded} ${units[unit]}`
}

/** Seconds as the largest unit that still says something useful. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'

  const total = Math.floor(seconds)
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m`
  if (total < 86400) {
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    // Minutes alongside hours because "up 2h" right after a deploy and "up 2h"
    // fifty minutes later are different facts on a page about restarts.
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

/**
 * Milliseconds, or a dash when the reading is missing.
 *
 * A dash rather than `0 ms`, because "not measured yet" and "measured, and it
 * was zero" are opposite readings on a latency gauge - and the first one is
 * common: a process that has just started has no event loop history yet.
 */
export function millis(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value} ms`
}

/** A ratio as a percentage, with enough precision to see a small one. */
export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const scaled = value * 100
  if (scaled > 0 && scaled < 0.1) return '<0.1%'
  return `${scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10}%`
}

/**
 * When free space stops being a number and starts being a Tuesday.
 *
 * The uploads volume is the one place this app writes without bound, and it is
 * a bind mount from the host - so it fills independently of everything else and
 * nothing else in the stack will mention it until a write fails. 10% is the
 * point where there is still time to act, 5% is the point where there is not.
 */
export function diskStatus(
  freeBytes: number | null,
  totalBytes: number | null,
): ProbeStatus | null {
  if (!freeBytes || !totalBytes || totalBytes <= 0) return null
  const free = freeBytes / totalBytes
  if (free < 0.05) return 'down'
  if (free < 0.1) return 'slow'
  return 'ok'
}

/**
 * Memory pressure, as a fraction of the heap actually in use.
 *
 * Heap rather than RSS, deliberately. RSS on this box includes whatever the
 * kernel has not bothered to reclaim and routinely sits high on a perfectly
 * idle container, so alerting on it produces a page that cries wolf. A heap
 * that is persistently near its ceiling is the thing that precedes an OOM.
 */
export function heapPressure(
  heapUsed: number | null,
  heapTotal: number | null,
): number | null {
  if (!heapUsed || !heapTotal || heapTotal <= 0) return null
  return heapUsed / heapTotal
}

/**
 * When the event loop is late enough to be somebody's slow page.
 *
 * A tick of a few milliseconds is a healthy Node process. Past ~70ms, requests
 * are queueing behind CPU work and a page that should be instant is not; past
 * 250ms the replica is effectively unresponsive even though it is answering
 * health checks, which is the exact state this measurement exists to catch.
 */
export function lagStatus(lagMs: number | null): ProbeStatus | null {
  if (lagMs === null || !Number.isFinite(lagMs)) return null
  if (lagMs >= 250) return 'down'
  if (lagMs >= 70) return 'slow'
  return 'ok'
}

/**
 * When a box's load stops being work and starts being a queue.
 *
 * Taken per core, so one threshold covers both machines - the Hetzner box has
 * two cores and the Strato box six, and a raw load of 4 is a different morning
 * on each. At 1.0 per core every core has a runnable process and work is
 * starting to wait; 2.0 means twice as much wants to run as can, which on the
 * app box is where request latency visibly doubles.
 */
export function loadStatus(perCore: number | null): ProbeStatus | null {
  if (perCore === null || !Number.isFinite(perCore)) return null
  if (perCore >= 2) return 'down'
  if (perCore >= 1) return 'slow'
  return 'ok'
}

/**
 * When a box is close enough to full that the OOM killer is the next event.
 *
 * Measured against MemAvailable, so this is genuinely "how much could a new
 * process still get" rather than "how much is untouched". 85% is where there is
 * still room to act; past 95% Linux starts reclaiming aggressively and the
 * machine gets slow before it gets fatal - which is exactly the window this is
 * meant to catch, because after that it is a restart nobody chose.
 */
export function memoryStatus(used: number | null): ProbeStatus | null {
  if (used === null || !Number.isFinite(used)) return null
  if (used >= 0.95) return 'down'
  if (used >= 0.85) return 'slow'
  return 'ok'
}

/**
 * The one word at the top of the page.
 *
 * Takes the worst of everything, for the reason `rollup` gives: a dashboard
 * that averages a dead replica with a live one into "mostly fine" is a
 * dashboard that has to be checked by hand, which is what it was built to
 * avoid.
 */
export function overall(parts: (ProbeStatus | null)[]): ProbeStatus {
  const known = parts.filter((part): part is ProbeStatus => part !== null)
  if (known.some((part) => part === 'down')) return 'down'
  if (known.some((part) => part === 'slow')) return 'slow'
  return 'ok'
}

/** How a status reads to a person. */
export function statusLabel(status: ProbeStatus): string {
  return status === 'ok' ? 'Healthy' : status === 'slow' ? 'Degraded' : 'Down'
}

/**
 * Traffic and errors across a recorded window.
 *
 * Sums the per-sample deltas rather than subtracting the first cumulative
 * counter from the last, because the counters reset on deploy - across a
 * window containing one, the endpoints say the process served fewer requests
 * than it did, and can say it served a negative number. The nulls that
 * `health_series` emits for a first sample or a broken reading are skipped, so
 * this is "what we recorded", which is the most anybody can claim.
 */
export function windowTotals(
  samples: { requestsDelta: number | null; errorsDelta: number | null }[],
): { requests: number; errors: number; rate: number | null } {
  let requests = 0
  let errors = 0

  for (const sample of samples) {
    if (sample.requestsDelta !== null) requests += sample.requestsDelta
    if (sample.errorsDelta !== null) errors += sample.errorsDelta
  }

  return { requests, errors, rate: requests > 0 ? errors / requests : null }
}
