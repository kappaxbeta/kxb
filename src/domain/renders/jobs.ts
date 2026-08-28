import { z } from 'zod'

/**
 * What a render job is, before any of it touches a database or a browser.
 *
 * Deliberately free of `server-only`: the backoffice renders a queue in a
 * client component, the API validates a body, the worker reads a row, and all
 * three need the same words for the same things.
 */

/** The four states, in the only order they occur. */
export const RENDER_STATUSES = ['pending', 'running', 'done', 'failed'] as const

export type RenderStatus = (typeof RENDER_STATUSES)[number]

/** Terminal states. A job here will not move again on its own. */
export function isSettled(status: RenderStatus): boolean {
  return status === 'done' || status === 'failed'
}

/**
 * How many times a job may be claimed before the queue stops offering it.
 *
 * Kept in step with the default on `claim_render_job` by hand, and read here so
 * the backoffice can say "3 of 3" rather than leaving an operator to work out
 * why a job with attempts on it is not moving.
 */
export const MAX_ATTEMPTS = 3

/**
 * The size bounds, kept in step with the check constraint on `render_jobs` and
 * with `clampSize` in the render bench.
 *
 * Three copies is one more than anybody wants. They are not redundant: the
 * constraint refuses a row, this refuses a request, and the bench refuses a
 * draw that never became a row at all - the CLI hands documents straight to the
 * renderer. Each one is the last line of defence on a path the others do not
 * cover.
 */
export const MIN_SIZE = 16
export const MAX_SIZE = 2048

/**
 * A request to draw something.
 *
 * The document is `unknown` on purpose and stays that way through the whole
 * pipeline: it is validated by `parseShot` at the point of use - once in the
 * action, once again in the browser - rather than described a third time here.
 * A zod schema for a ShotSpec would be a second definition of the document,
 * kept in step with the parser by hand, and the parser is already the thing
 * that decides what a shot is.
 */
export const renderRequestSchema = z.object({
  document: z.unknown(),
  at: z.number().min(0).max(3600).optional(),
  width: z.number().int().min(MIN_SIZE).max(MAX_SIZE).optional(),
  height: z.number().int().min(MIN_SIZE).max(MAX_SIZE).optional(),
  /**
   * Who is asking, as a label. Free text, because nothing branches on it - see
   * the note on the column. Trimmed and bounded so the queue stays readable.
   */
  source: z.string().trim().min(1).max(40),
  /** Provenance only. A saved scene this document came from, if there was one. */
  sceneId: z.uuid().optional(),
})

export type RenderRequest = z.infer<typeof renderRequestSchema>

/** A job as everything outside the database sees it. */
export interface RenderJob {
  id: string
  status: RenderStatus
  source: string
  width: number
  height: number
  atSeconds: number
  sceneId: string | null
  tenantId: string | null
  requestedBy: string | null
  attempts: number
  error: string | null
  storagePath: string | null
  claimedAt: string | null
  finishedAt: string | null
  createdAt: string
}

/** The bucket every render lands in. Public - see the note in the migration. */
export const RENDERS_BUCKET = 'renders'

/**
 * Where a job's picture lives.
 *
 * The job's own id, which is a uuid nobody can guess. Not the scene's id and
 * not its name: a path that can be derived from something a reader already
 * knows is a path that leaks further than the page embedding it, and this
 * bucket is public. Re-rendering the same scene mints a new job and therefore a
 * new object, so a picture is never overwritten underneath a page still showing
 * it.
 */
export function renderPath(jobId: string): string {
  return `${jobId}.webp`
}

/**
 * The public URL for a finished render.
 *
 * Built rather than fetched. `getPublicUrl` in supabase-js is string
 * concatenation with a round trip's worth of ceremony around it, and a card
 * that needs twelve of these should not need a client to make them.
 */
export function renderUrl(supabaseUrl: string, storagePath: string): string {
  const base = supabaseUrl.replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${RENDERS_BUCKET}/${storagePath}`
}
