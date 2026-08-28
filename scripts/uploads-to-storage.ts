/**
 * Copies the files that predate Supabase Storage into the `uploads` bucket.
 *
 *     UPLOAD_DIR=./uploads-backfill bun run scripts/uploads-to-storage.ts
 *     UPLOAD_DIR=./uploads-backfill bun run scripts/uploads-to-storage.ts --apply
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * Uploads used to be written to a host directory bind-mounted into the app
 * container, and the `uploads` table stored the path within it. The bytes moved
 * to Storage; the rows did not need to, because the object key is the path they
 * already held. So this copies files and touches no rows at all - which is what
 * makes it safe to re-run, and safe to interrupt.
 *
 * ---------------------------------------------------------------------------
 * Where to run it
 * ---------------------------------------------------------------------------
 * It needs the old files and a network route to Supabase. The Hetzner box has
 * the files but no bun, so the practical order is to bring them here first:
 *
 *     rsync -az hetzner:/mnt/volume-hel1-1/uploads/ ./uploads-backfill/
 *     UPLOAD_DIR=./uploads-backfill bun run scripts/uploads-to-storage.ts
 *
 * Point NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at whichever
 * database owns those rows - for the real files that is production, not the
 * local stack, and getting that backwards uploads every workspace's images into
 * a dev bucket. It prints the host it is about to write to for that reason.
 *
 * ---------------------------------------------------------------------------
 * Dry by default
 * ---------------------------------------------------------------------------
 * Without `--apply` it reports what it would do and writes nothing. The report
 * is the interesting part anyway: rows whose file is already in the bucket,
 * rows whose file is missing from disk (broken before this ran, and still
 * broken after), and the total bytes about to cross the network.
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const UPLOAD_BUCKET = 'uploads'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const root = process.env.UPLOAD_DIR

if (!url || !serviceKey) {
  console.error('\n  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n')
  process.exit(1)
}
if (!root) {
  console.error('\n  UPLOAD_DIR must point at the copied uploads directory\n')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`\n  database ${new URL(url).host}`)
console.log(`  files    ${root}`)
console.log(`  mode     ${apply ? 'APPLY - writes to the bucket' : 'dry run'}\n`)

/**
 * Distinct paths, not rows.
 *
 * Storage is content-addressed and several slugs routinely point at one file -
 * the same image dropped into five pages is five rows and one object. Copying
 * per row would upload it five times.
 */
const seen = new Map<string, string>()
const PAGE = 1000

for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('uploads')
    .select('slug, storage_path, mime')
    .order('slug')
    .range(from, from + PAGE - 1)

  if (error) {
    console.error(`  could not read uploads: ${error.message}`)
    process.exit(1)
  }
  if (!data || data.length === 0) break

  for (const row of data) seen.set(row.storage_path, row.mime)
  if (data.length < PAGE) break
}

console.log(`  ${seen.size} distinct file(s) referenced by the uploads table\n`)

let copied = 0
let already = 0
let missing = 0
let failed = 0
let bytes = 0

for (const [storagePath, mime] of seen) {
  // `list` on the parent prefix is one round trip per file, so ask Storage for
  // the object itself instead and let a 404 answer the question.
  const existing = await supabase.storage.from(UPLOAD_BUCKET).download(storagePath)
  if (!existing.error) {
    already += 1
    continue
  }

  let buffer: Buffer
  try {
    buffer = await readFile(join(root, storagePath))
  } catch {
    // A row whose file is gone. It was already serving a 404 before this ran;
    // the point of listing it is that the count should be zero, and if it is
    // not, that is a pre-existing problem this migration did not cause.
    console.log(`  missing on disk  ${storagePath}`)
    missing += 1
    continue
  }

  bytes += buffer.byteLength

  if (!apply) {
    copied += 1
    continue
  }

  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true })

  if (error) {
    console.log(`  FAILED           ${storagePath}: ${error.message}`)
    failed += 1
    continue
  }

  copied += 1
}

const mb = (bytes / 1024 / 1024).toFixed(1)
console.log(`\n  ${apply ? 'copied' : 'would copy'}   ${copied} file(s), ${mb} MB`)
console.log(`  already there  ${already}`)
console.log(`  missing        ${missing}`)
if (failed > 0) console.log(`  failed         ${failed}`)
console.log(apply ? '' : '\n  re-run with --apply to write\n')

process.exit(failed > 0 ? 1 : 0)
