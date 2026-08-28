'use server'

import { revalidatePath } from 'next/cache'
import { resolveFeatures } from '@/domain/flags/queries'
import { renderRequestSchema } from '@/domain/renders/jobs'
import { findScene } from '@/domain/scenes/queries'
import { parseShot } from '@/domain/studio/shot'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import type { Client } from '@/es/store'
import { requireBackofficeSection } from '@/lib/backoffice'
import type { Json } from '@/lib/supabase/database.types'
import { requireTenant } from '@/lib/tenant'

/**
 * Registering a render.
 *
 * The whole of what this file does is write a row, and that is the point: the
 * request is the job, and the job exists before anything is drawn. Nothing here
 * launches a browser, waits for a picture, or knows how one is made. A caller
 * gets an id back immediately and asks about it later.
 *
 * Modelled on `@/domain/scenes/actions` down to the shape of `actorFor`, and
 * for the same reason: a render is requested either from the backoffice, by the
 * kxb.team team with no workspace behind it, or by a space from its own
 * surfaces. Same table, same row; what differs is who may write it.
 *
 * Not exported as the only way in. `POST /api/renders` is the same thing over
 * HTTP for callers that are not a React form - a script, a job, a service - and
 * both funnel through `register` below so there is one authorization story.
 */

export type RenderResult = { ok: true; id: string } | { ok: false; error: string }

/** Where the render is being asked for from. Decided by the surface, not by input. */
export type RenderScope = { kind: 'platform' } | { kind: 'space'; slug: string }

interface Actor {
  supabase: Client
  userId: string
  /** The actor's email, for the backoffice audit log on platform requests. */
  userEmail: string | null
  tenantId: string | null
}

type Guarded = { ok: true; actor: Actor } | { ok: false; error: string }

/**
 * Who is asking, may they, and is the feature even on.
 *
 * The flag is checked here rather than at each call site, because this is the
 * chokepoint every path goes through and a flag enforced in four places is a
 * flag enforced in three. `renders` gates *accepting work* - see the note in
 * keys.ts - so this is exactly the right altitude for it: the worker below has
 * no idea the flag exists and will happily drain a queue that has stopped
 * accepting new rows.
 */
async function actorFor(scope: RenderScope): Promise<Guarded> {
  if (scope.kind === 'space') {
    const context = await requireTenant(scope.slug)
    if (!context.features.renders) {
      return { ok: false, error: 'Renders are not enabled for this space' }
    }
    return {
      ok: true,
      actor: {
        supabase: context.supabase,
        userId: context.user.id,
        userEmail: context.user.email ?? null,
        tenantId: context.tenant.id,
      },
    }
  }

  // 404s a non-admin rather than refusing, the same posture as the rest of
  // /ovaloffice. A refusal would confirm the surface exists.
  const { supabase, user } = await requireBackofficeSection('renders', 'write')
  const features = await resolveFeatures(supabase)
  if (!features.renders) {
    return { ok: false, error: 'Renders are switched off' }
  }
  return {
    ok: true,
    actor: { supabase, userId: user.id, userEmail: user.email ?? null, tenantId: null },
  }
}

/**
 * Register a render, and return the id it will be found under.
 *
 * The document is run through `parseShot` before it is stored - the studio's
 * own parser, which clamps every number and drops any avatar or block model it
 * does not recognise. A server action is a public endpoint, and the far end of
 * an unrecognised model id is a `fetch` in the renderer that never resolves. It
 * is parsed again in the browser, and that is not belt-and-braces: the row can
 * outlive a pack removal, so the document that was valid when it was queued may
 * not be by the time it is drawn.
 *
 * Width and height fall back to the document's own, which is what almost every
 * caller wants: a shot knows what shape it is.
 */
export async function requestRender(
  input: unknown,
  scope: RenderScope = { kind: 'platform' },
): Promise<RenderResult> {
  const parsed = renderRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad render request' }
  }

  const guard = await actorFor(scope)
  if (!guard.ok) return guard
  const { supabase, userId, userEmail, tenantId } = guard.actor

  const shot = parseShot(parsed.data.document)

  const { data, error } = await supabase
    .from('render_jobs')
    .insert({
      document: shot as unknown as Json,
      at_seconds: parsed.data.at ?? 0,
      width: parsed.data.width ?? shot.width,
      height: parsed.data.height ?? shot.height,
      source: parsed.data.source,
      scene_id: parsed.data.sceneId ?? null,
      tenant_id: tenantId,
      requested_by: userId,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not register the render: ${error.message}` }

  // Only the platform surface is a backoffice action; a space registers renders
  // under `requireTenant`, which is not the backoffice and not audited here.
  if (tenantId === null) {
    await recordBackofficeAction({
      actor: { id: userId, email: userEmail },
      section: 'renders',
      action: 'render.request',
      summary: `Requested a render (${parsed.data.source})`,
      detail: { renderId: data.id, source: parsed.data.source, sceneId: parsed.data.sceneId ?? null },
    })
  }

  revalidatePath('/ovaloffice/renders')
  return { ok: true, id: data.id }
}

/**
 * Register a render of a scene that is already saved.
 *
 * The one convenience over `requestRender`, and it earns its place because it
 * is the only path where the caller genuinely should not send a document: the
 * document is already a row, and a client that posted its own copy could post a
 * different one and have it recorded against that scene's id.
 *
 * The read is with the caller's own session, so the row level security on
 * `published_scenes` decides whether this scene exists for them at all - which
 * is the same answer they would get from opening it in the studio.
 */
export async function requestSceneRender(
  sceneId: string,
  size?: { width?: number; height?: number },
): Promise<RenderResult> {
  const guard = await actorFor({ kind: 'platform' })
  if (!guard.ok) return guard

  const scene = await findScene(guard.actor.supabase, sceneId)
  if (!scene) return { ok: false, error: 'No such scene' }

  return requestRender(
    {
      document: scene.document,
      source: 'catalogue',
      sceneId: scene.id,
      width: size?.width,
      height: size?.height,
    },
    { kind: 'platform' },
  )
}
