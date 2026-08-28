import { NextResponse } from 'next/server'
import { MAX_IMAGE_PIXELS, sanitizeImage } from '@/lib/image-sanitize'
import { hasRoomFor } from '@/domain/billing/quota'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'
import {
  checksumOf,
  MAX_UPLOAD_BYTES,
  newUploadSlug,
  sniffImageType,
  storageKeyFor,
  UPLOAD_BUCKET,
} from '@/lib/uploads'

/**
 * Accept an image and return an opaque slug.
 *
 * The slug is the whole public identity of the file: the editor stores
 * `/api/uploads/<slug>` as the `src`, and nothing about the workspace, the page
 * or the bytes can be read back out of it. The previous scheme put the tenant
 * id and page id in the URL, which leaked internal structure into every
 * document an image appeared in.
 *
 * Files are content-addressed, so the same picture dropped into five pages is
 * stored once and minted five slugs. That also makes writes idempotent - a
 * retried upload overwrites a byte-identical object.
 *
 * The bytes go to Supabase Storage rather than to a local disk, which is what
 * lets a second app server exist: a bind mount is shared by two containers on
 * one box and by nothing at all across two boxes.
 */
export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Malformed upload' }, { status: 400 })
  }

  const file = formData.get('file')
  const workspace = formData.get('slug')
  const pageId = formData.get('pageId')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (typeof workspace !== 'string' || workspace.length === 0) {
    return NextResponse.json({ error: 'No space provided' }, { status: 400 })
  }

  // Membership, and the workspace's right to record anything at all.
  //
  // This used to also carry the argument that an unpaid workspace should not
  // quietly keep accepting files, storage being the one cost that goes on
  // accruing after billing stops. That concern is exactly right and is no
  // longer this check's to make: an unpaid space is on `free` now and free
  // holds no images at all, so the cap below refuses it by number rather than
  // by entitlement - and refuses a *paid* space at its own ceiling too, which
  // the old gate never did.
  const context = await requireTenant(workspace)
  const blocked = writeBlockedReason(context)
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 403 })
  }

  /**
   * The kill switch, ahead of the cap and ahead of reading any bytes.
   *
   * `pictures` is off by default and fails closed - see the note on it in
   * `flags/keys.ts`. This is the one surface that takes bytes from strangers
   * and serves them back from our own origin, so the switch that stops it has
   * to be the first thing asked, before a single byte is read into memory.
   */
  if (!context.features.pictures) {
    return NextResponse.json(
      { error: 'Image uploads are switched off.' },
      { status: 403 },
    )
  }

  /**
   * How many images this space may hold, checked before the work.
   *
   * Ahead of the read, the sniff, the sanitise and the store, all of which cost
   * real CPU and memory on a file we are about to refuse. The size check below
   * is described as "cheap rejection before reading the whole thing into
   * memory" and this is the same instinct one step earlier.
   *
   * `scan_status = 'clean'` matches what the serving routes count as an image
   * that exists. A pending row is not yet servable, and charging somebody for
   * one would be charging them for a file they cannot see.
   */
  const { count: held, error: countError } = await context.supabase
    .from('uploads')
    .select('slug', { count: 'exact', head: true })
    .eq('tenant_id', context.tenant.id)
    .eq('scan_status', 'clean')

  if (countError) {
    return NextResponse.json(
      { error: 'Could not check how many images this space holds. Try again in a moment.' },
      { status: 503 },
    )
  }

  const { allowed, limit } = await hasRoomFor(
    context.supabase,
    context.tenant.id,
    context.tenant.tier,
    'pictures',
    held ?? 0,
  )

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          limit === 0
            ? 'This plan does not include image uploads. Upgrade to add images.'
            : `This space is holding all ${limit} of its images. Remove one, or upgrade for more.`,
      },
      { status: 403 },
    )
  }

  // Cheap rejection before reading the whole thing into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Images must be smaller than ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` },
      { status: 413 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Again on the real length, because `file.size` is client-reported.
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 })
  }

  // Identified from the bytes, not from `file.type`. What this returns is what
  // gets stored and later served, so a mislabelled file cannot become a script
  // that runs on our own origin.
  const sniffed = sniffImageType(buffer)
  if (!sniffed) {
    return NextResponse.json(
      { error: 'Only PNG, JPEG, GIF and WebP images are supported' },
      { status: 415 },
    )
  }

  /**
   * Rebuilt from its pixels before anything is stored.
   *
   * The sniff above proves the file starts like an image; it cannot prove the
   * rest of it is one. `sanitizeImage` decodes and re-encodes, which drops
   * anything appended after the image data, every EXIF field, and any payload
   * riding in a container the sniffer never looked at. See the module for why
   * this beats running an antivirus over the same four formats.
   *
   * Inline rather than queued, because it is cheap enough to be: measured at
   * ~110ms for the worst case that fits under `MAX_UPLOAD_BYTES` - a 9.5MB
   * 12MP photo - and single-digit milliseconds for the screenshots and pasted
   * images that make up most of what arrives here. Queuing it would cost more
   * than it saves: the editor puts `/api/uploads/<slug>` in the document the
   * moment this route answers, so a file checked afterwards would render broken
   * until the check landed.
   */
  const clean = await sanitizeImage(buffer, sniffed)
  if (!clean.ok) {
    if (clean.reason === 'too-many-pixels') {
      return NextResponse.json(
        {
          error: `Image is too large to process (over ${MAX_IMAGE_PIXELS / 1_000_000} megapixels)`,
        },
        { status: 413 },
      )
    }
    if (clean.reason === 'too-large') {
      // Deliberately not "must be smaller than 10MB" - the file already was, or
      // it would have been turned away above. It is the rebuilt image that does
      // not fit, which only happens on something very large and very
      // compressed, so the useful advice is about resolution rather than bytes.
      return NextResponse.json(
        { error: 'This image could not be stored at a reasonable size - try a smaller resolution' },
        { status: 413 },
      )
    }
    return NextResponse.json(
      { error: 'That file could not be read as an image' },
      { status: 415 },
    )
  }

  /**
   * Addressed and measured by the *rebuilt* bytes, not the uploaded ones.
   *
   * These are what go in the bucket, so they are what the content address has
   * to describe - otherwise two uploads that sanitise to the same image would
   * be stored twice under different keys, and worse, the checksum on the row
   * would not match the object it points at.
   */
  const bytes = clean.bytes
  const checksum = checksumOf(bytes)
  const storagePath = storageKeyFor(context.tenant.id, checksum, sniffed.ext)

  /**
   * The service role, not the caller's session.
   *
   * The bucket is private and carries no `storage.objects` policies at all, so
   * the caller's own client could not write to it - by design. Membership and
   * the workspace's right to write were both settled above, and this route is
   * the only thing that ever puts an object in this bucket. The authorization
   * lives here, in code that can see the tenant, rather than in a storage
   * policy that would have to re-derive it.
   */
  const { error: storeError } = await createAdminClient()
    .storage.from(UPLOAD_BUCKET)
    .upload(storagePath, bytes, {
      contentType: sniffed.mime,
      // Content-addressed: an existing object at this key is the same bytes, so
      // a retried or duplicated upload should overwrite rather than 409. Without
      // this, the second person to upload a shared image gets an error.
      upsert: true,
    })

  if (storeError) {
    return NextResponse.json(
      { error: `Could not store file: ${storeError.message}` },
      { status: 500 },
    )
  }

  const slug = newUploadSlug()

  const { error } = await context.supabase.from('uploads').insert({
    slug,
    tenant_id: context.tenant.id,
    page_id: typeof pageId === 'string' && pageId.length > 0 ? pageId : null,
    storage_path: storagePath,
    mime: sniffed.mime,
    size_bytes: bytes.length,
    checksum,
    uploaded_by: context.user.id,
    // Explicit, though it is also the column default. The row is only written
    // once the bytes have been through `sanitizeImage`, so nothing reaches this
    // insert in any other state - and the serving routes filter on it, so a
    // future async path can insert `pending` without touching them.
    scan_status: 'clean',
  })

  if (error) {
    // The object exists but is unreachable without a row. Harmless: storage is
    // content-addressed, so the next upload of the same image reuses the object.
    return NextResponse.json(
      { error: `Could not record upload: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    slug,
    url: `/api/uploads/${slug}`,
    mime: sniffed.mime,
    size: bytes.length,
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
