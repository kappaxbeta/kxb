import { NextResponse } from 'next/server'
import { mayDo } from '@/domain/xps/access'
import { findXpProject, spaceXpBytes } from '@/domain/xps/queries'
import { CAPS } from '@/lib/xp-formats'
import { intakeFile, SCAN_STATUS_ON_ACCEPT } from '@/lib/xp-intake'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'
import { readGrant } from '@/domain/xps/grants'

/**
 * Step three of the save handshake: one file's bytes.
 *
 * The editor calls `/save` first, is told which hashes are missing, and posts
 * each of those here. `docs/xp/backend.md` §9.
 *
 * ---------------------------------------------------------------------------
 * One file per request, not a folder per request
 * ---------------------------------------------------------------------------
 * A 128MB multipart body is one thing that either arrives or does not, on a
 * connection that may be a phone on a train. Per-file means a failure costs one
 * file rather than the afternoon, retries are free because the content address
 * makes them idempotent, and the editor can show progress that means something.
 *
 * It also means this route never has more than one file in memory, which is the
 * difference between a save and an out-of-memory on a box with 3.7GB across two
 * replicas.
 *
 * ---------------------------------------------------------------------------
 * Nothing here is a save
 * ---------------------------------------------------------------------------
 * A file that lands leaves a blob and an `xp_files` row and no version pointing
 * at it. That is deliberate: a half-uploaded folder is garbage a sweep
 * collects, and the alternative - a version row written first and patched as
 * files arrive - is a version that can be read while it is incomplete. The
 * store reads versions, so it would be read.
 */

export const maxDuration = 60

export async function POST(
  request: Request,
  { params }: { params: Promise<{ xpId: string }> },
) {
  const { xpId } = await params

  const path = request.headers.get('x-xp-path')
  if (!path) return bad('Say which file this is, in x-xp-path')

  const user = await getUser()
  if (!user) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const project = await findXpProject(supabase, xpId)
  if (!project) return new NextResponse('Not found', { status: 404 })

  // The space is loaded by id rather than by slug, because this route is called
  // by the editor with a project id and nothing else. `requireTenant` wants a
  // slug, so the project's own tenant is resolved first and membership is what
  // `mayDo` then asks about.
  const space = await spaceFor(project.tenantId)

  const verdict = mayDo(project, 'edit', {
    accountId: user.id,
    space,
    grant: await readGrant(supabase, xpId, user.id),
    operator: false,
  })
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 403 })
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.length === 0) return bad('Empty upload')

  /**
   * The quota, checked here rather than at `/save`.
   *
   * `/save` sees a manifest of hashes, most of which are usually already held —
   * so the number it could check is the folder's size and not the space's. This
   * is the moment a new byte actually arrives, which is the only moment the
   * question "does this space have room" has a true answer.
   */
  const held = await spaceXpBytes(supabase, project.tenantId)
  if (held + body.length > CAPS.spaceBytes) {
    return NextResponse.json(
      { error: 'This space has no room left for XP files' },
      { status: 413 },
    )
  }

  const result = await intakeFile(path, body)
  if (!result.ok) {
    // The reason is written for whoever dropped the file. 422 rather than 400:
    // the request was well-formed and the file was not.
    return NextResponse.json(
      { error: result.problem.reason, at: result.problem.at, path },
      { status: 422 },
    )
  }

  const key = `${project.tenantId}/${result.sha}.${result.type.ext}`
  const admin = createAdminClient()

  /**
   * `upsert` because the content address makes a re-upload the same bytes.
   *
   * A retry after a timeout, two editors saving folders that share a model, and
   * the same picture in `preview/` twice all arrive here as a write of an
   * object that already exists with identical contents. Failing those would
   * turn "the network hiccuped" into "your save is stuck".
   */
  const stored = await admin.storage
    .from('xp')
    .upload(key, result.bytes, { contentType: result.type.mime, upsert: true })

  if (stored.error) {
    return NextResponse.json({ error: 'Could not store that file' }, { status: 502 })
  }

  const { error } = await supabase.from('xp_files').upsert(
    {
      tenant_id: project.tenantId,
      sha: result.sha,
      ext: result.type.ext,
      mime: result.type.mime,
      bytes: result.bytes.length,
      scan_status: SCAN_STATUS_ON_ACCEPT,
    },
    { onConflict: 'tenant_id,sha' },
  )

  if (error) {
    return NextResponse.json({ error: 'Could not record that file' }, { status: 500 })
  }

  return NextResponse.json({
    path,
    // The sha of what was *stored*, which for an image is not the sha of what
    // arrived - it was rebuilt from its pixels. The editor has to update its
    // manifest with this before calling `/save` again, or the save will ask for
    // a hash that will never exist.
    sha: result.sha,
    bytes: result.bytes.length,
    mime: result.type.mime,
    rebuilt: result.bytes.length !== body.length,
  })
}

async function spaceFor(tenantId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenants_read_model')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!data) return null
  try {
    return await requireTenant(data.slug)
  } catch {
    // Not a member, or the space is gone. `mayDo` treats a null space as "you
    // are not in it", which is the right answer and a better one than a throw.
    return null
  }
}

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}
