'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { findScene } from '@/domain/scenes/queries'
import { blocksFromWorld, SET_BLOCK_CAP } from '@/domain/scenes/world-import'
import type { BlockSpec } from '@/domain/studio/scene'
import { findWorld } from '@/domain/worlds/queries'
import { encodeShot, parseShot } from '@/domain/studio/shot'
import type { Client } from '@/es/store'
import { requireBackofficeSection } from '@/lib/backoffice'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { hasRole, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Saving, renaming, forking and deleting a scene.
 *
 * Modelled on `@/domain/worlds/actions` down to the shape of `actorFor`, and
 * for the same reason: a scene is published either from the backoffice - by the
 * kxb.team team, with no workspace behind it - or by a space, from its own
 * studio. Same document, same row; what differs is who may write it, and the
 * two authorities have nothing in common, so the branch happens once at the top
 * and everything below it is the same code.
 *
 * Nothing here trusts a client-supplied origin: it is decided by which branch
 * the caller got through, and the check constraint in the migration keeps it
 * honest against the tenant column.
 *
 * ---------------------------------------------------------------------------
 * The document is never trusted
 * ---------------------------------------------------------------------------
 * Every path runs the incoming JSON through `parseShot` - the studio's own
 * parser, which clamps every number, drops unknown avatars and models, and
 * turns a file that is not a shot at all into the default one. A server action
 * is a public endpoint, and the thing on the other end of these model ids is a
 * `fetch` in somebody's browser.
 */

export type SceneResult = { ok: true; id: string } | { ok: false; error: string }

/** Where a scene is being saved from. Decided by the caller's surface, not by input. */
export type SceneScope = { kind: 'platform' } | { kind: 'space'; slug: string }

export interface SceneDetails {
  name: string
  blurb?: string
  visibility?: 'private' | 'public'
}

const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the scene a name')
    .max(60, 'Keep the name under 60 characters'),
  blurb: z.string().trim().max(280, 'Keep the description under 280 characters').optional(),
  visibility: z.enum(['private', 'public']).optional(),
})

const idSchema = z.uuid()

interface Actor {
  supabase: Client
  userId: string
  /** The actor's email, for the backoffice audit log on platform writes. */
  userEmail: string | null
  origin: 'platform' | 'space'
  tenantId: string | null
  /** Present for a space, for the revalidate paths. */
  slug: string | null
}

type Guarded = { ok: true; actor: Actor } | { ok: false; error: string }

/**
 * Who is saving, and may they.
 *
 * The platform branch calls `requireBackofficeSection`, which 404s a non-admin
 * rather than returning a refusal - the same posture the rest of /ovaloffice
 * takes.
 */
async function actorFor(scope: SceneScope): Promise<Guarded> {
  if (scope.kind === 'platform') {
    const { supabase, user } = await requireBackofficeSection('scenes', 'write')
    return {
      ok: true,
      actor: {
        supabase,
        userId: user.id,
        userEmail: user.email ?? null,
        origin: 'platform',
        tenantId: null,
        slug: null,
      },
    }
  }

  const context = await requireTenant(scope.slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // Hiding the button hides nothing - a server action is an endpoint - so the
  // check is here as well as in the policy.
  if (!hasRole(context, ['owner', 'admin', 'member'])) {
    return { ok: false, error: 'You cannot save scenes in this space' }
  }

  return {
    ok: true,
    actor: {
      supabase: context.supabase,
      userId: context.user.id,
      userEmail: context.user.email ?? null,
      origin: 'space',
      tenantId: context.tenant.id,
      slug: scope.slug,
    },
  }
}

/**
 * What a document contributes to the row beside itself.
 *
 * The document goes in as an *object*, not as the text it arrived as. The
 * column is `jsonb`, and handing PostgREST a string would store a jsonb string -
 * a document whose whole content is one long quoted blob, which reads back as a
 * string and parses into the default shot. The studio sends its own encoding
 * because that is what it has; the database gets the parsed thing.
 *
 * `seconds` and `cast_size` are copied out so a card can describe a scene
 * without parsing a document it did not fetch.
 */
function measure(encoded: string): { document: Json; seconds: number; cast_size: number } {
  const shot = parseShot(JSON.parse(decodeDocument(encoded)))
  return {
    // From the parsed shot rather than from what arrived, so what is in the row
    // is exactly what the parser admitted.
    document: JSON.parse(JSON.stringify(shot)) as Json,
    seconds: Math.round(shot.duration * 100) / 100,
    cast_size: shot.cast.length,
  }
}

/**
 * The studio's own encoding, back to text.
 *
 * A scene travels as the base64url in its link, because that is the string the
 * editor already has in the address bar and the one somebody pastes. Anything
 * that is not that is handed on as-is and fails at `JSON.parse`, which
 * `parseShot` would have turned into a default shot anyway - so the failure is
 * caught by the caller below rather than saved as an empty scene.
 */
function decodeDocument(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8')
}

function refreshLists(actor: Actor): void {
  if (actor.slug) revalidatePath(`/t/${actor.slug}/scenes`)
  else revalidatePath('/ovaloffice/scenes')
}

/** Save a scene into the catalogue for the first time. */
export async function publishScene(input: {
  scope: SceneScope
  /** The shot, as the base64url the studio keeps in its address bar. */
  document: string
  details: SceneDetails
  forkedFrom?: string | null
}): Promise<SceneResult> {
  const parsed = detailsSchema.safeParse(input.details)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' }
  }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  let measured: ReturnType<typeof measure>
  try {
    measured = measure(input.document)
  } catch {
    return { ok: false, error: 'That does not look like a scene' }
  }

  let forkedFrom: string | null = null
  if (input.forkedFrom && idSchema.safeParse(input.forkedFrom).success) {
    const parent = await findScene(actor.supabase, input.forkedFrom)
    forkedFrom = parent ? parent.id : null
  }

  const { data, error } = await actor.supabase
    .from('published_scenes')
    .insert({
      name: parsed.data.name,
      blurb: parsed.data.blurb || null,
      visibility: parsed.data.visibility ?? 'private',
      origin: actor.origin,
      tenant_id: actor.tenantId,
      author_id: actor.userId,
      forked_from: forkedFrom,
      ...measured,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not save that scene: ${error.message}` }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'scenes',
      action: 'scene.publish',
      summary: `Published scene "${parsed.data.name}"`,
      detail: { sceneId: data.id, name: parsed.data.name, visibility: parsed.data.visibility ?? 'private' },
    })
  }

  refreshLists(actor)
  return { ok: true, id: data.id }
}

/**
 * Save over a scene that already exists.
 *
 * Who may is decided by the update policy - the author, the owning space's
 * leadership, or a backoffice admin - rather than re-derived here. A caller who
 * may not is indistinguishable from one editing a scene that is not there,
 * which is what `maybeSingle()` returning nothing means below.
 */
export async function updateScene(input: {
  scope: SceneScope
  id: string
  document?: string
  details: SceneDetails
}): Promise<SceneResult> {
  const parsed = detailsSchema.safeParse(input.details)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' }
  }
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such scene' }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  let document: ReturnType<typeof measure> | null = null
  if (input.document !== undefined) {
    try {
      document = measure(input.document)
    } catch {
      return { ok: false, error: 'That does not look like a scene' }
    }
  }

  const { data, error } = await actor.supabase
    .from('published_scenes')
    .update({
      name: parsed.data.name,
      blurb: parsed.data.blurb || null,
      visibility: parsed.data.visibility ?? 'private',
      updated_at: new Date().toISOString(),
      ...(document ?? {}),
    })
    .eq('id', input.id)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: `Could not save that scene: ${error.message}` }
  /*
    Nothing was updated, and the two reasons for that are indistinguishable from
    here on purpose - the update policy is a row filter, so "somebody deleted it"
    and "you may not write it" both arrive as no rows. What is *not* acceptable
    is answering "No such scene" to somebody who is looking at it: that reads as
    the studio having lost the document, which is the one thing that has not
    happened. Both readings, and the way out of either, in one sentence.
  */
  if (!data) {
    return {
      ok: false,
      error: 'That scene is gone, or it is not yours to change. Save as a copy to keep this.',
    }
  }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'scenes',
      action: 'scene.update',
      summary: `Edited scene "${parsed.data.name}"`,
      detail: { sceneId: input.id, name: parsed.data.name, visibility: parsed.data.visibility ?? 'private' },
    })
  }

  refreshLists(actor)
  return { ok: true, id: data.id }
}

export async function deleteScene(input: { scope: SceneScope; id: string }): Promise<SceneResult> {
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such scene' }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  const { error } = await actor.supabase.from('published_scenes').delete().eq('id', input.id)
  if (error) return { ok: false, error: `Could not delete that scene: ${error.message}` }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'scenes',
      action: 'scene.delete',
      summary: `Deleted scene ${input.id}`,
      detail: { sceneId: input.id },
    })
  }

  refreshLists(actor)
  return { ok: true, id: input.id }
}

/**
 * A built world, as the blocks a scene that references it should draw.
 *
 * ---------------------------------------------------------------------------
 * Why this is not guarded, and why that is not a hole
 * ---------------------------------------------------------------------------
 * Every other action in this file starts with `actorFor`, because every other
 * one *writes*. This one reads, through the caller's own session client, so the
 * row-level policy in the published-worlds migration is the whole answer: a
 * public world is public - the discovery page lists them to strangers and the
 * lounge walks people around them - and a private one is invisible here for
 * exactly the same reason it is invisible everywhere else.
 *
 * Guarding it would be worse than pointless. A saved scene can be watched at
 * `/s/<id>` by somebody with no account, and its set has to arrive for the
 * scene to be the scene. An admin check here would mean a public link that
 * renders the world for its author and an empty stage for everybody they sent
 * it to.
 *
 * ---------------------------------------------------------------------------
 * Which blocks
 * ---------------------------------------------------------------------------
 * `blocksFromWorld` is `toBlocks` - the same conversion a space uses to walk
 * around somebody's world - under the set's own cap. The furniture that cannot
 * become a block, and the overflow above the cap, travel back as counts: a set
 * that is quietly part of the world is worse than one you were told about.
 */
export async function worldSet(worldId: string): Promise<
  | { ok: true; name: string; blocks: BlockSpec[]; props: number; dropped: number }
  | { ok: false; error: string }
> {
  if (!idSchema.safeParse(worldId).success) return { ok: false, error: 'No such world' }

  const supabase = await createClient()
  const world = await findWorld(supabase as unknown as Client, worldId)
  if (!world) return { ok: false, error: 'That world is not here' }

  const imported = blocksFromWorld(world.document, SET_BLOCK_CAP)
  if (imported.blocks.length === 0) {
    return { ok: false, error: `${world.name} is all furniture — nothing in it is a block` }
  }

  return { ok: true, name: world.name, ...imported }
}

/**
 * A scene's link, for opening it in the studio.
 *
 * Round-tripped through the parser rather than handed back as stored, so a row
 * written before a model was retired opens as the shot the studio can actually
 * draw - the same guarantee `findScene` gives, expressed as a URL.
 */
export async function sceneLink(supabase: Client, id: string): Promise<string | null> {
  const scene = await findScene(supabase, id)
  return scene ? `?v=${encodeShot(scene.document)}` : null
}
