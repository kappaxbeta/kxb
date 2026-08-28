import { cronAuthorized } from '@/lib/cron-auth'
import { processSnapshot } from '@/domain/health/snapshot'

/**
 * Two questions, one endpoint.
 *
 * ---------------------------------------------------------------------------
 * The bare GET is a liveness probe and must stay one
 * ---------------------------------------------------------------------------
 * `GET /api/health` deliberately does not touch Supabase. It answers "is the
 * Node process serving?", not "is the database reachable". This is what the
 * Docker healthcheck calls, and the distinction is the whole point: a
 * healthcheck that fails during a database outage restarts both app containers
 * over a problem on a different machine that restarting cannot fix, turning a
 * degraded site into a down one. Do not add a dependency check here.
 *
 * ---------------------------------------------------------------------------
 * ?deep=1 is how the replicas see each other
 * ---------------------------------------------------------------------------
 * The backoffice health page runs on one replica and needs the memory, uptime,
 * lag and counters of all of them - see replicas.ts for why. That fan-out
 * happens over the compose network, so each replica has to be able to describe
 * itself on request.
 *
 * It is authenticated even though it is only reachable inside the Docker
 * network. Two reasons, and the second is the real one: the app is one Caddy
 * config change away from this path being public, and "it is on a private
 * network" is exactly the assumption that stops being true without anybody
 * revisiting the endpoint that depended on it. What it discloses - uptime,
 * memory, request volume, build id - is a useful map for somebody deciding
 * whether the box is worth attacking.
 *
 * The token is CRON_SECRET rather than a new variable of its own. It is already
 * the app's "there is no user behind this caller" secret, held by the same
 * operator, deployed by the same mechanism; a second one would mean a deploy
 * that has to set both and a feature that silently stops working when it sets
 * only one.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep')

  if (deep !== '1') {
    return Response.json({ status: 'ok' })
  }

  if (!cronAuthorized(request)) {
    // 404, not 401. A 401 confirms the endpoint exists and is worth guessing
    // at; the same posture requireBackofficeAdmin() takes for the same reason.
    return new Response('Not found', { status: 404 })
  }

  return Response.json(await processSnapshot(), {
    headers: { 'cache-control': 'no-store' },
  })
}


