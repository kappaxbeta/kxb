import {
  TOURNAMENT_STREAM_TYPE,
  type TournamentEvent,
} from '@/domain/tournament/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * Enough of a tournament to list it, and no more.
 *
 * The bracket is deliberately absent: it is derived from the results (see
 * ./bracket.ts), so storing it here would be storing something already implied
 * and free to fall out of step with the log. A page that wants the bracket
 * folds the stream - which is a few dozen events - rather than reading a copy.
 */
export const tournamentsProjection: Projection<TournamentEvent> = {
  name: 'tournaments_read_model',
  streamTypes: [TOURNAMENT_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<TournamentEvent>): Promise<void> {
    switch (event.type) {
      case 'TournamentCreated': {
        const { error } = await supabase.from('tournaments_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.data.hostTenantId,
            name: event.data.name,
            mode: event.data.mode,
            world_id: event.data.worldId,
            // NULL for a bracket on an arena, which is every one fought before
            // this existed - see the migration.
            xp_id: event.data.xpId ?? null,
            status: 'open',
            entrants: 0,
            created_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )
        if (error) {
          throw new Error(`tournaments projection failed to create: ${error.message}`)
        }
        return
      }

      case 'EntrantRegistered':
      case 'EntrantWithdrew':
        // Counted rather than incremented, for the same idempotence reason the
        // scores are: a replay re-delivers every registration.
        await recount(supabase, event)
        return

      case 'TournamentStarted':
        await patch(supabase, event, { status: 'live' })
        return

      case 'TournamentCompleted':
        await patch(supabase, event, {
          status: 'ended',
          winner_id: event.data.winner,
          ended_at: event.createdAt,
        })
        return

      case 'TournamentCancelled':
        await patch(supabase, event, { status: 'cancelled', ended_at: event.createdAt })
        return

      default:
        // MatchBattleCreated, MatchBattleDetached and MatchResultRecorded shape
        // the bracket, which this table does not hold. Nothing to write.
        return
    }
  },
}

type TournamentPatch = {
  status?: string
  entrants?: number
  winner_id?: string | null
  ended_at?: string
}

async function patch(
  supabase: Client,
  event: StoredEvent<TournamentEvent>,
  changes: TournamentPatch,
): Promise<void> {
  const { error } = await supabase
    .from('tournaments_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `tournaments projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}

/**
 * Re-derive the entrant count by folding the stream's registrations.
 *
 * Reading the log rather than keeping a counter, because the projection has to
 * survive replay and a counter does not. The stream is short - a tournament is
 * a few dozen events - so this stays cheap.
 */
async function recount(
  supabase: Client,
  event: StoredEvent<TournamentEvent>,
): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .select('type, data')
    .eq('tenant_id', event.tenantId)
    .eq('stream_id', event.streamId)
    .lte('global_seq', event.globalSeq)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(`tournaments projection failed to recount: ${error.message}`)
  }

  const entrants = new Set<string>()
  for (const row of data ?? []) {
    const payload = row.data as { entrantId?: string }
    if (row.type === 'EntrantRegistered' && payload.entrantId) {
      entrants.add(payload.entrantId)
    }
    if (row.type === 'EntrantWithdrew' && payload.entrantId) {
      entrants.delete(payload.entrantId)
    }
  }

  await patch(supabase, event, { entrants: entrants.size })
}
