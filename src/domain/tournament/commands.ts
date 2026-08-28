import { z } from 'zod'
import { battleModeSchema } from '@/domain/battle/commands'
import type {
  BattleMode,
  FootballSettings,
  RaceSettings,
} from '@/domain/battle/events'
import { TOURNAMENT_NAME_MAX } from '@/domain/tournament/events'

export const tournamentNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the tournament a name')
  .max(TOURNAMENT_NAME_MAX, `Name cannot exceed ${TOURNAMENT_NAME_MAX} characters`)

export const createTournamentSchema = z
  .object({
    name: tournamentNameSchema,
    mode: battleModeSchema,
    /**
     * Optional now, because a bracket has two kinds of ground.
     *
     * It was required, which is what made "fight this bracket in a level"
     * unexpressible: an XP is not an arena and has no world id of its own.
     * Which of the two is present is checked below rather than here, so the
     * message is about the choice rather than about a field.
     */
    worldId: z.uuid('Pick a battlefield').optional(),
    /**
     * The level every round is fought inside. Same alphabet the battle's own
     * `xpId` accepts, and checked here for the reason given there: a reference
     * ends up in a path on the server, and a validator in one place is a
     * validator enforced where somebody remembered to call it.
     */
    xpId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'Not an XP')
      .max(64)
      .optional(),
  })
  /*
   * Exactly one ground, and the refusal names the mistake.
   *
   * Both would be two answers to one question - which is the arena a bracket in
   * a level is fought on - and neither is a bracket with nowhere to play.
   */
  .refine((value) => (value.worldId === undefined) !== (value.xpId === undefined), {
    message: 'Pick a battlefield or a level, not both',
    path: ['worldId'],
  })

export const tournamentIdSchema = z.object({ tournamentId: z.uuid() })

export const matchSchema = z.object({
  tournamentId: z.uuid(),
  round: z.number().int().min(0).max(8),
  match: z.number().int().min(0).max(64),
})

export type CreateTournament = {
  type: 'CreateTournament'
  actorId: string
  name: string
  /**
   * How the sides are drawn in every round.
   *
   * Resolved by the action rather than taken from the form when a level is
   * chosen: an XP brings its own shape (`battleModeFor`), and a bracket that
   * asked twice would be a bracket whose stored answer can disagree with the
   * matches it stages.
   */
  mode: BattleMode
  worldId: string
  /** The level every round is fought inside, when it is one. */
  xpId?: string
  hostTenantId: string
  /** The format every match is fought under. Resolved by the action. */
  football?: FootballSettings
  race?: RaceSettings
}

export type RegisterEntrant = {
  type: 'RegisterEntrant'
  actorId: string
  tenantId: string
}

export type WithdrawEntrant = { type: 'WithdrawEntrant'; actorId: string }

export type StartTournament = { type: 'StartTournament'; actorId: string }

export type AttachMatchBattle = {
  type: 'AttachMatchBattle'
  actorId: string
  round: number
  match: number
  battleId: string
}

/**
 * Let go of a match's battle so it can be fought again.
 *
 * Only ever for a match that ended without deciding anything - the action
 * checks that against the battle itself, because whether a finished match
 * produced a winner is I/O and not something this stream can see.
 */
export type ReplayMatch = {
  type: 'ReplayMatch'
  actorId: string
  round: number
  match: number
}

export type RecordMatchResult = {
  type: 'RecordMatchResult'
  actorId: string
  round: number
  match: number
  winner: string
}

export type CancelTournament = { type: 'CancelTournament'; actorId: string }

export type TournamentCommand =
  | CreateTournament
  | RegisterEntrant
  | WithdrawEntrant
  | StartTournament
  | AttachMatchBattle
  | ReplayMatch
  | RecordMatchResult
  | CancelTournament
