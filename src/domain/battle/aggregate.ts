import type { BattleCommand } from '@/domain/battle/commands'
import {
  ABANDON_AFTER_HOURS,
  BATTLE_STREAM_TYPE,
  type BattleEvent,
  type BattleMode,
  type Finisher,
  type FootballSettings,
  hasClock,
  isElimination,
  isFullTime,
  isRace,
  isScored,
  isValidSide,
  MAX_MATCH_MINUTES,
  MAX_PLAYERS,
  MAX_SCORE_LIMIT,
  MIN_MATCH_MINUTES,
  MIN_PLAYERS,
  NO_SCORE,
  type RaceSettings,
  readyNeeded,
  type Score,
  seatsIn,
  type Side,
  winnerByFinish,
  winnerByScore,
  type XpMatchRules,
} from '@/domain/battle/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface Participant {
  /** The player's own space, which need not be the host's. */
  tenantId: string
  side?: Side
  defeated: boolean
}

export interface BattleState {
  status: 'none' | 'open' | 'live' | 'ended' | 'cancelled'
  name: string
  mode: BattleMode
  worldId: string
  /** The XP this is fought inside, or null for a world. See ./events. */
  xpId: string | null
  /**
   * What this match settled the level's rules to be, or null.
   *
   * Null for every match in a world and for every XP match created before the
   * wizard could ask - which reads as "whatever the level says" and is what
   * those matches were played under. See `XpMatchRules`.
   */
  xpRules: XpMatchRules | null
  hostTenantId: string
  createdBy: string
  /** userId -> participant */
  participants: Readonly<Record<string, Participant>>
  /**
   * Who has said they are ready, in the order they said it.
   *
   * Only meaningful before kickoff. Kept as a list rather than a flag on the
   * participant because the roster is keyed by id and a lobby wants to draw the
   * order people arrived at the line.
   */
  ready: readonly string[]
  winner: { type: 'player' | 'side'; id: string } | null
  /** Who said they want to go again, in the order they said it. */
  rematchWanted: readonly string[]
  /** The match this one turned into, once somebody started it. */
  rematchBattleId: string | null
  /** Present only for football. Null everywhere else. */
  football: FootballSettings | null
  /** Present only for a race. Null everywhere else. */
  race: RaceSettings | null
  /**
   * Who got home, in the order they did.
   *
   * Empty in every other mode, and empty in a race until somebody crosses. The
   * order of this list *is* the result - see `winnerByFinish` - so it is appended
   * to and never sorted.
   */
  finishers: readonly Finisher[]
  /** The scoreline. Stays at 0-0 in the modes that do not score. */
  score: Score
  /** When the whistle went, for deriving the clock. Null until it starts. */
  startedAt: string | null
  /**
   * Goals already counted, by the id their reporter minted.
   *
   * Bounded in practice by how many goals a ten-minute match can hold, so unlike
   * the wire's hit deduplication this needs no cap - and must not have one, since
   * a forgotten id here would let a redelivered report score twice.
   */
  countedGoals: readonly string[]
}

export const initialBattleState: BattleState = {
  status: 'none',
  name: '',
  mode: 'ffa',
  worldId: '',
  xpId: null,
  xpRules: null,
  hostTenantId: '',
  createdBy: '',
  participants: {},
  ready: [],
  winner: null,
  rematchWanted: [],
  rematchBattleId: null,
  football: null,
  race: null,
  finishers: [],
  score: NO_SCORE,
  startedAt: null,
  countedGoals: [],
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

/**
 * Who was ahead when everybody left.
 *
 * The same two functions the whistle uses, picked the same way - so an
 * abandoned football match is scored exactly as a finished one would have been
 * and a race by who got home. Everything else returns null, and that is not a
 * gap: an elimination match is decided by the last player standing, and in a
 * match nobody finished there is no such player. A winner invented from who
 * happened to still be alive when the room emptied would be a result nobody
 * earned.
 */
function resultAsItStood(state: BattleState): BattleState['winner'] {
  if (isRace(state.mode)) return winnerByFinish(state.finishers)
  if (isScored(state.mode)) return winnerByScore(state.score)
  return null
}

export function evolve(state: BattleState, event: BattleEvent): BattleState {
  switch (event.type) {
    case 'BattleCreated':
      return {
        ...state,
        status: 'open',
        name: event.data.name,
        mode: event.data.mode,
        worldId: event.data.worldId,
        // Absent on every match created before XPs existed, which is what
        // `?? null` is saying rather than defending against.
        xpId: event.data.xpId ?? null,
        xpRules: event.data.xpRules ?? null,
        hostTenantId: event.data.hostTenantId,
        createdBy: event.data.createdBy,
        football: event.data.football ?? null,
        race: event.data.race ?? null,
      }

    case 'PlayerJoined':
      return {
        ...state,
        participants: {
          ...state.participants,
          [event.data.userId]: {
            tenantId: event.data.tenantId,
            side: event.data.side,
            defeated: false,
          },
        },
      }

    case 'PlayerLeft':
      return {
        ...state,
        participants: withoutKey(state.participants, event.data.userId),
        // A tick belonging to somebody who is no longer here would keep the
        // start button lit for a lobby that has emptied out from under it.
        ready: state.ready.filter((userId) => userId !== event.data.userId),
      }

    case 'PlayerReady': {
      const already = state.ready.includes(event.data.userId)
      if (event.data.ready === already) return state
      return {
        ...state,
        ready: event.data.ready
          ? [...state.ready, event.data.userId]
          : state.ready.filter((userId) => userId !== event.data.userId),
      }
    }

    case 'BattleStarted':
      // `at` is absent on every match started before football existed, and those
      // modes have no clock to derive - so null is the honest value, not a
      // fabricated kickoff.
      return { ...state, status: 'live', startedAt: event.data.at ?? null }

    case 'GoalScored': {
      // Idempotent on replay and against a redelivered report. Checked before the
      // score moves, because counting a goal twice is the one arithmetic error
      // nobody can talk you out of.
      if (state.countedGoals.includes(event.data.id)) return state

      return {
        ...state,
        score: {
          ...state.score,
          [event.data.side]: state.score[event.data.side] + 1,
        },
        countedGoals: [...state.countedGoals, event.data.id],
      }
    }

    case 'RacerFinished': {
      // Idempotent on replay and against a redelivered report: a racer finishes
      // once, so their own id is the deduplication a goal needs a minted one for.
      if (state.finishers.some((f) => f.userId === event.data.userId)) return state

      return {
        ...state,
        finishers: [
          ...state.finishers,
          {
            userId: event.data.userId,
            place: event.data.place,
            seconds: event.data.seconds,
          },
        ],
      }
    }

    case 'PlayerDefeated': {
      const existing = state.participants[event.data.userId]
      // Evolve must survive any history, including one an older bug reordered.
      if (!existing) return state
      return {
        ...state,
        participants: {
          ...state.participants,
          [event.data.userId]: { ...existing, defeated: true },
        },
      }
    }

    case 'BattleEnded':
      return { ...state, status: 'ended', winner: event.data.winner }

    case 'BattleCancelled':
      return { ...state, status: 'cancelled' }

    case 'RematchWanted':
      // Idempotent on replay, and against a double-clicked button.
      if (state.rematchWanted.includes(event.data.userId)) return state
      return { ...state, rematchWanted: [...state.rematchWanted, event.data.userId] }

    case 'RematchStarted':
      return { ...state, rematchBattleId: event.data.battleId }

    default:
      return state
  }
}

/**
 * Which side a player counts as, for deciding who is left.
 *
 * In `ffa` a player's side is themselves, which is what collapses three modes
 * into one win condition: "the last side with somebody standing wins" is
 * already the rule for free-for-all once every player is their own side. A
 * one-vs-everyone match is a team match whose champion side has one member.
 */
function sideOf(userId: string, participant: Participant, mode: BattleMode): string {
  return mode === 'ffa' ? userId : (participant.side ?? userId)
}

/** The sides that still have at least one player standing. */
function standingSides(state: BattleState): string[] {
  const sides = new Set<string>()
  for (const [userId, participant] of Object.entries(state.participants)) {
    if (!participant.defeated) sides.add(sideOf(userId, participant, state.mode))
  }
  return [...sides]
}

/**
 * Has this match resolved, and in whose favour?
 *
 * Returns the `BattleEnded` event when it has, or null while it has not. Pure,
 * so the interesting cases - a mutual knockout, everybody leaving, a team whose
 * last member quits rather than dies - are all enumerable in a unit test.
 */
function endingOf(state: BattleState): BattleEvent | null {
  if (state.status !== 'live') return null

  /**
   * Football and race are not decided by who is left standing, and this is the
   * line that says so.
   *
   * Without it, the first knockout in a football match would end it: a scored
   * match has two sides, and "one side has somebody up" is trivially true the
   * moment the other side's only player goes down. A race would be worse still -
   * it has no sides at all, so every racer is their own side and the first one
   * knocked into the void would hand the win to whoever was left. Football ends on
   * the clock or the score limit; a race ends when everybody is home or the clock
   * runs out. Nothing else.
   *
   * The stronger guarantee is upstream, in `ReportDefeat`: neither mode writes a
   * defeat at all, so `standingSides` could not find an empty side even if this
   * returned. Both are deliberate. One of them is the rule; the other makes the
   * rule impossible to break by accident from a new call site.
   */
  if (!isElimination(state.mode)) return null

  const standing = standingSides(state)
  if (standing.length > 1) return null

  // Nobody left standing is a draw, not a win for the last person to fall.
  if (standing.length === 0) {
    return { type: 'BattleEnded', data: { winner: null } }
  }

  return {
    type: 'BattleEnded',
    data: {
      winner: {
        type: state.mode === 'ffa' ? 'player' : 'side',
        id: standing[0]!,
      },
    },
  }
}

/**
 * Has a football match been won on the scoreline?
 *
 * Only ever by the score limit. Running out of time is the *other* way it ends and
 * is not decided here, because time passing is not something the log can notice on
 * its own - somebody has to call it, which is what `CallFullTime` is for.
 *
 * Pure and separate from `endingOf` rather than another branch inside it: the two
 * modes answer "is it over" from entirely different facts, and a single function
 * consulting both would have to be read twice to be sure which rule applied to
 * which mode.
 */
function scoredEndingOf(state: BattleState): BattleEvent | null {
  if (state.status !== 'live') return null

  const limit = state.football?.scoreLimit
  if (!limit) return null

  const leader = (['red', 'blue'] as const).find((side) => state.score[side] >= limit)
  if (!leader) return null

  return { type: 'BattleEnded', data: { winner: { type: 'side', id: leader } } }
}

/**
 * Is everybody home?
 *
 * The race's own ending, and the only one the log can notice by itself: running
 * out of time is the *other* way it ends and is called for, exactly as full time
 * in football is.
 *
 * "Everybody" is everybody still on the roster, so a racer who gives up and
 * leaves does not hold the rest of the field on the finish line waiting for
 * somebody who has closed the tab. That is the same call `LeaveBattle` makes
 * below - walking out of a race is walking out, not a defeat and not a result.
 */
function raceEndingOf(state: BattleState): BattleEvent | null {
  if (state.status !== 'live') return null
  if (!isRace(state.mode)) return null

  const racers = Object.keys(state.participants)
  if (racers.length === 0) return null
  if (!racers.every((userId) => state.finishers.some((f) => f.userId === userId))) {
    return null
  }

  return { type: 'BattleEnded', data: { winner: winnerByFinish(state.finishers) } }
}

export function decide(state: BattleState, command: BattleCommand): BattleEvent[] {
  switch (command.type) {
    case 'CreateBattle': {
      if (state.status !== 'none') {
        throw new DomainError('That battle already exists', 'battle_exists')
      }

      /**
       * Settings belong to football and to nothing else.
       *
       * Both directions are enforced: a football match without them would have no
       * clock and so no way to end, and settings attached to a free-for-all would
       * be a fact in the log that nothing will ever read - which is worse than an
       * error, because it looks like it means something.
       */
      const football = command.football
      if (isScored(command.mode)) {
        if (!football) {
          throw new DomainError('A football match needs a clock', 'football_settings')
        }
        assertFootballSettings(football)
      } else if (football) {
        throw new DomainError(
          'Only a football match has those settings',
          'football_settings',
        )
      }

      /**
       * A rules override belongs to a level, and to nothing else.
       *
       * Refused rather than dropped: a host who set a score limit on a match
       * with no XP in it has misunderstood what they were setting, and a fact
       * in the log that nothing will ever read is worse than an error because
       * it looks like it means something. The same bargain the two settings
       * blocks above already make with their modes.
       */
      if (command.xpRules && !command.xpId) {
        throw new DomainError(
          'Only a match inside an XP has a level to override',
          'xp_rules_without_xp',
        )
      }
      if (command.xpRules) assertXpRules(command.xpRules)

      /** The same bargain, for the mode with the other clock. */
      const race = command.race
      if (isRace(command.mode)) {
        if (!race) {
          throw new DomainError('A race needs a time limit', 'race_settings')
        }
        assertDuration(race.durationMinutes)
      } else if (race) {
        throw new DomainError('Only a race has those settings', 'race_settings')
      }

      return [
        {
          type: 'BattleCreated',
          data: {
            name: command.name,
            mode: command.mode,
            worldId: command.worldId,
            ...(command.xpId ? { xpId: command.xpId } : {}),
            ...(command.xpRules ? { xpRules: command.xpRules } : {}),
            hostTenantId: command.hostTenantId,
            createdBy: command.actorId,
            ...(football ? { football } : {}),
            ...(race ? { race } : {}),
          },
        },
      ]
    }

    case 'JoinBattle': {
      assertOpen(state)

      // Re-joining the side you are already on is a no-op, so a double-clicked
      // button does not append a second PlayerJoined for the same person.
      const existing = state.participants[command.actorId]
      if (existing) {
        if (existing.side === command.side) return []
        // Switching sides before the start is allowed, and is recorded as a
        // fresh join rather than an edit - evolve overwrites the entry, and the
        // log keeps both facts in the order they happened.
      }

      if (!isValidSide(state.mode, command.side)) {
        throw new DomainError(
          state.mode === 'ffa'
            ? 'This is a free-for-all - there are no sides to pick'
            : 'Pick a side',
          'bad_side',
        )
      }

      /**
       * The room's capacity, which a level may narrow.
       *
       * `players.max` is a fact about the level - a board game for four has
       * four seats wherever it is opened - so the fifth person is turned away
       * at the door with a sentence rather than admitted into a game with no
       * seat for them. It never *widens* past `MAX_PLAYERS`, which is the
       * transport's number and not a taste.
       */
      const seats = seatsIn(state.xpRules)
      if (!existing && Object.keys(state.participants).length >= seats) {
        throw new DomainError(`A battle holds ${seats} fighters`, 'battle_full')
      }

      // One champion, by definition. Without this the mode is just a team match
      // with confusing labels.
      if (
        state.mode === 'one_vs_all' &&
        command.side === 'champion' &&
        hasOtherChampion(state, command.actorId)
      ) {
        throw new DomainError('Somebody is already the champion', 'champion_taken')
      }

      return [
        {
          type: 'PlayerJoined',
          data: {
            userId: command.actorId,
            tenantId: command.tenantId,
            side: command.side,
          },
        },
      ]
    }

    case 'LeaveBattle': {
      const participant = state.participants[command.actorId]
      if (!participant) return []

      if (state.status === 'open') {
        const left: BattleEvent = {
          type: 'PlayerLeft',
          data: { userId: command.actorId },
        }

        /**
         * The last one out closes it.
         *
         * An empty lobby is not a match anybody can join - it has no host
         * standing in it and nothing will ever start it - so leaving it "open"
         * means the list of what is on fills up with things that are not on.
         * Recorded as cancelled, which is what it is: a match that never
         * happened.
         *
         * Only for a lobby. Walking out of a *live* match is a defeat, and the
         * win condition already resolves the case where that empties the
         * arena - as a draw, which is a different and truer answer.
         */
        const remaining = Object.keys(state.participants).filter(
          (userId) => userId !== command.actorId,
        )
        if (remaining.length === 0) {
          return [left, { type: 'BattleCancelled', data: {} }]
        }

        return [left]
      }

      if (state.status !== 'live') return []

      /**
       * Walking out of a football match is just walking out.
       *
       * Not a defeat, because a defeat is not how football is lost - recording one
       * would put a fact in the log that no rule reads. So the player leaves the
       * roster, and the match carries on with whoever is left: a side going a player
       * down is a disadvantage, not a forfeit.
       *
       * If that empties the pitch there is nobody to play, and the score at that
       * moment is the result - which may well be a draw at 0-0. Better than leaving
       * a live match nobody is in, which is the same reasoning the lobby uses when
       * the last person out cancels it.
       */
      if (isScored(state.mode)) {
        const left: BattleEvent = { type: 'PlayerLeft', data: { userId: command.actorId } }

        const remaining = Object.keys(state.participants).filter(
          (userId) => userId !== command.actorId,
        )
        if (remaining.length > 0) return [left]

        return [
          left,
          { type: 'BattleEnded', data: { winner: winnerByScore(state.score) } },
        ]
      }

      /**
       * Giving up on a race is giving up.
       *
       * Not a defeat, for the reason football's branch above gives, and with one
       * consequence football does not have: leaving can *end* the race. The field
       * is what everybody else is waiting for, so somebody who quits while the
       * rest are already home stops holding them on the line - which is exactly
       * `raceEndingOf` asked against the roster this departure leaves behind.
       *
       * A racer who walks out has no place, which is what a did-not-finish is:
       * nothing was recorded, and nothing is what it means.
       */
      if (isRace(state.mode)) {
        const left: BattleEvent = { type: 'PlayerLeft', data: { userId: command.actorId } }

        const after = evolve(state, left)
        const remaining = Object.keys(after.participants)
        if (remaining.length === 0) {
          return [
            left,
            { type: 'BattleEnded', data: { winner: winnerByFinish(state.finishers) } },
          ]
        }

        const ending = raceEndingOf(after)
        return ending ? [left, ending] : [left]
      }

      /**
       * Walking out of a live match counts as going down.
       *
       * Recorded as a defeat rather than a departure so that quitting cannot be
       * used to deny somebody a win - if leaving removed you from the roster,
       * the last two players could both quit and the match would end in a draw
       * neither of them earned. It also means the win condition has one input
       * (who is standing) instead of two.
       */
      if (participant.defeated) return []

      const defeated: BattleEvent = {
        type: 'PlayerDefeated',
        data: { userId: command.actorId },
      }
      return withEnding(state, defeated)
    }

    /**
     * The ready sign.
     *
     * Only in the lobby: once the whistle has gone there is nothing to be ready
     * for, and a tick appearing on a live match would be a control that changes
     * nothing. Only a fighter, for the reason `WantRematch` refuses a spectator
     * - somebody who is not in the match saying they are ready would count
     * towards a start they are not part of.
     *
     * Returning nothing rather than throwing when the answer is already what
     * was asked for, so a double-tapped button appends no second event.
     */
    case 'SetReady': {
      assertOpen(state)

      if (!state.participants[command.actorId]) {
        throw new DomainError('Join the match first', 'not_a_fighter')
      }
      if (state.ready.includes(command.actorId) === command.ready) return []

      return [
        {
          type: 'PlayerReady',
          data: { userId: command.actorId, ready: command.ready },
        },
      ]
    }

    case 'StartBattle': {
      assertOpen(state)

      /**
       * Whoever set it up, or anybody left in it once they have gone.
       *
       * ---------------------------------------------------------------------
       * Reported as "leaving as owner closes the match"
       * ---------------------------------------------------------------------
       * It did not cancel it - `LeaveBattle` only does that when the lobby
       * *empties*, which is a match nobody attended. What it did was worse and
       * looked the same from outside: the host walked out, the three people
       * still in the lobby kept their seats, and not one of them could blow the
       * whistle. A match that cannot be started is closed in every sense that
       * matters to somebody standing in it, and it stays on the list until the
       * day-later backstop sweeps it.
       *
       * So the whistle passes to the room. **This is the argument `StartRematch`
       * already makes twenty lines down**, in as many words: whoever set the
       * match up may have lost and left, and a rematch only they could call is
       * one that usually cannot be called. The same is true of the first one.
       *
       * The host keeps it while they are *here*, which is the half worth
       * keeping: a lobby with its host in it has somebody whose match it is, and
       * letting anybody start it would take that from them for no reason.
       */
      // `createdBy` is a string and empty before anything is created, which
      // `assertOpen` above has already ruled out - so membership is the whole
      // question, not nullness.
      const hosting = state.createdBy in state.participants
      const mayStart = hosting
        ? command.actorId === state.createdBy
        : command.actorId in state.participants

      if (!mayStart) {
        throw new DomainError(
          hosting
            ? 'Only whoever set this up can start it'
            : 'Only somebody in the match can start it',
          'not_host',
        )
      }

      /**
       * Enough people, and enough of them ready.
       *
       * Two conditions where there was one, and the second is the ask: a match
       * that kicked off with one person in it was doing so because the roster
       * was the only thing anybody counted, and somebody still loading the
       * level is on the roster. `readyNeeded` is where the level gets its say -
       * a document that declares `players.min: 4` cannot be started with three,
       * which is exactly the detectable brokenness §3 says a lower bound is
       * for.
       *
       * Ready is counted rather than required of everybody: a lobby where one
       * person wandering off blocks the start is a lobby that never starts, and
       * whoever is not ready is drawn as not ready rather than as a veto.
       */
      const needed = readyNeeded(state.xpRules)

      const count = Object.keys(state.participants).length
      if (count < needed) {
        throw new DomainError(
          `A battle needs ${needed} fighters to start`,
          'not_enough_players',
        )
      }

      // Only the ticks belonging to people who are still here - `evolve` drops
      // a leaver's, and this is the second gate for a history an older bug
      // could have left crossed.
      const standing = state.ready.filter((userId) => state.participants[userId])
      if (standing.length < needed) {
        throw new DomainError(
          `${needed} people have to be ready — ${standing.length} so far`,
          'not_enough_ready',
        )
      }

      // Every side has to be occupied, or the match is over the instant it
      // begins - the win condition would find one standing side immediately.
      const occupied = new Set(
        Object.entries(state.participants).map(([userId, participant]) =>
          sideOf(userId, participant, state.mode),
        ),
      )
      if (occupied.size < 2) {
        throw new DomainError(
          state.mode === 'one_vs_all'
            ? 'A champion and at least one challenger, please'
            : 'Both sides need somebody on them',
          'empty_side',
        )
      }

      // The kickoff instant is recorded only where something reads it. The other
      // three modes have no clock, and a timestamp in their payload would be a
      // fact nobody consults. A race reads it twice over: for the time limit, and
      // because every finishing time is measured from it.
      return [
        { type: 'BattleStarted', data: hasClock(state.mode) ? { at: command.at } : {} },
      ]
    }

    case 'ReportDefeat': {
      if (state.status !== 'live') return []

      /**
       * Nobody is eliminated from a football match.
       *
       * Being knocked out there is a setback measured in seconds - you get up and
       * carry on, and even with respawns switched off the match still ends on the
       * clock rather than when a side runs out of players. So this records nothing,
       * which is the same call `combat.ts` makes about health and for the same
       * reason: "Ana was down for four seconds in the 62nd minute" is not a fact
       * anybody will ask about tomorrow, and the goals already say how it went.
       *
       * Returning early rather than throwing, because the scene reports a knockout
       * the instant health hits zero and it should not have to know which modes
       * care. One rule here beats a condition at every call site.
       *
       * The same is true of a race, where being knocked out costs you the run
       * back to where you were and nothing else. What it costs is real; what it
       * is worth recording is not.
       */
      if (!isElimination(state.mode)) return []

      const participant = state.participants[command.userId]
      if (!participant) {
        throw new DomainError('That fighter is not in this battle', 'not_a_fighter')
      }
      // Already down. Respawning and being knocked out again within one match
      // does not make a second defeat - you are out the first time.
      if (participant.defeated) return []

      const defeated: BattleEvent = {
        type: 'PlayerDefeated',
        data: { userId: command.userId, by: command.by },
      }
      return withEnding(state, defeated)
    }

    case 'ReportGoal': {
      // Not live yet, or already over. A goal reported a moment after the final
      // whistle is dropped rather than rejected: the reporter was mid-frame when
      // the match ended and there is nothing for them to correct.
      if (state.status !== 'live') return []

      if (!isScored(state.mode)) {
        throw new DomainError('There is no ball in this match', 'not_football')
      }

      /**
       * Only somebody in the match may report a goal in it.
       *
       * This is the check the action's doc comment has always claimed was here.
       * Without it `ReportGoal` was the one command in this decider that never
       * read `actorId`, and the gap was not theoretical: RLS admits any member
       * *or admitted guest* of the host space to this stream, and the id dedup
       * is no defence because a hostile caller mints a fresh id per call -
       * exactly what the legitimate client does. A spectator, or the player
       * currently losing, could reach `scoreLimit` on their own and the same
       * append would end the match with a fabricated winner, which then flows
       * into friendly counts and tournament brackets.
       *
       * Thrown rather than dropped, unlike the two guards above it: a report
       * from outside the roster is not a mid-frame timing accident, it is a
       * claim that should never have been made.
       */
      if (!state.participants[command.actorId]) {
        throw new DomainError('That reporter is not in this match', 'not_a_player')
      }

      // Already counted. The reporter mints the id, so this is the same guard the
      // wire uses against a redelivered packet - here because the consequence is
      // permanent.
      if (state.countedGoals.includes(command.id)) return []

      const scored: BattleEvent = {
        type: 'GoalScored',
        data: {
          id: command.id,
          side: command.side,
          ...(command.by ? { by: command.by } : {}),
          ...(command.ownGoal ? { ownGoal: true } : {}),
        },
      }

      /**
       * The goal that wins it ends it, in the same append.
       *
       * Two events, one transaction - exactly as `withEnding` does for a defeat, and
       * for the same reason: there is no instant where the log says a side reached
       * the target and nobody has won.
       */
      const ending = scoredEndingOf(evolve(state, scored))
      return ending ? [scored, ending] : [scored]
    }

    case 'ReportFinish': {
      // Not started, or already over. A finish reported a moment after the time
      // limit is dropped rather than rejected: the racer was mid-stride when the
      // race ended and there is nothing for them to correct.
      if (state.status !== 'live') return []

      if (!isRace(state.mode)) {
        throw new DomainError('There is nothing to run to in this match', 'not_race')
      }

      // Somebody who is not in the race cannot finish it. A spectator standing on
      // the line is a spectator standing on the line.
      if (!state.participants[command.userId]) {
        throw new DomainError('That racer is not in this race', 'not_a_racer')
      }

      // Already home. A second crossing is somebody walking back over the line.
      if (state.finishers.some((f) => f.userId === command.userId)) return []

      /**
       * The place, from the log rather than from the claim.
       *
       * Whoever is being folded here is behind everybody already recorded and in
       * front of everybody who has not reported yet, and that is the entire
       * ordering: the server took these reports in some order, and that order is
       * the result. No client is in a position to know it.
       */
      const finished: BattleEvent = {
        type: 'RacerFinished',
        data: {
          userId: command.userId,
          place: state.finishers.length + 1,
          seconds: elapsedSeconds(state.startedAt, command.now),
        },
      }

      /**
       * The last one home ends it, in the same append.
       *
       * Two events, one transaction - as `withEnding` does for a defeat and
       * `ReportGoal` does for the goal that wins it. There is no instant where the
       * log says everybody is home and nobody has won.
       */
      const ending = raceEndingOf(evolve(state, finished))
      return ending ? [finished, ending] : [finished]
    }

    case 'CallFullTime': {
      if (state.status !== 'live') return []

      /**
       * A race runs out of time the same way a football match does.
       *
       * Same command, same guard, same clock read off the same recorded kickoff -
       * the only thing that differs is what the result is when the whistle goes,
       * and that is one line below. A second command called `CallTimeLimit` would
       * have been the same code twice with a different name on it.
       */
      if (isRace(state.mode)) {
        if (!state.race) {
          throw new DomainError('This race has no clock', 'not_race')
        }
        if (
          !isFullTime(state.startedAt, state.race.durationMinutes, Date.parse(command.now))
        ) {
          throw new DomainError('There is still time on the clock', 'not_full_time')
        }

        // Whoever is still running is recorded as not having finished, which is
        // what having no place already says. Nothing further to write.
        return [
          { type: 'BattleEnded', data: { winner: winnerByFinish(state.finishers) } },
        ]
      }

      if (!isScored(state.mode) || !state.football) {
        throw new DomainError('This match has no clock', 'not_football')
      }

      /**
       * Checked against the kickoff in the log, not taken on trust.
       *
       * Anybody in the match may call it - whoever is watching the clock when it
       * hits zero, which must not be only the host, since the host may well have
       * wandered off - so the guard against a client ending a match it is losing is
       * this comparison rather than who sent it. `now` comes from the server's
       * clock in the action; the browser's is not consulted.
       */
      if (!isFullTime(state.startedAt, state.football.durationMinutes, Date.parse(command.now))) {
        throw new DomainError('There is still time on the clock', 'not_full_time')
      }

      return [{ type: 'BattleEnded', data: { winner: winnerByScore(state.score) } }]
    }

    /**
     * The day-later backstop.
     *
     * Two people open a match, nobody presses start, and the room sits in the
     * lobby forever - or it kicks off, everybody closes their laptop, and it is
     * still "live" a week on. Neither is a bug in the clock: `CallFullTime` only
     * exists for the modes that have one, and somebody has to be watching to
     * call it. This is what closes the rest.
     *
     * **What the result is, decided per case rather than in general.** The
     * backlog entry asked for one answer and there are honestly two:
     *
     *   - **Never started** → `BattleCancelled`. Nothing happened, so there is
     *     no result to record, and calling it a match anybody played would put
     *     a game nobody attended into everybody's tally.
     *   - **Started** → `BattleEnded`, with the score exactly as it stood, and
     *     `abandoned` beside it. A football match walked away from at 2-1 was
     *     2-1; throwing that away because nobody blew the whistle loses a real
     *     fact to a missing button press. The flag is what stops it reading as
     *     a finished match.
     *
     * Idempotent rather than an error once it has run, because a sweep that
     * raced with itself must not turn a closed match into a failure somebody
     * has to look at.
     */
    case 'AbandonBattle': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'ended' || state.status === 'cancelled') return []

      /*
       * The kickoff when there is one, and the opening otherwise.
       *
       * `startedAt` is off the match's own event and is the better clock: a
       * match that sat open for two days and then kicked off an hour ago is a
       * live match, not an abandoned one, and reading the opening here would
       * close it out from under the people in it.
       */
      const since = Date.parse(state.startedAt ?? command.openedAt)
      if (Number.isNaN(since)) {
        throw new DomainError('That match has no clock to measure', 'no_opening')
      }

      const hours = (Date.parse(command.now) - since) / 3_600_000
      if (hours < ABANDON_AFTER_HOURS) {
        throw new DomainError('That match is not old enough to close', 'not_stale')
      }

      if (state.status === 'open') return [{ type: 'BattleCancelled', data: {} }]

      return [
        {
          type: 'BattleEnded',
          data: { winner: resultAsItStood(state), abandoned: true },
        },
      ]
    }

    /**
     * Called off, by the host or by whoever runs the space.
     *
     * Two authorities and not one, and the second was added because the first
     * is not always present: a match opened by somebody who has since left, or
     * one nobody turned up to, stayed in the space's active list until the
     * day-later sweep found it — and the person looking at a list of matches
     * that are not happening is an owner, who had no button.
     *
     * `asStaff` is decided in the action from the session's role and is never
     * on the wire. A client that could set it could call off anybody's match.
     *
     * **Cancelled and not ended**, whichever state it was in. The two are
     * different facts and the read model treats them differently: an `ended`
     * match has a result and goes in everybody's tally, and a match somebody
     * called off has neither — a live game closed by an owner is not a game
     * anybody won. `AbandonBattle` above makes the opposite choice for the
     * opposite reason: nobody is left there to decide, so the score as it stood
     * is the most honest thing left.
     *
     * Idempotent once cancelled, so two owners pressing at once is one event
     * rather than a failure one of them has to read.
     */
    case 'CancelBattle': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'cancelled') return []
      if (state.status === 'ended') {
        throw new DomainError('That battle is already over', 'battle_over')
      }
      if (command.actorId !== state.createdBy && command.asStaff !== true) {
        throw new DomainError(
          'Only whoever set this up, or somebody who runs the space, can call it off',
          'not_host',
        )
      }
      return [{ type: 'BattleCancelled', data: {} }]
    }

    case 'WantRematch': {
      /**
       * Only once it is over.
       *
       * Asking mid-fight would be asking people to decide whether they want
       * another one before they know how this one went, which is not the
       * question. And only fighters get a say - a spectator opting in would put
       * somebody on the next roster who was never on this one.
       */
      if (state.status !== 'ended') {
        throw new DomainError('That match is not over yet', 'battle_not_ended')
      }
      if (!state.participants[command.actorId]) {
        throw new DomainError('You were not in that match', 'not_a_fighter')
      }
      if (state.rematchBattleId) {
        throw new DomainError('The rematch has already started', 'rematch_started')
      }
      if (state.rematchWanted.includes(command.actorId)) return []

      return [{ type: 'RematchWanted', data: { userId: command.actorId } }]
    }

    case 'StartRematch': {
      if (state.status !== 'ended') {
        throw new DomainError('That match is not over yet', 'battle_not_ended')
      }
      // Started once. A second one would strand whoever followed the first.
      if (state.rematchBattleId) return []

      if (state.rematchWanted.length < MIN_PLAYERS) {
        throw new DomainError(
          `${MIN_PLAYERS} people have to want a rematch`,
          'not_enough_players',
        )
      }
      /**
       * Started by somebody who is actually going.
       *
       * Not "the host", deliberately: the person who set the match up may well
       * have lost and left, and a rematch that only they can call is one that
       * usually cannot be called. Anybody who opted in may start it, which is
       * the same set of people it is for.
       */
      if (!state.rematchWanted.includes(command.actorId)) {
        throw new DomainError('Opt in first', 'not_in_rematch')
      }

      return [{ type: 'RematchStarted', data: { battleId: command.battleId } }]
    }

    /**
     * Line up again, from the middle of one.
     *
     * ---------------------------------------------------------------------
     * Why this is not two commands
     * ---------------------------------------------------------------------
     * "Call it off and open another" is what a person would do by hand, and it
     * loses the only thing that makes a restart work: **everybody else is
     * looking at this match**. Their rooms poll this stream, so a cancellation
     * on its own leaves four people on a "called off" screen with a lobby to
     * find their own way back to. The pointer is what walks them across, and
     * writing it in the same append as the cancellation is what stops there
     * being an instant where the match is over and nowhere leads on from it.
     *
     * So: `RematchStarted` first, `BattleCancelled` second, one transaction.
     * The order matters to a reader more than to the fold - a stream that says
     * "the next one is over there, and this one is finished with" reads in the
     * order it happened.
     *
     * ---------------------------------------------------------------------
     * Cancelled, never ended
     * ---------------------------------------------------------------------
     * The same call `CancelBattle` makes and for the same reason: a match
     * somebody restarted is not a match anybody won, and putting it in the
     * tallies would credit a game that was abandoned halfway through. The one
     * that gets played is the one that counts.
     *
     * A match that is genuinely **over** is refused rather than restarted -
     * that is what `WantRematch` and `StartRematch` are for, and they are a
     * better answer there because they ask the room first. This one cannot ask:
     * it exists precisely for the case where somebody has stopped answering.
     */
    case 'RestartBattle': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'ended') {
        throw new DomainError(
          'That match is over — ask for a rematch instead',
          'battle_over',
        )
      }

      /**
       * Whoever set it up, whoever runs the space, or - once the host has gone
       * - anybody still in it.
       *
       * The third is `StartBattle`'s rule, and it belongs here for the reason
       * that one gives: the person who opened the match may be the very person
       * who has just dropped out, and a restart only they could call is one
       * that cannot be called in the situation it was built for.
       */
      const hosting = state.createdBy in state.participants
      const mayRestart =
        command.asStaff === true ||
        command.actorId === state.createdBy ||
        (!hosting && command.actorId in state.participants)

      if (!mayRestart) {
        throw new DomainError(
          'Only somebody in this match, or whoever runs the space, can restart it',
          'not_host',
        )
      }

      /**
       * Started once, whoever pressed it.
       *
       * Two people pressing at the same moment is one restart and one place for
       * both of them to go - the action hands the second presser the id that is
       * already recorded rather than the one it just made, which is exactly
       * what `StartRematch` does with a rematch that already exists.
       */
      if (state.rematchBattleId) return []

      /**
       * A match already called off still gets the pointer.
       *
       * Not a second cancellation - it is already cancelled - but the people in
       * it are still standing in a room with nowhere to go, which is the
       * situation this whole command exists to fix.
       */
      if (state.status === 'cancelled') {
        return [{ type: 'RematchStarted', data: { battleId: command.battleId } }]
      }

      return [
        { type: 'RematchStarted', data: { battleId: command.battleId } },
        { type: 'BattleCancelled', data: {} },
      ]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * Append the ending, if this defeat produced one.
 *
 * The end of a match is a consequence of the last defeat, not a separate thing
 * somebody has to remember to command - so it is decided here, against the
 * state the defeat produces, and written in the same append. Two events, one
 * transaction: there is no instant where the log says everybody is down and
 * nobody has won.
 */
function withEnding(state: BattleState, defeated: BattleEvent): BattleEvent[] {
  const after = evolve(state, defeated)
  const ending = endingOf(after)
  return ending ? [defeated, ending] : [defeated]
}

/**
 * The settings, checked again on the way into the log.
 *
 * The action's schema already bounds these. This is the second gate, and it is here
 * for the reason the palette allow-list is checked in the action rather than only
 * in the picker: a command is a public entry point, and these values are about to
 * become permanent. A ninety-minute clock in a team room is not a crash, it is a
 * match nobody can finish.
 */
function assertFootballSettings(settings: FootballSettings): void {
  const { scoreLimit } = settings

  assertDuration(settings.durationMinutes)

  if (scoreLimit !== undefined) {
    if (!Number.isInteger(scoreLimit) || scoreLimit < 1 || scoreLimit > MAX_SCORE_LIMIT) {
      throw new DomainError(
        `A score target is 1-${MAX_SCORE_LIMIT} goals`,
        'bad_score_limit',
      )
    }
  }
}

/**
 * The rules a match settled on, checked on the way into the log.
 *
 * The schema already bounds these; this is the second gate, for the reason
 * `assertFootballSettings` gives - a command is a public entry point and these
 * values are about to become permanent. What it cannot check is the *level*:
 * whether the world has goals to score in is `matchRulesProblems`' question and
 * it needs the document, which is why that check lives in the action beside the
 * load rather than here.
 */
function assertXpRules(rules: XpMatchRules): void {
  const { min, max } = rules.players
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1) {
    throw new DomainError('A match is for a whole number of people', 'bad_players')
  }
  if (min > max) {
    throw new DomainError(
      'The smallest number of players is more than the largest',
      'bad_players',
    )
  }
  if (max > MAX_PLAYERS) {
    throw new DomainError(`A battle holds ${MAX_PLAYERS} fighters`, 'bad_players')
  }
  if (rules.scoreLimit !== undefined && (!Number.isInteger(rules.scoreLimit) || rules.scoreLimit < 1)) {
    throw new DomainError('A score target of zero is a match nobody can play', 'bad_score_limit')
  }
  if (rules.timeLimit !== undefined && (!Number.isInteger(rules.timeLimit) || rules.timeLimit < 1)) {
    throw new DomainError('A clock of zero is a match that is over on the first frame', 'bad_duration')
  }
}

/**
 * The clock, checked on the way into the log.
 *
 * Shared by the two modes that have one, because the bounds are the same bounds
 * for the same reason: under three minutes nothing has time to turn round, and
 * over ten a team room has stopped playing and started holding a fixture.
 */
function assertDuration(durationMinutes: number): void {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_MATCH_MINUTES ||
    durationMinutes > MAX_MATCH_MINUTES
  ) {
    throw new DomainError(
      `A match runs ${MIN_MATCH_MINUTES}-${MAX_MATCH_MINUTES} minutes`,
      'bad_duration',
    )
  }
}

/**
 * How long a run took, in whole seconds.
 *
 * Both ends come from the server: the kickoff is what the log recorded, and `now`
 * is stamped in the action. A browser cannot post a fast time by being wrong
 * about what time it is.
 *
 * Clamped at zero, and floored rather than rounded, because a time is a stopwatch
 * reading and 12.9 seconds is twelve seconds on a stopwatch. An unparseable
 * kickoff - which no live race has - reads as zero rather than as NaN, since a
 * number that poisons every comparison it touches is a worse answer than a wrong
 * one that is obviously wrong.
 */
function elapsedSeconds(startedAt: string | null, now: string): number {
  if (!startedAt) return 0

  const kickoff = Date.parse(startedAt)
  const at = Date.parse(now)
  if (Number.isNaN(kickoff) || Number.isNaN(at)) return 0

  return Math.max(0, Math.floor((at - kickoff) / 1000))
}

function hasOtherChampion(state: BattleState, exceptUserId: string): boolean {
  return Object.entries(state.participants).some(
    ([userId, participant]) =>
      userId !== exceptUserId && participant.side === 'champion',
  )
}

function notFound(): DomainError {
  return new DomainError('Battle not found', 'battle_not_found')
}

function assertOpen(state: BattleState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'live') {
    throw new DomainError('That battle has already started', 'battle_live')
  }
  if (state.status === 'ended') {
    throw new DomainError('That battle is over', 'battle_over')
  }
  if (state.status === 'cancelled') {
    throw new DomainError('That battle was called off', 'battle_cancelled')
  }
}

export const battleDecider: Decider<BattleState, BattleCommand, BattleEvent> = {
  streamType: BATTLE_STREAM_TYPE,
  initialState: initialBattleState,
  evolve,
  decide,
}
