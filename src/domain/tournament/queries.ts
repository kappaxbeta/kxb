import 'server-only'
import { isBattleMode, type BattleMode } from '@/domain/battle/events'
import {
  fold,
  type TournamentState,
} from '@/domain/tournament/fold'
import type { Client } from '@/es/store'

export interface TournamentView {
  id: string
  name: string
  mode: BattleMode
  worldId: string
  /** The level every round is fought inside, or null for an arena. */
  xpId: string | null
  status: 'open' | 'live' | 'ended' | 'cancelled'
  entrants: number
  winnerId: string | null
  createdBy: string | null
  createdAt: string
}

type Row = {
  id: string
  name: string
  mode: string
  world_id: string
  xp_id: string | null
  status: string
  entrants: number
  winner_id: string | null
  created_by: string | null
  created_at: string
}

const COLUMNS =
  'id, name, mode, world_id, xp_id, status, entrants, winner_id, created_by, created_at'

function toView(row: Row): TournamentView {
  return {
    id: row.id,
    name: row.name,
    // A mode this build has never heard of reads as the one every bracket
    // without an opinion is, rather than as `undefined` rendered into a page.
    mode: isBattleMode(row.mode) ? row.mode : 'ffa',
    worldId: row.world_id,
    xpId: row.xp_id ?? null,
    status:
      row.status === 'live' || row.status === 'ended' || row.status === 'cancelled'
        ? row.status
        : 'open',
    entrants: row.entrants,
    winnerId: row.winner_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listTournaments(
  supabase: Client,
  tenantId: string,
  limit = 30,
): Promise<TournamentView[]> {
  const { data, error } = await supabase
    .from('tournaments_read_model')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to list tournaments: ${error.message}`)
  return (data ?? []).map(toView)
}

/**
 * One tournament, bracket included.
 *
 * The bracket is folded from the stream rather than read from a table, because
 * it is derived - see the note in ./projection.ts. A tournament is a few dozen
 * events, so this is a cheap read and it cannot disagree with the log.
 */
export async function findTournament(
  supabase: Client,
  tenantId: string,
  tournamentId: string,
): Promise<{ view: TournamentView; state: TournamentState } | null> {
  const { data, error } = await supabase
    .from('tournaments_read_model')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load tournament: ${error.message}`)
  if (!data) return null

  const state = await fold(supabase, tenantId, tournamentId)
  return { view: toView(data), state }
}

/** A space's friendly counts. No ordering by skill - see the migration. */
export interface ScoreView {
  userId: string
  played: number
  won: number
}

export async function listScores(
  supabase: Client,
  tenantId: string,
): Promise<ScoreView[]> {
  const { data, error } = await supabase
    .from('battle_scores')
    .select('user_id, played, won')
    .eq('tenant_id', tenantId)
    // Most active first, not most successful. Ordering by wins would be a
    // leaderboard, which this deliberately is not.
    .order('played', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Failed to load scores: ${error.message}`)

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    played: row.played,
    won: row.won,
  }))
}
