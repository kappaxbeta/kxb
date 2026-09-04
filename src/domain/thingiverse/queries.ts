import 'server-only'
import { hiddenAmong, isHidden } from '@/domain/moderation/hidden'
import type { BakedClip } from '@/domain/animator/clip'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'
import { type EmoteTree, freshTree } from '@/domain/thingiverse/emote-tree'
import { MAX_CLIPS_PER_TENANT } from '@/domain/thingiverse/clip-events'
import type { BlueprintVisibility } from '@/domain/thingiverse/events'
import {
  MAX_THINGS_PER_WORLD,
  type ThingTuning,
} from '@/domain/thingiverse/thing-events'
import type { Client } from '@/es/store'

/**
 * Reading the shelf, and reading a room.
 *
 * Neither is paged. A space holds at most `MAX_BLUEPRINTS_PER_TENANT`
 * blueprints and a world at most `MAX_THINGS_PER_WORLD` things, and both caps
 * exist precisely so that "everything here" is one request - the same call the
 * goals and images queries make, and for the same reason the blocks query
 * cannot.
 */

export interface BlueprintView {
  id: string
  name: string
  spec: BlueprintSpec
  ownerId: string
  visibility: BlueprintVisibility
  /** Whether the person asking owns it. Decides what the rail lets them do. */
  mine: boolean
}

export interface ThingView {
  id: string
  blueprintId: string
  x: number
  y: number
  z: number
  facing: number
  scale: number
  /** This one's disagreements with its blueprint. Empty when it agrees. */
  tuning: ThingTuning
  /** Who summoned it. Shown in the rail; not a permission - see the decider. */
  placedBy: string | null
  /** Whether it outlives whoever summoned it. See `ThingSummoned.keep`. */
  keep: boolean
  /**
   * The blueprint, resolved.
   *
   * Carried on the thing rather than left to a second lookup in the client,
   * because the scene cannot draw a thing without it: the model, the scale and
   * whether it blocks all live on the blueprint, and a thing whose blueprint
   * arrived one render later would pop into existence at the wrong size.
   *
   * Null only when the row points at a blueprint that is not in the table at
   * all - a projection that is mid-replay, or a thing summoned in a space whose
   * shelf was rebuilt. The renderer skips those rather than guessing, which is
   * why this is nullable rather than a default spec that would draw a grass
   * block where somebody's lamp used to be.
   */
  blueprint: BlueprintView | null
}

/**
 * The shelf, as one person sees it.
 *
 * Theirs and the space's public ones, in one list, each marked. Two queries
 * would have let the rail draw its two sections without a filter - and would
 * have made "how many blueprints does this space have" two round trips and the
 * ordering of a merged list somebody else's problem.
 *
 * Retired blueprints are left out here and deliberately *not* left out of
 * `listThings` below: the shelf is what you may summon, and a room is what is
 * standing in it. A retired lamp still lights the corridor it is in.
 */
export async function listBlueprints(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<BlueprintView[]> {
  const { data, error } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('id, name, spec, owner_id, visibility')
    .eq('tenant_id', tenantId)
    .eq('retired', false)
    .or(`visibility.eq.public,owner_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    throw new Error(`Failed to load blueprints: ${error.message}`)
  }

  // Anything a moderator has taken down. Filtered here rather than in the
  // policy - see `hiddenAmong`, which argues why, and which is the one place to
  // grep for if that ever changes.
  const rows = data ?? []
  const down = await hiddenAmong(supabase, rows.map((row) => row.id))

  return rows.filter((row) => !down.has(row.id)).map((row) => toBlueprint(row, userId))
}

/**
 * One blueprint, by id, or null.
 *
 * Its own query rather than `listBlueprints().find()`, which is what the first
 * draft of the composer did and which is wrong twice: it fetches five hundred
 * rows to read one, and it silently returns nothing for a blueprint that is the
 * five hundred and first. The policy does the same work either way - the `or`
 * below is the same visibility rule - so this costs nothing and answers exactly
 * the question the route asks.
 */
export async function findBlueprint(
  supabase: Client,
  tenantId: string,
  userId: string,
  id: string,
): Promise<BlueprintView | null> {
  const { data, error } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('id, name, spec, owner_id, visibility')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('retired', false)
    .or(`visibility.eq.public,owner_id.eq.${userId}`)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load the blueprint: ${error.message}`)
  }

  if (!data) return null
  // A taken-down blueprint is not found rather than found-and-refused: the
  // composer's route reads this, and "no such blueprint" is a page it already
  // draws, whereas a null spec is not.
  if (await isHidden(supabase, data.id)) return null

  return toBlueprint(data, userId)
}

/** How many blueprints the space has, for the cap on drawing another. */
export async function countBlueprints(
  supabase: Client,
  tenantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('retired', false)

  if (error) {
    throw new Error(`Failed to count blueprints: ${error.message}`)
  }

  return count ?? 0
}

/**
 * How many of those are vehicles.
 *
 * Its own count because a vehicle is its own line on the plan. `TierLimits`
 * says so in as many words - vehicles are not counted among blueprints,
 * "because they are priced two orders of magnitude apart" - and the difference
 * is not a rounding: a blueprint costs 30 to 60 coins past the allowance and a
 * vehicle costs 10,000 to 50,000. Counting one against the other would either
 * charge somebody a vehicle's price for a barrel or let a car through on a
 * blueprint's.
 *
 * It does *not* replace `countBlueprints`, which stays exactly as it is. That
 * one counts rows for the platform ceiling in `blueprint.ts` - a real limit on
 * a real box, and a vehicle occupies a row like anything else. This one counts
 * for the plan. Two questions, two numbers, and the create path subtracts.
 *
 * `spec->vehicle` rather than a column: the block is part of the spec and lives
 * or dies with it, and a column would be a second copy for a projection to keep
 * in step.
 */
export async function countVehicles(
  supabase: Client,
  tenantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('retired', false)
    .not('spec->vehicle', 'is', null)

  if (error) {
    throw new Error(`Failed to count vehicles: ${error.message}`)
  }

  return count ?? 0
}

/**
 * Everything standing in one world, with its blueprint attached.
 *
 * Two queries rather than an embedded join, because these are read models and
 * read models here carry no foreign keys - by design, since a projection has to
 * be able to apply events in whatever order the log hands them over, and a key
 * would make a thing whose blueprint has not projected yet a write that fails
 * rather than one that resolves a moment later.
 *
 * The second query asks for the blueprints *by id* and does not filter on
 * `retired`: see the note on `BlueprintRetired` about why taking something off
 * the shelf does not go round the rooms collecting it.
 */
export async function listThings(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
): Promise<ThingView[]> {
  const { data, error } = await supabase
    .from('thingiverse_things_read_model')
    .select('id, blueprint_id, x, y, z, facing, scale, tuning, placed_by, keep')
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    // One more than a world may hold, so a world that somehow exceeded the cap
    // still loads whole rather than quietly missing a piece of furniture.
    .limit(MAX_THINGS_PER_WORLD + 1)

  if (error) {
    throw new Error(`Failed to load things: ${error.message}`)
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  const ids = [...new Set(rows.map((row) => row.blueprint_id))]
  const { data: shelf, error: shelfError } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('id, name, spec, owner_id, visibility')
    .eq('tenant_id', tenantId)
    .in('id', ids)

  if (shelfError) {
    throw new Error(`Failed to load blueprints for a world: ${shelfError.message}`)
  }

  const byId = new Map(
    (shelf ?? []).map((row) => [row.id, toBlueprint(row, userId)] as const),
  )

  return rows.map((row) => ({
    id: row.id,
    blueprintId: row.blueprint_id,
    x: row.x,
    y: row.y,
    z: row.z,
    facing: row.facing,
    scale: row.scale,
    tuning: (row.tuning ?? {}) as ThingTuning,
    placedBy: row.placed_by,
    keep: row.keep,
    blueprint: byId.get(row.blueprint_id) ?? null,
  }))
}

/** How many things are already standing here, for the cap on summoning another. */
export async function countThings(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('thingiverse_things_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)
    .eq('deleted', false)

  if (error) {
    throw new Error(`Failed to count things: ${error.message}`)
  }

  return count ?? 0
}

/**
 * One row, as the app sees it.
 *
 * `spec` is `jsonb` and Postgres will not check it, so this is a cast and says
 * so. What makes it honest is that every write went through `specSchema` and
 * the decider's own `assertSpec` - see the note there about why the aggregate
 * checks a second time. A row that somehow held nonsense would draw nothing and
 * be editable back into shape, which is the failure this is allowed to have.
 */
function toBlueprint(
  row: {
    id: string
    name: string
    spec: unknown
    owner_id: string
    visibility: string
  },
  userId: string,
): BlueprintView {
  return {
    id: row.id,
    name: row.name,
    spec: row.spec as BlueprintSpec,
    ownerId: row.owner_id,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    mine: row.owner_id === userId,
  }
}

/**
 * The space's emote menu, or an empty one.
 *
 * Never null, and that is the whole shape of it: a space that has never
 * arranged a menu has an empty menu, not an absent one, and every caller would
 * otherwise write the same `?? { roots: [] }` - which is a default that drifts
 * the moment one of them writes `[]` instead.
 *
 * Forgiving on error like `readProfileSkin`, and for a related reason: the menu
 * is read by a *world*, on the way in, and a room that refused to open because
 * a menu could not be read would be trading a whole space for a picker.
 */
export async function readEmoteTree(
  supabase: Client,
  tenantId: string,
): Promise<{ tree: EmoteTree; byId: string | null }> {
  const { data, error } = await supabase
    .from('thingiverse_emotes_read_model')
    .select('tree, by_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data) return { tree: freshTree(), byId: null }
  // A cast through `unknown`, and it says what every jsonb read in this file
  // says: Postgres will not check the shape, and `treeProblems` in the decider
  // is what makes it true on the way in. A row that somehow held nonsense would
  // draw an empty menu and be editable back into shape, which is the failure
  // this is allowed to have.
  return { tree: data.tree as unknown as EmoteTree, byId: data.by_id }
}

export interface ClipView {
  id: string
  name: string
  /** The rig it was authored against. See `ClipDrawn.skeleton`. */
  skeleton: string
  /** What plays. See `BakedClip`. */
  clip: BakedClip
  ownerId: string
  visibility: BlueprintVisibility
  mine: boolean
}

/**
 * The clips a space has animated for itself.
 *
 * Yours and the space's public ones, in one list, exactly as the blueprints
 * come - and, like them, not paged, because `MAX_CLIPS_PER_TENANT` exists so
 * that "everything here" is one request.
 *
 * The baked samples travel with the row. That is the expensive decision on this
 * page and it is the right one: what reads this is a *world*, and a world that
 * fetched a clip the moment somebody sat down would play the first half-second
 * of a chair as a body standing still. Sixty-four clips of a few tens of
 * kilobytes is the ceiling, and `MAX_CLIP_SAMPLES` is what keeps each one
 * honest.
 *
 * `doc` is deliberately *not* selected: it is what the animator reopens, it is
 * the same size again, and nothing in a running world has any use for it. The
 * editor reads it by id - see `findClipDoc`.
 */
export async function listClips(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<ClipView[]> {
  const { data, error } = await supabase
    .from('thingiverse_clips_read_model')
    .select('id, name, skeleton, clip, owner_id, visibility')
    .eq('tenant_id', tenantId)
    .eq('retired', false)
    .or(`visibility.eq.public,owner_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(MAX_CLIPS_PER_TENANT + 1)

  if (error) {
    throw new Error(`Failed to load clips: ${error.message}`)
  }

  const clipRows = data ?? []
  const downClips = await hiddenAmong(supabase, clipRows.map((row) => row.id))

  return clipRows.filter((row) => !downClips.has(row.id)).map((row) => ({
    id: row.id,
    name: row.name,
    skeleton: row.skeleton,
    clip: row.clip as unknown as BakedClip,
    ownerId: row.owner_id,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    mine: row.owner_id === userId,
  }))
}

/** How many clips the space has, for the cap on making another. */
export async function countClips(supabase: Client, tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from('thingiverse_clips_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('retired', false)

  if (error) throw new Error(`Failed to count clips: ${error.message}`)
  return count ?? 0
}

/**
 * One clip's authoring document, for reopening it in the animator.
 *
 * Its own query because it is the only thing that wants `doc`, and it is as
 * large again as the samples - see `listClips`.
 */
export async function findClipDoc(
  supabase: Client,
  tenantId: string,
  id: string,
): Promise<{ name: string; doc: unknown } | null> {
  const { data, error } = await supabase
    .from('thingiverse_clips_read_model')
    .select('name, doc')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load that clip: ${error.message}`)
  if (!data) return null
  // Taken down reads as not found, the same call `findBlueprint` makes.
  if (await isHidden(supabase, id)) return null

  return { name: data.name, doc: data.doc }
}
