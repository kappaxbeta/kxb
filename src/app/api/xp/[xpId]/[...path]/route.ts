import { NextResponse } from 'next/server'
import { findXpProject, readXpVersion } from '@/domain/xps/queries'
import { checkPath } from '@/lib/xp-formats'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Serve one file out of a project's folder.
 *
 * ---------------------------------------------------------------------------
 * Two lookups, and the first one is the authorization
 * ---------------------------------------------------------------------------
 * The project row is read with the **caller's own session**, so RLS decides
 * whether it exists for them: published is visible to anybody including signed
 * out, a member of the home space sees their space's work, the owner sees
 * theirs wherever it lives, and everybody else gets nothing and therefore a
 * 404. That is the same shape `/api/uploads/[slug]` uses and the same reason -
 * the row is the authorization record and the route is the only door.
 *
 * Only then does the service-role client touch the bucket. Nothing here trusts
 * a path from the URL to address an object: the path is looked up *in the
 * manifest*, which maps it to a content hash this project's version actually
 * declared. A path that is not in the manifest is a 404 before any key is
 * built, which is a stronger property than sanitising one - there is no
 * traversal to defend against when the caller's string is a map key rather than
 * part of a key.
 *
 * ---------------------------------------------------------------------------
 * Which version gets served, and why it is not "the latest"
 * ---------------------------------------------------------------------------
 * `published_version` for anybody who is only here because it is published;
 * `current_version` for somebody who may see the draft. Never "the newest",
 * because the newest is the draft and the draft is what the store must not
 * serve - docs/xp/backend.md §7.3. This is the second place that rule is
 * enforced (the first is the aggregate keeping the two numbers apart) and it is
 * the place that matters, because this is what a browser actually fetches.
 *
 * A route rather than a signed URL, for the reason the uploads route gives and
 * one more: an XP taken down for review has to stop serving immediately, and a
 * signed URL minted an hour ago will not.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ xpId: string; path: string[] }> },
) {
  const { xpId, path: segments } = await params
  const path = segments.join('/')

  // Cheap and total: if this is not a name a folder may contain, it cannot be
  // in any manifest, so there is nothing to look up.
  if (!checkPath(path).ok) return notFound()

  const supabase = await createClient()

  const project = await findXpProject(supabase, xpId)
  if (!project) return notFound()

  /**
   * `removed` and `archived` stop serving; `unlisted` does not.
   *
   * An unlisted project is one whose page says it was taken down, and that page
   * still shows its cover. Cutting the bytes as well would turn a considered
   * "this is gone" into a broken image beside the sentence explaining it.
   */
  if (project.state === 'removed' || project.state === 'archived') return notFound()

  const version = versionToServe(project)
  if (version === null) return notFound()

  const saved = await readXpVersion(supabase, xpId, version)
  if (!saved) return notFound()

  const entry = saved.manifest[path]
  if (!entry) return notFound()

  // The service-role client, and only after everything above agreed. The bucket
  // has no policies on `storage.objects` at all, so this is the only way to
  // reach an object and this route is the only place it happens.
  const admin = createAdminClient()

  const { data: file, error } = await admin.storage
    .from('xp')
    .download(`${project.tenantId}/${entry.sha}.${extensionOf(path)}`)

  if (error || !file) return notFound()

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      'Content-Type': entry.mime,
      // Content-addressed, so a hash cannot come to mean different bytes and
      // there is no invalidation path anywhere in the system. The URL contains
      // a version-resolved path rather than the hash, so this is safe only
      // because a *published* version is immutable - which is why a draft is
      // served with no cache at all below.
      'Cache-Control':
        project.state === 'published'
          ? 'public, max-age=31536000, immutable'
          : 'private, no-store',
      'Content-Length': String(entry.bytes),
      // The bytes went through `xp-intake.ts`, which proved they are the type
      // this says. Sniffing is still switched off: a browser that guesses is a
      // browser that can be persuaded to guess "html".
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * A published project serves what was approved; a draft serves what was saved.
 *
 * Written as a function rather than a ternary at the call site because the
 * wrong answer here is the one bug in this route that would not look like a
 * bug: serving `current_version` to everybody works perfectly, right up until
 * somebody's unreviewed save is on the public store.
 */
function versionToServe(project: {
  state: string
  currentVersion: number
  publishedVersion: number | null
}): number | null {
  if (project.state === 'published' || project.state === 'unlisted') {
    return project.publishedVersion
  }
  return project.currentVersion > 0 ? project.currentVersion : null
}

function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1)
}

/**
 * One answer for "no such file", "not yours" and "taken down".
 *
 * Same posture as the rest of the product: a 403 confirms the thing exists,
 * which is a fact worth not confirming to somebody probing for it.
 */
function notFound(): NextResponse {
  return new NextResponse('Not found', { status: 404 })
}
