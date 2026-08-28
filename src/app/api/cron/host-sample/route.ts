import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Client } from '@/es/store'
import { pruneHostSamples, writeHostSample } from '@/domain/health/host'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * Where the boxes report themselves.
 *
 * The agent on each machine (scripts/health-agent.sh) reads /proc every five
 * minutes and posts it here. This is the only inbound half of that: the app
 * cannot reach into either host to ask, and deliberately has no way to - the
 * Strato box publishes nothing but HTTPS, and giving the app container a way to
 * run commands on it would be a far larger hole than the gauge is worth.
 *
 * Behind the same CRON_SECRET as the other machine-to-machine routes, for the
 * same reason: there is no user here, and the alternative to a bearer token is
 * an unauthenticated endpoint that lets anybody write to the graph an operator
 * makes decisions from.
 */
export const dynamic = 'force-dynamic'

/**
 * Fourteen days, matching health_samples. Two hosts every five minutes is about
 * eight thousand rows a fortnight - small enough to never think about.
 */
const KEEP_DAYS = 14

/**
 * Validated rather than trusted, even though the caller holds the secret.
 *
 * The secret says the caller is our own cron job; it does not say the shell
 * script parsed /proc correctly on a kernel whose format shifted. An unparsed
 * field arriving as the string "null" and being stored as a number is how a
 * chart ends up with a spike nobody can explain. Anything that is not a finite
 * number is rejected here rather than written.
 */
const HostSample = z.object({
  host: z.enum(['app', 'db']),
  hostname: z.string().max(255).optional(),
  cpuCores: z.number().int().nonnegative().max(1024),
  load1: z.number().nonnegative(),
  load5: z.number().nonnegative(),
  load15: z.number().nonnegative(),
  cpuTotal: z.number().nonnegative(),
  cpuIdle: z.number().nonnegative(),
  memTotalBytes: z.number().nonnegative(),
  memAvailableBytes: z.number().nonnegative(),
  swapTotalBytes: z.number().nonnegative(),
  swapFreeBytes: z.number().nonnegative(),
  diskTotalBytes: z.number().nonnegative(),
  diskFreeBytes: z.number().nonnegative(),
  uptimeSeconds: z.number().nonnegative(),
})

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('Malformed JSON', { status: 400 })
  }

  const parsed = HostSample.safeParse(body)
  if (!parsed.success) {
    // The reason, not just a 400. The only caller is a shell script somebody is
    // installing, and "which field is wrong" is the entire content of the
    // feedback loop while they are doing it.
    return Response.json(
      { error: 'Invalid sample', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const admin = createAdminClient() as unknown as Client

  await writeHostSample(admin, parsed.data)

  /**
   * Pruned by the app box's agent only.
   *
   * Both agents post here, so pruning on every request would run the delete
   * twice as often as needed for no benefit. Tying it to one host keeps it on a
   * predictable schedule without a second thing to install.
   */
  const pruned =
    parsed.data.host === 'app' ? await pruneHostSamples(admin, KEEP_DAYS) : 0

  return Response.json({ stored: parsed.data.host, pruned })
}
