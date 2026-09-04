'use server'

import { randomUUID } from 'node:crypto'
import { buyExtra } from '@/domain/bank/extras'
import { nextPrice, type NextPrice } from '@/domain/bank/next'
import type { Purchasable } from '@/domain/bank/prices'
import type { Tier } from '@/domain/billing/tiers'
import type { Client } from '@/es/store'
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
  countVehicles,
  findBlueprint,
  countThings,
  listBlueprints,
} from '@/domain/thingiverse/queries'
import { type ModelHit, searchModels } from '@/domain/thingiverse/models'
import { sameItem } from '@/domain/thingiverse/craft'
import { starterSet } from '@/domain/thingiverse/starters'
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
import { hasRole, requireTenant, thingiverseOpen, writeBlockedReason } from '@/lib/tenant'

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
   * The feature's own gate, here as well as on every surface.
   *
   * It was only on the surfaces, and a gate that lives only where the button is
   * drawn is not a gate: a server action is a POST endpoint, its id is in the
   * client bundle of every page in the space, and "the flag is off" was
   * enforced by not drawing a link to it.
   *
   * Two gates once, flag and `xo` tier, and `thingiverseOpen` is now the whole
   * of it - the tier stopped being half of the answer when the free plan grew
   * rooms and places to summon into. See the helper for that argument. What
   * this still catches is the case it was written for: an installation that has
   * not shipped the thingiverse to this space, reached by a POST rather than by
   * a link.
   *
   * A refusal rather than `notFound()`, which is what the pages use. The pages
   * are answering "does this URL exist for you" and the honest answer there is
   * no. This is answering a control somebody pressed, and every other refusal in
   * this file comes back as a sentence the panel can show - a thrown navigation
   * error out of a server action lands as an unexplained failure in a rail.
   */
  if (!thingiverseOpen(context)) {
    return { ok: false as const, error: 'The thingiverse is not open in this space.' }
  }

  return {
    ok: true as const,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    /*
      For the quota, which is a fact about the plan rather than about the
      request. Read off the context the caller already has rather than through
      `tenantLimit`'s extra round trip - every path in this file has one.
    */
    tier: context.tenant.tier,
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
 * Whether a spec describes a vehicle.
 *
 * The presence of the block is the whole test, and it is the same one
 * `countVehicles` runs in SQL and the workbench runs on the shelf. Written
 * against `unknown` because it is asked of a spec that has been through zod but
 * is typed as the schema's output at the call site and as raw input here.
 */
function hasVehicle(spec: unknown): boolean {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    (spec as { vehicle?: unknown }).vehicle != null
  )
}

/** A line of the plan, and what the next one on it costs. */
interface PriceLine {
  what: Purchasable
  next: NextPrice
}

/**
 * Which line this is charged against, and what it costs.
 *
 * Blueprints and vehicles are separate allowances that the same action can
 * create, so the choice has to be made once, from the spec, in the one place
 * both the charge and the refusal are decided. Two call sites each deciding it
 * is how a car comes to be charged as a barrel.
 *
 * `blueprints` is the caller's total row count, which includes vehicles - it is
 * the number `countBlueprints` gives and the number the platform ceiling wants.
 * The vehicles are subtracted here rather than by the caller so nobody has to
 * remember that they are counted twice in one place and once in the other.
 */
async function priceLine(
  supabase: Client,
  tenantId: string,
  tier: Tier,
  counts: { vehicle: boolean; blueprints: number },
): Promise<PriceLine> {
  const vehicles = await countVehicles(supabase, tenantId)

  return counts.vehicle
    ? { what: 'vehicles', next: await nextPrice(supabase, tenantId, tier, 'vehicles', vehicles) }
    : {
        what: 'blueprints',
        next: await nextPrice(
          supabase,
          tenantId,
          tier,
          'blueprints',
          Math.max(0, counts.blueprints - vehicles),
        ),
      }
}

/** How a line reads in a refusal. */
const LINE_WORDS: Record<Purchasable, string> = {
  blueprints: 'blueprints',
  vehicles: 'vehicles',
  clips: 'clips',
  privateXps: 'private levels',
  publicXps: 'published levels',
  xoPlaces: 'rooms',
}

/**
 * Take the coins, or say why not.
 *
 * The half of a create path that is the same whatever is being created, kept
 * apart so the two callers cannot drift into refusing differently. `buyExtra`
 * rather than `charge`: a charge without `space_extra_add` is coins taken for a
 * cap that did not move, so the very next press charges again.
 *
 * Vehicles reach the `refused` branch by a different road from everything else
 * and the sentence has to survive it. Every tier holds *zero* of them, so
 * `limit` is 0 and the plan-holds phrasing would read "this plan holds 0
 * vehicles and cannot buy more" - which is exactly backwards, since a vehicle
 * is the one thing on this table that is always bought and never included. The
 * only way to get there is an operator's `vehicle_limit` override, so the
 * sentence names that instead.
 */
async function payFor(
  prepared: { supabase: Client; tenantId: string; userId: string; tier: Tier },
  line: PriceLine,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const word = LINE_WORDS[line.what]

  if (line.next.kind === 'refused') {
    return {
      ok: false,
      error:
        line.next.limit === null
          ? `This space already has unlimited ${word}.`
          : `This plan holds ${line.next.limit} ${word} and cannot buy more. Retire one, or upgrade.`,
    }
  }

  if (line.next.kind === 'costs') {
    const bought = await buyExtra(
      prepared.supabase,
      prepared.tenantId,
      prepared.userId,
      prepared.tier,
      line.what,
    )
    if (!bought.ok) return { ok: false, error: bought.error }
  }

  return { ok: true }
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

  /*
    Which line of the plan this is charged against.

    A blueprint with a `vehicle` block is a *vehicle*, and vehicles are their
    own line - `TierLimits` says so, and the reason is the size of the gap: a
    blueprint past the allowance is 30 to 60 coins and a vehicle is 10,000 to
    50,000. So it is one or the other, never both, and the counts have to agree
    with that or a space pays a vehicle's price for a barrel. The ceiling
    above is unaffected: a vehicle occupies a row like anything else.

    The New vehicle button on the workbench arrives here with `exampleCar`
    already in the spec, so a car bought that way is priced correctly from the
    first press rather than at whatever the bench saves next.
  */
  const wanted = await priceLine(prepared.supabase, prepared.tenantId, prepared.tier, {
    vehicle: hasVehicle(parsed.data.spec),
    blueprints: standing,
  })

  /*
    Past what the plan holds, this costs coins.

    ---------------------------------------------------------------------------
    Two limits, and they are not the same kind of thing
    ---------------------------------------------------------------------------
    The one above is `blueprint.ts`'s platform ceiling: a real limit on a real
    box, checked first, and no amount of coins moves it. This one is the tier's
    allowance, which is a commercial number that a purse *can* lift by one. They
    are deliberately separate rungs - see `resolveLimit` - and a space that buys
    its way past its plan still stops at the ceiling.

    ---------------------------------------------------------------------------
    Charged on the press, not behind a confirmation
    ---------------------------------------------------------------------------
    Which is a real decision and the same one the summon button already makes:
    the price is drawn on the control that spends it (`CoinPrice`, and see
    `nextPrice` for how the two are kept from disagreeing), so pressing it *is*
    the confirmation. A second dialogue in front of a sixty-coin slot would be a
    modal in the middle of putting a thing in a room.

    Charge before draw, which is the ordering `buyExtra` argues for at length.
    The failure it leaves is a slot paid for and not filled - and because a slot
    belongs to the space permanently, the next draw simply uses it. Nobody has
    to be made whole for that one.
  */
  const paid = await payFor(prepared, wanted)
  if (!paid.ok) return paid

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

  /*
    The other door a vehicle comes through, and the reason it needed one.

    Every other charge in this file hangs off a *create*: a press makes a thing
    that did not exist, and the price sits on the press. A vehicle is not made
    that way. It is a `vehicle` block added to a blueprint at the bench - one
    checkbox, on a spec somebody is already editing - so the act that costs
    10,000 coins was, until this, an ordinary save.

    Which means the charge has to be a *transition*: this spec has one and the
    stored one does not. Not "the spec has one", which would charge again on
    every subsequent save of the same car, and not "the checkbox was ticked",
    which is a fact about a browser and can be replayed by anybody willing to
    send the request twice.

    Taking the block away is deliberately free and deliberately not refunded.
    The slot belongs to the space and stays bought (economy.md §8.8), so
    unticking and re-ticking is free rather than a way to be charged twice -
    which is the right way round for a checkbox somebody may well press to see
    what it does.
  */
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  if (hasVehicle(parsed.data.spec)) {
    const before = await findBlueprint(
      prepared.supabase,
      prepared.tenantId,
      prepared.userId,
      parsed.data.id,
    )

    // A blueprint that is not there is the decider's refusal to make, not this
    // one's: charging for a stream that does not exist would be the worst of
    // both. Fall through and let the command fail.
    if (before && !hasVehicle(before.spec)) {
      const paid = await payFor(prepared, {
        what: 'vehicles',
        next: await nextPrice(
          prepared.supabase,
          prepared.tenantId,
          prepared.tier,
          'vehicles',
          await countVehicles(prepared.supabase, prepared.tenantId),
        ),
      })
      if (!paid.ok) return paid
    }
  }

  return dispatchBlueprint(slug, parsed.data.id, (by) => ({
    type: 'ReshapeBlueprint',
    by,
    spec: parsed.data.spec,
  }))
}

/**
 * What adding a set of ours came to.
 *
 * A count rather than an id, because there is no single thing to point at: the
 * caller has just caused up to ten blueprints to exist and the only useful
 * answers are how many landed and how many were already there. `ok: false` is
 * still one sentence, which is what every panel in this feature draws.
 */
export type StarterResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string }

/**
 * Put one of our sets on the space's shelf.
 *
 * ---------------------------------------------------------------------------
 * Skipping by name, rather than adding a second Bun
 * ---------------------------------------------------------------------------
 * An item is a *word* resolved against the shelf (see `./craft`), so a space
 * holding two blueprints called "Bun" is a space where every recipe naming one
 * is a coin toss. Pressing the button twice is a thing people do - to see what
 * it does, or because the first press was on a slow connection - so the second
 * press has to be a no-op rather than a quietly broken kitchen.
 *
 * The comparison is the *shelf's* rule (`sameItem`: lowercase, spaces and
 * underscores the same) rather than string equality, because that is the rule a
 * recipe will resolve by later. Matching more loosely than the thing that reads
 * it would be a duplicate this could not see.
 *
 * ---------------------------------------------------------------------------
 * One event per blueprint, in a loop, and no transaction
 * ---------------------------------------------------------------------------
 * A set is not an aggregate: each of these is an ordinary blueprint on its own
 * stream from the moment it lands, and nothing afterwards knows they arrived
 * together. So a set that half-lands is a shelf with half a kitchen on it,
 * which the count says out loud and which pressing the button again fixes -
 * exactly the shape the skip above gives it.
 */
export async function drawStarterSet(slug: string, setId: string): Promise<StarterResult> {
  const set = starterSet(setId)
  if (!set) return { ok: false, error: 'No such set.' }

  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const standing = await listBlueprints(prepared.supabase, prepared.tenantId, prepared.userId)
  const wanted = set.things.filter(
    (starter) => !standing.some((entry) => sameItem(entry.name, starter.name)),
  )

  if (standing.length + wanted.length > MAX_BLUEPRINTS_PER_TENANT) {
    return {
      ok: false,
      error: `This space has room for ${MAX_BLUEPRINTS_PER_TENANT} blueprints. Retire a few first.`,
    }
  }

  /*
    The plan's allowance, and the one place this feature refuses rather than
    charges.

    A set is up to ten blueprints behind one press. `drawBlueprint` charges on
    the press because the price is drawn on the control and the control makes
    one thing; ten silent charges off one button is a different act, and a purse
    emptied by a set nobody priced is exactly the kind of thing this economy is
    written to make impossible. So the whole set is refused, with the number
    that would let it through.

    Checked against the *shelf* rather than `countBlueprints`, which is the
    count this path already has and is the same number for this purpose: a
    starter set is public, and the shelf query returns every public blueprint
    plus the asker's own.
  */
  const room = await nextPrice(
    prepared.supabase,
    prepared.tenantId,
    prepared.tier,
    'blueprints',
    standing.length + wanted.length - 1,
  )
  if (room.kind !== 'included') {
    return {
      ok: false,
      error: `This plan holds ${room.kind === 'refused' ? (room.limit ?? 'no') : 'fewer'} blueprints than that set needs. Buy a few slots first, or upgrade.`,
    }
  }

  /*
    The command loop is written out rather than run through `dispatchBlueprint`,
    and the reason is what that helper does *around* the append: it prepares the
    request and projects the read model, and a ten-thing set would therefore
    re-read the tenant ten times and rebuild the shelf ten times to add one
    kitchen. Membership is a fact about this request, so it is read once; the
    projection is a fold over new events, so it is run once at the end.
  */
  const { supabase, tenantId, userId, by } = prepared
  let added = 0

  try {
    for (const starter of wanted) {
      await executeCommand({
        supabase,
        decider: blueprintDecider,
        tenantId,
        streamId: randomUUID(),
        command: {
          type: 'DrawBlueprint',
          by,
          name: starter.name,
          spec: starter.spec,
          /*
            Public, which is the one decision here that is not "whatever a fresh
            blueprint does". A kitchen whose bun is private is a kitchen only its
            author can cook in: the board resolves the word against what the
            *room* can see, and half the point of a set is that somebody else
            walks up to it. See `listBlueprints`, whose filter is the one the
            shelf and the summon menu both run.
          */
          visibility: 'public',
        },
        metadata: { actorId: userId },
      })
      added += 1
    }
  } catch (error) {
    // Whatever landed before the refusal stays landed - see the note above on
    // why a set is not an aggregate. The count is not returned here because the
    // caller is being told something went wrong; pressing the button again adds
    // the rest.
    await runProjection(supabase, thingiverseProjection, tenantId)
    return toResult(error)
  }

  await runProjection(supabase, thingiverseProjection, tenantId)
  return { ok: true, added, skipped: set.things.length - wanted.length }
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

  // The plan's allowance, and the coins past it. The same two rungs and the
  // same ordering as `drawBlueprint` above - read the note there.
  const paid = await payFor(prepared, {
    what: 'clips',
    next: await nextPrice(prepared.supabase, prepared.tenantId, prepared.tier, 'clips', kept),
  })
  if (!paid.ok) return paid

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
