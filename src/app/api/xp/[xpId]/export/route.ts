import { NextResponse } from 'next/server'
import { mayDo } from '@/domain/xps/access'
import { readGrant } from '@/domain/xps/grants'
import { findXpProject, readXpVersion } from '@/domain/xps/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'
import { zip, type ZipEntry } from '@/lib/zip'

/**
 * The folder, as a file you hold.
 *
 * ---------------------------------------------------------------------------
 * This is the one place a whole-project object exists
 * ---------------------------------------------------------------------------
 * `docs/xp/backend.md` §6.0 argued at length for storing a project as a
 * document row plus content-addressed blobs rather than as one object. The
 * appeal of one object was real — a project is one thing you can hand over —
 * and this is where that survives: the manifest is walked, the blobs are
 * pulled, and out comes exactly §1's folder. The artifact the other design
 * would have stored is the artifact this produces, on the rare occasion
 * somebody wants a download, instead of on every single save.
 *
 * ---------------------------------------------------------------------------
 * Why the permission is its own rung and not `edit`
 * ---------------------------------------------------------------------------
 * §7.0 says there is no personal shelf and that leaving with your work is
 * Export. That is only a promise if it survives every way somebody loses their
 * footing: billing lapsing, the tier dropping, leaving the space, the space
 * owner removing the project, the project being archived. All of those refuse
 * `edit` — and the refusal an owner outside the space gets literally says
 * *export it to keep a copy*. `mayDo(…, 'export')` is what stops that being a
 * lie, and its comment carries the argument.
 */

export const maxDuration = 120

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ xpId: string }> },
) {
  const { xpId } = await params

  const user = await getUser()
  if (!user) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const project = await findXpProject(supabase, xpId)
  if (!project) return new NextResponse('Not found', { status: 404 })

  const verdict = mayDo(project, 'export', {
    accountId: user.id,
    space: await spaceFor(supabase, project.tenantId),
    grant: await readGrant(supabase, xpId, user.id),
    operator: false,
  })
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 403 })
  }

  if (project.currentVersion === 0) {
    return NextResponse.json({ error: 'There is nothing saved to export yet' }, { status: 404 })
  }

  const version = await readXpVersion(supabase, xpId, project.currentVersion)
  if (!version) {
    return NextResponse.json({ error: 'That version could not be read' }, { status: 404 })
  }

  /**
   * The document comes out of the row, not out of the bucket.
   *
   * It is stored as `jsonb`, so it went in as a value rather than as bytes and
   * there is no original formatting to preserve — two spaces is what the editor
   * writes and what a person reading the file expects. Everything *else* comes
   * back byte-for-byte, which is the property the intake pipeline deliberately
   * protects by storing JSON assets verbatim rather than re-serialising them.
   */
  const entries: ZipEntry[] = [
    {
      path: 'document.xp.json',
      bytes: new TextEncoder().encode(`${JSON.stringify(version.document, null, 2)}\n`),
    },
  ]

  const admin = createAdminClient()

  for (const [path, entry] of Object.entries(version.manifest)) {
    // The document's own manifest entry is skipped: it is written above from
    // the row, and a folder with two of them is not a folder anybody can open.
    if (path === 'document.xp.json') continue

    const key = `${project.tenantId}/${entry.sha}.${path.slice(path.lastIndexOf('.') + 1)}`
    const { data, error } = await admin.storage.from('xp').download(key)

    /**
     * A missing blob fails the whole export rather than producing a folder with
     * a hole in it. Somebody who asked for their work and got nine of ten files
     * has something worse than an error: an archive they will not discover is
     * incomplete until they need the tenth.
     */
    if (error || !data) {
      return NextResponse.json(
        { error: `${path} could not be read, so the export was stopped rather than sent incomplete` },
        { status: 500 },
      )
    }

    entries.push({ path, bytes: new Uint8Array(await data.arrayBuffer()) })
  }

  const archive = zip(entries, new Date())

  return new NextResponse(archive as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(archive.length),
      'Content-Disposition': `attachment; filename="${downloadName(project.name)}"`,
      // A project's contents change with every save, and this is a snapshot of
      // one moment. Caching it would hand somebody yesterday's work.
      'Cache-Control': 'private, no-store',
    },
  })
}

/**
 * A filename somebody's operating system will accept.
 *
 * Not the project's name as typed. A name may contain a slash, a colon, a
 * quote or an emoji, and `Content-Disposition` is a header — a quote in it ends
 * the filename early and the rest becomes something the browser may or may not
 * ignore. So the name is reduced to the same alphabet paths use, which is
 * already the thing every reader of this archive can cope with.
 */
function downloadName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  return `${slug}.xp.zip`
}

async function spaceFor(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const { data } = await supabase
    .from('tenants_read_model')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!data) return null
  try {
    return await requireTenant(data.slug)
  } catch {
    // Not a member any more, or the space is gone. `mayDo` treats a null space
    // as "you are not in it" — and for an owner that still allows the export,
    // which is the entire point of this route.
    return null
  }
}
