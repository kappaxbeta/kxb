import { NextResponse } from 'next/server'
import { findRenderJob } from '@/domain/renders/queries'
import { isSettled, renderUrl } from '@/domain/renders/jobs'
import { env } from '@/lib/env'
import { requireApiUser } from '../auth'

/**
 * How a caller finds out what happened to its render.
 *
 * Read with the caller's own session, so row level security decides what comes
 * back - a job you did not ask for and whose space you do not belong to is a
 * 404, the same as one that never existed. Nothing here re-states that rule.
 *
 * `url` is present exactly when the render is finished, which is what makes
 * this pollable without the caller having to know how a storage path becomes an
 * address. `done` is the only status that carries one - see the check
 * constraint that refuses a `done` row without a path.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/renders/[id]'>) {
  const { id } = await ctx.params

  // A poll loop is the normal caller here, so an expired session has to be
  // distinguishable from a job that does not exist - the first is worth signing
  // in again for, the second means stop polling.
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const job = await findRenderJob(auth.supabase, id)
  if (!job) {
    return NextResponse.json({ error: 'No such render' }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    /**
     * A hint, not a promise. A caller that keeps polling a settled job is
     * burning requests on an answer that will not change, and the one thing the
     * server can cheaply tell it is that there is no point.
     */
    settled: isSettled(job.status),
    attempts: job.attempts,
    width: job.width,
    height: job.height,
    error: job.error,
    url: job.storagePath ? renderUrl(env.supabaseUrl(), job.storagePath) : null,
  })
}
