import 'server-only'
import { env } from '@/lib/env'

/**
 * Is the backend reachable, and how slowly.
 *
 * Supabase is not a library call here - it is a second machine. Postgres, auth,
 * realtime and storage all live on the Strato box behind `backend.kxb.team`,
 * on a different provider from the app. Every one of them is a network hop that
 * can be up, slow, or gone independently of the others, and "the site is down"
 * has repeatedly meant one of these four rather than the app.
 *
 * Each probe is timed and each is allowed to fail on its own. The point of
 * splitting them is that the answers differ: realtime being down means the
 * lounge is empty while the rest of the app works perfectly, which is a very
 * different morning from Postgres being down.
 */

export type ProbeStatus = 'ok' | 'slow' | 'down'

export interface Probe {
  name: string
  status: ProbeStatus
  /** Round-trip in milliseconds. Present even when the probe failed. */
  ms: number
  /** Why it failed, when it did. Never shown to anyone but an admin. */
  detail: string | null
}

/**
 * When a dependency stops being "up" and starts being a problem.
 *
 * The app and the database are in different data centres, so the floor is a
 * real internet round trip rather than a loopback - a few hundred milliseconds
 * is normal here and would be alarming in a single-box deployment. 1s is the
 * point where a page that makes three sequential queries becomes visibly slow;
 * 5s is where the request is effectively lost, and is well under the Docker
 * healthcheck's own timeout so a slow probe can never be what restarts a
 * container.
 */
const SLOW_MS = 1_000
const TIMEOUT_MS = 5_000

async function timed(
  name: string,
  run: (signal: AbortSignal) => Promise<void>,
): Promise<Probe> {
  const started = performance.now()
  try {
    await run(AbortSignal.timeout(TIMEOUT_MS))
    const ms = Math.round(performance.now() - started)
    return { name, status: ms > SLOW_MS ? 'slow' : 'ok', ms, detail: null }
  } catch (error) {
    return {
      name,
      status: 'down',
      ms: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * A GET that only has to arrive.
 *
 * `apikey` is sent on every one of these because the self-hosted gateway
 * answers 401 without it - which reads exactly like the service being down if
 * you are only looking at the status code, and has cost real time here before.
 */
async function reach(url: string, signal: AbortSignal): Promise<void> {
  const key = env.supabaseAnonKey()
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    // Both headers, not just `apikey`. The gateway is satisfied by the first,
    // but the services behind it check the bearer - realtime answers 403 to a
    // request carrying only the apikey, which reads exactly like an outage if
    // you are looking at the status code alone. That mistake is what made this
    // probe report a permanently dead realtime on a healthy stack.
    headers: { apikey: key, authorization: `Bearer ${key}` },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
}

/**
 * Realtime, probed by actually opening a socket.
 *
 * ---------------------------------------------------------------------------
 * Why not an HTTP health path
 * ---------------------------------------------------------------------------
 * The first version of this asked `/realtime/v1/api/tenants/{tenant}/health`,
 * which was wrong twice over. It answered 403 without a bearer token, so
 * realtime showed red on a perfectly working stack; and it hardcodes a tenant
 * name that is an environment variable on the self-hosted box, so the probe
 * would have gone red again the day that name changed - for a reason having
 * nothing to do with whether realtime works.
 *
 * A websocket handshake has neither problem, and is a stronger claim: it is the
 * exact path the lounge uses. HTTP 200 from a health route proves the container
 * is alive; a 101 proves the thing the app actually depends on is working,
 * through the same gateway, with the same credentials.
 *
 * The socket is closed the moment it opens. This is a liveness check, not a
 * subscription - staying joined would leave a connection per health page load
 * against a tenant with a connection limit.
 */
async function reachRealtime(base: string, signal: AbortSignal): Promise<void> {
  if (typeof WebSocket === 'undefined') {
    // Node has had a global WebSocket since 22.4 and the runtime image is
    // node:22. Throwing rather than silently reporting healthy: a probe that
    // cannot run must not look like a probe that passed.
    throw new Error('no WebSocket in this runtime')
  }

  const url = `${base.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(
    env.supabaseAnonKey(),
  )}&vsn=1.0.0`

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url)

    const finish = (error?: Error) => {
      signal.removeEventListener('abort', onAbort)
      try {
        socket.close()
      } catch {
        // Already closing, or never opened. Nothing to do either way.
      }
      if (error) reject(error)
      else resolve()
    }

    const onAbort = () => finish(new Error('timed out'))
    signal.addEventListener('abort', onAbort, { once: true })

    socket.onopen = () => finish()
    socket.onerror = () => finish(new Error('websocket refused'))
    // A close before an open is a rejected handshake - a wrong key, or the
    // gateway answering for a container that is not there.
    socket.onclose = (event) => {
      if (event.code !== 1000) finish(new Error(`closed ${event.code}`))
    }
  })
}

export async function probeDependencies(): Promise<Probe[]> {
  const base = env.supabaseUrl().replace(/\/$/, '')

  /**
   * Run together rather than in sequence.
   *
   * Four sequential probes against a backend that has gone away is four
   * timeouts end to end - twenty seconds before the health page renders, at
   * exactly the moment somebody is refreshing it because the site is down.
   * In parallel the worst case is one timeout.
   */
  return Promise.all([
    /**
     * Postgres through PostgREST, not through supabase-js.
     *
     * A HEAD against a table with a limit of zero rows is the cheapest thing
     * that proves the whole chain - gateway, PostgREST, connection pooler,
     * Postgres - is answering. `error_reports` is chosen because it is
     * admin-only under RLS, so the anon key gets a well-formed empty answer:
     * this measures reachability, and must not become a way to read rows.
     */
    timed('postgres', (signal) =>
      reach(`${base}/rest/v1/error_reports?select=id&limit=0`, signal),
    ),
    timed('auth', (signal) => reach(`${base}/auth/v1/health`, signal)),
    timed('realtime', (signal) => reachRealtime(base, signal)),
    timed('storage', (signal) => reach(`${base}/storage/v1/version`, signal)),
  ])
}

/**
 * The worst thing that happened, as one word.
 *
 * Worst rather than an average, because that is how an operator reads a
 * dashboard: a row of four greens and one red is a red morning, and any rollup
 * that renders it amber has made the page harder to act on than the list it
 * summarises.
 */
export function rollup(probes: Probe[]): ProbeStatus {
  if (probes.some((p) => p.status === 'down')) return 'down'
  if (probes.some((p) => p.status === 'slow')) return 'slow'
  return 'ok'
}

/** The shape stored in `health_samples.deps`. */
export function depsJson(probes: Probe[]): Record<string, { status: ProbeStatus; ms: number }> {
  return Object.fromEntries(
    probes.map((p) => [p.name, { status: p.status, ms: p.ms }]),
  )
}
