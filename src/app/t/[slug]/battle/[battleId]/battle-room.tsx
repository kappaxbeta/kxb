'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { GuestInviteButton } from '@/app/components/guest-invite-button'
import { battleDestination } from '@/domain/guests/application'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import {
  cancelBattle,
  joinBattle,
  leaveBattle,
  reportDefeat,
  reportFinish,
  reportGoal,
  setReady,
  startBattle,
  startRematch,
} from '@/domain/battle/actions'
import { readBattle } from '@/app/t/[slug]/battle/[battleId]/read-battle'
import { report } from '@/app/t/[slug]/battle/[battleId]/report'
import { useFullTime } from '@/app/t/[slug]/battle/[battleId]/full-time'
import { MatchOver } from '@/app/t/[slug]/battle/[battleId]/match-over'
import {
  matchRemaining,
  MIN_PLAYERS,
  sidesFor,
  type Side,
  type Team,
} from '@/domain/battle/events'
import { goalsReady } from '@/app/world/lounge/_sim/football'
import { raceReady } from '@/app/world/lounge/_sim/race'
import type { WorldSpawn } from '@/domain/worlds/queries'
import { play } from '@/lib/audio/engine'
import type { BattleView } from '@/domain/battle/queries'
import {
  alliesOf,
  footballSide,
  homeInOrder,
  wonBy,
} from '@/domain/battle/roster'
import type { Goal, GoalTeam } from '@/domain/lounge/goal-events'
import type { BlockView } from '@/domain/lounge/queries'
import { startingOrder } from '@/app/world/lounge/_sim/spawn'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import type { Locale } from '@/domain/i18n/locale'
import { useRefusal } from '@/app/i18n/use-refusal'

const BUTTON =
  'rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium transition hover:bg-white/30 disabled:opacity-40'

/**
 * How many times a report from inside the frame loop is attempted before the
 * room is told it was lost.
 *
 * These are the reports that cannot be reproduced by trying again later. A goal
 * is gone the moment the owner resets the ball and broadcasts the kickoff;
 * a defeat is gone the moment health hits zero, because in elimination modes
 * there is no respawn and the moment never comes back. Retrying costs a
 * duplicate command at worst, and the decider was built to ignore those - goals
 * dedup on their minted id, and a second defeat for someone already down
 * returns no events.
 */
const GOAL_REPORT_ATTEMPTS = 3

/** Backoff between report attempts, multiplied by the attempt number. */
const GOAL_RETRY_DELAY = 400

export function BattleRoom({
  slug,
  battle: initialBattle,
  worldName,
  initialBlocks,
  initialGoals = [],
  avatar,
  userId,
  displayName,
  canInvite,
  staff,
  spawnAt,
  perf,
  perfReadout,
}: {
  slug: string
  battle: BattleView
  worldName: string
  initialBlocks: BlockView[]
  /** The goals in this arena. Only football does anything with them. */
  initialGoals?: Goal[]
  avatar: string
  userId: string
  displayName: string
  /** Owners and admins may hand out a guest link from inside the match. */
  canInvite: boolean
  /**
   * Whether this person runs the space, for the one control that is not a
   * player's.
   *
   * The same predicate as `canInvite` today and deliberately not the same prop:
   * they are different questions - *may you let a stranger in* and *may you end
   * something other people are in the middle of* - and a single boolean serving
   * both is one that cannot be changed for one of them.
   */
  staff: boolean
  /**
   * Where this arena's door is, for anybody without a square on the ring.
   *
   * Fighters are placed by `spawnSlot` below, which the scene prefers - a match
   * opens with its roster spread around the middle, and a door would put them
   * all back on one spot. This is for spectators.
   */
  spawnAt?: WorldSpawn
  /**
   * Measure this match while it is being played. The `perf` flag, resolved for
   * this space on the server - see the prop of the same name on `LoungeScene`.
   */
  perf?: boolean
  /** Whether this space shows the readings to the people playing. */
  perfReadout?: boolean
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const dict = battleDict(locale)
  const t = dict.room
  /*
    The refusals the frame loop reports are looked up inside the callbacks that
    report them, off `locale` rather than off `t`.

    Those callbacks are held by the scene for the length of a match, so their
    dependency lists are load-bearing - and the React Compiler will not preserve
    a `useCallback` whose dependency is a member expression off a value it
    cannot prove stable. `locale` is a two-letter string and `battleDict` is a
    lookup in a frozen table, so calling it at the moment of failure costs
    nothing and keeps the list honest.
  */
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  /**
   * The match, in state rather than re-fetched through the router.
   *
   * Nothing in this component calls `router.refresh()`, and that is the whole
   * design: a refresh re-renders the route around a live WebGL canvas, which is
   * what every action in domain/lounge/actions.ts goes out of its way to avoid.
   * Doing it on a timer during a fight would be worse still.
   *
   * So joining, starting, going down and the result all arrive as plain data
   * through `readBattle` and land here. The scene above never re-renders from
   * the server.
   *
   * That last sentence was false for as long as `readBattle` was a Server
   * Action: one that refreshes the session writes cookies, and Next re-renders
   * the whole route in reply to a cookie-writing action. It is a route handler
   * now - see ./read-battle.ts - and nothing on this page asks the router for
   * anything any more. The actions below still do, once each, when somebody
   * presses something; the poll does not.
   */
  const [battle, setBattle] = useState(initialBattle)

  const refresh = useCallback(async () => {
    const next = await readBattle(slug, initialBattle.id)
    if (next) setBattle(next)
  }, [slug, initialBattle.id])

  const me = battle.participants.find((p) => p.userId === userId)
  const joined = Boolean(me)
  /**
   * Whoever may blow the whistle. See the decider: the host keeps it while they
   * are in the lobby and it passes to the room once they have left, so a match
   * whose host walked out is not one nobody can start.
   */
  const hosting = battle.participants.some((player) => player.userId === battle.createdBy)
  const isHost = hosting ? battle.createdBy === userId : joined
  const live = battle.status === 'live'
  const over = battle.status === 'ended' || battle.status === 'cancelled'

  /**
   * Everyone on our side, us included.
   *
   * A free-for-all has no sides, so this is just us - and since we are never a
   * peer in our own transform map, the effect is that everybody is hittable.
   * That is the same rule the decider uses when it works out who is standing;
   * see `sideOf` in domain/battle/aggregate.ts.
   */
  const allies = useMemo(
    () => alliesOf(battle.participants, userId),
    [battle.participants, userId],
  )

  /**
   * Did we win?
   *
   * Two shapes of answer, because the modes draw sides differently: a
   * free-for-all names a person, a team match names a side. `sideOf` in
   * domain/battle/aggregate.ts makes the same distinction when it decides who
   * is left standing - this is the reading half of it.
   */
  const iWon = wonBy(battle.winner, userId, me?.side)

  /** Where we came, and whether we are home at all. Null outside a race. */
  const myPlace = me?.place ?? null

  /**
   * Everybody who is home, in the order they got there.
   *
   * Sorted by place rather than trusting the roster's order, which is by when
   * people joined - the two have nothing to do with each other, and a podium
   * listed in join order would be a podium in the wrong order.
   */
  const home = useMemo(() => homeInOrder(battle.participants), [battle.participants])

  const resultLine = (() => {
    if (battle.status === 'cancelled') return t.calledOffBeforeStart

    /**
     * A race says who won it and what it took, because that is what happened.
     *
     * "Nobody was left standing" is nonsense in a mode where nobody is ever out,
     * and a race that nobody managed to finish is a real outcome with a real
     * thing to say about it - the course beat everyone, which is worth being told
     * rather than being handed a draw with no explanation.
     */
    if (battle.mode === 'race') {
      const first = battle.participants.find((p) => p.place === 1)
      if (!first) return t.raceNobodyHome

      const time = first.seconds === null ? '' : ` ${formatClock(first.seconds)}`
      if (first.userId === userId) return fill(t.homeFirst, { time })
      return fill(t.someoneHomeFirst, {
        name: first.name,
        time,
        tail: myPlace
          ? fill(t.youCame, { place: ordinal(myPlace, locale) })
          : t.youDidNotFinish,
      })
    }

    /**
     * Football says the score, because that is what happened.
     *
     * "Nobody was left standing" is exactly wrong for a mode where nobody is ever
     * out - so this branch comes first, and it is the scoreline that gets read out
     * rather than a survivor.
     */
    if (battle.mode === 'football') {
      const line = `${battle.score.red}–${battle.score.blue}`
      if (battle.winner === null) return fill(t.aDrawScore, { line })
      const side = dict.sides[battle.winner.id as Side] ?? battle.winner.id
      return iWon
        ? fill(t.yourSideTookIt, { line })
        : fill(t.scoreTo, { line, side })
    }

    if (battle.winner === null) return t.nobodyStanding
    if (battle.winner.type === 'player') {
      return iWon
        ? t.lastStanding
        : fill(t.someoneLastStanding, { name: nameOf(battle, battle.winner.id, t) })
    }
    const side = dict.sides[battle.winner.id as Side] ?? battle.winner.id
    return iWon ? fill(t.sideTookItYours, { side }) : fill(t.sideTookIt, { side })
  })()

  /**
   * The fanfare.
   *
   * Keyed off the scoreline everybody already sees rather than off `onGoal`,
   * and that is the whole point: `onGoal` fires on exactly one client - whoever
   * is stepping the ball - so a sound played there would be heard by one person
   * per goal, and never by the side that just conceded. The score on the match
   * row is the version of events every client agrees on.
   *
   * It arrives when the score does, which for the scorer is immediate (they
   * refresh on report) and for everybody else is the next poll. A scoreboard
   * and its jingle being a few seconds behind together is coherent; only one of
   * them being late would not be.
   */
  const heardScore = useRef<number | null>(null)
  useEffect(() => {
    const total = battle.score.red + battle.score.blue
    const previous = heardScore.current
    heardScore.current = total

    // Null on the first pass: joining a match that is already 3-1 is not three
    // goals happening. Only an increase counts - a correction downwards, or a
    // rematch resetting to nil-nil, is not something to cheer.
    if (previous !== null && total > previous) play('win')
  }, [battle.score.red, battle.score.blue])

  /**
   * And the same again when somebody gets home.
   *
   * Keyed off the roster everybody sees rather than off `onFinish`, for exactly
   * the reason the goal jingle is: `onFinish` fires on one client, so a sound
   * played there would be heard by the person who finished and by nobody who was
   * beaten. The places on the match row are the version every client agrees on.
   */
  const heardHome = useRef<number | null>(null)
  useEffect(() => {
    const previous = heardHome.current
    heardHome.current = home.length

    // Null on the first pass: walking into a race where two people are already
    // home is not two people finishing.
    if (previous !== null && home.length > previous) play('win')
  }, [home.length])

  /**
   * And once more at full time, for the side that took it.
   *
   * Conditional where the goal jingle is not. A goal is an event in a match
   * still being played and belongs to everyone watching; the last one is a
   * result, and playing a victory sting at somebody who just lost is the kind
   * of detail that makes a game feel like it is not on your side.
   */
  const heardResult = useRef(false)
  useEffect(() => {
    if (!over || !iWon || heardResult.current) return
    heardResult.current = true
    play('win')
  }, [over, iWon])

  /** Dismissed so the arena can be looked at once the shouting is over. */
  const [showResult, setShowResult] = useState(true)

  /**
   * How many have said they are at the line.
   *
   * The same number the decider counts, so the button greys out for the reason
   * a press would have been refused - a Start that is pressable and then says
   * no is the shape of control this room already went out of its way to avoid
   * with the mode errors.
   */
  const readyCount = battle.participants.filter((p) => p.ready).length

  /** Who is up for another one, and whether we are among them. */
  const rematchers = battle.participants.filter((p) => p.wantsRematch)
  const iWantRematch = rematchers.some((p) => p.userId === userId)

  /**
   * Our square on the starting ring.
   *
   * Derived from the roster rather than handed out by the server, because every
   * client sorts the same roster the same way (see `startingOrder`) and so
   * arrives at the same answer without anybody having to be assigned anything.
   *
   * Undefined until we are actually in the line-up - a spectator has no square.
   */
  const spawnSlot = useMemo(() => {
    const order = startingOrder(battle.participants)
    const index = order.indexOf(userId)
    return index === -1 ? undefined : { index, total: order.length }
  }, [battle.participants, userId])

  /**
   * Make the rematch and walk into it.
   *
   * Its own handler rather than `act`, because this one navigates: everybody
   * else who opted in follows the link that appears on their own screen a poll
   * later, so the person who started it should not be left behind on the
   * finished match watching them go.
   */
  function goRematch() {
    setError(null)
    startTransition(async () => {
      const result = await startRematch(slug, initialBattle.id)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(refusal(result.error ?? t.thatDidNotWork))
      else await refresh()
    })
  }

  /**
   * Report our own defeat, once.
   *
   * The scene calls this the instant our health reaches zero. It is not
   * wrapped in the transition above because it fires from inside the frame
   * loop's callback chain during a fight, where blocking on a transition would
   * stall the frame that is drawing our own death.
   *
   * Retried like a goal, and for a sharper reason. In elimination modes there
   * is no respawn, so this fires exactly once per match and the moment never
   * comes back: an attacker skips a downed target and the burn is gated on not
   * being dead, so nothing will call it again. A dropped request used to be an
   * unhandled rejection with no error shown - and since elimination has no
   * clock, no full-time whistle would ever end the match either. Every client
   * would sit there rendering a body on the floor of a match that stayed live
   * until somebody found the menu and forfeited.
   *
   * Safe to repeat: a defeat for somebody already down returns no events.
   */
  const onDefeated = useCallback(
    (by?: string) => {
      void (async () => {
        const outcome = await report(() => reportDefeat(slug, initialBattle.id, by), {
          attempts: GOAL_REPORT_ATTEMPTS,
          backoff: (attempt) => GOAL_RETRY_DELAY * attempt,
        })

        if (outcome.at === 'refused') setError(refusal(outcome.error))
        else if (outcome.at === 'lost') setError(battleDict(locale).room.knockoutLost)
        // Our own defeat may have been the one that decided it, so pull the
        // result straight away rather than waiting for the next poll.
        else void refresh()
      })()
    },
    // `t` is one of two module-level objects, so naming a string off it is a
    // dependency that changes only when the reader's language does.
    [slug, initialBattle.id, refresh, locale, refusal],
  )

  const isFootball = battle.mode === 'football'
  const isRace = battle.mode === 'race'

  /**
   * The clock, whichever mode's it is.
   *
   * Football and race both run on one, and it is the same clock doing the same
   * job - a duration recorded at creation, counted down from the kickoff in the
   * log. One value here rather than two branches at every place a countdown is
   * shown or a whistle is blown.
   */
  const clock = battle.football ?? battle.race

  /**
   * Which side somebody is on, for spotting an own goal.
   *
   * Only the two football sides. A spectator, or anybody not on the roster, gets
   * undefined - which is how a stray touch from somebody who is not playing stays
   * out of the scoring.
   */
  const sideOf = useCallback(
    (id: string): GoalTeam | undefined => footballSide(battle.participants, id),
    [battle.participants],
  )

  /**
   * Report a goal.
   *
   * Called only on whichever client is stepping the ball, so this fires once per
   * goal rather than once per person watching - see `ballOwner`. Not wrapped in the
   * transition, for the same reason `onDefeated` is not: it is called from inside
   * the frame loop's callback chain, and blocking on a transition there would stall
   * the frame that is drawing the goal.
   */
  const onGoal = useCallback(
    (side: GoalTeam, by: string | undefined, ownGoal: boolean) => {
      // Minted once, out here rather than per attempt, which is what makes the
      // retries safe: the decider counts an id at most once, so the same report
      // arriving twice is a no-op rather than a second goal. See ./report.
      const id = crypto.randomUUID()

      void (async () => {
        const outcome = await report(
          () => reportGoal(slug, initialBattle.id, { id, side: side as Team, by, ownGoal }),
          { attempts: GOAL_REPORT_ATTEMPTS, backoff: (attempt) => GOAL_RETRY_DELAY * attempt },
        )

        if (outcome.at === 'refused') setError(refusal(outcome.error))
        else if (outcome.at === 'lost') setError(battleDict(locale).room.goalLost)
        // The score is on the match row, so pull it straight away rather than
        // waiting out the poll - a scoreboard five seconds behind the ball is
        // worse than no scoreboard.
        else void refresh()
      })()
    },
    [slug, initialBattle.id, refresh, locale, refusal],
  )

  /**
   * "I'm home."
   *
   * Called by the scene the frame our own position crosses a finish - see
   * `FinishLine` - so this fires once, on one client, for one racer. Not wrapped
   * in the transition for the same reason `onDefeated` and `onGoal` are not: it
   * is called from inside the frame loop's callback chain, and blocking there
   * would stall the frame that is drawing our own finish.
   *
   * The place and the time are not passed and could not be: both are worked out
   * server-side, from the order the log accepted the reports and from the kickoff
   * it recorded. All this says is that we crossed.
   */
  const onFinish = useCallback(async (): Promise<boolean> => {
    try {
      const result = await reportFinish(slug, initialBattle.id)
      if (!result.ok) {
        setError(refusal(result.error ?? battleDict(locale).room.finishLost))
        return false
      }
      /**
       * Accepted is not the same as recorded.
       *
       * `ReportFinish` returns no events at all - without erroring - when the
       * match is not live on the server's reading of it, which is a real gap
       * because this client learns the match went live from a five-second poll.
       * Trusting `ok` there latched the crossing as done and left the racer
       * unable to ever finish, with a board that never moved to explain it.
       *
       * So the roster is what answers. Our own finish may have been the last one
       * anyway, so this is the refresh that was already due - it just gets read
       * rather than fired off.
       */
      const next = await readBattle(slug, initialBattle.id)
      if (next) setBattle(next)

      const place = next?.participants.find((p) => p.userId === userId)?.place ?? null
      if (place === null) {
        setError(battleDict(locale).room.finishNotCounted)
        return false
      }
      return true
    } catch {
      /**
       * A server action that rejected outright - the network went, or the write
       * threw on the far side. Said out loud rather than swallowed, and reported
       * as not stuck, so crossing the line again tries again. This used to be an
       * unhandled rejection and the racer's only evidence was a board that never
       * moved.
       */
      setError(battleDict(locale).room.finishNotReached)
      return false
    }
  }, [slug, initialBattle.id, userId, locale, refusal])

  /**
   * The clock, ticked locally and derived from the kickoff in the log.
   *
   * A second's interval rather than a frame loop: this only has to move a
   * mm:ss readout, and it lives outside the Canvas where a per-frame re-render would
   * cost the whole HUD. Everybody derives the same number from the same recorded
   * kickoff, so nobody has to be told what it is.
   */
  const [remaining, setRemaining] = useState(() =>
    clock ? matchRemaining(battle.startedAt, clock.durationMinutes) : 0,
  )

  useEffect(() => {
    if (!clock || battle.status !== 'live') return

    const duration = clock.durationMinutes
    const tick = () => setRemaining(matchRemaining(battle.startedAt, duration))
    tick()

    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [clock, battle.startedAt, battle.status])

  useFullTime({
    slug,
    battleId: initialBattle.id,
    startedAt: battle.startedAt,
    durationMinutes: clock?.durationMinutes,
    live: battle.status === 'live',
    tick: remaining,
    onEnded: refresh,
  })

  /**
   * The roster changes underneath this page - people join in the lobby,
   * somebody goes down mid-fight and the server may decide the whole thing is
   * over - and none of that arrives through the scene, which only knows about
   * health.
   *
   * So the page polls. Not a Realtime subscription: the battle's channel
   * carries positions at 12Hz and putting durable state on it would mean every
   * client re-deriving the match from broadcasts, which is exactly the
   * authority the server already has.
   *
   * Five seconds is well under how long anybody stares at a result that has not
   * appeared yet, and it costs one small query - it does not re-render the
   * scene, because `refresh` only sets state.
   */
  useEffect(() => {
    // Keep watching after the final bell too, until the rematch question is
    // settled: other people opting in, and somebody starting it, both arrive
    // this way. Once a rematch exists there is nothing left to learn here.
    if (battle.status === 'cancelled') return
    if (over && battle.rematchBattleId) return

    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [over, battle.status, battle.rematchBattleId, refresh])

  const sides = sidesFor(battle.mode)

  /**
   * The doorway question, for somebody who arrived without a place in the match.
   *
   * A guest link can be handed out from inside a running match, and following
   * one drops you into a world with a HUD, a roster and no indication that you
   * are not in it. The roster controls at the bottom answered that in principle
   * - there is a Join button down there before kickoff - but they sit in a strip
   * over the floor of the arena, competing with the fight, and on a phone they
   * are the last thing on screen. People stood in a match they were not in and
   * assumed it was broken.
   *
   * So: ask, once, in front of everything. Nobody is put on the roster by
   * arriving - `joined` is what decides that and only `joinBattle` sets it - and
   * this is the moment that fact is made visible rather than left to be inferred.
   *
   * `dismissed` rather than a "seen it" flag on the server: watching is not a
   * decision worth persisting, and somebody who chose to watch and then reloads
   * is asking the question again anyway.
   */
  const [dismissed, setDismissed] = useState(false)
  const asking = !joined && !over && !dismissed

  /**
   * Whether the match menu is open.
   *
   * Open on arrival only while the match has not started, which is the one
   * stretch where the menu *is* the screen: picking a side and calling the
   * kickoff are the only things to do in a room where nothing is happening
   * yet. Once it is live or over, the arena is what you came for and the menu
   * starts out of the way.
   *
   * Read from the first render and not synced afterwards, deliberately - the
   * match going live under somebody who is reading the roster should not snatch
   * the panel away mid-sentence. Closing it is one tap.
   */
  const [menuOpen, setMenuOpen] = useState(initialBattle.status === 'open')

  /** Said the same way on the closed strip and inside the menu. */
  const modeLine =
    battle.mode === 'ffa'
      ? t.ffa
      : battle.mode === 'team'
        ? t.team
        : battle.mode === 'football'
          ? fill(t.football, {
              n: battle.football?.durationMinutes ?? 0,
              tag: battle.football?.damage === false ? t.friendly : '',
            })
          : battle.mode === 'race'
            ? fill(t.race, {
                n: battle.race?.durationMinutes ?? 0,
                tag: battle.race?.damage === false ? t.clean : '',
              })
            : t.oneVsAll

  const statusLine =
    battle.status === 'open'
      ? t.waitingToStart
      : battle.status === 'live'
        ? isRace
          ? t.running
          : t.fighting
        : battle.status === 'ended'
          ? t.over
          : t.calledOff

  /**
   * Where the bottom of this frame effectively is, for anything the scene hangs
   * off it.
   *
   * The lobby panel below lies across the bottom of the screen, and the scene's
   * touch rig anchors to that same edge - thumbstick bottom-left, action stack
   * bottom-right, emote button in the corner (see `STICK_ANCHOR` and its
   * neighbours in world/lounge/touch-controls.tsx). On a phone that put the
   * stick's ring straight over the join buttons, and since the rig is painted
   * on top it ate every tap aimed at them: the panel was visible and dead.
   *
   * `--hud-edge` is the one thing both halves already agree on, so the panel
   * measures itself and raises it for everything inside this frame. Nothing
   * moves on a desktop, where the variable stays at its 1rem floor for a rig
   * that is not drawn.
   *
   * Written straight onto the node instead of held in state, for the same
   * reason nothing here calls `router.refresh()`: the scene is this panel's
   * sibling and re-renders with it, and a live WebGL canvas should not be
   * re-rendered to deliver a number that CSS was going to read anyway.
   */
  const frame = useRef<HTMLDivElement | null>(null)
  const lobby = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const strip = lobby.current
    const root = frame.current
    if (!strip || !root) return

    const measure = () => {
      // The strip is anchored at bottom-0 and carries its own padding, so its
      // height is already the gap from the bottom of the frame to the top of
      // the panel - inset included. The controls sit in that padding.
      root.style.setProperty('--hud-edge', `${strip.offsetHeight}px`)
    }
    measure()

    // It changes shape as people join and as the buttons wrap, which on a
    // narrow phone is the difference between two rows and four.
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])

  return (
    /*
      A frame in the page, not a takeover of the viewport.

      This was `fixed inset-0 bg-black`, from when a match was the only thing on
      screen and the navigation was a row across the top that a fight had no use
      for. Both halves of that are now wrong: the rail is where you leave a
      match from, and covering it meant the way out disappeared exactly when
      somebody wanted it. The black was the other half - it painted over the sky
      the arena is supposed to stand in, so a battle was the one place in the app
      that ended at a hard rectangle.

      Same frame as the lounge, the café and the house, down to the height: the
      scene inside is the same component, so a fight now dissolves into the same
      background everything else does.
    */
    <div ref={frame} className="relative h-viewport-inset w-full">
      <LoungeScene
        slug={slug}
        worldId={battle.worldId}
        worldName={`${battle.name} · ${worldName}`}
        initialBlocks={initialBlocks}
        initialImages={[]}
        initialGoals={initialGoals}
        football={
          // Only a live football match has a ball. Before kickoff and after the
          // whistle the goals are still drawn - they are part of the arena - but
          // there is nothing to kick.
          isFootball && joined ? { onGoal, sideOf, live } : undefined
        }
        /**
         * A race, which puts us on the grid and watches for our own finish.
         *
         * Handed over from the moment we are on the roster rather than at the off,
         * so the start line is where people stand while they wait - a race whose
         * field wandered in from wherever they happened to be would be decided
         * before it began. `live` is what gates the crossing itself: it goes false
         * once we are home, which stops a lap of honour reporting a second finish.
         */
        race={
          isRace && joined
            ? { onFinish, live: live && myPlace === null }
            : undefined
        }
        // Nobody edits the ground during a match. The arena is what it was when
        // the fight started, which is the point of having saved it.
        readOnly
        canModerate={false}
        mode="battle"
        // Nobody floats above a fight. `readOnly` would otherwise hand every
        // fighter flight, since the arena is not theirs to edit.
        canFly={false}
        // The bell. Swinging starts when the host starts the match, not when
        // people wander into the lobby.
        // In football and in a race, whether a charge hurts at all is the host's
        // setting: a friendly match still has dashing, and it only shoves.
        canFight={live && joined && (battle.football?.damage ?? battle.race?.damage ?? true)}
        /**
         * Going down is how you leave a fight - a respawn button there would mean
         * nobody could ever win one.
         *
         * Football is the exception, and the host sets it. The match is decided by
         * the score, so somebody who could not come back would simply be somebody
         * who stopped playing for up to ten minutes. Nothing about being down is
         * recorded either way; see `ReportDefeat` in domain/battle/aggregate.ts.
         *
         * A race always comes back, and not as a setting: you reappear on the
         * start line with the whole course to run again, which is punishment
         * enough for being knocked into the void and is what makes a late dash
         * worth landing.
         */
        canRespawn={isRace || (isFootball && (battle.football?.respawn ?? true))}
        // Our square on the starting ring. Everybody derives the same order
        // from the same roster, so nobody has to be told where to stand.
        spawnSlot={spawnSlot}
        spawnAt={spawnAt}
        avatar={avatar}
        /**
         * On the roster, or not in the room at all.
         *
         * `joined` rather than `live && joined`, so the pre-kickoff lobby is
         * already this match's own channel instead of the lounge's - and
         * `undefined` for somebody who has not joined, which is what makes a
         * spectator a spectator: no presence, no channel, no body for anybody
         * else to see. The Realtime policy would refuse them the `battle:`
         * topic anyway (only the roster may read it), so asking would only
         * mean a failed subscribe and an error banner over a match they are
         * quite happily watching.
         */
        presence={
          joined
            ? {
                tenantId: battle.tenantId,
                userId,
                name: displayName,
                battleId: battle.id,
              }
            : undefined
        }
        /**
         * Only for somebody who joined, because only they have a channel.
         *
         * A spectator has no presence and no socket, so there is no room for
         * them to measure and nothing their frame rate would describe about the
         * match - they are watching a world they are not in.
         */
        perf={perf && joined}
        perfReadout={perfReadout}
        battle={
          // Only once it is running. Before that there is nothing to be hit by
          // and no defeat worth reporting; after, the fight is decided.
          live && joined
            ? {
                battleId: battle.id,
                allies,
                // Sides exist in team, one-vs-everyone and football. A
                // free-for-all and a race have none, so nobody's name gets
                // coloured in either - asked of the mode itself rather than
                // listed here, so a sixth mode cannot be forgotten.
                teams: sides.length > 0,
                onDefeated,
              }
            : undefined
        }
      />

      {/*
        A football match with nowhere to score.

        Said out loud, and before kickoff too, because the failure is otherwise
        silent in the worst way: the ball spawns, everybody runs about, and
        nothing ever counts. The one player who can fix it - somebody from the
        space that owns the world - gets pointed at the editor that does; for a
        borrowed public arena there is nothing a visitor can do but pick another
        ground, and the copy says that instead of offering a door that 404s.
      */}
      {isFootball && !over && !goalsReady(initialGoals) && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
          <div className="pointer-events-auto max-w-md rounded-2xl border border-amber-300/40 bg-amber-950/85 px-4 py-3 text-center text-xs text-amber-100 backdrop-blur-sm">
            <p className="font-medium">{t.noGoals}</p>
            <p className="mt-1 text-amber-100/70">
              {t.noGoalsBody}
              {battle.worldId === battle.tenantId ? (
                t.noGoalsLounge
              ) : (
                <>
                  <Link
                    href={`/t/${slug}/battle/battlefields/${battle.worldId}/build`}
                    className="underline hover:text-white"
                  >
                    {t.openArenaEditor}
                  </Link>
                  {t.noGoalsArena}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/*
        A race with nowhere to line up, or nowhere to get to.

        The same warning the missing goals get, and said for the same reason:
        without a start everybody would run from wherever they happened to be
        standing, and without a finish the race is a jog that ends when the clock
        does. Both are silent failures otherwise.
      */}
      {isRace && !over && !raceReady(initialGoals) && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
          <div className="pointer-events-auto max-w-md rounded-2xl border border-amber-300/40 bg-amber-950/85 px-4 py-3 text-center text-xs text-amber-100 backdrop-blur-sm">
            <p className="font-medium">{t.noCourse}</p>
            <p className="mt-1 text-amber-100/70">
              {t.noCourseBody}
              {battle.worldId === battle.tenantId ? (
                t.noCourseLounge
              ) : (
                <>
                  <Link
                    href={`/t/${slug}/battle/battlefields/${battle.worldId}/build`}
                    className="underline hover:text-white"
                  >
                    {t.openArenaEditor}
                  </Link>
                  {t.noCourseArena}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/*
        Anything that went wrong mid-match, where somebody playing can see it.

        `error` had two homes and both of them are shut during play: the join
        prompt, which only exists for people who are not in the match, and the
        match menu, which closes itself the moment the bell goes. So every
        failure reported from the frame loop - a goal, a defeat, a finish - set a
        string into a paragraph nobody could reach. A racer whose finish was
        refused saw a board that simply never moved, which is indistinguishable
        from the feature not existing.

        Below the board rather than over it, so the clock and the order stay
        readable while it is up, and dismissable because it is the only copy of
        the message once the panels are closed.
      */}
      {error && !asking && !menuOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-400/40 bg-red-950/85 px-4 py-3 text-xs text-red-100 backdrop-blur-sm">
            <p role="alert" className="flex-1">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 rounded-full border border-red-200/30 px-2 py-0.5 text-[11px] transition hover:bg-white/10"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/*
        The race board.

        The clock and where you are in the field, which are the two things a racer
        looks up for - and, once anybody is home, the order they got there in.
        Top centre, like the football scoreboard, because it is the same glance.
      */}
      {isRace && (live || over) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="flex max-w-full flex-col items-center gap-1 rounded-2xl border border-white/15 bg-black/70 px-5 py-2 text-white backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span className="text-lg tabular-nums text-white/80">
                {live ? formatClock(remaining) : t.time}
              </span>

              <span className="border-l border-white/15 pl-4 text-sm">
                {myPlace
                  ? fill(t.youCame, { place: ordinal(myPlace, locale) }).trim()
                  : live
                    ? fill(t.homeOf, {
                        n: home.length,
                        of: battle.participants.length,
                      })
                    : t.youDidNotFinish.trim()}
              </span>
            </div>

            {/* The order, once there is one. Names rather than a table: three
                across the top of a race is a result, not a spreadsheet. */}
            {home.length > 0 && (
              <p className="max-w-full truncate text-[11px] text-white/50">
                {home
                  .slice(0, 3)
                  .map(
                    (racer) =>
                      `${ordinal(racer.place ?? 0, locale)} ${racer.name}${
                        racer.seconds === null ? '' : ` ${formatClock(racer.seconds)}`
                      }`,
                  )
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/*
        The scoreboard.

        Top centre and always visible during a football match, because the score and
        the clock are the two things people look up for - and unlike the roster panel
        at the bottom, they change while you are watching the ball rather than while
        you are reading.
      */}
      {isFootball && (live || over) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-black/70 px-5 py-2 text-white backdrop-blur-sm">
            <span className="text-sm font-medium text-red-400">{dict.sides.red}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {battle.score.red} : {battle.score.blue}
            </span>
            <span className="text-sm font-medium text-blue-400">{dict.sides.blue}</span>

            <span className="ml-2 border-l border-white/15 pl-4 text-lg tabular-nums text-white/80">
              {live ? formatClock(remaining) : t.ft}
            </span>

            {battle.football?.scoreLimit && (
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                {fill(t.firstTo, { n: battle.football.scoreLimit })}
              </span>
            )}
          </div>
        </div>
      )}

      {/*
        The result, said out loud.

        Its own overlay rather than a line in the panel below, because winning
        is the thing the whole match was for and a caption at the bottom of the
        screen is not how you tell somebody they won. It is dismissible so the
        arena underneath can still be looked at afterwards.
      */}
      {over && showResult && (
        <MatchOver
          battle={battle}
          slug={slug}
          t={t}
          dict={dict}
          iWon={iWon}
          joined={joined}
          resultLine={resultLine}
          rematchers={rematchers}
          iWantRematch={iWantRematch}
          pending={pending}
          act={act}
          goRematch={goRematch}
          onLookAround={() => setShowResult(false)}
        />
      )}

      {/*
        "Are you in?" - asked before the room is handed over.
        ......................................................................
        Two shapes, because there are two honest answers. Before kickoff the
        match can still take somebody, so this offers the way in. After it, the
        decider refuses a join outright (`assertOpen` in the battle aggregate),
        so offering one would be offering something that cannot be done - and
        the useful thing to say is that they arrived late, plus the two places
        they might actually want to be.
      */}
      {asking && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t.watchWithoutJoining}
            onClick={() => setDismissed(true)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            className="hud-panel relative w-full max-w-sm p-5 text-white"
          >
            <p className="font-pixel text-xs uppercase tracking-[0.2em] text-ink-muted">
              {live ? t.alreadyFighting : dict.xpRoom.waitingToStart}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{battle.name}</h2>
            <p className="mt-1 text-sm text-white/60">
              {live ? t.startedWithoutYou : t.inRoomNotMatch}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {!live && sides.length === 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => joinBattle(slug, battle.id))}
                  className={BUTTON}
                >
                  {pending ? t.joining : t.joinTheMatch}
                </button>
              )}

              {!live &&
                sides.map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => joinBattle(slug, battle.id, side))}
                    className={BUTTON}
                  >
                    {fill(t.joinSide, { side: dict.sides[side] })}
                  </button>
                ))}

              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-full border border-white/25 px-5 py-2 text-sm transition hover:bg-white/10"
              >
                {live ? t.watch : t.justWatch}
              </button>

              {live && (
                <Link
                  href={`/t/${slug}/battle`}
                  className="rounded-full border border-white/25 px-5 py-2 text-sm transition hover:bg-white/10"
                >
                  {t.backToLobby}
                </Link>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
        </div>
      )}

      {/*
        The way back to the match itself, and all it is when shut.
        ......................................................................
        This is what the roster panel became. It used to stand open across the
        bottom of the screen, which cost twice: it covered the near half of the
        arena, and the touch rig anchors to that same edge - so raising the rig
        clear of it (see `--hud-edge` above) only moved the problem, planting
        the thumbstick in the middle of the pitch instead.

        A closed strip costs neither. The rig sits back down in its corner
        because there is barely anything to clear, the world is whole again, and
        the line that mattered while you are playing - which match, and where it
        is up to - is the button.
      */}
      <div
        ref={lobby}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4"
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/75 px-4 py-2 text-xs text-white backdrop-blur-sm transition hover:bg-black/90"
        >
          <span className="truncate font-medium">{battle.name}</span>
          <span className="truncate text-white/50">
            {modeLine} · {statusLine}
          </span>
          {/* The count is the half of the roster worth carrying on a closed
              button: who exactly is in can wait for the menu, but whether
              anybody is yet cannot. */}
          <span className="text-white/40">·</span>
          <span className="text-white/50 tabular-nums">{battle.participants.length}</span>
          <span aria-hidden className="text-white/40">
            ▲
          </span>
        </button>
      </div>

      {/*
        Open, and in the middle, where a menu belongs.
        ......................................................................
        Centred rather than grown from the bottom edge on purpose: down there it
        would be back in the rig's corner the moment it had any height, and the
        two would be fighting over the same thumb again. In the middle it is
        plainly a thing you opened and will close, it is the same shape as the
        doorway question above it, and the controls underneath are covered by
        something the player put there.
      */}
      {menuOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t.closeMenu}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={battle.name}
            className="hud-panel relative max-h-full w-full max-w-md overflow-y-auto p-5 text-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{battle.name}</p>
                <p className="text-xs text-white/50">
                  {modeLine}
                  {' · '}
                  {statusLine}
                </p>
              </div>

              <Link href={`/t/${slug}/battle`} className="text-xs text-white/60 hover:text-white">
                {t.leaveTheRoom}
              </Link>
            </div>

            {over && (
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">
                {battle.status === 'cancelled'
                  ? t.calledOffBeforeStart
                  : battle.winner === null
                    ? t.aDrawNobodyStanding
                    : battle.winner.type === 'player'
                      ? fill(t.someoneWon, {
                          name: nameOf(battle, battle.winner.id, t),
                        })
                      : fill(t.someoneWon, {
                          name: dict.sides[battle.winner.id as Side] ?? battle.winner.id,
                        })}
              </p>
            )}

            {/* The roster. Struck through once somebody is out. */}
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {battle.participants.map((p) => (
                <li
                  key={p.userId}
                  className={`rounded-full px-2 py-1 ${
                    p.defeated ? 'bg-white/5 text-white/35 line-through' : 'bg-white/15'
                  }`}
                >
                  {/*
                    A tick beside whoever has said they are at the line.

                    Only before kickoff, because that is the only time it means
                    anything - a live match's roster is about who is standing.
                  */}
                  {battle.status === 'open' && (
                    <span className={p.ready ? 'mr-1 text-emerald-300' : 'mr-1 text-white/25'}>
                      {p.ready ? '\u2713' : '\u25cb'}
                    </span>
                  )}
                  {p.name}
                  {p.side && (
                    <span className="ml-1 text-white/40">{dict.sides[p.side]}</span>
                  )}
                  {/* Where they came, which in a race is the only thing the
                      roster has to say about anybody. */}
                  {p.place !== null && (
                    <span className="ml-1 text-white/60">
                      {ordinal(p.place, locale)}
                    </span>
                  )}
                </li>
              ))}
              {battle.participants.length === 0 && (
                <li className="text-white/50">{t.nobodyYet}</li>
              )}
            </ul>

            {!over && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!live && !joined && sides.length === 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => joinBattle(slug, battle.id))}
                    className={BUTTON}
                  >
                    {t.join}
                  </button>
                )}

                {!live &&
                  sides.map((side) => (
                    <button
                      key={side}
                      type="button"
                      disabled={pending || me?.side === side}
                      onClick={() => act(() => joinBattle(slug, battle.id, side))}
                      className={BUTTON}
                    >
                      {fill(me?.side === side ? t.onSide : t.joinSide, {
                        side: dict.sides[side],
                      })}
                    </button>
                  ))}

                {/*
                  The ready sign.

                  Beside Join rather than instead of it, because they are two
                  different facts: joining is being in the match, and this is
                  being at the line. The gap between them is a world still
                  loading, which is the whole reason `StartBattle` counts these
                  instead of counting the roster.
                */}
                {joined && !live && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => setReady(slug, battle.id, !me?.ready))}
                    aria-pressed={Boolean(me?.ready)}
                    className={
                      me?.ready
                        ? 'rounded-lg bg-emerald-400/90 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-emerald-300 disabled:opacity-40'
                        : BUTTON
                    }
                  >
                    {me?.ready ? t.ready : t.iAmReady}
                  </button>
                )}

                {joined && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      // Quitting a live match is recorded as going down, which
                      // can hand somebody the win - worth saying out loud.
                      if (live && !confirm(t.forfeitWarning)) {
                        return
                      }
                      act(() => leaveBattle(slug, battle.id))
                    }}
                    className={BUTTON}
                  >
                    {live ? t.forfeit : t.leave}
                  </button>
                )}

                {/* Pulling somebody in who has no account. Beside the roster
                    controls because that is what it is - one more body in this
                    match - and available while the match is live as well as
                    before it, since "you should see this" happens mid-game far
                    more often than it happens in the lobby. */}
                {canInvite && (
                  <GuestInviteButton
                    slug={slug}
                    // This match, not the lounge. The invitation is to a thing
                    // that is happening now and may well be over by the time
                    // somebody has been talked through finding it from the rail.
                    // The shared format, not a literal: the sweep that revokes
                    // these once the match empties finds them by matching this
                    // exact string. See `revokeLinksForBattle`.
                    destination={battleDestination(slug, battle.id)}
                    className={`${BUTTON} disabled:opacity-40`}
                  />
                )}

                {isHost && !live && (
                  <button
                    type="button"
                    disabled={pending || readyCount < MIN_PLAYERS}
                    onClick={() => act(() => startBattle(slug, battle.id))}
                    title={
                      readyCount < MIN_PLAYERS
                        ? fill(t.needReady, { n: MIN_PLAYERS })
                        : undefined
                    }
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-300 disabled:opacity-40"
                  >
                    {t.start}
                    {readyCount > 0 ? fill(t.startCount, { n: readyCount }) : ''}
                  </button>
                )}

                {/*
                  Calling it off, and it is no longer only a lobby control.

                  Two changes, both because the old shape left matches stuck in
                  the space's active list:

                  - **Whoever runs the space can press it too.** The host is not
                    always there - a match opened by somebody who has since left
                    could only be closed by the day-later sweep, and the person
                    looking at a list of matches that are not happening was an
                    owner with no button.
                  - **While it is live, not only before kickoff.** `!live` was
                    hiding a control the decider has always accepted, so a match
                    that had started and emptied could not be closed at all.

                  A cancelled match is not an ended one: it has no result and
                  goes in nobody's tally, which is what "this did not happen"
                  should mean. `listBattles` asks for open and live, so it leaves
                  the list the moment this returns.
                */}
                {(isHost || staff) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => cancelBattle(slug, battle.id))}
                    className={BUTTON}
                  >
                    {live ? t.endTheMatch : t.callItOff}
                  </button>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="mt-4 border-t border-white/10 pt-3 text-center">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full border border-white/25 px-5 py-1.5 text-xs transition hover:bg-white/10"
              >
                {t.backToTheMatch}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function nameOf(battle: BattleView, userId: string, t: BattleDict['room']): string {
  return battle.participants.find((p) => p.userId === userId)?.name ?? t.somebody
}

/** Seconds as m:ss, for the match clock. */
function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * 1st, 2nd, 3rd.
 *
 * The English rule in three lines rather than a dependency: 11th, 12th and 13th
 * are the exceptions everybody's first attempt at this gets wrong, and a race
 * with eleven runners is not a stretch.
 */
/**
 * Where somebody came, as a word rather than a number.
 *
 * English needs the whole rule - `1st`, `2nd`, `3rd`, and `11th` through `13th`
 * breaking it - and German needs none of it: every ordinal is the figure with a
 * full stop after it. That difference is exactly why this takes a locale rather
 * than living in the dictionary as a template: `{n}th` cannot be written down
 * as a string, because in English the suffix depends on the number.
 */
function ordinal(place: number, locale: Locale): string {
  if (locale === 'de') return `${place}.`

  const tens = place % 100
  if (tens >= 11 && tens <= 13) return `${place}th`

  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th'
  return `${place}${suffix}`
}
