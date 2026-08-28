import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSafeStorageKey, UPLOAD_BUCKET } from '@/lib/uploads'

/**
 * A banner's picture, for people who are not signed in.
 *
 * The obvious route already exists - `/api/uploads/<slug>` - and cannot be used
 * here, which is worth stating plainly because it looks like duplication. That
 * route's entire authorization is that the lookup runs with the caller's own
 * session, so RLS on `public.uploads` decides whether the row exists for them.
 * That is exactly right for an image pasted into a private page, and it means
 * an anonymous visitor gets a 404 for every upload in the product. The banner
 * on a public door is the one image that has to be readable by somebody with no
 * session at all.
 *
 * So this route asks a different question, and it is a narrow one:
 *
 *   is this banner attached to a live event?
 *
 * Not "does this banner exist" - a draft in the studio stays private - and not
 * "is this file public", which is the property `/api/uploads` is right to
 * refuse. The host publishes a banner by attaching it in Settings, and this
 * route is the other half of that same click. Detaching it takes the picture
 * off the internet, which is what a host reaching for that control means.
 *
 * The id in the URL is the banner's, not the upload's, for that reason: the
 * authorization is a fact about the banner, so the banner is what gets named.
 * It also means the poster can be re-baked without every link to it changing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // A uuid or nothing. Cheap, and it keeps a malformed id from reaching
  // PostgREST as a type error rather than an empty result.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()

  /**
   * The banner, its picture, and the event holding it up - in one query.
   *
   * `event_spaces!inner` is the check. The join is on `event_spaces.banner_id`,
   * so a banner nobody has attached has no row on the other side and the query
   * returns nothing - which becomes the same 404 as an invented id. The
   * archived filter is there because an archived space's doors are shut, and a
   * picture still being served off one is the kind of thing nobody notices for
   * a year.
   */
  const { data, error } = await admin
    .from('event_banners')
    .select(
      'poster_slug, event_spaces!inner(tenant_id), tenants_read_model!inner(archived)',
    )
    .eq('id', id)
    .eq('tenants_read_model.archived', false)
    .maybeSingle()

  if (error || !data?.poster_slug) {
    return new NextResponse('Not found', { status: 404 })
  }

  // The file itself, read with the service role. There is nobody to ask about
  // here: the decision was made above, and the bucket carries no policies.
  const { data: upload } = await admin
    .from('uploads')
    .select('storage_path, mime')
    .eq('slug', data.poster_slug)
    // Same gate as `/api/uploads/[slug]`, and it matters more here: this is the
    // one route that serves a file to somebody with no session at all.
    .eq('scan_status', 'clean')
    .maybeSingle()

  if (!upload || !isSafeStorageKey(upload.storage_path)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const file = await admin.storage.from(UPLOAD_BUCKET).download(upload.storage_path)

  // The row exists but the object does not - a half-finished save, or a
  // restored database pointed at an empty bucket. There is no disk fallback
  // here on purpose: no banner predates Storage, so a fallback could only ever
  // hide a failed upload.
  if (file.error || !file.data) {
    return new NextResponse('Not found', { status: 404 })
  }

  const bytes = await file.data.arrayBuffer()

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      // The type sniffed at upload time, never a guess from the extension.
      'Content-Type': upload.mime,
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      /**
       * `public`, unlike the uploads route - and that is the whole difference
       * between the two.
       *
       * That response depended on who asked, so a shared cache handing it to
       * the next person would be a leak. This one does not: everybody gets the
       * same bytes, and the front page is going to ask for it once per visitor.
       *
       * Not `immutable`, though. A banner id outlives its poster - re-saving
       * bakes a new frame under the same id - so a browser that cached this
       * forever would show yesterday's arrangement until it was hard-reloaded.
       * An hour is long enough to matter on a page that gets linked from a
       * Discord, and short enough that fixing a typo at 09:00 is up by 10:00.
       */
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
