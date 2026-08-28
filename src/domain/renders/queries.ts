import 'server-only'
import type { Client } from '@/es/store'
import { type RenderJob, RENDER_STATUSES, type RenderStatus } from '@/domain/renders/jobs'

/**
 * Reading the render queue.
 *
 * Every function here is `select` and leans on the row level security in
 * 20260929010000_render_jobs.sql rather than filtering by ownership itself -
 * the same discipline the scenes and worlds queries explain. "Whose renders may
 * this reader see" is one sentence and it is written in the policy.
 *
 * The deliberate omission is the same one `SCENE_COLUMNS` makes: the document.
 * A queue listing is statuses and sizes; the only thing that needs the shot is
 * the worker, and it asks for one job at a time.
 */

/**
 * Everything the backoffice queue needs. Note the absent `document`.
 *
 * One unbroken literal, not a concatenation. supabase-js parses this string at
 * the type level to work out what a row looks like, and it can only do that
 * with something it can see whole - a `'a, b' + 'c, d'` resolves to `string`
 * and every field on the result becomes an error type.
 */
const JOB_COLUMNS =
  'id, status, source, width, height, at_seconds, scene_id, tenant_id, requested_by, attempts, error, storage_path, claimed_at, finished_at, created_at'

interface Row {
  id: string
  status: string
  source: string
  width: number
  height: number
  at_seconds: number
  scene_id: string | null
  tenant_id: string | null
  requested_by: string | null
  attempts: number
  error: string | null
  storage_path: string | null
  claimed_at: string | null
  finished_at: string | null
  created_at: string
}

/**
 * A status out of the database, narrowed.
 *
 * The check constraint means this can only ever be one of the four, but the
 * generated types say `string` - and a reader that cast would be trusting a
 * constraint it cannot see. `pending` is the honest answer for a value that
 * should not exist: it is the state that leads somewhere.
 */
function asStatus(value: string): RenderStatus {
  return (RENDER_STATUSES as readonly string[]).includes(value)
    ? (value as RenderStatus)
    : 'pending'
}

function summarise(row: Row): RenderJob {
  return {
    id: row.id,
    status: asStatus(row.status),
    source: row.source,
    width: row.width,
    height: row.height,
    atSeconds: row.at_seconds,
    sceneId: row.scene_id,
    tenantId: row.tenant_id,
    requestedBy: row.requested_by,
    attempts: row.attempts,
    error: row.error,
    storagePath: row.storage_path,
    claimedAt: row.claimed_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }
}

/**
 * The most recent jobs, newest first.
 *
 * Bounded rather than paged. This is an operations view of a queue that drains,
 * and the question it answers is "what is happening now" - which is the top of
 * the list. Nobody has needed page four of the render history.
 */
export async function listRenderJobs(
  supabase: Client,
  { limit = 50 }: { limit?: number } = {},
): Promise<RenderJob[]> {
  const { data, error } = await supabase
    .from('render_jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to list render jobs: ${error.message}`)
  return (data ?? []).map((row) => summarise(row as Row))
}

/** One job, or null if there is none this reader may see. */
export async function findRenderJob(
  supabase: Client,
  id: string,
): Promise<RenderJob | null> {
  const { data, error } = await supabase
    .from('render_jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to read render job: ${error.message}`)
  return data ? summarise(data as Row) : null
}

/**
 * How much is waiting, and how much has gone wrong.
 *
 * One row rather than the whole queue, because the backoffice header wants a
 * number and the nav wants a badge. Counted with `head: true`, so what comes
 * back over the wire is three counts and no rows at all.
 */
export async function renderQueueDepth(
  supabase: Client,
): Promise<{ pending: number; running: number; failed: number }> {
  const count = async (status: RenderStatus) => {
    const { count: n } = await supabase
      .from('render_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    return n ?? 0
  }

  const [pending, running, failed] = await Promise.all([
    count('pending'),
    count('running'),
    count('failed'),
  ])

  return { pending, running, failed }
}
