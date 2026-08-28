#!/usr/bin/env bun
/**
 * Draws whatever is in the render queue.
 *
 *     bun run render:worker            # poll forever - what the container runs
 *     bun run render:worker --once     # drain what is there and exit
 *
 * ---------------------------------------------------------------------------
 * What this is
 * ---------------------------------------------------------------------------
 * The other half of `render_jobs`. Something registers a job - the API, the
 * backoffice, a script - and this claims it, draws it in a headless browser,
 * encodes the frame and puts the picture in Storage. It is the only thing that
 * ever moves a job out of `pending`, and it is the service role, which is why
 * every state column is refused to everybody else by row level security.
 *
 * It does not know the `renders` flag exists. That flag gates *accepting* work;
 * a queue that has stopped accepting still deserves to be drained.
 *
 * ---------------------------------------------------------------------------
 * Why a browser, and why on this box
 * ---------------------------------------------------------------------------
 * The same argument `shoot-scenes.ts` makes at length: the scene is drawn by
 * the same three.js the product runs, because the alternative is a second
 * renderer whose output drifts from the first. Chrome runs headless with
 * SwiftShader - software rasterisation, no GPU, which Hetzner Cloud does not
 * offer anyway. Seconds per frame, and pixel-wise fine for a still.
 *
 * ---------------------------------------------------------------------------
 * One job at a time, and a fresh browser for each
 * ---------------------------------------------------------------------------
 * Deliberate, and it is a memory decision rather than a correctness one. The
 * production box is two cores and 4GB with two app replicas already on it; one
 * SwiftShader render of a glTF scene peaks around a gigabyte. Two at once is
 * the OOM killer choosing between this and the site.
 *
 * The browser is launched per job and closed after it for the same reason. It
 * costs a second or two of startup against a render measured in seconds, and it
 * buys the guarantee that no scene's glTFs, textures or WebGL context outlive
 * the job that loaded them. A long-lived browser that has drawn two hundred
 * scenes is two hundred scenes of retained memory and one restart away from
 * being the reason the site went down.
 */

import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { launchChrome, openTab, sleep, waitFor } from './devtools'
import type { Database } from '../src/lib/supabase/database.types'
import { renderPath } from '../src/domain/renders/jobs'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')

/**
 * Where the render bench is served from.
 *
 * In compose this is `http://app:3000` - the service name on the internal
 * network, not the public domain. The worker sits beside the app rather than in
 * front of Caddy, so a render does not consume a TLS handshake, a proxy hop and
 * a public request slot to fetch its own glTFs.
 */
const APP = process.env.RENDER_APP_URL ?? 'http://localhost:3000'

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const PORT = Number(process.env.RENDER_DEBUG_PORT ?? 9444)
const PROFILE = process.env.RENDER_PROFILE_DIR ?? path.join('/tmp', 'render-profile')

/** How long to wait before asking again, when the queue was empty. */
const POLL_MS = Number(process.env.RENDER_POLL_MS ?? 5_000)

/**
 * How long a `running` job may sit before it is assumed dead.
 *
 * Generous, because the thing it must not do is requeue a job that is merely
 * slow: a complicated scene on a busy box is minutes, and requeuing it while it
 * is still drawing means two renders of the same job racing to upload.
 */
const STALE = process.env.RENDER_STALE_AFTER ?? '10 minutes'

/** A render that has not finished by now is hung rather than slow. */
const DRAW_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 180_000)

const once = process.argv.includes('--once')

/**
 * What the bench is asked for, and the only thing the bucket accepts.
 *
 * The browser encodes it. A canvas will hand back webp directly, so nothing
 * here needs an image library - which is the difference between a worker image
 * with a native toolchain in it and one with Chromium and a script.
 */
const FORMAT = 'webp'
const WEBP_PREFIX = 'data:image/webp;base64,'

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * A claimed row.
 *
 * The function returns one `render_jobs` composite rather than a set, so this
 * is the row type itself - and an empty queue comes back as `null`, which is
 * the whole of how a worker learns there is nothing to do.
 */
type Job = Database['public']['Functions']['claim_render_job']['Returns']

interface Capture {
  dataUrl: string
  contentType: string
  width: number
  height: number
}

// ---------------------------------------------------------------------------

/**
 * Draw one job, and return the bytes.
 *
 * Everything in here is inside the job's `running` window, so anything that
 * throws is reported against the row rather than lost. The one thing that is
 * *not* reported is the process being killed - which is what the stale requeue
 * above is for.
 */
async function draw(job: Job): Promise<Buffer> {
  const chrome = await launchChrome({
    executable: CHROME,
    port: PORT,
    profile: PROFILE,
    size: `${job.width},${job.height}`,
  })

  try {
    const tab = await openTab(chrome, `${APP}/world/render`, (line) =>
      console.error(`  [${job.id}]${line}`),
    )
    try {
      // Hydration first: until the client bundle has run there is no bench.
      await waitFor(
        tab.page,
        'window.drawReady === true',
        `${job.id}: the bench to hydrate`,
        90_000,
      )

      /**
       * The document goes in as an argument, not as part of the URL.
       *
       * A shot with a world set in it is tens of kilobytes of JSON, which is a
       * URL no server will accept - and it would put the whole document in an
       * access log. `Runtime.evaluate` has no such limit, and this is why the
       * bench takes its scene from a function call rather than a query string.
       */
      const request = JSON.stringify({
        document: job.document,
        at: job.at_seconds,
        width: job.width,
        height: job.height,
        format: FORMAT,
      })

      const capture = await Promise.race([
        tab.page.evaluate<Capture>(`window.draw(${request})`),
        sleep(DRAW_TIMEOUT_MS).then(() => {
          throw new Error(`gave up after ${Math.round(DRAW_TIMEOUT_MS / 1000)}s`)
        }),
      ])

      /**
       * The prefix is checked, not just sliced off.
       *
       * A canvas asked for a format it cannot encode silently gives you a PNG
       * instead - no error, no warning, just different bytes. Uploading those
       * as `image/webp` would be refused by the bucket's mime allow-list at
       * best, and at worst would put a mislabelled file behind a public URL.
       */
      if (!capture?.dataUrl?.startsWith(WEBP_PREFIX)) {
        throw new Error(
          capture?.dataUrl
            ? `the bench returned ${capture.contentType ?? 'something else'}, not webp`
            : 'the bench returned no frame',
        )
      }

      return Buffer.from(capture.dataUrl.slice(WEBP_PREFIX.length), 'base64')
    } finally {
      await tab.close()
    }
  } finally {
    chrome.close()
  }
}

/** Claim, draw, upload, report. The whole of what a worker does. */
async function runOne(job: Job): Promise<void> {
  const started = Date.now()
  console.log(`[${job.id}] ${job.source} ${job.width}x${job.height} attempt ${job.attempts}`)

  try {
    const webp = await draw(job)
    const at = renderPath(job.id)

    const { error: uploadError } = await supabase.storage
      .from('renders')
      .upload(at, webp, { contentType: 'image/webp', upsert: true })

    if (uploadError) throw new Error(`upload failed: ${uploadError.message}`)

    /**
     * The path is written in the same statement as the status.
     *
     * The check constraint refuses a `done` row without one, which makes the
     * two impossible to get out of step - a worker that uploaded and then
     * crashed before recording the path leaves the job `running` and stale, and
     * the next drain draws it again. An orphaned object is the cheap half of
     * that trade.
     */
    const { error } = await supabase
      .from('render_jobs')
      .update({ status: 'done', storage_path: at, finished_at: new Date().toISOString() })
      .eq('id', job.id)

    if (error) throw new Error(`could not record the result: ${error.message}`)

    console.log(
      `[${job.id}] done in ${Math.round((Date.now() - started) / 1000)}s` +
        ` (${Math.round(webp.byteLength / 1024)} kB) -> ${at}`,
    )
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    console.error(`[${job.id}] failed: ${reason}`)

    // Terminal, not requeued. A job that failed cleanly failed for a reason
    // that will still be true next time - an unparseable document, a model that
    // no longer exists. Retrying it is a decision for whoever reads the error.
    await supabase
      .from('render_jobs')
      .update({
        status: 'failed',
        error: reason.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)
  }
}

/**
 * Takes the next job, or null when there is nothing to do.
 *
 * The `id` check is not defensive tidying, it is the whole of how an empty
 * queue is recognised. A `language sql` function returning a composite gives
 * back a *row of nulls* rather than no row at all when its final statement
 * matches nothing, and PostgREST passes that through faithfully - so `data` is
 * a truthy object with `id: null` on it. Trusting it produced a worker that
 * "claimed" a null job, failed to write it back, and did so again immediately:
 * a hot loop against the database for as long as the queue stayed empty.
 */
async function claim(): Promise<Job | null> {
  const { data, error } = await supabase.rpc('claim_render_job')
  if (error) throw new Error(`could not claim a job: ${error.message}`)
  return data?.id ? data : null
}

async function main() {
  console.log(`render worker: ${APP} -> ${SUPABASE_URL}${once ? ' (once)' : ''}`)

  /**
   * Clean up after the last worker before doing anything else.
   *
   * A `running` row whose process was killed - OOM on this box is the expected
   * way to die - has nobody left to move it. Nothing polls for those; a
   * worker's first act is to release them, which means a restart is the repair.
   */
  const { data: released } = await supabase.rpc('requeue_stale_render_jobs', {
    p_older_than: STALE,
  })
  if (released) console.log(`requeued ${released} stale job(s)`)

  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      // The job in flight is left to finish. Its row is `running`, so if this
      // process is killed harder than that, the next worker requeues it.
      console.log(`${signal}: finishing the current job, then stopping`)
      stopping = true
    })
  }

  while (!stopping) {
    const job = await claim()

    if (!job) {
      if (once) break
      await sleep(POLL_MS)
      continue
    }

    await runOne(job)
  }

  console.log('render worker: stopped')
}

await main()
