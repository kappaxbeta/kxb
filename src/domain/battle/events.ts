import type { Preset } from '@kxb/xp'
import type { DomainEvent } from '@/es/types'

/**
 * A match: a roster, a start, and a winner.
 *
 * This is the one part of fighting that is event-sourced, and the line is worth
 * stating because everything around it deliberately is not. Health, dashes and
 * hits stay exactly where combat.ts put them - on the Realtime channel,
 * client-authoritative, gone when the tab closes - because "Bo was on 40% for a
 * second there" is not a fact anybody will ask about tomorrow.
 *
 * "Bo won" is. So the log holds who turned up, whose side they were on, who
 * went down, and who was left standing, and nothing else. A battle's history is
 * a few dozen events no matter how long the fighting lasted.
 *
 * The stream id is the battle's id; the tenant is the space hosting it. For a
 * challenge between two spaces that is the challenger's - a match has to live
 * on exactly one stream, and a stream belongs to exactly one tenant, so
 * somebody has to be the host. Which is why `PlayerJoined` records each
 * player's own tenant separately: the roster spans spaces even though the
 * stream cannot.
 */

export const BATTLE_STREAM_TYPE = 'battle'

/**
 * How the sides are drawn.
 *
 * `ffa`        - everyone for themselves; the last one standing wins.
 * `team`       - two sides; the last side with somebody up wins.
 * `one_vs_all` - one champion against everybody else. Structurally a team match
 *                with a team of one, which is exactly how it is implemented -
 *                see `sideOf` in ./aggregate.ts. Modelling it as its own thing
 *                would mean a second win condition to keep in step with the
 *                first.
 * `football`   - two sides and a ball; the side with more goals when the clock
 *                runs out wins.
 * `race`       - a start line, a finish line, and everybody for themselves; the
 *                first one home wins and the rest are placed behind them.
 *
 * The first three share one win condition. The last two each have their own, and
 * what those two have in common is more interesting than what separates them:
 * being knocked out is not how you lose either of them, so it is not recorded
 * here at all - see `ReportDefeat` in ./aggregate.ts. A goal, or an order of
 * finishing, is a durable fact ("we were 3-2 down and came back", "you beat me by
 * a second"). A knockout in the middle of one is as transient as the health bar
 * it came off, and the same argument that keeps health off the log keeps it off
 * too.
 */
export const BATTLE_MODES = ['ffa', 'team', 'one_vs_all', 'football', 'race'] as const

export type BattleMode = (typeof BATTLE_MODES)[number]

/**
 * Is this string one of them?
 *
 * A guard rather than a cast at each read, because the reads are of *columns* -
 * a projection writes whatever the event said and a row holds whatever was
 * written - and the two that existed had each spelled the coercion out by hand.
 * One of them had spelled it wrong: the tournaments list matched `team` and
 * `one_vs_all` and fell back to `ffa` for everything else, so a football
 * bracket read back as all-against-all in the only place it is ever named.
 */
export function isBattleMode(value: string): value is BattleMode {
  return (BATTLE_MODES as readonly string[]).includes(value)
}

/** Modes decided by a scoreline rather than by who is left standing. */
export function isScored(mode: BattleMode): boolean {
  return mode === 'football'
}

/** Modes decided by who got there first. */
export function isRace(mode: BattleMode): boolean {
  return mode === 'race'
}

/**
 * Modes where being knocked out puts you out.
 *
 * Written as "neither of the other two" rather than as a list of three, so a
 * fifth mode has to decide what it is instead of quietly inheriting elimination
 * from a list nobody remembered to add it to. Everything that keys off "does a
 * defeat mean anything here" goes through this.
 */
export function isElimination(mode: BattleMode): boolean {
  return !isScored(mode) && !isRace(mode)
}

/** Modes that end on a clock, and so need a duration set up front. */
export function hasClock(mode: BattleMode): boolean {
  return isScored(mode) || isRace(mode)
}

/**
 * How long a football match runs.
 *
 * Three to ten minutes. Under three there is no time for the game to turn round
 * once; over ten a team room has stopped playing football and started holding a
 * fixture.
 */
export const MIN_MATCH_MINUTES = 3
export const MAX_MATCH_MINUTES = 10

/** The most goals a host may set as the target. */
export const MAX_SCORE_LIMIT = 20

/**
 * The settings a football match is played under.
 *
 * Recorded on `BattleCreated` rather than kept beside the match, because they
 * decide how every moment of it is played and a match whose rules could change
 * halfway through is not one worth recording the result of.
 */
export interface FootballSettings {
  /** The clock, in minutes. */
  durationMinutes: number
  /**
   * First to this many goals takes it, ending the match early.
   *
   * Absent means the clock is the only way it ends, which is ordinary football.
   */
  scoreLimit?: number
  /**
   * Whether a dash hurts.
   *
   * Off makes it a friendly: charges still shove the ball - and each other - and
   * nobody's health moves. On is the rough version, where the striker can be put
   * on the floor.
   */
  damage: boolean
  /**
   * Whether being knocked out puts you back on the pitch.
   *
   * On by default and on in almost every match, because the score decides this
   * mode: a player who could not come back would just be a player who stopped
   * playing, for up to ten minutes. Off is available for hosts who want a
   * knockout to actually cost something.
   *
   * Either way it is not an elimination - nothing about being down is written to
   * the log in football, and the match ends on the clock regardless of how many
   * people are upright when it does.
   */
  respawn: boolean
}

export const DEFAULT_FOOTBALL_SETTINGS: FootballSettings = {
  durationMinutes: 5,
  damage: true,
  respawn: true,
}

/**
 * The settings a race is run under.
 *
 * Two, where football has four, and the two it does not have are the interesting
 * ones. There is no score target, because the target is the finish line and the
 * arena already holds it. And there is no respawn switch: a knocked-out racer
 * always comes back, at the start, because the alternative is somebody watching
 * the rest of a ten-minute race from the floor - and unlike football, where a
 * side plays on a player down, a race with nobody left running has to wait out
 * its clock with nothing happening in it.
 *
 * Being sent back to the start is what a knockout *costs* here, and it is a real
 * cost: a dash at the last corner can undo the whole run. That is the game, and
 * it is why `damage` exists - a host who wants a clean race turns it off, and
 * charges become shoves.
 */
export interface RaceSettings {
  /**
   * The time limit, in minutes.
   *
   * Not how long the race takes - that is however long the course takes - but
   * how long it is allowed to take. When it runs out the race ends and whoever
   * is still running is recorded as not having finished.
   */
  durationMinutes: number
  /**
   * Whether a dash hurts.
   *
   * On is the rough version: knock somebody off the roof and they restart. Off
   * still shoves - a charge moves people, which on a narrow ledge is its own kind
   * of rough - and nobody's health moves.
   */
  damage: boolean
}

export const DEFAULT_RACE_SETTINGS: RaceSettings = {
  durationMinutes: 5,
  damage: true,
}

/** The two sides in a team match. */
export const TEAMS = ['red', 'blue'] as const
export type Team = (typeof TEAMS)[number]

/** The two sides in a one-vs-everyone match. */
export const ONE_VS_ALL_SIDES = ['champion', 'challengers'] as const
export type OneVsAllSide = (typeof ONE_VS_ALL_SIDES)[number]

/**
 * Which side a player is on, as the log records it.
 *
 * Absent in `ffa`, where there are no sides - a player's side is themselves.
 */
export type Side = Team | OneVsAllSide

export const BATTLE_NAME_MAX = 60

/** Nobody can fight alone, and a crowd stops being a match. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 16

/**
 * What this match decided the level's rules are.
 *
 * **The document's own `rules` block is a suggestion** (docs/xp/backlog.md §3),
 * and this is the match saying what it settled on. The wizard is pre-filled
 * from the level, so a host who changes nothing stores what the author wrote;
 * a host who wants a five-minute deathmatch on a level built as a course stores
 * that, and the document is not touched by either.
 *
 * ---------------------------------------------------------------------------
 * Whole, not a patch
 * ---------------------------------------------------------------------------
 * Every field is required, which is the one decision worth defending. A patch
 * would have needed a third value for "no limit at all" - `undefined` meaning
 * "whatever the document said" and `null` meaning "none" - and the difference
 * between those two would then have to be right in the wizard, in the decider,
 * in the projection and in the merge. A complete block has one reading: absent
 * `scoreLimit` is no score target, in the match and in the document alike.
 *
 * The cost is that a match remembers a number the document might later change,
 * which is the same trade the version pin already makes (§11.5): a match is
 * fought under the rules it was set up under, and an author saving a new score
 * limit mid-series does not move the goalposts under people standing between
 * them.
 *
 * ---------------------------------------------------------------------------
 * Four fields, and the ones that are missing on purpose
 * ---------------------------------------------------------------------------
 * `XpRules` also carries `assign`, `respawn` and `roles`. None of them are
 * here, for the reason that block's own header gives about knobs nobody reads:
 * these four are the four the *host* has a question about - what game is this,
 * what ends it, and how many of us - and each of them has a control in the
 * wizard and a reader on the other side. A field a wizard cannot set is a
 * document field with a slower way in.
 */
export interface XpMatchRules {
  preset: Preset
  /** First to this many. Absent is a tally rather than a race to a number. */
  scoreLimit?: number
  /** Seconds, as the document counts them. Absent is no clock. */
  timeLimit?: number
  /**
   * How many people, both ends resolved.
   *
   * `min` is the one the room reads: it is what the ready gate refuses to
   * kick off below, which is exactly what §3 says a lower bound is for -
   * "a game needing four players that starts with two is broken in a way the
   * runtime can detect and say something about".
   */
  players: { min: number; max: number }
}

/**
 * How many people have to be ready before the whistle can go.
 *
 * `MIN_PLAYERS` is this app's floor - nobody fights alone - and a level may ask
 * for more. The larger of the two, because both are real: a four-player board
 * game does not become playable with two just because the battle system would
 * allow it, and a level that says it is for one still needs somebody to play
 * against here.
 *
 * One function, because the decider refuses below it and the lobby prints it,
 * and the way those two come apart is each doing its own arithmetic.
 */
export function readyNeeded(rules: XpMatchRules | null): number {
  return Math.max(MIN_PLAYERS, rules?.players.min ?? 1)
}

/**
 * How many the room holds.
 *
 * A level's `players.max` is a fact about the level (see `XpRules.players`), so
 * it narrows this match's capacity - it never widens it past what the transport
 * carries.
 */
export function seatsIn(rules: XpMatchRules | null): number {
  return Math.min(MAX_PLAYERS, rules?.players.max ?? MAX_PLAYERS)
}

export type BattleCreated = DomainEvent<
  'BattleCreated',
  {
    name: string
    mode: BattleMode
    /** The world it is fought in - a battlefield, or the host's own lounge. */
    worldId: string
    /**
     * An XP, when the match is fought inside one rather than in a world.
     *
     * A document id (`public/xp/xps/<id>.xp.json`), not a uuid: an XP is a file
     * for all of v1 (docs/xp/creator.md §3.1), so there is no row to point at
     * and its name is its identity.
     *
     * `worldId` is still set when this is, and still to the host's own space.
     * That is not redundancy - it is what keeps every rule that has ever been
     * written about a battle true: the roster, the RLS, the sides and the
     * scoring all reach for the world, and a match with no world would be a
     * second shape for every one of them to handle. What changes when this is
     * present is only *where the players are sent*.
     *
     * Optional, and absent on every match created before XPs existed. An event
     * that has already happened is not going to grow a field, which is the whole
     * reason a payload may only ever be added to.
     */
    xpId?: string
    /**
     * What this match decided the level's rules are. Only ever beside `xpId`.
     *
     * On the match, never on the document - see `XpMatchRules`. Optional, and
     * absent on every XP match created before the wizard could ask, which reads
     * as "whatever the level says" and is what those matches were played under.
     */
    xpRules?: XpMatchRules
    hostTenantId: string
    createdBy: string
    /** Present only for `football`. */
    football?: FootballSettings
    /** Present only for `race`. */
    race?: RaceSettings
  }
>

export type PlayerJoined = DomainEvent<
  'PlayerJoined',
  {
    userId: string
    /** The player's own space, which need not be the host's. */
    tenantId: string
    /** Absent in ffa. */
    side?: Side
  }
>

export type PlayerLeft = DomainEvent<'PlayerLeft', { userId: string }>

/**
 * "I am in, go when you like."
 *
 * Asked for as *"maybe we need a ready sign"*, after a match that looked broken
 * while somebody was still loading and then kicked off with one person in it.
 * Both halves of that are this event: it is what the lobby draws a tick against,
 * and `StartBattle` counts them rather than counting the roster.
 *
 * **On the log rather than on the socket**, which is the decision. Presence
 * would have been cheaper and answers a different question - who has a tab open
 * - and readiness is a thing somebody *said*, which has to survive a reload and
 * be the same fact on every screen. The roster is already durable and already
 * polled; this rides on it.
 *
 * A toggle rather than a one-way switch: somebody who says yes and then has to
 * find a charger should be able to take it back, and the alternative is a lobby
 * that starts without them because they could not say so.
 */
export type PlayerReady = DomainEvent<
  'PlayerReady',
  { userId: string; ready: boolean }
>

/**
 * The whistle.
 *
 * `at` is the kickoff time, and it is in the payload rather than read off the
 * event's own envelope on purpose. The clock is a *rule* - how long is left
 * decides when the match ends - and ./events.ts in domain/lounge states the
 * general principle this follows: an event has to be interpretable from its own
 * contents, because whatever replays it years from now may know nothing about the
 * envelope it arrived in. It is also what lets `evolve` see it at all, which is
 * how the decider can refuse to blow full time early.
 *
 * Optional, because every match started before football existed has no `at` and
 * never needed one - those modes have no clock. See `startedAt` in ./aggregate.ts.
 */
export type BattleStarted = DomainEvent<'BattleStarted', { at?: string }>

/**
 * Somebody went down.
 *
 * Reported by the player who was defeated, never by whoever hit them - the same
 * rule combat.ts already enforces on the wire, where each client is
 * authoritative over its own health only. `by` is what the victim believes
 * finished them, which is worth recording and not worth trusting: it decides
 * whose name appears on a kill feed, never who wins.
 */
export type PlayerDefeated = DomainEvent<
  'PlayerDefeated',
  { userId: string; by?: string }
>

/**
 * Who was left standing.
 *
 * `winner` is null for a match that ended with nobody up - two last players
 * knocking each other out in the same instant, or everybody leaving. A draw is
 * a real outcome and gets recorded as one rather than being forced onto
 * somebody.
 */
export type BattleEnded = DomainEvent<
  'BattleEnded',
  {
    winner: { type: 'player' | 'side'; id: string } | null
    /**
     * Nobody called this - the backstop did, a day after kickoff.
     *
     * A leaf field rather than a fifth status, and the reason is that the
     * *result* is not in doubt: a football match abandoned at 2-1 was 2-1, and
     * saying so is more honest than throwing the goals away because nobody
     * pressed a button at the end. What the field carries is the one thing a
     * reader would otherwise get wrong, which is that the whistle was never
     * blown.
     *
     * Absent on every match that ended the ordinary way, including all of them
     * from before the backstop existed.
     */
    abandoned?: true
  }
>

/**
 * How long a match may sit before the backstop closes it.
 *
 * A day, because the thing being caught is a room somebody opened on a Friday
 * and left - and anything shorter starts catching real matches. A tournament
 * final that runs past midnight is a match; one that is still "live" the
 * following evening is a browser tab somebody closed.
 *
 * Deliberately far from the in-play clock, which is minutes. The two never
 * interact: full time ends a match at its own duration, and this only ever sees
 * the matches full time never came for.
 */
export const ABANDON_AFTER_HOURS = 24

/**
 * A goal.
 *
 * The one thing that happens *inside* a football match and still earns a place in
 * the log, because unlike a hit or a knockout it is the thing the match is
 * counting. "We were two down at half time" is a fact somebody will tell you
 * about tomorrow; "Ana was on 40% for a moment there" is not.
 *
 * `side` is who the point went to, already resolved - not the goal the ball went
 * through. Working out that a ball through the red goal is a point for blue is
 * `scoringSide`'s job in football.ts, and it happens before this is written so
 * that the log says plainly who was awarded what. A reader of this stream should
 * not have to know the convention to add up the score.
 *
 * `by` is who put it in, which is worth recording and not worth trusting - it is
 * reported by whichever client was stepping the ball, exactly as `PlayerDefeated`
 * is reported by the victim. It decides whose name goes on the goal, never who
 * wins. `ownGoal` is the same claim about the same kick, kept separate so a
 * scorer's tally does not quietly include the ones they would rather forget.
 *
 * `id` is minted per goal by whoever reports it, so a redelivered report cannot
 * be counted twice - the same guard `HitMessage` uses on the wire, applied where
 * the consequence is permanent.
 */
export type GoalScored = DomainEvent<
  'GoalScored',
  {
    id: string
    side: Team
    by?: string
    ownGoal?: boolean
  }
>

/**
 * Somebody got home.
 *
 * The race's equivalent of a goal, and the same kind of fact: it is the thing the
 * match is counting, so it goes in the log while the knockouts and the shoves
 * that shaped it do not.
 *
 * `place` is 1-based and assigned by the decider from the order the log accepted
 * the reports - not claimed by the racer, who has no way of knowing whether
 * somebody beat them by a tenth of a second on a screen three hundred miles
 * away. The server's ordering is the only one everybody can agree on, and it is
 * the same ordering that makes `id` unnecessary here where a goal needs one: a
 * racer finishes once, so their own id is the deduplication.
 *
 * `seconds` is how long the run took, measured from the recorded kickoff against
 * the server's clock. It decides what is printed beside a name and never who
 * won - that is `place`, and the two cannot disagree because both are stamped
 * from the same instant.
 */
export type RacerFinished = DomainEvent<
  'RacerFinished',
  { userId: string; place: number; seconds: number }
>

export type BattleCancelled = DomainEvent<'BattleCancelled', Record<string, never>>

/**
 * Somebody wants to go again.
 *
 * Recorded on the *finished* match rather than gathered in memory, because the
 * people deciding are about to close the tab or wander off and the answer has
 * to survive that. It is also what lets a rematch be assembled without anybody
 * re-inviting anybody: the roster of the next match is the list of people who
 * said yes to this one.
 */
export type RematchWanted = DomainEvent<'RematchWanted', { userId: string }>

/**
 * The rematch exists, and it is that one.
 *
 * A new battle rather than this stream reopening. "Who won" is a fact about a
 * match, and a stream that ended twice would have two answers to it - which
 * would also collapse two matches into one row for the friendly counts. So each
 * round is its own battle, and this is the thread between them.
 */
export type RematchStarted = DomainEvent<'RematchStarted', { battleId: string }>

export type BattleEvent =
  | BattleCreated
  | PlayerJoined
  | PlayerLeft
  | PlayerReady
  | BattleStarted
  | PlayerDefeated
  | GoalScored
  | RacerFinished
  | BattleEnded
  | BattleCancelled
  | RematchWanted
  | RematchStarted

export const BATTLE_EVENT_LABELS: Record<BattleEvent['type'], string> = {
  BattleCreated: 'battle created',
  PlayerJoined: 'player joined',
  PlayerLeft: 'player left',
  PlayerReady: 'player ready',
  BattleStarted: 'battle started',
  PlayerDefeated: 'player defeated',
  GoalScored: 'goal scored',
  RacerFinished: 'racer finished',
  BattleEnded: 'battle ended',
  BattleCancelled: 'battle cancelled',
  RematchWanted: 'rematch wanted',
  RematchStarted: 'rematch started',
}

/**
 * The sides a mode allows. Empty for ffa, which has none.
 *
 * Football draws its sides exactly as `team` does - red against blue - which is
 * not a coincidence to be tidied away later: a football match *is* a team match
 * that happens to be scored differently, so it reuses the same two side names,
 * the same join buttons and the same nameplate colours.
 */
export function sidesFor(mode: BattleMode): readonly Side[] {
  if (mode === 'team' || mode === 'football') return TEAMS
  if (mode === 'one_vs_all') return ONE_VS_ALL_SIDES
  return []
}

export function isValidSide(mode: BattleMode, side: string | undefined): boolean {
  const allowed = sidesFor(mode)
  if (allowed.length === 0) return side === undefined
  return side !== undefined && (allowed as readonly string[]).includes(side)
}

/** The scoreline of a football match. */
export type Score = Record<Team, number>

export const NO_SCORE: Score = { red: 0, blue: 0 }

/**
 * How long is left, in seconds.
 *
 * Derived from the kickoff and the duration rather than counted down and
 * broadcast, which is the same trick the starting ring uses: every client works
 * the answer out from a fact they all already have, so nobody has to be told, a
 * player who reloads sees the right number, and one who joins late is not a
 * minute ahead of everybody else.
 *
 * Clamped at zero, because "minus four seconds left" is not a thing to put on a
 * clock, and because the caller that matters - `isFullTime` - only asks whether
 * it has run out.
 */
export function matchRemaining(
  startedAt: string | null,
  durationMinutes: number,
  now: number = Date.now(),
): number {
  if (!startedAt) return durationMinutes * 60

  const kickoff = Date.parse(startedAt)
  // An unparseable kickoff would otherwise make the clock NaN, which reads as a
  // blank HUD and a match that can never be brought to full time.
  if (Number.isNaN(kickoff)) return 0

  const elapsed = (now - kickoff) / 1000
  return Math.max(0, durationMinutes * 60 - elapsed)
}

export function isFullTime(
  startedAt: string | null,
  durationMinutes: number,
  now: number = Date.now(),
): boolean {
  return matchRemaining(startedAt, durationMinutes, now) <= 0
}

/**
 * Who won on this scoreline, or null for a draw.
 *
 * A draw is a real outcome and is recorded as one, the same way a match that ends
 * with nobody standing is - see `BattleEnded`. Forcing a winner out of 2-2 would
 * mean inventing a tiebreak nobody played.
 */
export function winnerByScore(
  score: Score,
): { type: 'side'; id: Team } | null {
  if (score.red === score.blue) return null
  return { type: 'side', id: score.red > score.blue ? 'red' : 'blue' }
}

/** A racer who got home, and what it says on the sheet beside their name. */
export interface Finisher {
  userId: string
  /** 1-based, in the order the log accepted the reports. */
  place: number
  /** How long the run took, from the recorded kickoff. */
  seconds: number
}

/**
 * Who won the race, or null if nobody finished.
 *
 * The first one home, which is the whole of the rule - there is no tiebreak
 * because there are no ties: two racers who cross in the same instant are
 * separated by which report the server took first, and one of them is in front.
 *
 * Null is a real outcome and not an error. A time limit can run out on a course
 * nobody managed, and "nobody finished" is a truer thing to record than handing
 * it to whoever happened to be furthest along - which nothing in the log would
 * know anyway, because how far you got is not a fact this stream holds.
 */
export function winnerByFinish(
  finishers: readonly Finisher[],
): { type: 'player'; id: string } | null {
  const first = finishers.find((finisher) => finisher.place === 1)
  return first ? { type: 'player', id: first.userId } : null
}
