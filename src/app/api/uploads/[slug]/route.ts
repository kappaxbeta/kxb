import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isSafeStorageKey, resolveStoredPath, UPLOAD_BUCKET } from '@/lib/uploads'

/**
 * Serve an uploaded image by slug.
 *
 * The authorization here is the slug lookup, and that is the whole point of the
 * refactor. The query runs with the *caller's own session*, so RLS on
 * `public.uploads` decides whether the row exists for them: a member of the
 * workspace gets it, anyone else gets nothing and therefore a 404.
 *
 * That replaces a route which read straight from disk with no session at all -
 * every image in every private workspace was public to anyone holding the URL,
 * and the URL was pasted into documents by design.
 *
 * Serving through the app rather than from `public/` is the price of that
 * check. A CDN would be faster and cannot ask who is asking; signed URLs are
 * the usual way to get both, and are the natural next step if this becomes hot.
 *
 * ---------------------------------------------------------------------------
 * The bytes now come from Storage, and that is a real tradeoff
 * ---------------------------------------------------------------------------
 * Reading them was a local disk read; it is now a request to the database box.
 * That is strictly worse per image, and it is the price of the app tier holding
 * no state - which is what a load balancer in front of several app servers
 * needs. It is bounded: slugs are immutable, so the `immutable` cache header
 * below means a browser fetches a given image once.
 *
 * If it does become hot, the fix is the signed URL mentioned above - a 302 to
 * Storage, so the bytes never traverse this process at all. That was not done
 * here because a signed URL works without a session for as long as it lives,
 * and swapping a "checked on every request" model for a bearer capability is a
 * decision that deserves to be made on its own, not folded into a move.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  if (!slug || slug.length > 64) {
    return new NextResponse('Not found', { status: 404 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('uploads')
    // Not `size_bytes`: the length sent is the length actually read, so a row
    // that disagrees with its object cannot produce a truncated response.
    .select('storage_path, mime')
    .eq('slug', slug)
    // The content check runs inline at upload, so today this matches every row
    // and changes nothing. It is here so that moving the check off the request
    // later is a change to one route instead of three: a `pending` row becomes
    // a 404 rather than an unscanned file with a `Content-Type` on it.
    .eq('scan_status', 'clean')
    .maybeSingle()

  // No row, or no permission to see it - deliberately the same answer. A 403
  // would confirm the file exists to someone who should not know that.
  if (error || !data) {
    return new NextResponse('Not found', { status: 404 })
  }

  // The key comes from our own table, so this is defence in depth - but it is
  // what stops a bad row addressing another workspace's prefix.
  if (!isSafeStorageKey(data.storage_path)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const bytes = await readObject(data.storage_path)

  // The row exists but the object does not - a half-finished upload, or a
  // restored database pointed at an empty bucket.
  if (!bytes) {
    return new NextResponse('Not found', { status: 404 })
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      // The sniffed type from upload time, never a guess from the extension.
      'Content-Type': data.mime,
      'Content-Length': String(bytes.byteLength),
      // Without this a browser may sniff the body and decide it is HTML,
      // which would undo the type checking done at upload.
      'X-Content-Type-Options': 'nosniff',
      // `private`, not `public`: the response depended on who asked, so a
      // shared cache must not hand it to the next person.
      //
      // `immutable` is still honest - a slug names one immutable set of
      // bytes. Editing an image produces a new upload and a new slug.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}

/**
 * The bytes, from the bucket - or from the old disk if they never got copied.
 *
 * The fallback is transitional and exists so the order of operations cannot
 * break anything: deploying this before `scripts/uploads-to-storage.ts` has run
 * would otherwise 404 every image uploaded before today. It only ever helps on
 * a machine that has the old bind mount, which is the current single box, so it
 * has to go before a second app server is added - by then the backfill has run
 * and the fallback is dead weight that would quietly hide a failed copy.
 *
 * The service role reads: the bucket has no policies, and the tenant check
 * already happened above against `public.uploads` with the caller's session.
 */
async function readObject(storagePath: string): Promise<ArrayBuffer | null> {
  const { data, error } = await createAdminClient()
    .storage.from(UPLOAD_BUCKET)
    .download(storagePath)

  if (!error && data) {
    return await data.arrayBuffer()
  }

  const fullPath = resolveStoredPath(storagePath)
  if (!fullPath) return null

  try {
    const buffer = await readFile(fullPath)
    // Node hands back a view into a shared pool, so the whole underlying buffer
    // is longer than this file and may hold somebody else's bytes. Slice to the
    // view's own range rather than passing `.buffer`, which would serve them.
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer
  } catch {
    return null
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
