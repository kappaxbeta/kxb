'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createBattle } from '@/domain/battle/actions'
import { battleModeSchema, footballSettingsSchema } from '@/domain/battle/commands'
import {
  DEFAULT_FOOTBALL_SETTINGS,
  type BattleMode,
  type FootballSettings,
} from '@/domain/battle/events'
import { findTenantIdBySlug } from '@/domain/tenants/queries'
import { slugSchema } from '@/domain/tenants/commands'
import { requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * One space challenging another.
 *
 * Two rules here are not arbitrary - they fall straight out of who can read
 * what, and changing either one would break a match rather than merely change
 * its flavour:
 *
 * **The ground must be a public battlefield.** A space cannot read another
 * space's lounge blocks (`lounge_blocks_read_model` is gated on membership),
 * so a match fought there would render as an empty void for half the fighters.
 * `visibility = 'public'` is precisely the switch that makes an arena's blocks
 * readable by outsiders - see 20260803040000_battlefields.sql - so it is also
 * precisely the condition for a shared match.
 *
 * **The space that accepts hosts the match.** A battle stream belongs to one
 * tenant, and the events policy only lets you append to your own space's
 * streams. Whoever accepts is the one whose session creates the battle, so
 * they are the only side who *can* host it. The challenger's fighters then
 * reach that stream through `can_act_in_battle`, which the accepted challenge
 * row is what satisfies.
 */

export type ChallengeResult =
  | { ok: true; challengeId: string; battleId?: string }
  | { ok: false; error: string }

/**
 * The settings travel with the challenge, and only football has any.
 *
 * Refined rather than merely optional, because the alternative fails on the
 * wrong person's screen. A football challenge with no clock is accepted by this
 * table quite happily and then refused by the decider when the *challenged*
 * space tries to host it - so the side that did nothing wrong sees the error.
 * Checking it here puts the complaint in front of whoever left the field blank.
 */
const createSchema = z
  .object({
    targetSlug: slugSchema,
    mode: battleModeSchema,
    worldId: z.uuid('Pick a battlefield'),
    message: z.string().trim().max(200).optional(),
    football: footballSettingsSchema.optional(),
  })
  .refine((value) => value.mode !== 'football' || value.football !== undefined, {
    message: 'A football match needs a clock',
    path: ['football'],
  })
  .refine((value) => value.mode === 'football' || value.football === undefined, {
    message: 'Only a football match has those settings',
    path: ['football'],
  })

const respondSchema = z.object({
  challengeId: z.uuid(),
  accept: z.boolean(),
})

export async function createChallenge(
  slug: string,
  targetSlug: string,
  mode: BattleMode,
  worldId: string,
  message?: string,
  /** Required for `football`, and refused for anything else. */
  football?: FootballSettings,
): Promise<ChallengeResult> {
  const parsed = createSchema.safeParse({
    targetSlug,
    mode,
    worldId,
    message,
    football,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid challenge' }
  }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const targetId = await findTenantIdBySlug(supabase, parsed.data.targetSlug)
  if (!targetId) return { ok: false, error: 'No space with that address' }
  if (targetId === tenant.id) {
    return { ok: false, error: 'That is your own space — use the lounge' }
  }

  // The ground has to be one both sides can see. See the note at the top.
  const { data: arena } = await supabase
    .from('battlefields_read_model')
    .select('visibility, archived')
    .eq('world_id', parsed.data.worldId)
    .maybeSingle()

  if (!arena || arena.archived) return { ok: false, error: 'Battlefield not found' }
  if (arena.visibility !== 'public') {
    return {
      ok: false,
      error: 'Open that battlefield to other spaces first — they cannot see a private one',
    }
  }

  const { data, error } = await supabase
    .from('space_challenges')
    .insert({
      challenger_tenant_id: tenant.id,
      challenged_tenant_id: targetId,
      mode: parsed.data.mode,
      world_id: parsed.data.worldId,
      message: parsed.data.message ?? null,
      created_by: user.id,
      // Null throughout for the three modes that have no clock, which is what
      // `space_challenges_football_settings` insists on.
      duration_minutes: parsed.data.football?.durationMinutes ?? null,
      score_limit: parsed.data.football?.scoreLimit ?? null,
      damage_on: parsed.data.football?.damage ?? null,
      respawn_on: parsed.data.football?.respawn ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // The partial unique index on (challenger, challenged) where pending.
    if (error.code === '23505') {
      return { ok: false, error: 'You already have a challenge waiting with that space' }
    }
    return { ok: false, error: `Failed to send the challenge: ${error.message}` }
  }

  revalidatePath(`/t/${slug}/battle/challenges`)
  return { ok: true, challengeId: data.id }
}

export async function respondToChallenge(
  slug: string,
  challengeId: string,
  accept: boolean,
): Promise<ChallengeResult> {
  const parsed = respondSchema.safeParse({ challengeId, accept })
  if (!parsed.success) return { ok: false, error: 'Invalid challenge' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant } = context

  const { data: challenge, error } = await supabase
    .from('space_challenges')
    // One string literal, not a concatenation: supabase-js parses this at the
    // type level to build the row type, and it can only do that for a literal.
    .select(
      'id, challenger_tenant_id, challenged_tenant_id, mode, world_id, status, duration_minutes, score_limit, damage_on, respawn_on',
    )
    .eq('id', parsed.data.challengeId)
    .maybeSingle()

  if (error) return { ok: false, error: `Failed to load the challenge: ${error.message}` }
  if (!challenge) return { ok: false, error: 'Challenge not found' }

  // Only the side being challenged answers it. The challenger withdraws
  // instead - see cancelChallenge.
  if (challenge.challenged_tenant_id !== tenant.id) {
    return { ok: false, error: 'That challenge is not yours to answer' }
  }
  if (challenge.status !== 'pending') {
    return { ok: false, error: 'That challenge has already been answered' }
  }

  if (!parsed.data.accept) {
    const { error: declineError } = await supabase
      .from('space_challenges')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', challenge.id)
      .eq('status', 'pending')

    if (declineError) {
      return { ok: false, error: `Failed to decline: ${declineError.message}` }
    }

    revalidatePath(`/t/${slug}/battle/challenges`)
    return { ok: true, challengeId: challenge.id }
  }

  /**
   * Accepting: make the match first, point the challenge at it second.
   *
   * That order is forced by the foreign key - `battle_id` references a row the
   * projection has not written yet, so it cannot be set before the battle
   * exists. The cost is that a failure between the two steps leaves a battle
   * nobody was invited to, sitting in the lobby. That is a stray match rather
   * than a broken one, and the alternative - dropping the key so the two could
   * be written together - would trade a visible loose end for an invisible one.
   */
  /**
   * The match the challenger asked for, transcribed rather than re-decided.
   *
   * `duration_minutes` is guaranteed present for football by the table's own
   * check constraint, so the fallback below is for the type rather than for a
   * case that can happen - but a challenge row written before that constraint
   * existed would otherwise crash the accept, and the default is a sane match.
   */
  const mode = challenge.mode as BattleMode
  const football: FootballSettings | undefined =
    mode === 'football'
      ? {
          durationMinutes:
            challenge.duration_minutes ??
            DEFAULT_FOOTBALL_SETTINGS.durationMinutes,
          ...(challenge.score_limit ? { scoreLimit: challenge.score_limit } : {}),
          damage: challenge.damage_on ?? DEFAULT_FOOTBALL_SETTINGS.damage,
          respawn: challenge.respawn_on ?? DEFAULT_FOOTBALL_SETTINGS.respawn,
        }
      : undefined

  const battle = await createBattle(
    slug,
    'Challenge match',
    mode,
    challenge.world_id ?? undefined,
    football,
  )
  if (!battle.ok) return { ok: false, error: battle.error }

  const { error: acceptError } = await supabase
    .from('space_challenges')
    .update({
      status: 'accepted',
      battle_id: battle.battleId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', challenge.id)
    .eq('status', 'pending')

  if (acceptError) {
    return { ok: false, error: `Failed to accept: ${acceptError.message}` }
  }

  revalidatePath(`/t/${slug}/battle/challenges`)
  return { ok: true, challengeId: challenge.id, battleId: battle.battleId }
}

/** Withdraw one you sent. */
export async function cancelChallenge(
  slug: string,
  challengeId: string,
): Promise<ChallengeResult> {
  const parsed = z.uuid().safeParse(challengeId)
  if (!parsed.success) return { ok: false, error: 'Invalid challenge' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const { supabase, tenant } = context

  const { error } = await supabase
    .from('space_challenges')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', parsed.data)
    // Both guards matter: only the sender may withdraw, and only while it is
    // still waiting - withdrawing an accepted challenge would strand the match
    // it already created.
    .eq('challenger_tenant_id', tenant.id)
    .eq('status', 'pending')

  if (error) return { ok: false, error: `Failed to withdraw: ${error.message}` }

  revalidatePath(`/t/${slug}/battle/challenges`)
  return { ok: true, challengeId: parsed.data }
}
