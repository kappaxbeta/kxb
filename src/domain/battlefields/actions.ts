'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { battlefieldDecider } from '@/domain/battlefields/aggregate'
import {
  type BattlefieldCommand,
  battlefieldIdSchema,
  createBattlefieldSchema,
  renameBattlefieldSchema,
  setVisibilitySchema,
} from '@/domain/battlefields/commands'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { searchPublicBattlefields } from '@/domain/battlefields/queries'
import type { BattlefieldVisibility } from '@/domain/battlefields/events'
import { templateWorldId } from '@/domain/battlefields/template-worlds'
import { layTemplate } from '@/domain/lounge/lay-template'
import { copyWorld, countBlocks, MAX_COPY_BLOCKS } from '@/domain/lounge/copy'
import { findTemplate } from '@/domain/lounge/templates'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { hasRole, requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Battlefield lifecycle.
 *
 * The authorization split here is worth reading before changing anything. The
 * decider enforces what *this stream* can see - it exists, it is not archived,
 * the change is not a no-op. It cannot enforce who you are, because the roster
 * lives on the tenant's stream and a decider that read another aggregate would
 * not be a decider.
 *
 * So two checks that the decider cannot make happen here instead:
 *
 *   1. **Role.** Creating and retiring an arena is an owner/admin call, the
 *      same pair that can flip the lounge's mode.
 *   2. **Ownership.** The battlefield's `tenant_id` must be the space the
 *      caller is acting in. Without it, a member of one workspace could rename
 *      another's arena by guessing its id - the command would reach a stream
 *      the decider is perfectly happy to write to.
 *
 * `executeCommand` is called with the *caller's* tenant id, so RLS on the
 * events table would stop a cross-tenant write anyway. The check above is what
 * turns that from an opaque database error into an answer.
 */

export type BattlefieldResult =
  | { ok: true; worldId: string }
  | { ok: false; error: string }

function toResult(error: unknown): BattlefieldResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That battlefield changed elsewhere. Try again.' }
  }
  throw error
}

/**
 * Shared guard: membership, the flag, billing, and role.
 *
 * Returns the pieces every action below needs, or the reason it may not run.
 */
type Guarded =
  | { ok: false; error: string }
  | { ok: true; supabase: Client; tenantId: string; userId: string; slug: string }

async function guard(slug: string): Promise<Guarded> {
  const guarded = await guardMember(slug)
  if (!guarded.ok) return guarded

  // Hiding the button hides nothing - a Server Action is a public endpoint.
  if (!guarded.canManage) {
    return { ok: false, error: 'Only an owner or admin can manage battlefields' }
  }

  return guarded
}

/**
 * The same guard without the role check: membership, the flag, and billing.
 *
 * Everything in this file except `ensureTemplateWorld` needs the role too - an
 * arena is a thing somebody made, and unmaking or renaming other people's work
 * is an owner/admin call. The one exception is standing up a *catalogue*
 * template, where there is nothing to abuse: the name, the contents and the id
 * are all fixed by the code (see domain/lounge/templates.ts and
 * ./template-worlds.ts), so the most an ordinary member can do with it is cause
 * their space's one standard pitch to exist. Making that owner-only would mean
 * a member could not start a football match until an owner had been through the
 * battlefields page first, which is the opposite of it being the default.
 */
async function guardMember(
  slug: string,
): Promise<Extract<Guarded, { ok: false }> | (Extract<Guarded, { ok: true }> & { canManage: boolean })> {
  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  return {
    ok: true,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    slug,
    canManage: hasRole(context, ['owner', 'admin']),
  }
}

/** Prove this arena belongs to the space the caller is acting in. */
async function assertOwned(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('battlefields_read_model')
    .select('tenant_id')
    .eq('world_id', worldId)
    .maybeSingle()

  if (error) throw new Error(`Failed to check battlefield: ${error.message}`)
  // Same answer for "does not exist" and "belongs to someone else", for the
  // reason requireRole gives in the tenant aggregate: the second is information.
  if (!data || data.tenant_id !== tenantId) return 'Battlefield not found'
  return null
}

async function run(
  guarded: Extract<Guarded, { ok: true }>,
  worldId: string,
  command: BattlefieldCommand,
): Promise<BattlefieldResult> {
  const { supabase, tenantId, slug } = guarded

  try {
    await executeCommand({
      supabase,
      decider: battlefieldDecider,
      tenantId,
      // The battlefield's stream id is its world id.
      streamId: worldId,
      command,
      metadata: { actorId: guarded.userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, battlefieldsProjection, tenantId)
  revalidatePath(`/t/${slug}/battle/battlefields`)
  return { ok: true, worldId }
}

export async function createBattlefield(
  slug: string,
  name: string,
  visibility: BattlefieldVisibility = 'space',
): Promise<BattlefieldResult> {
  const parsed = createBattlefieldSchema.safeParse({ name, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  // Minted here rather than derived, because there is nothing to derive it
  // from: two arenas in one space can share a name, and should be able to.
  const worldId = randomUUID()

  return run(guarded, worldId, {
    type: 'CreateBattlefield',
    actorId: guarded.userId,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
  })
}

/**
 * Save a world, as it stands, as a named arena.
 *
 * This is the path most arenas will actually be made by: people build in the
 * lounge together because that is where everyone already is, and then want to
 * keep what they made and fight on it. Building in an empty battlefield editor
 * is the other way round, and a lonelier one. A room saves the same way, for
 * the same reason - see the note on `sourceWorldId`.
 *
 * A copy, not a link - see the note at the top of domain/lounge/copy.ts. The
 * source carries on being what it was, and can be cleared or rebuilt without
 * touching the arena that was saved from it.
 */
export async function saveWorldAsArena(
  slug: string,
  name: string,
  visibility: BattlefieldVisibility = 'space',
  /** Omitted means the workspace's own lounge. A room passes its id. */
  sourceWorldId?: string,
): Promise<BattlefieldResult> {
  const parsed = createBattlefieldSchema.safeParse({ name, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const { supabase, tenantId, userId } = guarded

  // The lounge's world id is the tenant's own id.
  const from = sourceWorldId ?? tenantId
  const size = await countBlocks(supabase, tenantId, from)
  if (size === 0) {
    return {
      ok: false,
      error: `There is nothing in ${sourceWorldId ? 'this room' : 'the lounge'} to save yet`,
    }
  }
  if (size > MAX_COPY_BLOCKS) {
    return {
      ok: false,
      error: `That is ${size.toLocaleString()} blocks — too much to copy in one go`,
    }
  }

  const worldId = randomUUID()

  const created = await run(guarded, worldId, {
    type: 'CreateBattlefield',
    actorId: userId,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
  })
  if (!created.ok) return created

  try {
    await copyWorld(supabase, tenantId, userId, from, worldId)
  } catch (error) {
    // The arena exists but is empty. Left in place rather than unwound: an
    // empty arena is visible and retirable, whereas a half-copied one that
    // deleted itself would leave somebody wondering where their save went.
    return {
      ok: false,
      error: `The arena was created but copying stopped: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    }
  }

  revalidatePath(`/t/${slug}/battle/battlefields`)
  return { ok: true, worldId }
}

/**
 * The space's standing copy of a catalogue template, laid if it is not there.
 *
 * This is what makes "the pitch" a place rather than a button. A match has to
 * be fought on a battlefield row - `createBattle` checks for one - so before
 * this existed the only way to play football was for somebody to first build an
 * arena, then lay a pitch into it, then remember to pick it. Now the lobby
 * offers the pitch outright and this stands it up the first time anybody
 * accepts.
 *
 * Lazy rather than seeded at signup, deliberately: laying a pitch is a couple
 * of thousand block events, and doing that for every space that will never
 * play football is a lot of log for nothing. The cost lands once, on the first
 * person who asks for it, behind a button that already says it is working.
 *
 * Idempotent in both halves. The id is derived, so a second call finds the row
 * and returns early; and if the row exists but the world was emptied, this
 * leaves it alone - somebody who cleared their pitch on purpose should not have
 * it grow back.
 */
export async function ensureTemplateWorld(
  slug: string,
  templateId: string,
): Promise<BattlefieldResult> {
  const template = findTemplate(templateId)
  if (!template) return { ok: false, error: 'No such world template' }

  const guarded = await guardMember(slug)
  if (!guarded.ok) return guarded

  const { supabase, tenantId } = guarded
  const worldId = templateWorldId(tenantId, template.id)

  const { data: existing, error } = await supabase
    .from('battlefields_read_model')
    .select('world_id, archived')
    .eq('world_id', worldId)
    .maybeSingle()

  if (error) throw new Error(`Failed to check the template world: ${error.message}`)

  // Already standing, and not retired. Retired is treated as absent: the
  // decider will refuse to re-create the stream, so say so rather than
  // pretending it worked.
  if (existing && !existing.archived) return { ok: true, worldId }
  if (existing?.archived) {
    return { ok: false, error: `“${template.name}” was retired — un-retire it to use it` }
  }

  /**
   * Any member, including the first one ever to ask.
   *
   * This used to refuse a member here and tell them to fetch an owner, which
   * made the pitch the default only for spaces whose owner had happened to
   * press the button first - the opposite of what `guardMember` above exists
   * for. The refusal was there because the block-laying half went through
   * `applyWorldTemplate`, which is owner-or-admin because it *replaces* a world
   * somebody is standing in.
   *
   * That rule does not apply to what happens below. The world is one this call
   * created empty three lines ago, at an id derived from the tenant and the
   * template, with a name and contents fixed by the catalogue. There is nothing
   * in it to destroy and nothing about it to choose, so laying it is not a
   * moderator's act - which is why it now calls `layTemplate` directly rather
   * than going through the action that guards the destructive case.
   */

  const created = await run(guarded, worldId, {
    type: 'CreateBattlefield',
    actorId: guarded.userId,
    name: template.name,
    // Private to the space that laid it. Every space gets its own copy, so
    // there is nothing here for anybody else to discover - and opening it is a
    // deliberate act from the battlefields page.
    visibility: 'space',
  })
  if (!created.ok) return created

  // Lay it. Failing here leaves an empty arena rather than unwinding, for the
  // reason `saveWorldAsArena` gives above: an empty arena is visible and can
  // be rebuilt, whereas one that deleted itself is a mystery.
  try {
    await layTemplate(supabase, tenantId, worldId, guarded.userId, template)
  } catch (error) {
    return toResult(error)
  }

  return { ok: true, worldId }
}

/** One published arena, as the match-setup search shows it. */
export interface PublishedWorld {
  worldId: string
  name: string
  /** Null when the arena is public but the space that built it is not readable. */
  spaceName: string | null
}

/**
 * Published arenas from other spaces, matched by name.
 *
 * The discovery half of picking where to fight. It exists as an action rather
 * than as page data because the results change as somebody types, and shipping
 * every public arena on the platform to the lobby on first paint to filter it
 * client-side is the wrong shape - the corpus grows with the platform, and the
 * useful answer is almost always the first few.
 *
 * Read-only and role-free: anybody who may set up a match may look for
 * somewhere to hold it. The visibility rule is in the query - only `public`,
 * only unarchived, never this space's own (they are already listed above the
 * search).
 */
export async function findPublishedWorlds(
  slug: string,
  search: string,
): Promise<
  { ok: true; worlds: PublishedWorld[] } | { ok: false; error: string }
> {
  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const found = await searchPublicBattlefields(
    context.supabase,
    context.tenant.id,
    search,
    // A short list on purpose: this drops into a menu under a search box, and
    // forty results in a menu is a list nobody reads to the end of.
    12,
  )

  return {
    ok: true,
    worlds: found.map((world) => ({
      worldId: world.worldId,
      name: world.name,
      spaceName: world.spaceName,
    })),
  }
}

export async function renameBattlefield(
  slug: string,
  worldId: string,
  name: string,
): Promise<BattlefieldResult> {
  const parsed = renameBattlefieldSchema.safeParse({ worldId, name })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const denied = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.worldId)
  if (denied) return { ok: false, error: denied }

  return run(guarded, parsed.data.worldId, {
    type: 'RenameBattlefield',
    actorId: guarded.userId,
    name: parsed.data.name,
  })
}

export async function setBattlefieldVisibility(
  slug: string,
  worldId: string,
  visibility: BattlefieldVisibility,
): Promise<BattlefieldResult> {
  const parsed = setVisibilitySchema.safeParse({ worldId, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid visibility' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const denied = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.worldId)
  if (denied) return { ok: false, error: denied }

  return run(guarded, parsed.data.worldId, {
    type: 'SetBattlefieldVisibility',
    actorId: guarded.userId,
    visibility: parsed.data.visibility,
  })
}

export async function archiveBattlefield(
  slug: string,
  worldId: string,
): Promise<BattlefieldResult> {
  const parsed = battlefieldIdSchema.safeParse({ worldId })
  if (!parsed.success) {
    return { ok: false, error: 'Invalid battlefield' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const denied = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.worldId)
  if (denied) return { ok: false, error: denied }

  return run(guarded, parsed.data.worldId, {
    type: 'ArchiveBattlefield',
    actorId: guarded.userId,
  })
}
