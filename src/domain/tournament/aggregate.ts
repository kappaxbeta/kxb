import type {
  BattleMode,
  FootballSettings,
  RaceSettings,
} from '@/domain/battle/events'
import {
  champion,
  extend,
  firstRound,
  type Round,
} from '@/domain/tournament/bracket'
import type { TournamentCommand } from '@/domain/tournament/commands'
import {
  MAX_ENTRANTS,
  MIN_ENTRANTS,
  TOURNAMENT_STREAM_TYPE,
  type TournamentEvent,
} from '@/domain/tournament/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface TournamentState {
  status: 'none' | 'open' | 'live' | 'ended' | 'cancelled'
  name: string
  mode: BattleMode
  worldId: string
  /** The level every round is fought inside, or undefined for an arena. */
  xpId?: string
  hostTenantId: string
  createdBy: string
  /** The format every match is fought under, carried into each battle. */
  football?: FootballSettings
  race?: RaceSettings
  /** Sign-up order, which is the seeding. */
  entrants: readonly string[]
  /** entrantId -> their space, for the roster of each match's battle. */
  spaces: Readonly<Record<string, string>>
  /**
   * Derived, never stored. Empty until the tournament starts, because a
   * bracket over a field that is still changing is not yet a fact.
   */
  rounds: readonly Round[]
  winner: string | null
}

export const initialTournamentState: TournamentState = {
  status: 'none',
  name: '',
  mode: 'ffa',
  worldId: '',
  hostTenantId: '',
  createdBy: '',
  entrants: [],
  spaces: {},
  rounds: [],
  winner: null,
}

export function evolve(
  state: TournamentState,
  event: TournamentEvent,
): TournamentState {
  switch (event.type) {
    case 'TournamentCreated':
      return {
        ...state,
        status: 'open',
        name: event.data.name,
        mode: event.data.mode,
        worldId: event.data.worldId,
        xpId: event.data.xpId,
        hostTenantId: event.data.hostTenantId,
        createdBy: event.data.createdBy,
        football: event.data.football,
        race: event.data.race,
      }

    case 'EntrantRegistered':
      // Idempotent on replay: registering twice must not enter somebody twice.
      if (state.entrants.includes(event.data.entrantId)) return state
      return {
        ...state,
        entrants: [...state.entrants, event.data.entrantId],
        spaces: { ...state.spaces, [event.data.entrantId]: event.data.tenantId },
      }

    case 'EntrantWithdrew':
      return {
        ...state,
        entrants: state.entrants.filter((id) => id !== event.data.entrantId),
      }

    case 'TournamentStarted':
      // The bracket is built here, from the field as it finally stood.
      return { ...state, status: 'live', rounds: extend([firstRound(state.entrants)]) }

    case 'MatchBattleCreated': {
      const rounds = clone(state.rounds)
      const match = rounds[event.data.round]?.[event.data.match]
      if (!match) return state
      match.battleId = event.data.battleId
      return { ...state, rounds }
    }

    case 'MatchBattleDetached': {
      const rounds = clone(state.rounds)
      const match = rounds[event.data.round]?.[event.data.match]
      if (!match) return state
      match.battleId = null
      return { ...state, rounds }
    }

    case 'MatchResultRecorded': {
      const rounds = clone(state.rounds)
      const match = rounds[event.data.round]?.[event.data.match]
      if (!match) return state
      match.winner = event.data.winner
      // Unroll whatever this result made knowable. Doing it in evolve rather
      // than in decide is what keeps the bracket derived: a replay rebuilds it
      // from the results alone.
      return { ...state, rounds: extend(rounds) }
    }

    case 'TournamentCompleted':
      return { ...state, status: 'ended', winner: event.data.winner }

    case 'TournamentCancelled':
      return { ...state, status: 'cancelled' }

    default:
      return state
  }
}

function clone(rounds: readonly Round[]): Round[] {
  return rounds.map((round) => round.map((match) => ({ ...match })))
}

export function decide(
  state: TournamentState,
  command: TournamentCommand,
): TournamentEvent[] {
  switch (command.type) {
    case 'CreateTournament': {
      if (state.status !== 'none') {
        throw new DomainError('That tournament already exists', 'tournament_exists')
      }
      return [
        {
          type: 'TournamentCreated',
          data: {
            name: command.name,
            mode: command.mode,
            worldId: command.worldId,
            ...(command.xpId ? { xpId: command.xpId } : {}),
            hostTenantId: command.hostTenantId,
            createdBy: command.actorId,
            ...(command.football ? { football: command.football } : {}),
            ...(command.race ? { race: command.race } : {}),
          },
        },
      ]
    }

    case 'RegisterEntrant': {
      assertOpen(state)
      if (state.entrants.includes(command.actorId)) return []
      if (state.entrants.length >= MAX_ENTRANTS) {
        throw new DomainError(`A tournament holds ${MAX_ENTRANTS} entrants`, 'full')
      }
      return [
        {
          type: 'EntrantRegistered',
          data: { entrantId: command.actorId, tenantId: command.tenantId },
        },
      ]
    }

    case 'WithdrawEntrant': {
      // Only before it starts. Once a bracket exists, dropping out is losing
      // your match - which is the battle's business, not the tournament's.
      assertOpen(state)
      if (!state.entrants.includes(command.actorId)) return []
      return [{ type: 'EntrantWithdrew', data: { entrantId: command.actorId } }]
    }

    case 'StartTournament': {
      assertOpen(state)
      if (command.actorId !== state.createdBy) {
        throw new DomainError('Only whoever set this up can start it', 'not_host')
      }
      if (state.entrants.length < MIN_ENTRANTS) {
        throw new DomainError(
          `A tournament needs ${MIN_ENTRANTS} entrants`,
          'not_enough_entrants',
        )
      }

      const started: TournamentEvent = { type: 'TournamentStarted', data: {} }
      // A field of byes can decide the whole thing before anybody fights, so
      // the completion check runs here too.
      return withCompletion(state, [started])
    }

    case 'AttachMatchBattle': {
      assertLive(state)
      const match = state.rounds[command.round]?.[command.match]
      if (!match) throw new DomainError('No such match', 'no_match')
      if (match.winner !== null) {
        throw new DomainError('That match is already decided', 'match_decided')
      }
      if (match.a === null || match.b === null) {
        throw new DomainError('That match is not ready', 'match_not_ready')
      }
      // Already has one. Handing it a second battle would let a match be
      // fought twice and reported twice.
      if (match.battleId) return []

      return [
        {
          type: 'MatchBattleCreated',
          data: {
            round: command.round,
            match: command.match,
            battleId: command.battleId,
          },
        },
      ]
    }

    case 'ReplayMatch': {
      assertLive(state)
      if (command.actorId !== state.createdBy) {
        throw new DomainError('Only whoever set this up can order a replay', 'not_host')
      }

      const match = state.rounds[command.round]?.[command.match]
      if (!match) throw new DomainError('No such match', 'no_match')

      // A decided match is history. Replaying it would unwind rounds that have
      // already been built on top of its result, and the bracket after it is
      // derived from exactly that.
      if (match.winner !== null) {
        throw new DomainError('That match is already decided', 'match_decided')
      }

      // Nothing to let go of - the slot is free and `playMatch` will simply make
      // a battle for it.
      if (!match.battleId) return []

      return [
        {
          type: 'MatchBattleDetached',
          data: {
            round: command.round,
            match: command.match,
            battleId: match.battleId,
          },
        },
      ]
    }

    case 'RecordMatchResult': {
      assertLive(state)
      const match = state.rounds[command.round]?.[command.match]
      if (!match) throw new DomainError('No such match', 'no_match')
      if (match.winner !== null) return []
      if (match.a !== command.winner && match.b !== command.winner) {
        throw new DomainError('That entrant is not in that match', 'not_in_match')
      }

      const result: TournamentEvent = {
        type: 'MatchResultRecorded',
        data: { round: command.round, match: command.match, winner: command.winner },
      }
      return withCompletion(state, [result])
    }

    case 'CancelTournament': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'cancelled') return []
      if (state.status === 'ended') {
        throw new DomainError('That tournament is over', 'tournament_over')
      }
      if (command.actorId !== state.createdBy) {
        throw new DomainError('Only whoever set this up can call it off', 'not_host')
      }
      return [{ type: 'TournamentCancelled', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * Append the completion, if these events finished the bracket.
 *
 * Same shape as `withEnding` in the battle aggregate, and for the same reason:
 * the end of a tournament is a consequence of the last result, not a separate
 * thing somebody has to remember to command. Two events, one append, no instant
 * where the final is won and the tournament is still running.
 */
function withCompletion(
  state: TournamentState,
  events: TournamentEvent[],
): TournamentEvent[] {
  const after = events.reduce(evolve, state)
  const winner = champion(after.rounds)
  if (winner === null) return events
  return [...events, { type: 'TournamentCompleted', data: { winner } }]
}

function notFound(): DomainError {
  return new DomainError('Tournament not found', 'tournament_not_found')
}

function assertOpen(state: TournamentState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'live') {
    throw new DomainError('That tournament has already started', 'tournament_live')
  }
  if (state.status === 'ended') {
    throw new DomainError('That tournament is over', 'tournament_over')
  }
  if (state.status === 'cancelled') {
    throw new DomainError('That tournament was called off', 'tournament_cancelled')
  }
}

function assertLive(state: TournamentState): void {
  if (state.status !== 'live') {
    throw new DomainError('That tournament is not running', 'tournament_not_live')
  }
}

export const tournamentDecider: Decider<
  TournamentState,
  TournamentCommand,
  TournamentEvent
> = {
  streamType: TOURNAMENT_STREAM_TYPE,
  initialState: initialTournamentState,
  evolve,
  decide,
}
