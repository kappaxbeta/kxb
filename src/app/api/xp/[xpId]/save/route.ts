import { NextResponse } from 'next/server'
import { parseXp } from '@kxb/xp'
import { xpDecider } from '@/domain/xps/aggregate'
import { mayDo } from '@/domain/xps/access'
import { readGrant } from '@/domain/xps/grants'
import { readClaim } from '@/domain/xps/claims'
import { checkManifest, coverFor } from '@/domain/xps/manifest'
import { xpsProjection } from '@/domain/xps/projection'
import { findXpProject, heldShas } from '@/domain/xps/queries'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import { createClient, getUser } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'

/**
 * The save handshake.
 *
 * Called twice in the normal case, and that is the design rather than a
 * shortcoming. `docs/xp/backend.md` §9:
 *
 *   1. The editor hashes its folder in the browser and posts the manifest here.
 *   2. This answers with the hashes it does not hold.
 *   3. The editor posts exactly those to `/files`.
 *   4. It posts the manifest here again; nothing is missing; the version lands.
 *
 * When nothing changed but the document — the overwhelmingly common save — step
 * two comes back empty and the first call is the only call. A one-line edit to
 * a 40MB project moves two kilobytes, which is the difference between a save
 * people press and a save people avoid.
 *
 * ---------------------------------------------------------------------------
 * Why the version row is written before the event
 * ---------------------------------------------------------------------------
 * A crash between the two has to leave something harmless, and the two orders
 * are not equally harmless. Event first: `current_version` points at a version
 * that does not exist, and the project cannot be opened. Row first: a row
 * nothing points at, which is garbage a sweep collects and which no reader can
 * reach, because every reader asks for `current_version` or
 * `published_version` and neither moved.
 *
 * So the row goes first, at the version this request expects to claim, with
 * `on conflict do nothing`. A conflict means somebody else claimed it while we
 * were uploading — which is a genuine concurrent save, not an error to swallow,
 * and §12.7 already decided what to say about those: tell them, rather than
 * silently overwrite.
 */

export const maxDuration = 30

export async function POST(
  request: Request,
  { params }: { params: Promise<{ xpId: string }> },
) {
  const { xpId } = await params

  const user = await getUser()
  if (!user) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const project = await findXpProject(supabase, xpId)
  if (!project) return new NextResponse('Not found', { status: 404 })

  const space = await spaceFor(supabase, project.tenantId)
  const verdict = mayDo(project, 'edit', {
    accountId: user.id,
    space,
    grant: await readGrant(supabase, xpId, user.id),
    operator: false,
  })
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 403 })
  }

  /**
   * Somebody else has the editor open.
   *
   * §12.7: one at a time until there is real collaboration. This is the half
   * that makes the claim mean something — without it the claim is advice, and
   * two people who both ignore it are two people saving over each other.
   *
   * A stale claim is not a refusal. The whole point of an expiring claim is
   * that a closed laptop stops mattering after ninety seconds, so `live` is
   * computed against the server's clock rather than trusted from the row.
   *
   * And it is deliberately *not* the correctness guarantee. `expected_version`
   * below is still what makes a concurrent save fail rather than clobber; this
   * only means fewer people meet it.
   */
  const openBy = await readClaim(supabase, xpId)
  if (openBy && openBy.live && openBy.heldBy !== user.id) {
    return NextResponse.json(
      {
        error: 'Somebody else has this project open. It frees up on its own if they have gone.',
        heldUntil: openBy.expiresAt,
        conflict: true,
      },
      { status: 409 },
    )
  }

  let body: { document?: unknown; manifest?: unknown; base?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'That is not JSON' }, { status: 400 })
  }

  /**
   * --- what this edit was based on -----------------------------------------
   *
   * The claim above is bookkeeping and the version number below is a race
   * guard; neither of them answers the question this does. `expected` is
   * `currentVersion + 1`, read from the server's own row — so a save always
   * lands as the newest version no matter which version the person editing had
   * on screen, and "somebody else saved while I was in flight" is the only
   * conflict it can see.
   *
   * That leaves the gap the editor's `localStorage` draft drives straight
   * through, and it is not hypothetical: a draft survives a closed tab by
   * design, the claim expires after ninety seconds by design, and the editor
   * layers the draft over whatever the page loaded without comparing them. So a
   * laptop closed on v5 and reopened after a colleague saved v6 and v7 saves
   * v5's content as v8, with no error and nothing on screen — the failure
   * docs/xp/state.md §7.7 raised and page.tsx already names in its own comment
   * about opening on `current` rather than `published`.
   *
   * A `base` older than the current version is therefore the same situation as
   * a primary key conflict, found one step earlier, and it gets the same
   * answer: refuse and say so. Absent is treated as current — an older client
   * mid-deploy is not something to break, and this is a narrowing of what gets
   * through rather than a new requirement.
   */
  const base = typeof body.base === 'number' && Number.isInteger(body.base) ? body.base : null
  if (base !== null && base !== project.currentVersion) return savedElsewhere()

  // --- the document ---------------------------------------------------------
  //
  // `parseXp` is the boundary and it collects every problem rather than
  // throwing on the first, so a document with six typos reports six. Refusing
  // here rather than at load time is the whole point: a level that cannot run
  // should be refused at the moment somebody can still fix it.
  const parsed = parseXp(body.document)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'That document has problems', problems: parsed.problems },
      { status: 422 },
    )
  }

  // --- the manifest ---------------------------------------------------------
  const manifest = checkManifest(body.manifest)
  if (!manifest.ok) {
    return NextResponse.json(
      { error: 'That folder has problems', problems: manifest.problems },
      { status: 422 },
    )
  }

  const held = await heldShas(supabase, project.tenantId, manifest.shas)
  const missing = manifest.shas.filter((sha) => !held.has(sha))

  if (missing.length > 0) {
    // Not an error. This is step two, and the editor is expected to call again.
    return NextResponse.json({ saved: false, missing }, { status: 200 })
  }

  // --- claim the version ----------------------------------------------------
  const expected = project.currentVersion + 1

  const claim = await supabase
    .from('xp_versions')
    .insert({
      xp_id: xpId,
      version: expected,
      document: parsed.document as never,
      manifest: manifest.manifest as never,
      bytes: manifest.bytes,
      files: manifest.files,
      created_by: user.id,
    })
    .select('version')
    .maybeSingle()

  if (claim.error) {
    // 23505 is the primary key: somebody else already claimed this number.
    if (claim.error.code === '23505') return savedElsewhere()
    return NextResponse.json({ error: 'Could not write that version' }, { status: 500 })
  }

  // --- and record that it happened ------------------------------------------
  const appended = await executeCommand({
    supabase,
    decider: xpDecider,
    tenantId: project.tenantId,
    streamId: xpId,
    command: {
      type: 'SaveXpVersion',
      actorId: user.id,
      bytes: manifest.bytes,
      files: manifest.files,
      cover: coverFor(manifest.manifest, coverFrom(parsed.document)),
    },
  })

  const event = appended.find((e) => e.type === 'XpVersionSaved')

  /**
   * The decider picked a different number than we claimed, which means the
   * stream moved between reading the row and appending. Our claimed row is
   * orphaned — nothing points at it — and the honest answer is the same one a
   * primary key conflict gets, because it is the same situation seen a moment
   * later.
   */
  if (!event || event.data.version !== expected) {
    await supabase.from('xp_versions').delete().eq('xp_id', xpId).eq('version', expected)
    return savedElsewhere()
  }

  await runProjection(supabase, xpsProjection, project.tenantId)

  return NextResponse.json({ saved: true, version: event.data.version })
}

/**
 * §12.7's answer, in one place.
 *
 * Last-save-wins with an honest warning was the decision, and this is the
 * warning half: the second saver is told rather than silently overwriting. A
 * shared cursor in a 3D editor is its own project and is not a thing to add to
 * a save endpoint.
 */
function savedElsewhere(): NextResponse {
  return NextResponse.json(
    {
      error: 'Somebody else saved this project while you were working. Reload before saving again.',
      conflict: true,
    },
    { status: 409 },
  )
}

/** `meta.cover`, if the document carries one. It overrides filename order. */
function coverFrom(document: unknown): string | undefined {
  if (document === null || typeof document !== 'object') return undefined
  const meta = (document as { meta?: unknown }).meta
  if (meta === null || typeof meta !== 'object') return undefined
  const cover = (meta as { cover?: unknown }).cover
  return typeof cover === 'string' ? cover : undefined
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
    return null
  }
}
