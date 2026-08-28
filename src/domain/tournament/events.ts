import type {
  BattleMode,
  FootballSettings,
  RaceSettings,
} from '@/domain/battle/events'
import type { DomainEvent } from '@/es/types'

/**
 * A run of matches with one winner at the end.
 *
 * The bracket itself is *not* stored in these events. It is derived - every
 * round after the first is a pure function of who won the round before, so
 * recording it would be recording something already implied, and a stored
 * bracket that disagreed with the results would be a contradiction nobody could
 * resolve. See ./bracket.ts, and `evolve` in ./aggregate.ts which rebuilds it
 * on every fold.
 *
 * What *is* recorded is the part no function can derive: who entered, in what
 * order, and who won each match.
 */

export const TOURNAMENT_STREAM_TYPE = 'tournament'

export const TOURNAMENT_NAME_MAX = 60
export const MIN_ENTRANTS = 2
export const MAX_ENTRANTS = 16

export type TournamentCreated = DomainEvent<
  'TournamentCreated',
  {
    name: string
    /** How each individual match is fought. */
    mode: BattleMode
    /** The battlefield every match is fought on. */
    worldId: string
    /**
     * The level every match is fought *inside*, when it is one.
     *
     * A bracket's ground had to be an arena, which meant the one thing an XP is
     * best at - a level with two ends, built for a fixture - could be played as
     * a one-off match and never as a run of them.
     *
     * `worldId` is still filled in beside this, with the host's own tenant id,
     * exactly as `createBattle` fills it for an XP match. Two fields where one
     * would do, and it is the same trade the battle makes and for the same
     * reason: the world is where the match *is* and the reference is what is
     * *loaded*, and collapsing them would make "which arena" unanswerable for
     * every bracket ever fought on one.
     *
     * The `mode` above is resolved from this level's document at creation - see
     * `battleModeFor` - rather than asked for, which is why the setup form has
     * no mode step once a level is chosen. Recorded rather than re-derived per
     * round for the reason the settings beside it are: a bracket half-played
     * must not change shape because somebody saved a new version of the level.
     */
    xpId?: string
    hostTenantId: string
    createdBy: string
    /**
     * The format every match in this bracket is fought under.
     *
     * Recorded rather than derived, even though it is filled from the mode's
     * defaults today. Two reasons, and the first is the one that matters: the
     * battle decider refuses a football match with no clock, so a tournament
     * that did not carry these could not create its battles at all - which is
     * exactly what used to happen, leaving a live football bracket that could
     * never stage a single match and whose entrants could no longer withdraw.
     *
     * The second is replay. Defaults change; a bracket fought over five-minute
     * matches must still fold back to five-minute matches next year, and a
     * value read from a constant at replay time would quietly become whatever
     * that constant says then.
     *
     * Optional because tournaments created before this existed have neither,
     * and their history is not going to grow one.
     */
    football?: FootballSettings
    race?: RaceSettings
  }
>

/**
 * Somebody entered.
 *
 * `entrantId` is a user id. Sign-up order is the bracket's seeding, because
 * nothing here ranks anybody - see the note at the top of ./bracket.ts.
 */
export type EntrantRegistered = DomainEvent<
  'EntrantRegistered',
  { entrantId: string; tenantId: string }
>

export type EntrantWithdrew = DomainEvent<'EntrantWithdrew', { entrantId: string }>

export type TournamentStarted = DomainEvent<'TournamentStarted', Record<string, never>>

/** A match got a battle to be fought in. */
export type MatchBattleCreated = DomainEvent<
  'MatchBattleCreated',
  { round: number; match: number; battleId: string }
>

/**
 * A match's battle was let go, so it can be fought again.
 *
 * The counterpart to `MatchBattleCreated`, and the thing whose absence used to
 * deadlock a whole bracket. `recordMatchResult` says a draw "has to be replayed,
 * which is what a draw means in a knockout" - but nothing could attach a second
 * battle to a slot that already had one, and no command let go of the first. A
 * football match level at full time, an emptied pitch at 0-0, or a race nobody
 * finished therefore left a slot that could never gain a winner, a round that
 * could never be built, and a tournament that stayed live until it was called
 * off, discarding every result along with it.
 *
 * The battle itself is untouched. It happened, it is in its own log, and the
 * bracket simply stops pointing at it - which is also why this is a detach and
 * not a delete.
 */
export type MatchBattleDetached = DomainEvent<
  'MatchBattleDetached',
  { round: number; match: number; battleId: string }
>

export type MatchResultRecorded = DomainEvent<
  'MatchResultRecorded',
  { round: number; match: number; winner: string }
>

export type TournamentCompleted = DomainEvent<
  'TournamentCompleted',
  { winner: string | null }
>

export type TournamentCancelled = DomainEvent<
  'TournamentCancelled',
  Record<string, never>
>

export type TournamentEvent =
  | TournamentCreated
  | EntrantRegistered
  | EntrantWithdrew
  | TournamentStarted
  | MatchBattleCreated
  | MatchBattleDetached
  | MatchResultRecorded
  | TournamentCompleted
  | TournamentCancelled

export const TOURNAMENT_EVENT_LABELS: Record<TournamentEvent['type'], string> = {
  TournamentCreated: 'tournament created',
  EntrantRegistered: 'entrant registered',
  EntrantWithdrew: 'entrant withdrew',
  TournamentStarted: 'tournament started',
  MatchBattleCreated: 'match battle created',
  MatchBattleDetached: 'match sent for a replay',
  MatchResultRecorded: 'match result recorded',
  TournamentCompleted: 'tournament completed',
  TournamentCancelled: 'tournament cancelled',
}
