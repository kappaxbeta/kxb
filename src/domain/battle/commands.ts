import { z } from 'zod'
import { MAX_DECLARED_PLAYERS, PRESETS } from '@kxb/xp'
import {
  BATTLE_NAME_MAX,
  type BattleMode,
  type FootballSettings,
  MAX_MATCH_MINUTES,
  MAX_SCORE_LIMIT,
  MIN_MATCH_MINUTES,
  type RaceSettings,
  type Side,
  type Team,
  type XpMatchRules,
} from '@/domain/battle/events'

/**
 * Commands against one battle.
 *
 * `actorId` is stamped from the session in the action, never accepted from the
 * browser - the same rule as every other aggregate here. `ReportDefeat` is the
 * one worth looking at twice: it names a `userId`, and the action requires it
 * to be the actor's own. Letting one player report another's defeat would hand
 * anybody on the channel the ability to end a match they were losing.
 */

export const battleNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the battle a name')
  .max(BATTLE_NAME_MAX, `Name cannot exceed ${BATTLE_NAME_MAX} characters`)

export const battleModeSchema = z.enum(['ffa', 'team', 'one_vs_all', 'football', 'race'])
export const sideSchema = z.enum(['red', 'blue', 'champion', 'challengers'])
export const teamSchema = z.enum(['red', 'blue'])

/**
 * The settings a football match is played under.
 *
 * Bounded here so a hostile client cannot set a two-hour clock or a target of a
 * thousand goals; the decider checks the same bounds again, because these end up
 * in a log that cannot be edited afterwards.
 */
export const footballSettingsSchema = z.object({
  durationMinutes: z.number().int().min(MIN_MATCH_MINUTES).max(MAX_MATCH_MINUTES),
  scoreLimit: z.number().int().min(1).max(MAX_SCORE_LIMIT).optional(),
  damage: z.boolean().default(true),
  respawn: z.boolean().default(true),
})

/**
 * The settings a race is run under.
 *
 * The same clock bounds football has, checked here and again in the decider for
 * the same reason: a time limit ends up in a log that cannot be edited, and a
 * two-hour one is not a crash but a race nobody can finish.
 */
export const raceSettingsSchema = z.object({
  durationMinutes: z.number().int().min(MIN_MATCH_MINUTES).max(MAX_MATCH_MINUTES),
  damage: z.boolean().default(true),
})

/**
 * The rules a host settled on for a match inside an XP.
 *
 * Bounded against the package's own ceilings rather than against numbers picked
 * here, so the block a match stores is one `parseXp` would have accepted in a
 * document - which is the whole claim of "the document's rules are a
 * suggestion": an override has to be a thing the level *could* have said.
 *
 * The clock is seconds, as `XpRules.timeLimit` is, and not the minutes the xo
 * wizard deals in. Two units for one idea is how a five-minute match becomes a
 * five-second one, so the conversion happens in the control and nowhere else.
 */
export const xpMatchRulesSchema = z.object({
  preset: z.enum(PRESETS),
  scoreLimit: z.number().int().min(1).max(999).optional(),
  timeLimit: z.number().int().min(1).max(24 * 3600).optional(),
  players: z.object({
    min: z.number().int().min(1).max(MAX_DECLARED_PLAYERS),
    max: z.number().int().min(1).max(MAX_DECLARED_PLAYERS),
  }),
})

export const createBattleSchema = z.object({
  name: battleNameSchema,
  mode: battleModeSchema,
  /** Omitted means the host space's own lounge. */
  worldId: z.uuid().optional(),
  /**
   * An XP to fight inside, by document id.
   *
   * The same alphabet the route accepts, checked here as well - an id ends up in
   * a path on the server, and a validator that is only in one place is one that
   * is only enforced where somebody remembered to call it.
   */
  xpId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Not an XP')
    .max(64)
    .optional(),
  /** What the host settled on for the level. Only meaningful beside `xpId`. */
  xpRules: xpMatchRulesSchema.optional(),
  /** Required for `football` and meaningless anywhere else. */
  football: footballSettingsSchema.optional(),
  /** Required for `race` and meaningless anywhere else. */
  race: raceSettingsSchema.optional(),
})

/**
 * A goal, as reported by whichever client was stepping the ball.
 *
 * `id` is minted by the reporter so a redelivered report cannot be counted twice.
 * `side` is the side the point goes to, already resolved from the goal's own team
 * - see `scoringSide`.
 */
export const reportGoalSchema = z.object({
  battleId: z.uuid(),
  id: z.uuid(),
  side: teamSchema,
  by: z.uuid().optional(),
  ownGoal: z.boolean().optional(),
})

export const joinBattleSchema = z.object({
  battleId: z.uuid(),
  side: sideSchema.optional(),
})

export const battleIdSchema = z.object({ battleId: z.uuid() })

export const setReadySchema = z.object({ battleId: z.uuid(), ready: z.boolean() })

export type CreateBattle = {
  type: 'CreateBattle'
  actorId: string
  name: string
  mode: BattleMode
  worldId: string
  /** An XP to fight inside, by document id. See ./events. */
  xpId?: string
  /** What the host settled on for that level. Refused without `xpId`. */
  xpRules?: XpMatchRules
  hostTenantId: string
  /** Required for `football`, rejected for every other mode. */
  football?: FootballSettings
  /** Required for `race`, rejected for every other mode. */
  race?: RaceSettings
}

export type JoinBattle = {
  type: 'JoinBattle'
  actorId: string
  /** The joining player's own space. */
  tenantId: string
  side?: Side
}

export type LeaveBattle = { type: 'LeaveBattle'; actorId: string }

/**
 * "I am ready", or taking it back.
 *
 * `actorId` and nothing else: readiness is a thing you say about yourself, for
 * the same reason `ReportDefeat` uses the session's id. A command that could
 * name somebody else would let one player start a match on behalf of a room
 * that is still loading, which is the exact failure the gate exists to prevent.
 */
export type SetReady = { type: 'SetReady'; actorId: string; ready: boolean }

/**
 * `at` is the kickoff instant, stamped from the server's clock in the action.
 *
 * Passed in rather than read here so the decider stays pure - the same reason
 * `rollDamage` takes its randomness as an argument. A match whose clock started
 * whenever the aggregate happened to be folded would be untestable.
 */
export type StartBattle = { type: 'StartBattle'; actorId: string; at: string }

export type ReportDefeat = {
  type: 'ReportDefeat'
  actorId: string
  /** Always the actor. Enforced in the action, which knows the session. */
  userId: string
  by?: string
}

/**
 * A goal went in.
 *
 * Reported by whichever client is stepping the ball - see `ballOwner` - which is
 * the same shape of trust `ReportDefeat` already runs on: one client is
 * authoritative over one thing, and the decider checks what it can. It cannot
 * check that the ball really crossed the line, and does not try; what it does
 * enforce is that the match is live, that it is a football match, and that the
 * same goal is never counted twice.
 */
export type ReportGoal = {
  type: 'ReportGoal'
  actorId: string
  /** Minted by the reporter, so a redelivered report is idempotent. */
  id: string
  side: Team
  by?: string
  ownGoal?: boolean
}

/**
 * Full time.
 *
 * Sent by a client that has watched the clock run out, and validated against the
 * kickoff recorded in the log - so an impatient client cannot end a match early,
 * and it does not matter which one gets there first. Somebody has to ask: the
 * server has no timer of its own, and a match nobody is watching should not be
 * quietly resolved by a cron job hours later.
 *
 * `now` is stamped in the action from the server's clock, never the browser's.
 */
export type CallFullTime = { type: 'CallFullTime'; actorId: string; now: string }

/**
 * "I'm home."
 *
 * The race's `ReportDefeat`, and it runs on the same trust: `userId` is always
 * the actor's own, enforced in the action, because the alternative hands anybody
 * on the channel the ability to finish somebody else's race - or, worse, their
 * own, twice, from in front of them.
 *
 * `now` is stamped in the action from the server's clock, and it is what the
 * finishing time is measured against. Neither the place nor the time comes from
 * the browser: the browser only says that it crossed.
 */
export type ReportFinish = {
  type: 'ReportFinish'
  actorId: string
  /** Always the actor. Enforced in the action, which knows the session. */
  userId: string
  now: string
}

export type CancelBattle = {
  type: 'CancelBattle'
  actorId: string
  /**
   * Whether this person runs the space rather than the match.
   *
   * Decided in the action from `context.tenant.role`, never sent by a client -
   * the same rule `ReportFinish` states above about `userId`. A boolean rather
   * than the role name because the aggregate has exactly one question here and
   * a role it had to interpret would be the tenant's vocabulary leaking into a
   * match's rules.
   *
   * It exists because the host is not always there to press the button. A match
   * opened by somebody who has since left the space, or one nobody came to, sat
   * in the active list until the day-later sweep took it - and the person
   * looking at a list of matches that are not happening is an owner, who could
   * do nothing about it.
   */
  asStaff?: boolean
}

/**
 * Close a match two people opened and walked away from.
 *
 * Not a host's decision and not a player's - nobody is left to make one, which
 * is the whole reason this exists. It is issued by the sweep in
 * `domain/battle/actions.ts`, and both times it carries come from the server:
 * `now` from its clock, `openedAt` from the read model, which is a projection
 * of the log rather than anything a client sent.
 *
 * `openedAt` is here because the state has no creation time in it. A live match
 * has `startedAt` from its own kickoff event and that is what the guard prefers;
 * a match that never started has nothing at all, and the alternative to passing
 * it in was fabricating one.
 */
export type AbandonBattle = {
  type: 'AbandonBattle'
  now: string
  /** When it was opened, from the read model. Used only when it never started. */
  openedAt: string
}

export type WantRematch = { type: 'WantRematch'; actorId: string }

export type StartRematch = {
  type: 'StartRematch'
  actorId: string
  /** The battle that was created for the rematch. */
  battleId: string
}

/**
 * Start this one again, from here.
 *
 * `StartRematch`'s twin, and the difference between them is *when*: a rematch is
 * what a finished match offers, and this is for a match still being played that
 * has stopped being worth playing - somebody has dropped out and is not coming
 * back, so the four people left would rather line up again than finish a game
 * that is a player short.
 *
 * It carries the replacement's id for the same reason `StartRematch` does: the
 * new battle is created first, and this is the old stream being told where
 * everybody went. That pointer is the whole value of restarting through the log
 * rather than by calling one match off and opening another - everybody else's
 * room is polling the old match, so the pointer is what walks them across.
 *
 * `asStaff` is decided in the action from the session's role, exactly as
 * `CancelBattle` states: a client that could set it could restart anybody's
 * match.
 */
export type RestartBattle = {
  type: 'RestartBattle'
  actorId: string
  /** The battle created to take this one's place. */
  battleId: string
  /** Whether this person runs the space rather than the match. */
  asStaff?: boolean
}

export type BattleCommand =
  | CreateBattle
  | JoinBattle
  | LeaveBattle
  | SetReady
  | StartBattle
  | ReportDefeat
  | ReportGoal
  | ReportFinish
  | CallFullTime
  | CancelBattle
  | AbandonBattle
  | WantRematch
  | RestartBattle
  | StartRematch
