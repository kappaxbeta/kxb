'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createBattle, joinBattle } from '@/domain/battle/actions'
import { battleModeFor } from '@/domain/xps/battle-mode'
import { loadPlayableXp } from '@/domain/xps/playable'
import {
  type BattleMode,
  DEFAULT_FOOTBALL_SETTINGS,
  DEFAULT_RACE_SETTINGS,
  type Side,
  sidesFor,
} from '@/domain/battle/events'
import { tournamentDecider } from '@/domain/tournament/aggregate'
import {
  createTournamentSchema,
  matchSchema,
  type TournamentCommand,
  tournamentIdSchema,
} from '@/domain/tournament/commands'
import { fold } from '@/domain/tournament/fold'
import { tournamentsProjection } from '@/domain/tournament/projection'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import {
  battleOpen,
  requireFeature,
  requireTenant,
  writeBlockedReason,
  xpOpen,
} from '@/lib/tenant'

/**
 * Running a tournament.
 *
 * A tournament does not fight anybody - it creates battles and reads their
 * results. That keeps one referee rather than two: whether Ada beat Bo is
 * decided by the battle aggregate, exactly as it is for a one-off match, and
 * this aggregate only records which bracket slot that answered.
 *
 * `playMatch` is where the two meet: it makes the battle, enters both
 * entrants, and points the bracket at it.
 */

export type TournamentResult =
  | { ok: true; tournamentId: string; battleId?: string }
  | { ok: false; error: string }

function toResult(error: unknown): TournamentResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That tournament changed underneath you. Try again.' }
  }
  throw error
}

async function run(
  supabase: Client,
  tenantId: string,
  tournamentId: string,
  actorId: string,
  command: TournamentCommand,
  slug: string,
): Promise<TournamentResult> {
  try {
    await executeCommand({
      supabase,
      decider: tournamentDecider,
      tenantId,
      streamId: tournamentId,
      command,
      metadata: { actorId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, tournamentsProjection, tenantId)
  revalidatePath(`/t/${slug}/battle/tournaments`)
  return { ok: true, tournamentId }
}

export async function createTournament(
  slug: string,
  name: string,
  mode: BattleMode,
  worldId: string,
  /**
   * A level to fight the whole bracket inside, instead of an arena.
   *
   * Last and optional, the same shape `createBattle`'s own `xpId` takes and for
   * the reason argued there - a new parameter in the middle silently re-reads
   * every existing call.
   *
   * When it is set, `worldId` is ignored and `mode` is overruled: the level
   * decides both. See below.
   */
  xpId?: string,
): Promise<TournamentResult> {
  const parsed = createTournamentSchema.safeParse({
    name,
    mode,
    // The two grounds are exclusive - the schema refuses both - so a caller
    // that named a level does not also name the arena its form had selected.
    ...(xpId ? { xpId } : { worldId }),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid tournament' }
  }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')
  if (!battleOpen(context)) {
    return { ok: false, error: 'Matches are switched off for this space' }
  }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  if (parsed.data.worldId) {
    // Same rule as a one-off match: the ground must be ours, or public.
    const { data: arena } = await supabase
      .from('battlefields_read_model')
      .select('tenant_id, visibility, archived')
      .eq('world_id', parsed.data.worldId)
      .maybeSingle()

    if (!arena || arena.archived) return { ok: false, error: 'Battlefield not found' }
    if (arena.tenant_id !== tenant.id && arena.visibility !== 'public') {
      return { ok: false, error: 'Battlefield not found' }
    }
  }

  /**
   * A level, checked by being loaded, and then asked what shape it is.
   *
   * The plan gate first, because "XP is not switched on" and "that level does
   * not exist" are different sentences and an xo space deserves the first one.
   * `loadPlayableXp` is what makes the reference a *permission* check as well
   * as an existence one - a private draft in somebody else's space comes back
   * as not found rather than as a bracket nobody can play.
   *
   * **The mode is the level's, not the form's.** `battleModeFor` reads the
   * `rules.sides` its author set, or derives it from the team spawns they
   * placed - and it is settled *here*, once, rather than per round: the sides a
   * bracket hands its two entrants come from `state.mode`, so a tournament
   * whose stored mode disagreed with the matches it stages would hand somebody
   * a side the battle refuses.
   */
  let shape = parsed.data.mode
  if (parsed.data.xpId) {
    if (!xpOpen(context)) {
      return {
        ok: false,
        error: context.features.xp
          ? 'Levels are part of xp. Move this space to xp to run a bracket in one.'
          : 'XP is not switched on for this space',
      }
    }

    const document = await loadPlayableXp(supabase, tenant.id, parsed.data.xpId)
    if (!document) return { ok: false, error: 'XP not found' }
    shape = battleModeFor(document)
  }

  const tournamentId = randomUUID()

  return run(supabase, tenant.id, tournamentId, user.id, {
    type: 'CreateTournament',
    actorId: user.id,
    name: parsed.data.name,
    mode: shape,
    /*
     * The host's own space when a level is the ground, exactly as
     * `createBattle` stores it. The bracket still *has* a world - the matches
     * it stages need one - and it is the one every XP match already uses.
     */
    worldId: parsed.data.worldId ?? tenant.id,
    ...(parsed.data.xpId ? { xpId: parsed.data.xpId } : {}),
    hostTenantId: tenant.id,
    // The format, settled once for the whole bracket rather than per match, and
    // recorded so `playMatch` has something to hand `createBattle`. The mode's
    // defaults for now - there is no control for these on the setup form yet,
    // and a football tournament that cannot stage a match is worse than one
    // whose matches are five minutes long.
    ...(shape === 'football' ? { football: DEFAULT_FOOTBALL_SETTINGS } : {}),
    ...(shape === 'race' ? { race: DEFAULT_RACE_SETTINGS } : {}),
  }, slug)
}

export async function enterTournament(
  slug: string,
  tournamentId: string,
): Promise<TournamentResult> {
  const parsed = tournamentIdSchema.safeParse({ tournamentId })
  if (!parsed.success) return { ok: false, error: 'Invalid tournament' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'RegisterEntrant',
    actorId: user.id,
    tenantId: tenant.id,
  }, slug)
}

export async function withdrawFromTournament(
  slug: string,
  tournamentId: string,
): Promise<TournamentResult> {
  const parsed = tournamentIdSchema.safeParse({ tournamentId })
  if (!parsed.success) return { ok: false, error: 'Invalid tournament' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const { supabase, tenant, user } = context

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'WithdrawEntrant',
    actorId: user.id,
  }, slug)
}

export async function startTournament(
  slug: string,
  tournamentId: string,
): Promise<TournamentResult> {
  const parsed = tournamentIdSchema.safeParse({ tournamentId })
  if (!parsed.success) return { ok: false, error: 'Invalid tournament' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'StartTournament',
    actorId: user.id,
  }, slug)
}

/**
 * Put one bracket match into a battle.
 *
 * Three steps that have to happen in this order:
 *
 *   1. create the battle,
 *   2. enter both entrants onto its roster,
 *   3. point the bracket slot at it.
 *
 * Step 3 last, because the decider refuses a second battle for a slot that
 * already has one - so an interrupted run leaves a battle nobody is pointed at
 * rather than a slot pointed at a battle nobody is in. Re-running then makes a
 * fresh one and the stray is ignored, which is the failure worth having.
 *
 * Note step 2 enters *both* entrants, which is the one place the tournament
 * acts on somebody's behalf. It is safe here for the same reason it would not
 * be in a lounge: entering a bracket already said "put me in these matches",
 * and a match nobody had joined would need both people to press join at the
 * same moment before either could fight.
 */
export async function playMatch(
  slug: string,
  tournamentId: string,
  round: number,
  match: number,
): Promise<TournamentResult> {
  const parsed = matchSchema.safeParse({ tournamentId, round, match })
  if (!parsed.success) return { ok: false, error: 'Invalid match' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const state = await fold(supabase, tenant.id, parsed.data.tournamentId)
  if (state.status !== 'live') {
    return { ok: false, error: 'That tournament is not running' }
  }
  if (user.id !== state.createdBy) {
    return { ok: false, error: 'Only whoever set this up can put a match on' }
  }

  const slot = state.rounds[parsed.data.round]?.[parsed.data.match]
  if (!slot) return { ok: false, error: 'No such match' }
  if (slot.battleId) {
    return { ok: true, tournamentId: parsed.data.tournamentId, battleId: slot.battleId }
  }
  if (slot.a === null || slot.b === null) {
    return { ok: false, error: 'That match is waiting on an earlier round' }
  }

  // The format the tournament was created under. Without it the decider refuses
  // to make a football or race match at all - "a football match needs a clock" -
  // and since a bracket records no settings of its own before this existed, an
  // older football tournament still gets the defaults rather than nothing.
  const football =
    state.mode === 'football' ? (state.football ?? DEFAULT_FOOTBALL_SETTINGS) : undefined
  const race = state.mode === 'race' ? (state.race ?? DEFAULT_RACE_SETTINGS) : undefined

  const battle = await createBattle(
    slug,
    `${state.name} · round ${parsed.data.round + 1}`,
    state.mode,
    /*
     * A bracket in a level names no arena, exactly as `openXpHere` does not:
     * `createBattle` stores the host's own space when the world is absent, and
     * `state.worldId` is already that space for such a tournament. Passing it
     * would send the decider looking for a battlefield row that is a tenant.
     */
    state.xpId ? undefined : state.worldId,
    football,
    race,
    state.xpId,
  )
  if (!battle.ok) return { ok: false, error: battle.error }

  /**
   * Sides only matter in the modes that have them; a bracket match is two
   * entrants, so they take one each.
   *
   * Asked of `sidesFor` rather than assumed to be red and blue, which was wrong
   * for `one_vs_all` - its sides are champion and challengers, and handing it
   * 'red' had `isValidSide` reject the join with "Pick a side". A mode with no
   * sides gets undefined for both, which is what a free-for-all and a race want.
   */
  const sides = sidesFor(state.mode)
  const sideFor = (index: number): Side | undefined => sides[index]

  for (const [index, entrant] of [slot.a, slot.b].entries()) {
    if (entrant === user.id) {
      const joined = await joinBattle(slug, battle.battleId, sideFor(index))
      if (!joined.ok) return { ok: false, error: joined.error }
    }
  }

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'AttachMatchBattle',
    actorId: user.id,
    round: parsed.data.round,
    match: parsed.data.match,
    battleId: battle.battleId,
  }, slug).then((result) =>
    result.ok ? { ...result, battleId: battle.battleId } : result,
  )
}

/**
 * Carry a finished battle's result into the bracket.
 *
 * Reads the battle rather than taking a winner as an argument, so the
 * tournament cannot be told an outcome the match did not have. The battle
 * aggregate is the referee; this only files the answer.
 */
export async function recordMatchResult(
  slug: string,
  tournamentId: string,
  round: number,
  match: number,
): Promise<TournamentResult> {
  const parsed = matchSchema.safeParse({ tournamentId, round, match })
  if (!parsed.success) return { ok: false, error: 'Invalid match' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const { supabase, tenant, user } = context

  const state = await fold(supabase, tenant.id, parsed.data.tournamentId)
  const slot = state.rounds[parsed.data.round]?.[parsed.data.match]
  if (!slot) return { ok: false, error: 'No such match' }
  if (slot.winner !== null) {
    return { ok: true, tournamentId: parsed.data.tournamentId }
  }
  if (!slot.battleId) return { ok: false, error: 'That match has not been played' }

  const { data: battle } = await supabase
    .from('battles_read_model')
    .select('status, winner_type, winner_id')
    .eq('id', slot.battleId)
    .maybeSingle()

  if (!battle || battle.status !== 'ended') {
    return { ok: false, error: 'That match is still being fought' }
  }

  /**
   * Turn the battle's answer into a bracket answer.
   *
   * A `player` winner is the entrant. A `side` winner has to be mapped back to
   * whoever was actually on that side - read from the battle's own roster, not
   * from the order the slots were handed out.
   *
   * That distinction is the whole fix. The mapping used to be the convention
   * "slot.a took red, slot.b took blue", and nothing enforced it: `playMatch`
   * can only join the caller, so in the ordinary case where the host is not one
   * of the two entrants, both players pick their own side in the battle room and
   * either one could be red. When they picked the other way round, the bracket
   * advanced the player who lost. It was also simply untrue for `one_vs_all`,
   * whose sides are champion and challengers and which therefore mapped to
   * nobody at all.
   *
   * A draw leaves the slot undecided rather than picking somebody - it has to be
   * replayed, which is what a draw means in a knockout, and `replayMatch` is how
   * that is now done.
   */
  let winner: string | null = null
  if (battle.winner_type === 'player') {
    winner = battle.winner_id
  } else if (battle.winner_type === 'side' && battle.winner_id) {
    const { data: roster } = await supabase
      .from('battle_participants')
      .select('user_id, side')
      .eq('battle_id', slot.battleId)
      .eq('side', battle.winner_id)

    const won = (roster ?? [])
      .map((row) => row.user_id)
      .filter((id) => id === slot.a || id === slot.b)

    // Exactly one of the two entrants on the winning side is the only answer
    // worth acting on. Both of them there, or neither, means the roster is not
    // the two-entrant match this bracket thinks it is - and guessing between
    // them is how the wrong player used to get advanced.
    winner = won.length === 1 ? (won[0] ?? null) : null
  }

  if (!winner) {
    return {
      ok: false,
      error: 'That match did not decide anything — send it back for a replay',
    }
  }

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'RecordMatchResult',
    actorId: user.id,
    round: parsed.data.round,
    match: parsed.data.match,
    winner,
  }, slug)
}

/**
 * Send an undecided match back to be fought again.
 *
 * The way out of the one state a bracket could not leave. A knockout match that
 * ends without a winner - a football match level at full time, an emptied pitch
 * at 0-0, a race nobody finished, or a roster the result cannot be mapped onto -
 * leaves its slot with a battle attached and no winner. `playMatch` will not
 * make a second battle for a slot that has one, `AttachMatchBattle` no-ops on
 * it, and `recordMatchResult` keeps re-reading the same drawn match. The slot
 * could never gain a winner, the next round could never be built, and the
 * tournament stayed live until somebody called it off and lost every result
 * with it.
 *
 * This detaches the battle so `playMatch` can stage a fresh one. Guarded on the
 * battle actually being over and actually having decided nothing - a replay is
 * for a match that finished inconclusively, not an escape hatch from one
 * somebody is losing.
 */
export async function replayMatch(
  slug: string,
  tournamentId: string,
  round: number,
  match: number,
): Promise<TournamentResult> {
  const parsed = matchSchema.safeParse({ tournamentId, round, match })
  if (!parsed.success) return { ok: false, error: 'Invalid match' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const state = await fold(supabase, tenant.id, parsed.data.tournamentId)
  const slot = state.rounds[parsed.data.round]?.[parsed.data.match]
  if (!slot) return { ok: false, error: 'No such match' }
  if (!slot.battleId) {
    return { ok: false, error: 'That match has no battle to replay' }
  }

  const { data: battle } = await supabase
    .from('battles_read_model')
    .select('status, winner_type, winner_id')
    .eq('id', slot.battleId)
    .maybeSingle()

  if (!battle || battle.status !== 'ended') {
    return { ok: false, error: 'That match is still being fought' }
  }

  // A match that produced a winner is not a replay candidate, even if the
  // bracket has not filed it yet - `recordMatchResult` is what that needs. This
  // is the check that keeps a replay from being a way to erase a defeat.
  if (battle.winner_type === 'player' && battle.winner_id) {
    return { ok: false, error: 'That match had a winner — record it instead' }
  }
  if (battle.winner_type === 'side' && battle.winner_id) {
    const { data: roster } = await supabase
      .from('battle_participants')
      .select('user_id')
      .eq('battle_id', slot.battleId)
      .eq('side', battle.winner_id)

    const won = (roster ?? [])
      .map((row) => row.user_id)
      .filter((id) => id === slot.a || id === slot.b)

    if (won.length === 1) {
      return { ok: false, error: 'That match had a winner — record it instead' }
    }
  }

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'ReplayMatch',
    actorId: user.id,
    round: parsed.data.round,
    match: parsed.data.match,
  }, slug)
}

export async function cancelTournament(
  slug: string,
  tournamentId: string,
): Promise<TournamentResult> {
  const parsed = tournamentIdSchema.safeParse({ tournamentId })
  if (!parsed.success) return { ok: false, error: 'Invalid tournament' }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const { supabase, tenant, user } = context

  return run(supabase, tenant.id, parsed.data.tournamentId, user.id, {
    type: 'CancelTournament',
    actorId: user.id,
  }, slug)
}
