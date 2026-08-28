/**
 * How much this process has done since it started.
 *
 * ---------------------------------------------------------------------------
 * Why the state lives on globalThis
 * ---------------------------------------------------------------------------
 * The two things that need to write these counters are `src/proxy.ts` and
 * `src/instrumentation.ts`, and the thing that reads them is a route handler.
 * Next compiles the proxy into its own bundle, so a plain module-level `let`
 * would give each of them a private copy and the route handler would forever
 * report zero. `globalThis` is the one thing they demonstrably share, since
 * they are the same Node process.
 *
 * Keyed with `Symbol.for` rather than a string property so it cannot collide
 * with anything a dependency parks on the global object, and so re-evaluating
 * this module - which happens on every hot reload in dev - reattaches to the
 * existing counts instead of silently resetting them.
 *
 * ---------------------------------------------------------------------------
 * What these numbers are, and are not
 * ---------------------------------------------------------------------------
 * They are cumulative since *this process* started, per replica. They reset on
 * every deploy, which is why `health_samples` stores the raw counter and works
 * the deltas out at read time rather than storing a rate.
 *
 * `requests` counts what passed through the proxy, which by its matcher
 * excludes `_next/static`, images and the HMR socket. That is the denominator
 * worth having - it is app requests, not asset fetches - but it is not the
 * number in Caddy's access log, and the UI says so.
 *
 * There is deliberately no request *latency* here. Nothing in this app can
 * observe when a response finished: the proxy hands control back before the
 * page streams, and there is no global "response ended" hook to close a timer
 * in. Measuring only the proxy's own few milliseconds and calling it response
 * time would be a plausible number that describes nothing anybody cares about.
 * Real end-to-end latency needs OpenTelemetry; until that is wanted, event loop
 * lag is the honest saturation signal and it is what the page charts.
 */

export interface Counters {
  /** App requests that entered the proxy since process start. */
  requests: number
  /** Server errors seen by onRequestError since process start. */
  errors: number
  /** When this process's counting began, as an epoch millisecond. */
  since: number
}

const KEY = Symbol.for('unkown.t/health-counters')

type GlobalWithCounters = typeof globalThis & { [KEY]?: Counters }

function store(): Counters {
  const g = globalThis as GlobalWithCounters
  // `??=` rather than a check-then-assign so a second module instance
  // evaluating concurrently cannot replace counts the first one already took.
  return (g[KEY] ??= { requests: 0, errors: 0, since: Date.now() })
}

export function countRequest(): void {
  store().requests += 1
}

export function countError(): void {
  store().errors += 1
}

/** A copy, so a caller holding it cannot perturb the counts it is reporting. */
export function readCounters(): Counters {
  return { ...store() }
}

/**
 * Errors as a share of requests, or null when there is nothing to divide.
 *
 * Null rather than zero for an idle process, because "0% errors" and "no
 * requests yet" are different states and only one of them is reassuring. A
 * freshly deployed replica reads as the second until traffic reaches it.
 */
export function errorRate(counters: Counters): number | null {
  if (counters.requests <= 0) return null
  return counters.errors / counters.requests
}
