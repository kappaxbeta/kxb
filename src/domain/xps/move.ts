import 'server-only'
import { randomUUID } from 'node:crypto'
import { xpDecider } from '@/domain/xps/aggregate'
import { coverFor } from '@/domain/xps/manifest'
import { xpsProjection } from '@/domain/xps/projection'
import { readXpVersion, type XpProjectRow } from '@/domain/xps/queries'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { SCAN_STATUS_ON_ACCEPT } from '@/lib/xp-intake'

/**
 * Moving a project to another space.
 *
 * ---------------------------------------------------------------------------
 * A move is a copy, and the schema is why
 * ---------------------------------------------------------------------------
 * `events.tenant_id` is `not null` and the log is append-only, so a project
 * cannot change space by changing a field. There is no `XpMoved` that rewrites
 * anything. What happens instead is a **new stream in the target tenant** whose
 * `XpCreated` names `movedFrom`, and `XpMovedOut` closing the original — two
 * streams, one project, linked in both directions.
 *
 * The bytes have to move too, because `xp_files` is keyed `(tenant_id, sha)`
 * and the object key is `<tenantId>/<sha>.<ext>`. That scoping is deliberate
 * (docs/xp/backend.md §6.1) and this is the price of it: a move copies every
 * blob under the new prefix. Same-space copying, by contrast, moves nothing at
 * all — see `copyXp`.
 *
 * ---------------------------------------------------------------------------
 * What is left behind, and why that is right
 * ---------------------------------------------------------------------------
 * The source keeps its stream, its versions and its blobs. Nothing is deleted,
 * because deleting the origin of a move is how a half-finished move becomes
 * data loss: if the copy fails after the delete, the project is nowhere. The
 * old blobs are collected by the retention sweep §12.6 describes, and until
 * then both spaces are briefly billed for the same bytes — which that section
 * accepts by name.
 */

export type MoveOutcome =
  | { ok: true; xpId: string }
  | { ok: false; error: string }

export async function moveProject(
  supabase: Client,
  project: XpProjectRow,
  target: { id: string; slug: string },
  actorId: string,
): Promise<MoveOutcome> {
  if (target.id === project.tenantId) {
    return { ok: false, error: 'That project is already in this space' }
  }
  if (project.currentVersion === 0) {
    return { ok: false, error: 'There is nothing saved to move yet' }
  }

  const source = await readXpVersion(supabase, project.id, project.currentVersion)
  if (!source) return { ok: false, error: 'That version could not be read' }

  const admin = createAdminClient()

  /**
   * The bytes first, before anything says the project is in the new space.
   *
   * Order matters for the same reason it does in the save handshake: a failure
   * here leaves blobs nobody references, which a sweep collects, while a
   * failure the other way round leaves a project whose files are not where its
   * manifest says they are. Garbage is recoverable; a broken reference is what
   * somebody opens.
   */
  for (const [path, entry] of Object.entries(source.manifest)) {
    const ext = path.slice(path.lastIndexOf('.') + 1)
    const from = `${project.tenantId}/${entry.sha}.${ext}`
    const to = `${target.id}/${entry.sha}.${ext}`

    const { data, error } = await admin.storage.from('xp').download(from)
    if (error || !data) {
      return { ok: false, error: `${path} could not be read, so nothing was moved` }
    }

    const uploaded = await admin.storage
      .from('xp')
      .upload(to, await data.arrayBuffer(), { contentType: entry.mime, upsert: true })
    if (uploaded.error) {
      return { ok: false, error: `${path} could not be written to the new space` }
    }

    const { error: rowError } = await admin.from('xp_files').upsert(
      {
        tenant_id: target.id,
        sha: entry.sha,
        ext,
        mime: entry.mime,
        bytes: entry.bytes,
        // The bytes already passed intake once, in the space they came from,
        // and they are the same bytes - the hash says so. Re-running the
        // pipeline would be honest and would also mean a move failing because
        // a cap tightened since the file was accepted.
        scan_status: SCAN_STATUS_ON_ACCEPT,
      },
      { onConflict: 'tenant_id,sha' },
    )
    if (rowError) return { ok: false, error: `${path} could not be recorded in the new space` }
  }

  // --- the new stream --------------------------------------------------------
  const movedId = randomUUID()

  try {
    await executeCommand({
      supabase: admin,
      decider: xpDecider,
      tenantId: target.id,
      streamId: movedId,
      command: {
        type: 'CreateXp',
        actorId,
        name: project.name,
        movedFrom: project.id,
      },
    })
    await runProjection(admin, xpsProjection, target.id)

    const { error } = await admin.from('xp_versions').insert({
      xp_id: movedId,
      version: 1,
      document: source.document as never,
      manifest: source.manifest as never,
      bytes: source.bytes,
      files: source.files,
      created_by: actorId,
    })
    if (error) return { ok: false, error: 'The project could not be written to the new space' }

    await executeCommand({
      supabase: admin,
      decider: xpDecider,
      tenantId: target.id,
      streamId: movedId,
      command: {
        type: 'SaveXpVersion',
        actorId,
        bytes: source.bytes,
        files: source.files,
        cover: coverFor(source.manifest, project.coverPath ?? undefined),
      },
    })
    await runProjection(admin, xpsProjection, target.id)

    /**
     * And only now is the original closed.
     *
     * Last, so that every failure above leaves the project exactly where it
     * was. A `XpMovedOut` written first would mean a project that had left one
     * space without arriving in another, which is the one outcome worth
     * engineering the order around.
     */
    await executeCommand({
      supabase: admin,
      decider: xpDecider,
      tenantId: project.tenantId,
      streamId: project.id,
      command: { type: 'MoveXpOut', actorId, to: movedId },
    })
    await runProjection(admin, xpsProjection, project.tenantId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The move did not finish'
    return { ok: false, error: message }
  }

  return { ok: true, xpId: movedId }
}
