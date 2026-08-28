import 'server-only'
import { env } from '@/lib/env'
import { processSnapshot, type ProcessSnapshot } from '@/domain/health/snapshot'

/**
 * Every replica, not just the one that happened to render this page.
 *
 * ---------------------------------------------------------------------------
 * Why this module has to exist
 * ---------------------------------------------------------------------------
 * kxb.team runs two app containers behind Caddy, which balances randomly. A
 * health page that simply called `processSnapshot()` would report the memory,
 * uptime and request count of whichever replica caught *that* request, refresh
 * to different numbers for no visible reason, and - worst of all - show a
 * perfectly healthy card while the other replica was wedged. Half the requests
 * to the site would be failing and the monitoring page would be green.
 *
 * So each replica exposes itself over the compose network at
 * `/api/health?deep=1`, and this fans out to all of them. The local process is
 * fetched over HTTP along with the rest rather than short-circuited, so there
 * is one code path and the card you are looking at is not quietly a different
 * kind of measurement from the one beside it.
 *
 * ---------------------------------------------------------------------------
 * Naming
 * ---------------------------------------------------------------------------
 * The peer's compose service name (`app`, `app2`) is the label, because that is
 * what `docker compose logs` and `compose.yaml` call it - the name you need in
 * order to go and do something about it. The container hostname is carried
 * alongside for the case where you need to match a card to a container id.
 */

export interface ReplicaHealth {
  /** Compose service name, or 'local' when there are no peers configured. */
  name: string
  reachable: boolean
  snapshot: ProcessSnapshot | null
  /** Round-trip to the peer's health endpoint, in milliseconds. */
  ms: number
  error: string | null
}

/**
 * A replica that does not answer in this long is down as far as the page is
 * concerned. Short on purpose: this is a request between two containers on the
 * same Docker bridge network, where a healthy answer is single-digit
 * milliseconds. Waiting longer does not turn a wedged replica into a live one,
 * it just makes the page that tells you about it slow too.
 */
const PEER_TIMEOUT_MS = 3_000

/**
 * Who to ask.
 *
 * Set in compose.yaml, where the replicas are actually defined, rather than
 * hardcoded here - the code should not be the second place the topology is
 * written down, because then adding a third replica means a deploy that
 * changes both and forgets one. Unset in dev, where there is one process and
 * fanning out to a network name that does not resolve would only add a timeout
 * to every page load.
 */
export function peerUrls(): string[] {
  return (process.env.HEALTH_PEERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function askPeer(url: string): Promise<ReplicaHealth> {
  const name = labelFor(url)
  const started = performance.now()

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/health?deep=1`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
      // The peer is on a private network but the endpoint reports memory,
      // uptime and traffic, so it is authenticated anyway - see the route.
      headers: { authorization: `Bearer ${env.cronSecret()}` },
    })

    if (!response.ok) {
      return {
        name,
        reachable: false,
        snapshot: null,
        ms: Math.round(performance.now() - started),
        error: `${response.status} ${response.statusText}`,
      }
    }

    return {
      name,
      reachable: true,
      snapshot: (await response.json()) as ProcessSnapshot,
      ms: Math.round(performance.now() - started),
      error: null,
    }
  } catch (error) {
    return {
      name,
      reachable: false,
      snapshot: null,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** `http://app2:3000` reads as `app2`; anything unparseable reads as itself. */
function labelFor(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Ask every replica at once.
 *
 * In parallel because the interesting case is one replica being gone: in
 * sequence, that is a three second wait added to a page somebody is refreshing
 * precisely because something is wrong.
 */
export async function readReplicas(): Promise<ReplicaHealth[]> {
  const peers = peerUrls()

  // No peers configured - dev, or a single-container deployment. Read this
  // process directly rather than fetching ourselves through a URL that may not
  // be routable from inside the container.
  if (peers.length === 0) {
    const started = performance.now()
    const snapshot = await processSnapshot()
    return [
      {
        name: 'local',
        reachable: true,
        snapshot,
        ms: Math.round(performance.now() - started),
        error: null,
      },
    ]
  }

  return Promise.all(peers.map(askPeer))
}

/**
 * Are the replicas running the same build?
 *
 * This is the ChunkLoadError check, and it is the reason `buildId` is collected
 * at all. When the two replicas were built independently they got different
 * build ids and only a fraction of their chunk names in common; Caddy then
 * serves the HTML from one replica and `/_next/static/chunks/*.js` from the
 * other, and the browser throws. Both containers stay healthy throughout and
 * `/api/health` answers fine on either, so nothing else in this system notices.
 *
 * Replicas that did not answer are excluded rather than counted as a mismatch -
 * an unreachable replica is already reported as unreachable, and letting it
 * also raise a drift alarm would mean one outage lighting up two warnings that
 * need different fixes.
 */
export function buildDrift(replicas: ReplicaHealth[]): string[] {
  const ids = replicas
    .filter((replica) => replica.reachable && replica.snapshot?.buildId)
    .map((replica) => replica.snapshot!.buildId!)

  return [...new Set(ids)]
}
