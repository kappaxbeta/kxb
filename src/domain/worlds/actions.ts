'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { battlefieldDecider } from '@/domain/battlefields/aggregate'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { loungeGoalDecider } from '@/domain/lounge/goal-aggregate'
import { listGoals } from '@/domain/lounge/goal-queries'
import { deserialiseWorld, serialiseWorld } from '@/domain/builder/world'
import { clearWorld, MAX_COPY_BLOCKS, writeBlocks } from '@/domain/lounge/copy'
import { findRoom } from '@/domain/rooms/queries'
import { countBlockable, toBlocks } from '@/domain/worlds/blocks'
import { findWorld, listPublicWorlds, recordWorldUse } from '@/domain/worlds/queries'
import { reportReason } from '@/domain/worlds/reports'
import { MAX_WORLD_TAGS, normaliseTags } from '@/domain/worlds/tags'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { requireUser } from '@/lib/auth'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'
import type { Json } from '@/lib/supabase/database.types'
import { hasRole, requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Publishing, editing, forking and using a world.
 *
 * ---------------------------------------------------------------------------
 * Two publishers, one table
 * ---------------------------------------------------------------------------
 * A world is published either from the backoffice - by the kxb.team team, with
 * no workspace behind it - or by a space, from its own builder. They are the
 * same document and the same row; what differs is who is allowed to write it,
 * and that check cannot be one function because the two authorities have
 * nothing in common: one is `is_backoffice_admin()` on a verified email, the
 * other is membership of a tenant. So `actorFor` branches once, at the top, and
 * everything below it is the same code.
 *
 * The row's `origin` column is what the discovery page reads to say where a
 * world came from, and the check constraint in the migration is what keeps it
 * honest against the tenant column. Nothing here trusts a client-supplied
 * origin: it is decided by which branch the caller got through.
 *
 * ---------------------------------------------------------------------------
 * The document is never trusted
 * ---------------------------------------------------------------------------
 * Every path runs the incoming JSON through `deserialiseWorld`, which is the
 * builder's own parser: unknown models are dropped, numbers are clamped, and a
 * file that is not a world at all becomes the default one. A server action is a
 * public endpoint, and the thing on the other end of these model ids is a
 * `fetch` in somebody's browser.
 */

export type WorldResult = { ok: true; id: string } | { ok: false; error: string }

/** Where a world is being published from. Decided by the caller's surface, not by input. */
export type WorldScope = { kind: 'platform' } | { kind: 'space'; slug: string }

export interface WorldDetails {
  name: string
  blurb?: string
  tags?: string[]
  visibility?: 'private' | 'public'
  /**
   * A still of the world, as a data URL, shot from the editor's own canvas.
   *
   * Optional in both directions: a caller with no canvas sends nothing and the
   * card draws a placeholder, and a save that omits it leaves whatever picture
   * is already there rather than blanking it. Undefined means "leave it", null
   * means "there is no picture" - which is why this is not just `string`.
   */
  poster?: string | null
}

const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the world a name')
    .max(60, 'Keep the name under 60 characters'),
  blurb: z.string().trim().max(200, 'Keep the description under 200 characters').optional(),
  tags: z.array(z.string()).max(MAX_WORLD_TAGS, `Pick at most ${MAX_WORLD_TAGS} tags`).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  /**
   * Checked for being a JPEG data URL of a sane size, and nothing else.
   *
   * This ends up in an `<img src>` on a public page, so the shape matters: a
   * `data:text/html` URL in that attribute is inert in every browser, but the
   * column is also read by other things, and "the only thing that can be here
   * is a JPEG" is a much easier property to keep than "everything that reads
   * it treats it as untrusted". The length cap matches the check constraint.
   */
  poster: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'That is not a picture')
    .max(400_000, 'That picture is too big')
    .nullable()
    .optional(),
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
 * Who is publishing, and may they.
 *
 * The platform branch calls `requireBackofficeSection`, which 404s a non-admin
 * rather than returning a refusal - the same posture the rest of /ovaloffice
 * takes, and the reason this function can return a plain result for the space
 * branch without the two disagreeing about what a refusal looks like.
 */
async function actorFor(scope: WorldScope): Promise<Guarded> {
  if (scope.kind === 'platform') {
    const { supabase, user } = await requireBackofficeSection('worlds', 'write')
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
  requireFeature(context, 'worlds')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // Building is a member's job; publishing under the space's name is the
  // leadership's. Hiding the button hides nothing - a server action is an
  // endpoint - so the check is here as well as in the policy.
  if (!hasRole(context, ['owner', 'admin', 'member'])) {
    return { ok: false, error: 'You cannot publish worlds in this space' }
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
 * column is `jsonb`, and handing PostgREST a string would store a jsonb string
 * - a document whose whole content is one long quoted blob, which reads back as
 * a string and parses into the default world. The editor sends text because
 * that is what it has; the database gets the parsed thing.
 */
function measure(document: string): {
  document: Json
  placements: number
  blocks: number
} {
  const world = deserialiseWorld(document)
  return {
    // From the parsed world rather than from what arrived, so what is in the
    // row is exactly what the parser admitted.
    document: JSON.parse(serialiseWorld(world)) as Json,
    placements: world.placements.length,
    blocks: countBlockable(world),
  }
}

/**
 * The lists a change to one world is visible in.
 *
 * The catalogue always, and the space's own list when there is a space. The
 * backoffice has no list of its own to refresh - a platform world is published
 * from the builder and read back from /worlds like everybody else's.
 */
function refreshLists(actor: Actor): void {
  revalidatePath('/worlds')
  if (actor.slug) revalidatePath(`/t/${actor.slug}/worlds`)
}

/**
 * Save a world into the catalogue for the first time.
 *
 * `forkedFrom` is attribution, not permission: it is recorded when the editor
 * was opened on somebody else's world, and it is checked only for being a world
 * this caller can see - a fork of a world you cannot open is a claim about a
 * row you should not know exists.
 */
export async function publishWorld(input: {
  scope: WorldScope
  document: string
  details: WorldDetails
  forkedFrom?: string | null
}): Promise<WorldResult> {
  const parsed = detailsSchema.safeParse(input.details)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' }
  }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  const measured = measure(input.document)
  if (measured.placements === 0) {
    return { ok: false, error: 'There is nothing in this world to publish yet' }
  }

  let forkedFrom: string | null = null
  if (input.forkedFrom && idSchema.safeParse(input.forkedFrom).success) {
    const parent = await findWorld(actor.supabase, input.forkedFrom)
    forkedFrom = parent ? parent.id : null
  }

  const { data, error } = await actor.supabase
    .from('published_worlds')
    .insert({
      name: parsed.data.name,
      blurb: parsed.data.blurb || null,
      tags: normaliseTags(parsed.data.tags),
      visibility: parsed.data.visibility ?? 'private',
      origin: actor.origin,
      tenant_id: actor.tenantId,
      author_id: actor.userId,
      forked_from: forkedFrom,
      poster: parsed.data.poster ?? null,
      ...measured,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not publish that world: ${error.message}` }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'worlds',
      action: 'world.publish',
      summary: `Published world "${parsed.data.name}"`,
      detail: { worldId: data.id, name: parsed.data.name, visibility: parsed.data.visibility ?? 'private' },
    })
  }

  refreshLists(actor)
  return { ok: true, id: data.id }
}

/**
 * Save over a world that already exists.
 *
 * Who may is decided by the update policy - the author, the owning space's
 * leadership, or a backoffice admin - rather than re-derived here. A caller who
 * may not is indistinguishable from one editing a world that is not there,
 * which is what `maybeSingle()` returning nothing means below.
 *
 * The document is optional: retagging a world from a list page should not
 * require having it open in the editor.
 */
export async function saveWorld(input: {
  scope: WorldScope
  id: string
  document?: string
  details: WorldDetails
}): Promise<WorldResult> {
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such world' }

  const parsed = detailsSchema.safeParse(input.details)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' }
  }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  const patch: {
    name: string
    blurb: string | null
    tags: string[]
    visibility: string
    updated_at: string
    poster?: string | null
    document?: Json
    placements?: number
    blocks?: number
  } = {
    name: parsed.data.name,
    blurb: parsed.data.blurb || null,
    tags: normaliseTags(parsed.data.tags),
    visibility: parsed.data.visibility ?? 'private',
    updated_at: new Date().toISOString(),
  }

  // Only when one was sent. A retag from a list page has no canvas behind it,
  // and blanking the picture because the caller could not take one would be
  // the list quietly damaging what it is listing.
  if (parsed.data.poster !== undefined) patch.poster = parsed.data.poster

  if (typeof input.document === 'string') {
    const measured = measure(input.document)
    if (measured.placements === 0) {
      return { ok: false, error: 'Refusing to save an empty world over one that is not' }
    }
    Object.assign(patch, measured)
  }

  const { data, error } = await actor.supabase
    .from('published_worlds')
    .update(patch)
    .eq('id', input.id)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: `Could not save that world: ${error.message}` }
  if (!data) return { ok: false, error: 'That world is not yours to change' }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'worlds',
      action: 'world.save',
      summary: `Edited world "${parsed.data.name}"`,
      detail: { worldId: input.id, name: parsed.data.name, visibility: parsed.data.visibility ?? 'private' },
    })
  }

  refreshLists(actor)
  revalidatePath(`/worlds/${input.id}`)
  return { ok: true, id: data.id }
}

/**
 * Take a copy of somebody else's world and make it yours.
 *
 * The copy is complete and immediate - the document, not a reference - so the
 * fork survives the original being changed or deleted. That is the same rule
 * `copyWorld` follows for blocks and it is the one that makes "open, change,
 * save" safe to offer on a world you do not own: the thing you saved is yours,
 * and the thing you started from is untouched.
 *
 * Forks land private. Publishing somebody else's world under your own name is
 * a decision, and it should be one you make on purpose afterwards rather than
 * one a button made for you.
 */
export async function forkWorld(input: {
  scope: WorldScope
  id: string
}): Promise<WorldResult> {
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such world' }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  const source = await findWorld(actor.supabase, input.id)
  if (!source) return { ok: false, error: 'No such world' }

  const { data, error } = await actor.supabase
    .from('published_worlds')
    .insert({
      // Named after its parent rather than left blank, because a list of six
      // worlds all called "Untitled fork" is a list you cannot use.
      name: `${source.name} (fork)`.slice(0, 60),
      blurb: source.blurb,
      tags: source.tags,
      visibility: 'private',
      origin: actor.origin,
      tenant_id: actor.tenantId,
      author_id: actor.userId,
      forked_from: source.id,
      // The parent's picture travels with the copy: a fork opens as the world it
      // was forked from, so a blank card until somebody re-saves would be a
      // worse likeness than the one we already have.
      poster: source.poster,
      // The parsed world, for the reason `measure` gives: this column is jsonb.
      document: JSON.parse(serialiseWorld(source.document)) as Json,
      placements: source.document.placements.length,
      blocks: countBlockable(source.document),
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not fork that world: ${error.message}` }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'worlds',
      action: 'world.fork',
      summary: `Forked world "${source.name}"`,
      detail: { worldId: data.id, sourceId: source.id },
    })
  }

  refreshLists(actor)
  return { ok: true, id: data.id }
}

export async function deleteWorld(input: {
  scope: WorldScope
  id: string
}): Promise<WorldResult> {
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such world' }

  const guarded = await actorFor(input.scope)
  if (!guarded.ok) return guarded
  const { actor } = guarded

  const { data, error } = await actor.supabase
    .from('published_worlds')
    .delete()
    .eq('id', input.id)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: `Could not delete that world: ${error.message}` }
  if (!data) return { ok: false, error: 'That world is not yours to delete' }

  if (actor.origin === 'platform') {
    await recordBackofficeAction({
      actor: { id: actor.userId, email: actor.userEmail },
      section: 'worlds',
      action: 'world.delete',
      summary: `Deleted world ${input.id}`,
      detail: { worldId: input.id },
    })
  }

  refreshLists(actor)
  return { ok: true, id: input.id }
}

/**
 * Keep a world, or stop keeping it.
 *
 * One action for both directions, because the button is one button: asking the
 * caller to say which way it is going means trusting a client's idea of the
 * current state, and two people pressing a heart in two tabs would then be able
 * to disagree with the row. The row decides.
 *
 * Needs a signed-in user and nothing else - not membership of anything, not a
 * flag. Keeping a world is a private note about a public page.
 */
export async function toggleFavouriteWorld(
  id: string,
): Promise<{ ok: true; kept: boolean } | { ok: false; error: string }> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'No such world' }

  const { user, supabase } = await requireUser()

  const { data: existing, error: readError } = await supabase
    .from('world_favourites')
    .select('world_id')
    .eq('user_id', user.id)
    .eq('world_id', id)
    .maybeSingle()

  if (readError) return { ok: false, error: `Could not read that: ${readError.message}` }

  if (existing) {
    const { error } = await supabase
      .from('world_favourites')
      .delete()
      .eq('user_id', user.id)
      .eq('world_id', id)
    if (error) return { ok: false, error: `Could not forget that world: ${error.message}` }

    revalidatePath('/worlds')
    return { ok: true, kept: false }
  }

  const { error } = await supabase
    .from('world_favourites')
    .insert({ user_id: user.id, world_id: id })

  if (error) {
    // The foreign key: a world deleted between the page loading and the heart
    // being pressed.
    if (error.code === '23503') return { ok: false, error: 'That world is gone' }
    return { ok: false, error: `Could not save that world: ${error.message}` }
  }

  revalidatePath('/worlds')
  return { ok: true, kept: true }
}

/**
 * Say what is wrong with a world.
 *
 * One report per person per world - a second one replaces the first, because
 * somebody who finds a worse problem is changing their answer rather than
 * voting twice. Two people saying the same thing is what puts a label on the
 * card; see `REPORTS_BEFORE_LABEL`.
 *
 * The `offensive` arm is not a label at all. It goes to the moderation queue
 * that already exists, and the result says so - a reporter who has just seen
 * something they want gone deserves to know a human will read it, not to watch
 * a badge appear.
 */
export async function reportWorld(input: {
  id: string
  reason: string
  note?: string
}): Promise<{ ok: true; moderation: boolean } | { ok: false; error: string }> {
  if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such world' }

  const reason = reportReason(input.reason)
  if (!reason) return { ok: false, error: 'Pick what is wrong with it' }

  const note = (input.note ?? '').trim().slice(0, 500)

  const { user, supabase } = await requireUser()

  // Readable means reportable. If the select policy hides it there is nothing
  // here to complain about - the same rule `reportWorld` in the moderation
  // actions follows for a battlefield.
  const world = await findWorld(supabase, input.id)
  if (!world) return { ok: false, error: 'No such world' }

  const { error } = await supabase
    .from('published_world_reports')
    .upsert(
      {
        world_id: input.id,
        reported_by: user.id,
        reason: reason.id,
        note: note || null,
      },
      { onConflict: 'world_id,reported_by' },
    )

  if (error) return { ok: false, error: `Could not send that: ${error.message}` }

  revalidatePath('/worlds')
  revalidatePath(`/worlds/${input.id}`)

  return { ok: true, moderation: reason.moderation === true }
}

/** Take a report back — yours, or one about a world you own. */
export async function withdrawWorldReport(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'No such world' }

  const { user, supabase } = await requireUser()

  const { error } = await supabase
    .from('published_world_reports')
    .delete()
    .eq('world_id', id)
    .eq('reported_by', user.id)

  if (error) return { ok: false, error: `Could not withdraw that: ${error.message}` }

  revalidatePath('/worlds')
  revalidatePath(`/worlds/${id}`)
  return { ok: true }
}

export type AddWorldResult =
  | { ok: true; worldId: string; blocks: number; props: number; clipped: number }
  | { ok: false; error: string }

/**
 * Stand a published world up in a space, as a battlefield - or, given a room,
 * load it straight into that room instead.
 *
 * The battlefield is the default destination, and that is not an arbitrary
 * pick: the lounge is where everybody already is, and *defaulting* to
 * replacing the room somebody is standing in would be the most destructive
 * control in the app by accident. A battlefield is empty, named, and theirs -
 * copying into one costs nobody anything.
 *
 * `targetRoomId` is the deliberate exception: it only ever arrives from a
 * room's own "Discover worlds" link (see the `room` search param threaded
 * through `/t/[slug]/worlds`), so reaching this branch already means somebody
 * picked a room, went looking from inside it, and confirmed the swap on the
 * world's own page - the same shape saved-arena loading already asks for. The
 * room still has to be proven this tenant's own and open, the same way
 * `resolveWorld` proves a battlefield or room before anything is written to
 * it - `findWorld` alone would trust a client-supplied id.
 *
 * Which is also why this needs `battle` as well as `worlds`. A battlefield is
 * that feature's surface; landing blocks in one while it is off would put a
 * space's world somewhere the space cannot open.
 *
 * Lossy, and it says so. The result carries what was left behind - furniture
 * the palette has no block for, and anything clipped by the height limit - so
 * the caller can tell somebody what they actually got. See ./blocks.ts.
 */
export async function addWorldToSpace(
  slug: string,
  id: string,
  /** Load into this open room instead of a fresh battlefield. Omitted makes one. */
  targetRoomId?: string,
): Promise<AddWorldResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'No such world' }

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // The same pair that may make a battlefield any other way, and the same
  // pair that manages a room - see `guard` in domain/rooms/actions.ts.
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can add a world to this space' }
  }

  const { supabase, tenant, user } = context

  // Proven this tenant's own and open before anything is written - `findRoom`
  // filters closed rooms out already, so a hit here is both.
  if (targetRoomId) {
    const room = await findRoom(supabase, targetRoomId)
    if (!room || room.tenantId !== tenant.id) {
      return { ok: false, error: 'Room not found' }
    }
  }

  const source = await findWorld(supabase, id)
  if (!source) return { ok: false, error: 'No such world' }

  const { blocks, props, clipped, lift } = toBlocks(source.document)

  if (blocks.length === 0) {
    return {
      ok: false,
      error:
        'Nothing in this world can be stood on — it is all props, and a walkable world needs blocks',
    }
  }
  if (blocks.length > MAX_COPY_BLOCKS) {
    return {
      ok: false,
      error: `That is ${blocks.length.toLocaleString()} blocks — too much to copy in one go`,
    }
  }

  let worldId: string

  if (targetRoomId) {
    // The room already exists - nothing to create, and nothing to revert if a
    // later step fails. Cleared first, unlike a fresh battlefield: a room
    // already has whatever was built in it, and every other "replace this
    // world" action here clears before it writes.
    worldId = targetRoomId
    await clearWorld(supabase, tenant.id, worldId, user.id)

    /*
     * And the goals it already had, which `clearWorld` does not touch - they
     * are a different aggregate, one stream per goal (see `copyGoals`). A
     * fresh battlefield has none, which is why this never had to happen
     * before; a room that has been played in does, and leaving them would
     * strand the old pitch's goalposts in the middle of the new world.
     * Removed before the source's marks are stood below, so this cannot
     * delete the ones it is about to place.
     */
    for (const goal of await listGoals(supabase, tenant.id, worldId)) {
      await executeCommand({
        supabase,
        decider: loungeGoalDecider,
        tenantId: tenant.id,
        streamId: goal.id,
        command: { type: 'RemoveGoal' },
        metadata: { actorId: user.id },
      })
    }
  } else {
    worldId = randomUUID()

    try {
      await executeCommand({
        supabase,
        decider: battlefieldDecider,
        tenantId: tenant.id,
        // A battlefield's stream id is its world id.
        streamId: worldId,
        command: {
          type: 'CreateBattlefield',
          actorId: user.id,
          name: source.name,
          visibility: 'space',
        },
        metadata: { actorId: user.id },
      })
    } catch (error) {
      if (error instanceof DomainError) return { ok: false, error: error.message }
      if (error instanceof ConcurrencyError) {
        return { ok: false, error: 'That world was being added elsewhere. Try again.' }
      }
      throw error
    }

    await runProjection(supabase, battlefieldsProjection, tenant.id)
  }

  try {
    await writeBlocks(supabase, tenant.id, worldId, user.id, blocks)
  } catch (error) {
    // The destination is left standing rather than unwound - a battlefield is
    // visible and retirable even empty, and a room mid-copy is a room that was
    // already cleared, for the reason `saveWorldAsArena` gives: a half-copied
    // world that deleted itself is a save that vanished.
    return {
      ok: false,
      error: `${targetRoomId ? 'The room was cleared' : 'The battlefield was created'} but copying stopped: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    }
  }

  /*
   * The goals and race marks, as real goals.
   *
   * This is what makes a published race playable rather than decorative: a
   * `finish` mark is the thing `reportFinish` checks somebody ran through, and
   * a match that ends on it is what credits the world back in the catalogue.
   *
   * One command per mark, which is why the document caps them at a dozen. Best
   * effort as a group: an arena that arrived without its goals is an arena
   * somebody can stand goals in, and refusing the whole copy over one of them
   * would throw away the blocks as well.
   */
  for (const mark of source.document.marks) {
    try {
      await executeCommand({
        supabase,
        decider: loungeGoalDecider,
        tenantId: tenant.id,
        // A fresh stream per mark: the copy is a new goal that happens to
        // match, not the same goal in two worlds - the rule `copyGoals`
        // follows.
        streamId: randomUUID(),
        command: {
          type: 'PlaceGoal',
          worldId,
          kind: mark.kind,
          // Lifted with the blocks, or a goal ends up buried in the floor of a
          // world that was raised to sit on y=0.
          x: mark.x,
          y: mark.y + lift,
          z: mark.z,
          width: mark.width,
          height: mark.height,
          facing: mark.facing,
        },
        metadata: { actorId: user.id },
      })
    } catch (error) {
      console.warn(
        `Could not stand a ${mark.kind} mark: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
  }

  /*
   * Where this copy came from, so a match played on it can credit the world it
   * was built from. Best-effort like the spawn below: a copy that failed to
   * record its parent is a copy that never gets approved, not a broken one.
   */
  {
    const { error } = await supabase.from('world_copies').upsert({
      world_id: worldId,
      source_world_id: id,
      tenant_id: tenant.id,
    })
    if (error) console.warn(`Could not record where that world came from: ${error.message}`)
  }

  /*
   * The door travels with the world.
   *
   * After the blocks, and best-effort: a spawn that failed to write is people
   * arriving in the middle of a world that is otherwise entirely there, which
   * is the old behaviour rather than a broken copy. Lifted by the same amount
   * the blocks were, so it still points at the same place in the world.
   */
  if (source.document.spawn) {
    const { error } = await supabase.from('world_spawns').upsert({
      world_id: worldId,
      tenant_id: tenant.id,
      x: source.document.spawn.x,
      z: source.document.spawn.z,
    })
    if (error) console.warn(`Could not carry the spawn point over: ${error.message}`)
  }

  // Counted after the blocks have landed, so the number is arrivals rather than
  // attempts - which is what makes it worth sorting the catalogue by.
  await recordWorldUse(supabase, id)

  // The layout, not just the list a room's revalidated on - see the note on
  // `run` in domain/rooms/actions.ts for why a page-scoped revalidate leaves
  // the rail showing the old world.
  if (targetRoomId) revalidatePath(`/t/${slug}`, 'layout')
  else revalidatePath(`/t/${slug}/battle/battlefields`)
  revalidatePath('/worlds')
  return { ok: true, worldId, blocks: blocks.length, props, clipped }
}

/**
 * One catalogue world, as the arena picker draws it.
 *
 * A `WorldSummary` carries thumbnails, tags, counts and an origin, and the
 * picker is a row in a menu - so this is the three fields it actually renders.
 * Kept narrow deliberately: the picker is not a second discovery page, and a
 * shape that carried everything would invite it to become one.
 */
export interface CatalogueWorld {
  id: string
  name: string
  spaceName: string | null
  /** Whether it already has goals or a start and finish, so far as we can tell. */
  blocks: number
}

/**
 * Searching the catalogue from inside the lobby.
 *
 * The arena step already searched two corpora - the space's own battlefields
 * and every *published battlefield* on the platform - and neither of them is the
 * catalogue at /worlds. Those are different tables and different objects: a
 * battlefield is a ground somebody prepared to fight on, a catalogue world is a
 * world somebody built and shared. The gap meant browsing discovery, finding a
 * ground you liked, and having no way to fight on it without leaving the lobby,
 * going to the battlefields page, copying it, and coming back.
 *
 * Same shape as `findPublishedWorlds`, down to the twelve-result cap, because it
 * lands in the same menu under the same kind of box.
 */
export async function findCatalogueWorlds(
  slug: string,
  search: string,
): Promise<
  { ok: true; worlds: CatalogueWorld[] } | { ok: false; error: string }
> {
  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  requireFeature(context, 'battle')

  const found = await listPublicWorlds(context.supabase, {
    q: search,
    sort: 'used',
    limit: 12,
  })

  return {
    ok: true,
    worlds: found.map((world) => ({
      id: world.id,
      name: world.name,
      spaceName: world.spaceName ?? null,
      blocks: world.blocks,
    })),
  }
}
