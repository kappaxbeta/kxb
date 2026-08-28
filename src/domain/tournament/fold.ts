import 'server-only'
import {
  tournamentDecider,
  type TournamentState,
} from '@/domain/tournament/aggregate'
import type { TournamentEvent } from '@/domain/tournament/events'
import { loadStream } from '@/es/store'
import type { Client } from '@/es/store'
import { fold as foldEvents } from '@/es/types'

export type { TournamentState }

/**
 * Replay a tournament into its current state, bracket and all.
 *
 * A read that folds a stream rather than reading a projection, which is
 * unusual here and deliberate: the bracket is *derived* from the results (see
 * ./bracket.ts), so a table holding it could disagree with the log. Folding is
 * the only representation that cannot.
 *
 * Affordable because the stream is short - a sixteen-entrant tournament is
 * about forty events, all told.
 */
export async function fold(
  supabase: Client,
  tenantId: string,
  tournamentId: string,
): Promise<TournamentState> {
  const history = await loadStream<TournamentEvent>(supabase, tenantId, tournamentId)
  return foldEvents(tournamentDecider, history)
}
