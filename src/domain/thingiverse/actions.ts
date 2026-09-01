'use server'

import { randomUUID } from 'node:crypto'
import { freshSpec, MAX_BLUEPRINTS_PER_TENANT } from '@/domain/thingiverse/blueprint'
import { blueprintDecider } from '@/domain/thingiverse/aggregate'
import {
  type Asker,
  type BlueprintCommand,
  blueprintIdSchema,
  clipNameSchema,
  drawBlueprintSchema,
  handOverBlueprintSchema,
  renameBlueprintSchema,
  reshapeBlueprintSchema,
  setBlueprintVisibilitySchema,
} from '@/domain/thingiverse/commands'
import type { BakedClip } from '@/domain/animator/clip'
import { emoteTreeDecider, type EmoteCommand } from '@/domain/thingiverse/emote-aggregate'
import type { EmoteTree } from '@/domain/thingiverse/emote-tree'
import { clipDecider, type ClipCommand } from '@/domain/thingiverse/clip-aggregate'
import { MAX_CLIPS_PER_TENANT } from '@/domain/thingiverse/clip-events'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { payToSummon } from '@/domain/thingiverse/shop'
import {
  countBlueprints,
  countClips,
  countThings,
} from '@/domain/thingiverse/queries'
import { type ModelHit, searchModels } from '@/domain/thingiverse/models'
import { nameForModel } from '@/domain/thingiverse/summon'
import { thingDecider } from '@/domain/thingiverse/thing-aggregate'
import {
  moveThingSchema,
  scaleThingSchema,
  setThingKeepSchema,
  summonThingSchema,
  type ThingCommand,
  thingIdSchema,
  tuneThingSchema,
  turnThingSchema,
} from '@/domain/thingiverse/thing-commands'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { hasRole, hasTier, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Commands for the shelf and for the rooms.
 *
 * Shaped after the lounge's image actions, which is the nearest relative: one
 * stream per object, no batching and no chunk arithmetic - load, fold, decide,
 * append. Like those, **none of these revalidate the page**. A room is a live
 * canvas and re-rendering the route would tear down the WebGL context, taking
 * everybody's view of the world with it to deliver a fact the client already
 * applied optimistically.
 *
 * Two things here that the image actions do not need:
 *
 *   * **`Asker`.** Every blueprint command carries who is asking and whether
 *     they run the space, because ownership is the whole sharing model and the
 *     decider is the only layer that can see whose a blueprint is. See the note
 *     on `Asker` in ./commands.ts.
 *   * **A count.** Both caps - blueprints per space, things per world - are
 *     about a set the aggregate is not, so the number is read here and handed
 *     to the decider, which is where the rule stays written down. Exactly the
 *     shape the goals' cap takes.
 */

export type ThingiverseResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * What summoning a raw model hands back.
 *
 * Both ids, because the caller has just caused *two* things to exist and needs
 * both: the thing to correct its optimistic row with, and the blueprint to put
 * on the shelf it is already drawing. Without the second, a model summoned from
 * the packs would stand in the room while the rail's shelf claimed it did not
 * exist until the next page load.
 */
export type SummonedModel =
  | { ok: true; id: string; blueprintId: string }
  | { ok: false; error: string }

function toResult(error: unknown): { ok: false; error: string } {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'Someone else changed that. Try again.' }
  }
  throw error
}

/** Membership, write access, and who the caller is to a blueprint. */
async function prepare(slug: string) {
  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false as const, error: blocked }

  /*
   * The feature's own two gates, here as well as on every surface.
   *
   * They were only on the surfaces, and a gate that lives only where the button
   * is drawn is not a gate: a server action is a POST endpoint, its id is in the
   * client bundle of every page in the space, and "the flag is off" was
   * enforced by not drawing a link to it. A space on the free plan could have
   * put two hundred and fifty blueprints on a shelf it is not entitled to, and
   * the only thing stopping it was that nothing showed it the button.
   *
   * A refusal rather than `notFound()`, which is what the pages use. The pages
   * are answering "does this URL exist for you" and the honest answer there is
   * no. This is answering a control somebody pressed, and every other refusal in
   * this file comes back as a sentence the panel can show - a thrown navigation
   * error out of a server action lands as an unexplained failure in a rail.
   */
  if (!context.features.thingiverse || !hasTier(context, 'xo')) {
    return { ok: false as const, error: 'The thingiverse is not open in this space.' }
  }

  return {
    ok: true as const,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    by: {
      actorId: context.user.id,
      admin: hasRole(context, ['owner', 'admin']),
    } satisfies Asker,
  }
}

async function dispatchBlueprint(
  slug: string,
  streamId: string,
  build: (by: Asker) => BlueprintCommand,
): Promise<ThingiverseResult> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: blueprintDecider,
      tenantId,
      streamId,
      command: build(prepared.by),
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, thingiverseProjection, tenantId)
  return { ok: true, id: streamId }
}

async function dispatchThing(
  slug: string,
  streamId: string,
  command: ThingCommand,
): Promise<ThingiverseResult> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: thingDecider,
      tenantId,
      streamId,
      command,
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, thingiverseProjection, tenantId)
  return { ok: true, id: streamId }
}

/**
 * Arrange the space's emote menu.
 *
 * The stream id is the tenant's own - there is one menu per space and it is
 * never handed to anybody, so minting a second id would mean a lookup before
 * every write to answer "which menu". See `EMOTE_TREE_STREAM_TYPE`.
 *
 * The whole tree, every time, for the reason `EmoteTreeSet` gives: dragging a
 * clip between branches is one decision touching two places, and a patch would
 * have a window where it is in neither or both.
 */
export async function setEmoteTree(slug: string, tree: EmoteTree): Promise<ThingiverseResult> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: emoteTreeDecider,
      tenantId,
      streamId: tenantId,
      command: { type: 'SetEmoteTree', by: prepared.by, tree } satisfies EmoteCommand,
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, thingiverseProjection, tenantId)
  return { ok: true, id: tenantId }
}

/**
 * Look for a model, from the browser.
 *
 * A round trip for a search that could run locally, and that is the point: the
 * catalogue is 5,770 entries across two module constants, and importing it into
 * a client component ships every one of them to every visitor who opens the
 * composer. The page that *browses* the packs runs the same function on the
 * server for the same reason.
 *
 * Capped at forty, which is a grid you scan rather than a list you scroll, and
 * is also the number past which somebody should type another word instead.
 *
 * Gated like every other action here even though it writes nothing: what it
 * discloses is the catalogue, which is a thing a space has because it pays for
 * it - and an unauthenticated endpoint that answers "what models do you ship"
 * is the kind of thing that only ever gets noticed after it is indexed.
 */
export async function findParts(slug: string, query: string, pack?: string): Promise<ModelHit[]> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return []

  return searchModels(query, pack).slice(0, 40)
}

/**
 * Put a new thing on the shelf.
 *
 * The id is minted here rather than by the client, for the reason every stream
 * id in this codebase is: it has to exist before the first event is written,
 * and it is not something a browser should get to choose.
 */
export async function drawBlueprint(
  slug: string,
  input: { name: string; spec: unknown; visibility?: 'private' | 'public' },
): Promise<ThingiverseResult> {
  const parsed = drawBlueprintSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid blueprint' }
  }

  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const standing = await countBlueprints(prepared.supabase, prepared.tenantId)
  if (standing >= MAX_BLUEPRINTS_PER_TENANT) {
    return {
      ok: false,
      error: `This space has ${MAX_BLUEPRINTS_PER_TENANT} blueprints. Retire one first.`,
    }
  }

  return dispatchBlueprint(slug, randomUUID(), (by) => ({
    type: 'DrawBlueprint',
    by,
    name: parsed.data.name,
    spec: parsed.data.spec,
    visibility: parsed.data.visibility,
  }))
}

export async function renameBlueprint(
  slug: string,
  input: { id: string; name: string },
): Promise<ThingiverseResult> {
  const parsed = renameBlueprintSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({
    type: 'RenameBlueprint',
    by,
    name: parsed.data.name,
  }))
}

export async function reshapeBlueprint(
  slug: string,
  input: { id: string; spec: unknown },
): Promise<ThingiverseResult> {
  const parsed = reshapeBlueprintSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid blueprint' }
  }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({
    type: 'ReshapeBlueprint',
    by,
    spec: parsed.data.spec,
  }))
}

/** Put it on the shelf everybody in the space can reach, or take it back. */
export async function setBlueprintVisibility(
  slug: string,
  input: { id: string; visibility: 'private' | 'public' },
): Promise<ThingiverseResult> {
  const parsed = setBlueprintVisibilitySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid visibility' }
  }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({
    type: 'SetBlueprintVisibility',
    by,
    visibility: parsed.data.visibility,
  }))
}

/**
 * Hand it to somebody else.
 *
 * The new owner is trusted only as far as being a uuid - the decider does not
 * check that they are a member, and deliberately: membership is a moving fact
 * and a blueprint handed to somebody who later leaves would otherwise become
 * unreachable. What stops a stranger being named is that the row lives under
 * the space's RLS, so a blueprint owned by an id with no membership is visible
 * to nobody but an admin, who can hand it on again.
 */
export async function handOverBlueprint(
  slug: string,
  input: { id: string; ownerId: string },
): Promise<ThingiverseResult> {
  const parsed = handOverBlueprintSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid owner' }
  }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({
    type: 'HandOverBlueprint',
    by,
    ownerId: parsed.data.ownerId,
  }))
}

export async function retireBlueprint(
  slug: string,
  id: string,
): Promise<ThingiverseResult> {
  const parsed = blueprintIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid blueprint id' }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({ type: 'RetireBlueprint', by }))
}

/**
 * Summon one, into a world.
 *
 * The count is read before the command so the decider can refuse the
 * sixty-fifth - see `SummonThing.standing`. It is read *after* `prepare`, so a
 * guest or an archived space is refused before the database is asked anything.
 */
export async function summonThing(
  slug: string,
  input: {
    blueprintId: string
    worldId?: string
    x: number
    y: number
    z: number
    facing: number
    scale: number
    /** Whether it stays when you leave. Default true - see the schema. */
    keep?: boolean
  },
): Promise<ThingiverseResult> {
  const parsed = summonThingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid summon' }
  }

  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const world = parsed.data.worldId ?? prepared.tenantId
  const standing = await countThings(prepared.supabase, prepared.tenantId, world)

  /*
    Paid for before it exists.

    Charged here rather than beside the click, and the order is the whole
    reason: a summon that appeared and *then* asked for coins would be a thing
    standing in a room somebody could not afford, and taking it away again is a
    worse moment than never drawing it. A free blueprint - which is almost all
    of them - short-circuits inside `payToSummon` without a command or a round
    trip through the decider.

    Not transactional with the summon, and it cannot be: they are two
    aggregates with two streams. The failure that leaves is a charge with no
    thing, which is the right way round of the two - a refund is a
    conversation, and a free bench is a hole in a shop.
  */
  const paid = await payToSummon(slug, { blueprintId: parsed.data.blueprintId })
  if (!paid.ok) return { ok: false, error: paid.error }

  return dispatchThing(slug, randomUUID(), {
    type: 'SummonThing',
    ...parsed.data,
    standing,
  })
}

/**
 * Summon a raw model, drawing the blueprint it needs on the way.
 *
 * This is what `/thingiverse fountain` does when the space has no fountain yet,
 * and it is why the shelf fills up by being used rather than by anybody sitting
 * down to curate it. Two commands against two streams, in order, and the order
 * matters: a thing pointing at a blueprint that was never drawn is a row the
 * room cannot render.
 *
 * They are deliberately **not** one transaction. The event store appends per
 * stream, so "both or neither" is not on offer without a saga, and the failure
 * it would protect against is benign: a blueprint drawn and then not summoned
 * is a blueprint on your shelf, which is exactly what you would have got by
 * making one and changing your mind.
 */
export async function summonModel(
  slug: string,
  input: {
    model: string
    name?: string
    worldId?: string
    x: number
    y: number
    z: number
    facing: number
    scale: number
    keep?: boolean
  },
): Promise<SummonedModel> {
  const drawn = await drawBlueprint(slug, {
    name: input.name?.trim() || nameForModel(input.model),
    // Summoned as it comes out of the pack: solid, still, standing where it is
    // put. Anything else would be this action guessing at a design decision the
    // person can make in one click once they can see the thing.
    spec: freshSpec(input.model),
  })
  if (!drawn.ok) return drawn

  const summoned = await summonThing(slug, {
    blueprintId: drawn.id,
    worldId: input.worldId,
    x: input.x,
    y: input.y,
    z: input.z,
    facing: input.facing,
    scale: input.scale,
    keep: input.keep,
  })
  if (!summoned.ok) return summoned

  return { ok: true, id: summoned.id, blueprintId: drawn.id }
}

export async function moveThing(
  slug: string,
  input: { id: string; worldId?: string; x: number; y: number; z: number },
): Promise<ThingiverseResult> {
  const parsed = moveThingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid position' }
  }

  const { id, x, y, z } = parsed.data
  return dispatchThing(slug, id, { type: 'MoveThing', x, y, z })
}

export async function turnThing(
  slug: string,
  input: { id: string; worldId?: string; facing: number },
): Promise<ThingiverseResult> {
  const parsed = turnThingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rotation' }
  }

  return dispatchThing(slug, parsed.data.id, {
    type: 'TurnThing',
    facing: parsed.data.facing,
  })
}

export async function scaleThing(
  slug: string,
  input: { id: string; worldId?: string; scale: number },
): Promise<ThingiverseResult> {
  const parsed = scaleThingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid size' }
  }

  return dispatchThing(slug, parsed.data.id, {
    type: 'ScaleThing',
    scale: parsed.data.scale,
  })
}

/** This one, specifically, blocks or falls differently from its kind. */
export async function tuneThing(
  slug: string,
  input: { id: string; worldId?: string; tuning: unknown },
): Promise<ThingiverseResult> {
  const parsed = tuneThingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid properties' }
  }

  return dispatchThing(slug, parsed.data.id, {
    type: 'TuneThing',
    tuning: parsed.data.tuning,
  })
}

/**
 * Make it furniture, or make it a loan.
 *
 * Anybody who may build here may set it, exactly as they may move or dismiss
 * anything standing in the room - a thing in a room belongs to the room. Which
 * also means an admin can let go of what somebody else left behind, which is
 * the whole of tidying up after a busy afternoon.
 */
export async function setThingKeep(
  slug: string,
  input: { id: string; worldId?: string; keep: boolean },
): Promise<ThingiverseResult> {
  const parsed = setThingKeepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid setting' }

  return dispatchThing(slug, parsed.data.id, {
    type: 'SetThingKeep',
    keep: parsed.data.keep,
  })
}

export async function dismissThing(
  slug: string,
  input: { id: string; worldId?: string },
): Promise<ThingiverseResult> {
  const parsed = thingIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid thing id' }

  return dispatchThing(slug, parsed.data.id, { type: 'DismissThing' })
}

/**
 * Commands for the clips a space animates.
 *
 * A third noun on the same shelf, dispatched the same way the blueprints are -
 * `Asker` for the ownership rule, a count for the cap, no revalidation. What is
 * different is the size of what travels: a baked clip is tens of kilobytes of
 * numbers, which is why the animator sends one on Save rather than on every
 * keyed pose.
 */
async function dispatchClip(
  slug: string,
  streamId: string,
  build: (by: Asker) => ClipCommand,
): Promise<ThingiverseResult> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: clipDecider,
      tenantId,
      streamId,
      command: build(prepared.by),
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, thingiverseProjection, tenantId)
  return { ok: true, id: streamId }
}

/**
 * Save a pose sequence as a clip the space keeps.
 *
 * The bounds on what arrives are the decider's `assertClip` rather than a zod
 * schema, which is the one place in this domain that is true and is worth
 * saying why: what has to be checked is not a *shape* - "an object with a times
 * array" is trivially satisfiable - but a set of relationships between three
 * array lengths. A schema that expressed that would be `assertClip` written
 * twice, so it is written once, where the log is.
 *
 * What zod still does is the cheap half: the name, and that the payload is an
 * object at all.
 */
export async function saveClip(
  slug: string,
  input: { name: string; skeleton: string; clip: unknown; doc: unknown },
): Promise<ThingiverseResult> {
  const parsed = clipNameSchema.safeParse(input.name)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }
  if (!input.clip || typeof input.clip !== 'object') {
    return { ok: false, error: 'That clip is malformed' }
  }

  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const kept = await countClips(prepared.supabase, prepared.tenantId)
  if (kept >= MAX_CLIPS_PER_TENANT) {
    return {
      ok: false,
      error: `This space has ${MAX_CLIPS_PER_TENANT} clips. Retire one first.`,
    }
  }

  return dispatchClip(slug, randomUUID(), (by) => ({
    type: 'DrawClip',
    by,
    name: parsed.data,
    skeleton: input.skeleton,
    clip: input.clip as BakedClip,
    doc: input.doc,
    visibility: 'private',
  }))
}

/** Key it again. Both halves travel together - see `ClipReshaped`. */
export async function reshapeClip(
  slug: string,
  input: { id: string; clip: unknown; doc: unknown },
): Promise<ThingiverseResult> {
  const parsed = blueprintIdSchema.safeParse({ id: input.id })
  if (!parsed.success) return { ok: false, error: 'Invalid clip id' }
  if (!input.clip || typeof input.clip !== 'object') {
    return { ok: false, error: 'That clip is malformed' }
  }

  return dispatchClip(slug, parsed.data.id, (by) => ({
    type: 'ReshapeClip',
    by,
    clip: input.clip as BakedClip,
    doc: input.doc,
  }))
}

export async function renameClip(
  slug: string,
  input: { id: string; name: string },
): Promise<ThingiverseResult> {
  const id = blueprintIdSchema.safeParse({ id: input.id })
  const name = clipNameSchema.safeParse(input.name)
  if (!id.success || !name.success) return { ok: false, error: 'Invalid name' }

  return dispatchClip(slug, id.data.id, (by) => ({
    type: 'RenameClip',
    by,
    name: name.data,
  }))
}

export async function setClipVisibility(
  slug: string,
  input: { id: string; visibility: 'private' | 'public' },
): Promise<ThingiverseResult> {
  const parsed = setBlueprintVisibilitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid visibility' }

  return dispatchClip(slug, parsed.data.id, (by) => ({
    type: 'SetClipVisibility',
    by,
    visibility: parsed.data.visibility,
  }))
}

export async function retireClip(slug: string, id: string): Promise<ThingiverseResult> {
  const parsed = blueprintIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid clip id' }

  return dispatchClip(slug, parsed.data.id, (by) => ({ type: 'RetireClip', by }))
}
