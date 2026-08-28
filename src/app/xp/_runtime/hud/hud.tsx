'use client'

import { useEffect, useState } from 'react'
import {
  publishSceneDebug,
  type SceneDebug,
} from '@/app/xp/_runtime/hud/debug-store'

import { COOL_KEY, CoolRing, coolingDim, useCooling, type Cooling } from '@/app/xp/_runtime/hud/cooling'
import { describeEnding, type Match } from '@/app/xp/_runtime/match/match'
import { teamTotals, type Standing } from '@/app/xp/_runtime/match/standings'
import { voteView, type OpenVote } from '@/app/xp/_runtime/match/vote'
import { teamColour } from '@/app/xp/_runtime/match/teams'
import { formatRunTime, type Run } from '@/app/xp/_runtime/match/race'
import type { RoleView, XpDocument } from '@kxb/xp'
import type { Scripts } from '@kxb/xp/script'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { XP_EN, xpDict, type XpDict } from '@/app/i18n/xp'
import { translator } from '@kxb/xp/words'

/**
 * Everything drawn over the canvas rather than in it.
 *
 * Ordinary DOM, deliberately: it is a handful of numbers that change a few times
 * a second, which is what React is good at, and putting text inside a WebGL
 * context to avoid a re-render would be paying for a font atlas to save nothing.
 *
 * Split out of ./scene because the two have different reasons to change. The
 * scene changes when the *simulation* does; this changes when somebody decides a
 * player should be told something - and the whole argument of this file is that
 * they should be told more than they currently are.
 */

/**
 * What to say about the scripts, in three words.
 *
 * On the HUD rather than in a console because it is the one part of this that
 * cannot be checked by looking: the sandbox is a wasm module fetched
 * asynchronously, and until it arrives a level with a turret in it is a level
 * with a turret standing still - which looks exactly like a level whose author
 * has not finished. "loading" and "none" are different facts and both are worth
 * a word.
 */
export function scriptState(
  xp: XpDocument,
  scripts: Scripts | null,
  broken: readonly string[],
  /**
   * Defaulted, so a test can ask what this *says about a document* without
   * naming a language. The scene passes the reader's.
   */
  words: XpDict['hud']['scripts'] = XP_EN.hud.scripts,
): string {
  const named = Object.keys(xp.scripts ?? {}).length
  if (named === 0) return words.none
  if (broken.length > 0) return fill(words.broken, { n: named, broken: broken.length })

  /**
   * How many of them anything actually runs.
   *
   * `named` counts what the document *declares*, and that is not the same
   * question. The engine compiles only what a blueprint points at and returns a
   * shared no-op when that set is empty (`NO_SCRIPTS`, ./script) - which is
   * truthy, so `scripts ? 'running' : 'loading'` reported "1 scripts running"
   * over a level where nothing could possibly run.
   *
   * That is the worst place to be wrong. This readout exists for exactly one
   * moment - somebody's script does nothing and they want to know whether it
   * loaded - and in that moment it was confidently answering yes. An unattached
   * script is *the* most common reason a script does nothing, so it gets said
   * here rather than left to be deduced.
   */
  const attached = new Set(
    Object.values(xp.blueprints)
      .map((blueprint) => blueprint.script)
      .filter((name): name is string => name !== undefined),
  )
  if (attached.size === 0) return fill(words.noneAttached, { n: named })
  if (!scripts) return fill(words.loading, { n: named })
  // The fraction only when it says something: "3 scripts running" for a level
  // where all three are on something, and "1/3" for one where two are not.
  return attached.size === named
    ? fill(words.allRunning, { n: named })
    : fill(words.someRunning, { attached: attached.size, n: named })
}

/**
 * What is running, and where you are.
 *
 * Outside the canvas as ordinary DOM. It is a handful of numbers that change a
 * few times a second, which is exactly what React is good at - and putting text
 * inside a WebGL context to avoid a re-render would be paying for a font atlas
 * to save nothing.
 */
/**
 * Send the level's numbers to the rail.
 *
 * Published from here rather than from the scene because this component already
 * holds all five - two of them, `entities` and `cells`, only exist at runtime
 * and are handed down for exactly that reason (see the note at the scene's call
 * site). Publishing from the scene would mean threading `scripts` down a second
 * path to the same place.
 *
 * Cleared on unmount, so "is a level open" is answerable by whether the store
 * holds anything rather than by parsing a URL in the rail.
 */
function useDebugPublish(value: SceneDebug) {
  const { name, placements, entities, cells, scripts } = value

  /*
   * The position, taken apart before the effect rather than inside it.
   *
   * `at` is a fresh object every frame somebody walks, so depending on it would
   * re-run this at frame rate. Pulling the three numbers out first means the
   * dependency array is entirely primitives and the object is rebuilt only when
   * one of them actually moved - and it means the lint rule agrees, rather than
   * being argued with in a comment somebody later "fixes".
   */
  const x = value.at?.x ?? null
  const y = value.at?.y ?? null
  const z = value.at?.z ?? null
  /*
   * Rounded here rather than in the panel, which is the opposite of what the
   * coordinate does and is deliberate: this is a *dependency*, and an unrounded
   * bearing re-runs the effect on every frame anybody moves the mouse. The
   * coordinate gets away with being raw because the store compares it rounded;
   * doing the same for a number that changes this continuously would still cost
   * an effect per frame to discover there was nothing to publish.
   */
  const facing = value.facing === null ? null : Math.round(value.facing)

  useEffect(() => {
    publishSceneDebug({
      name,
      placements,
      entities,
      cells,
      scripts,
      at: x === null || y === null || z === null ? null : { x, y, z },
      facing,
    })

    return () => publishSceneDebug(null)
  }, [name, placements, entities, cells, scripts, x, y, z, facing])
}

/**
 * The controls chip's face: a pad, drawn in the panel's own hand.
 *
 * A literal `?` was the first version and it asked the wrong question - it
 * reads as *help*, and what is behind it is the controls, including the two
 * pickers that are the only way to change how the level drives on a phone. A
 * pad says "settings for the thing in your hands" without a word in any
 * language.
 *
 * Stroked in `currentColor` at 1.6, round caps and joins, on a 24 grid: the
 * same construction as `GestureMark` in ./controls-panel and the same weight
 * as the `.hud-key` caps it sits beside, so the chip belongs to the set rather
 * than to whichever icon font happened to be nearby.
 */
function GamepadMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The body: a lozenge, because a rectangle reads as a screen. */}
      <rect x="2.2" y="7.4" width="19.6" height="9.2" rx="4.6" />
      {/* The d-pad, left, where a left thumb goes. */}
      <path d="M7 9.9v2.6M5.7 11.2h2.6" />
      {/* And the face buttons, right, offset the way every pad has them. */}
      <circle cx="16.2" cy="10.9" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="13.1" r="0.95" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Hud({
  xp,
  cells,
  entities,
  readout,
  broken,
  troubles,
  said,
  vitals,
  peers,
  kills,
  standings,
  vote,
  turn,
  seats,
  rolled,
  says,
  live = [],
  cooling,
  phase,
  countdown,
  round,
  seat,
  tally,
  secret,
  seen,
  won,
  run,
  match,
  downFor,
  onEnterVr,
  onUnstick,
  onControls,
  scripts,
}: {
  xp: XpDocument
  cells: number
  entities: number
  readout: { x: number; y: number; z: number; facing: number } | null
  broken: readonly string[]
  /**
   * Failures that are not the level's fault, in the level's own words.
   *
   * Separate from `broken` because the two send a reader to different places: a
   * broken script is something the author wrote and can fix, and this is the
   * host failing to do something the level asked — a save that did not land, a
   * store that would not answer. Counting them together put "could not save
   * that checkpoint" under a heading that says `script failures`, which sends
   * an author to read their scripts about somebody else's network.
   */
  troubles?: readonly string[]
  said: readonly { id: number; text: string }[]
  /** The player's own health and ammunition, when the document gives them any. */
  vitals: { hp?: number; ammo?: number }
  /** How many other people are in this room. Zero when it is not one. */
  peers: number
  /**
   * Kills the arbiter has agreed to, claims still in the air, and the last
   * refusal.
   *
   * Drawn rather than kept, and that is the whole point of it: a shot at another
   * player is decided somewhere else, so a client that showed the kill
   * immediately would be showing a result it can lose. See
   * docs/xp/server-authority.md §4.1 - this project has lost one that way.
   */
  kills?: { mine: number; pending: number; refused: string | null }
  /**
   * Everybody's kills, when there is an arbiter keeping them.
   *
   * Empty in every level that is not a room, which is most of them - and empty
   * means nothing is drawn rather than an empty box with a heading.
   */
  standings?: readonly Standing[]
  /** The vote the room is having, when it is having one. */
  vote?: OpenVote | null
  /**
   * Whose turn it is, by account id, or null when nobody is taking any.
   *
   * Null in every level without a `pass` verb in it, which is all but one of
   * them — and null draws nothing rather than a line saying so.
   */
  turn?: string | null
  /**
   * Chair to whoever is in it, so the turn can be named by *colour*.
   *
   * The arbiter answers turns by account id, which is the only thing it knows -
   * and an account id is the one fact about a table nobody sitting at it can
   * see. Everybody can see which colour each player is moving, so that is what
   * the line says.
   */
  seats?: Readonly<Record<string, string>>
  /**
   * The last die, as an event rather than a number.
   *
   * `at` is a counter, which is what makes two fours in a row two
   * announcements: a face alone cannot say whether it is news.
   */
  rolled?: { seat: string | null; face: number; at: number } | null
  /**
   * The actions this player can take right now, in the document's own order.
   *
   * Worked out here rather than passed down, from the same `allowedIn` the
   * dispatch uses - so a button exists exactly when the key it names would do
   * something. A phase that takes a key away takes its button away in the same
   * frame, which is the only version of this that can be trusted.
   */
  live?: readonly { does: string; label: string; code: string }[]
  /**
   * How long until each waiting key may be pressed again.
   *
   * A reference to the frame loop's own numbers rather than values, so the rings
   * on the buttons move without this component rendering again - see ./cooling,
   * which is also where the reason there is only one set of these numbers is
   * written. Absent until ./simulation mounts, and in a level that puts a wait on
   * nothing it stays empty forever.
   */
  cooling?: { readonly current: Cooling | null }
  /**
   * What the phase this player is in says they can do, in the author's words.
   *
   * `allow` decides which keys are live and tells nobody: the button quietly
   * does nothing. Every person who has played one of these without writing it
   * has asked the same question - *what do I do now* - and this is the level's
   * answer to it. See `FlowPhase.says`.
   */
  says?: string | null
  /**
   * The level's own declared numbers, and what they are at.
   *
   * `data` has been readable by rules and writable by verbs since §7c and
   * **nothing has ever drawn it**, which is survivable for a level counting
   * coins towards a door and fatal for one whose whole loop runs through it:
   * the board game rolls a die into `dice` and the player had no way to find
   * out what they rolled. A number a rule reads and a player cannot is a number
   * the player is playing without.
   *
   * Only the fields the document gave a `label`, in declaration order. A label
   * is the author saying *this one is for reading* - `turn` holding an index
   * into a seat order is a real field and not a thing to put on somebody's
   * screen - and it is already in the format because the data panel prints it.
   */
  tally?: readonly { label: string; value: number }[]
  /**
   * Which side this player is on, when the level has sides.
   *
   * The only cue before this was the colour of the ring under your own feet,
   * which works when you already know the four colours and are looking down. At
   * a table you are looking at the *board*, and "which of these am I" is the
   * first question anybody asks - a four-seat game where you have to work that
   * out from a ring is a game you start by guessing.
   */
  seat?: string
  /**
   * Which phase of its own round the level is in, when it describes one.
   *
   * Drawn because in a turn-based game the question a player has *between*
   * actions is "what am I meant to do now", and `allow` answers it only by a
   * button quietly not working - which reads as a broken key rather than as a
   * rule. Absent for every level that describes no run.
   */
  phase?: string | null
  /**
   * Seconds left on a phase that leaves on a clock, drawn big in the middle.
   *
   * A kick off is three seconds of not being allowed to kick, and the only
   * sign of it used to be the button being missing - which reads as the game
   * being broken rather than as a countdown. Absent for every phase that leaves
   * on something other than time, because those have no number to show.
   */
  countdown?: number
  /**
   * Which round of how many, for a run that goes round.
   *
   * The pair rather than the number, because the number alone is not news: a
   * player wants "two of three", and only the document knows the three. Absent
   * for every flow that declares no `rounds`, which is most of them.
   */
  round?: { at: number; of: number }
  /**
   * What this player was dealt.
   *
   * Drawn quietly and always, rather than once at the start: a role you were
   * shown for three seconds while you were still working out the controls is a
   * role you spend the round unsure about, and asking somebody to remember it is
   * asking them to ask.
   */
  secret?: string | null
  /**
   * And whether that role means the room can see you.
   *
   * Drawn beside the role rather than left to be inferred from it, because it
   * cannot be: a player whose body is on nobody else's screen has no way to find
   * out except by walking up to somebody and being ignored. `normal` says
   * nothing, which is the whole of every level written before this.
   */
  seen?: RoleView
  /**
   * The run's own ending, when the document declared one.
   *
   * `flow.wins`, and separate from `match` because they are two different
   * endings a level may have at once: a preset's whistle is about the mode, and
   * this is about a condition the *document* wrote. False for every level that
   * never declared one.
   */
  won?: boolean
  /** The clock, when this level can be raced. Null when it cannot. */
  run: Run | null
  /** The score and the whistle, when this level is playing a mode. */
  match: Match | null
  /** Whole seconds until the player is back, or null when they are alive. */
  downFor: number | null
  /**
   * Set only when a headset is actually attached.
   *
   * Absent is the common case - every phone, and every desktop browser without
   * one - and absent means no button at all. An "Enter VR" that is always there
   * and fails on a laptop is worse than one that is simply not, which is the
   * whole of what was asked for.
   */
  onEnterVr?: () => void
  /**
   * Put me back where I started, because I cannot move.
   *
   * Asked for as *"a respawn button for stuck situations"*, and it earns its
   * place on the HUD rather than in the room's rail for one reason: it has to be
   * reachable from wherever the level is being played. The rail belongs to a
   * space, and the same scene runs on `/lobby`, on `/demo`, in the editor's
   * try-out and full-screen with the chrome gone - all of which are places
   * somebody can be stuck with no rail on screen.
   *
   * Absent in a level that has no way to put anybody anywhere, which is nowhere
   * today but is the honest shape for a prop nothing has to supply.
   */
  onUnstick?: () => void
  /**
   * Open the controls panel.
   *
   * Handed in rather than owned here, like every other verb on this HUD: the
   * panel's open state lives in ./scene beside the `H` handler that also sets
   * it, and two authorities on one boolean is how a chip and a key come to
   * disagree about whether the panel is up.
   */
  onControls?: () => void
  scripts: string
}) {
  const locale = useLocale()
  const t = xpDict(locale).hud
  useDebugPublish({
    name: xp.name,
    placements: xp.world.placements.length,
    entities,
    cells,
    scripts,
    at: readout ?? null,
    facing: readout?.facing ?? null,
  })

  return (
    <>
      {/**
        * The clock and the score, in one column.
        *
        * Together rather than in two corners because they are one thing to a
        * player - how am I doing, and how long have I got - and because a level
        * can have both: a timed course reports a run clock *and* a countdown,
        * and two absolutely-positioned readouts would sooner or later be drawn
        * on top of each other.
        */}
      {/*
        The corner, as one column rather than two things in the same square inch.
        ---------------------------------------------------------------------
        Both of these were `absolute left-0 top-0 p-4`, so in any level with a
        readout they were drawn on top of each other - the level's name over the
        phase over the score, each legible alone and unreadable together. A board
        game has the most to say there, so it is where it showed: *I can't see
        whose turn it is* was three lines of white text in one square inch.

        Stacked rather than offset by a guessed height, because the tally is as
        tall as the document made it: a level with five fields pushes this five
        fields down and one with none gets the corner it always had.
      */}
      <div
        /*
          Below whatever the page has put above it, and nothing when it has put
          nothing there.

          The match room used to float a strip across this edge - name on the
          left, Leave on the right - and it and this both owned `top-0` in files
          that knew nothing about each other, so the level's name sat over the
          phase and `Leave` sat over `Unstick`. That strip has since moved into
          the rail and the collision is gone, which is the better fix.

          The variable stays because the *class* of bug does not: any page that
          later floats something over a scene has one number to set, in its own
          file, and unset means zero. It is not paying for a strip that no longer
          exists.
        */
        style={{ paddingTop: 'calc(1rem + var(--xp-chrome-top, 0px))' }}
        className="pointer-events-none absolute left-0 top-0 flex max-w-[17rem] flex-col gap-3 p-4"
      >
        {live.length > 0 ? <Actions live={live} {...(cooling ? { cooling } : {})} /> : null}
        {seat || phase || says || round || (tally && tally.length > 0) ? (
          <Tally
            tally={tally ?? []}
            seat={seat}
            phase={phase}
            says={says}
            {...(round ? { round } : {})}
          />
        ) : null}
        {/*
          The level's own numbers, last and dimmer.

          Placements, entities, solid cells and a coordinate are *developer*
          furniture, and they were drawn at the same weight as the score - so a
          player reading "whose turn is it" read four lines about the geometry
          first. Same corner, a third of the emphasis: still there when you go
          looking, gone when you are not.
        */}
        <div className="font-mono text-[10px] leading-relaxed text-white/40">
        {/*
          The name stays; the numbers went to the rail.

          Placements, entities, solid cells and the coordinate are developer
          furniture, and being a third of the emphasis was already a compromise
          - four lines of geometry in front of somebody trying to read whose
          turn it is. They are published to the rail now (`debug-store`) and
          opened when somebody goes looking.

          The name is not furniture and does not move. This runtime also runs at
          /xp/<id>, where there is no rail at all, and a level that does not say
          what it is is a level nobody can report a bug about.
        */}
        {/*
          Through the level's own table, so a document that lists a German
          title has one here. Falls back to the name as written, which is what
          every level does - see `@kxb/xp/words`.
        */}
        <p className="text-white">{translator(xp.words, locale)(xp.name)}</p>
        {/* Only in a room, because "0 others" in a level nobody else can reach
            is a number about a thing that is not happening. */}
        {peers > 0 ? (
          <p className="text-white">
            {fill(peers === 1 ? t.otherOne : t.otherMany, { n: peers })}
          </p>
        ) : null}
        {/* Only once something has happened. A "0 kills" in a room where nobody
            has fired is a scoreboard for a game that has not started. */}
        {kills && (kills.mine > 0 || kills.pending > 0) ? (
          <p className="text-white">
            {fill(kills.mine === 1 ? t.killOne : t.killMany, { n: kills.mine })}
            {kills.pending > 0 ? (
              <span className="opacity-60"> · {fill(t.pending, { n: kills.pending })}</span>
            ) : null}
          </p>
        ) : null}
        {/* In play, in the corner the player is already reading, because the
            last time a refusal like this went into a panel it was a panel that
            closes at kickoff. */}
        {kills?.refused ? <p className="text-amber-300">{kills.refused}</p> : null}
        {/* In the corner with the rest of the quiet readouts, because it is a
            fact about you rather than an event — and deliberately not in the
            middle of the screen, where somebody standing behind you can read
            it as easily as you can. */}
        {secret ? (
          <p className="text-fuchsia-300">{fill(t.youAre, { role: secret })}</p>
        ) : null}
        {/* Under the role and in the same quiet corner, because it is the other
            half of the same sentence: what you were dealt, and what it does to
            you. Only when it does something - `normal` is everybody. */}
        {seen === 'nobody' ? (
          <p className="text-fuchsia-300/70">{t.seenNobody}</p>
        ) : seen === 'team' ? (
          <p className="text-fuchsia-300/70">{t.seenTeam}</p>
        ) : null}
        {/* The coordinate went to the rail with the rest of the developer
            numbers. It is the one somebody reads while *walking*, which is
            exactly why it should not be a line the walker has to read past. */}
      </div>
      </div>

      {run || match || turn || (standings && standings.length > 1) ? (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 p-4 text-center font-mono tabular-nums">
          {match ? <Scoreboard match={match} /> : null}
          {run ? <Clock run={run} /> : null}
          {standings ? <Board standings={standings} /> : null}
          {turn ? <Turn turn={turn} standings={standings ?? []} seats={seats} /> : null}
        </div>
      ) : null}

      {/*
        The count into a kick off, over the middle of the world.

        Big and central because it is the one thing worth looking at while it
        is on screen: you cannot kick yet, and this says how long for. It sits
        above the phase strip rather than in it - the strip is a sentence you
        read once, and this is a number that changes every second.

        `pointer-events-none` like everything else drawn over the world; there
        is nothing to click and it must not eat a click meant for the pitch.
      */}
      {countdown !== undefined && countdown > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <span className="font-mono text-7xl font-bold tabular-nums text-white/85 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
            {countdown}
          </span>
        </div>
      ) : null}

      {/* A result, from whichever produced one. A run that finished in a level
          with no mode declared is still a result, and hiding the clock when it
          stops would otherwise have thrown that away entirely. */}
      {match?.ending || run?.phase === 'finished' ? (
        <FullTime match={match} run={run} sided={teamTotals(standings ?? []).length > 1} />
      ) : null}

      {/*
        And the ending the *document* declared, which the two above cannot draw.

        In the same place and not inside `FullTime`, because it is a different
        fact with a different source: that panel reads a `Match` or a `Run` -
        the two hard-coded machines - and `flow.wins` is a condition a level
        wrote about its own data. A level can have both, and the whistle is the
        one that carries a score.

        It says the run is over and does not name a winner, which is exactly
        what the field says: the condition is about the level's state, and the
        board beside this is what has been answering "who is ahead" all along.
      */}
      {won && !match?.ending ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-black/60 px-6 py-3 text-center font-mono text-2xl text-emerald-300">
            {t.won}
            <span className="mt-1 block text-xs text-neutral-400">{t.runOver}</span>
          </p>
        </div>
      ) : null}

      {/**
        * Waiting to come back.
        *
        * In the middle, like full time, because it is the other moment a player
        * is *not* playing - and a countdown in a corner is a countdown you spend
        * the whole wait hunting for. Only when there is a wait at all: a level
        * with instant respawn never renders this, which is every level written
        * before `rules.respawn` existed.
        */}
      {/**
        * Out, in the place the respawn countdown would have been.
        *
        * Deliberately the same spot: it is the answer to the same question -
        * *why can I not do anything* - and the two can never be true at once,
        * because a match with no lives left never starts a countdown.
        */}
      {standings?.some((row) => row.mine && row.out) ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-mono">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{t.out}</p>
          {/* Said where the state is, because a control nobody is told about is
              a spectator sitting still behind one person for a whole round. */}
          <p className="mt-2 text-sm text-white/40">{t.watchSomebodyElse}</p>
        </div>
      ) : null}

      {vote && standings ? <VotePanel vote={vote} standings={standings} /> : null}

      {downFor !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 text-center font-mono tabular-nums">
          <p className="text-[11px] uppercase tracking-[0.3em] text-rose-300/70">{t.down}</p>
          <p className="mt-2 text-5xl leading-none text-white/80">{downFor}</p>
        </div>
      ) : null}

      {/*
        The way into a headset, and the way out of a corner.

        Together in one row, top right, because both are things you do *to the
        session* rather than in the game - and a lone button floating in the
        opposite corner would read as part of the level.
      */}
      {onControls || onEnterVr || onUnstick ? (
        <div className="pointer-events-none absolute right-0 top-0 m-4 flex items-center gap-2">
          {/*
            The way to the controls, and on a phone the *only* way.

            `H` opened the panel and nothing else did, which on glass meant the
            handedness switch and the camera mode were both unreachable - "on
            xp u can not even choose". A chip costs one corner and answers it.
            Last in the row so the two session buttons keep the outer corner
            they have always had, and it lands nearest the thumb either way.
          */}
          {onControls ? (
            <button
              type="button"
              onClick={onControls}
              aria-label={t.showControls}
              title={t.showControls}
              className="hud-chip pointer-events-auto size-11 justify-center !px-0"
            >
              <GamepadMark />
            </button>
          ) : null}
          {onUnstick ? (
            <button
              type="button"
              onClick={onUnstick}
              title={t.unstickTitle}
              className="pointer-events-auto rounded-full border border-white/25 bg-black/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 backdrop-blur-sm transition hover:bg-white/15"
            >
              {t.unstick}
            </button>
          ) : null}
          {onEnterVr ? (
            <button
              type="button"
              onClick={onEnterVr}
              className="pointer-events-auto rounded-full border border-white/25 bg-black/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 backdrop-blur-sm transition hover:bg-white/15"
            >
              {t.enterVr}
            </button>
          ) : null}
        </div>
      ) : null}

      {rolled ? <Rolled rolled={rolled} /> : null}

      {/* A crosshair, because a view without one leaves you guessing where the
          middle is. It is the middle in third person too: the camera sits behind
          the eye along the same line, so a shot still goes through here. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70"
      />



      {/**
        * Health and ammunition, big, in the corner a player looks at.
        *
        * Only when the document gives them any. A level about walking around a
        * room has neither, and a HUD that showed `hp —` would be telling
        * somebody about a rule the level does not have.
        *
        * Ammunition matters more than it looks: a miss is otherwise
        * indistinguishable from a gun that is not working, and the counter going
        * down is the only feedback a shot into empty air produces.
        */}
      {vitals.hp !== undefined || vitals.ammo !== undefined ? (
        <div className="pointer-events-none absolute bottom-0 right-0 flex items-baseline gap-4 p-4 font-mono text-sm tabular-nums text-white/80">
          {vitals.hp !== undefined ? (
            <p className={vitals.hp <= 25 ? 'text-rose-300' : undefined}>
              <span className="text-[11px] text-white/40">{t.hp} </span>
              {vitals.hp}
            </p>
          ) : null}
          {vitals.ammo !== undefined ? (
            <p className={vitals.ammo === 0 ? 'text-amber-300' : undefined}>
              <span className="text-[11px] text-white/40">{t.ammo} </span>
              {vitals.ammo}
            </p>
          ) : null}
        </div>
      ) : null}

      {/**
       * A script that threw, where somebody playing will see it.
       *
       * Deliberately not a console line. The lounge lost a race result to
       * exactly this and rendered a mode error inside a panel that closes at
       * kickoff (docs/xp/creator.md §9): a failure nobody is shown is a game
       * that looks finished and quietly is not. A broken script stops one
       * entity and leaves the rest of the level running, so without this the
       * only symptom is a turret that does nothing.
       */}
      {broken.length > 0 ? (
        <div className="pointer-events-none absolute right-0 top-0 max-w-sm p-4 font-mono text-[11px] leading-relaxed text-rose-300/90">
          <p className="text-rose-200">
            {fill(broken.length === 1 ? t.scripts.failureOne : t.scripts.failureMany, {
              n: broken.length,
            })}
          </p>
          {broken.slice(-4).map((line) => (
            <p key={line} className="truncate">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/**
       * The same corner, and the same rule: visible while playing.
       *
       * docs/xp/state.md §7.8 asks for exactly this and says why in the repo's
       * own history — a denial that reaches only `log` is one the author sees
       * and the player does not, and the player is the person it happened to.
       * Below the script failures rather than merged with them, so a level with
       * both says two things rather than one wrong one.
       */}
      {troubles && troubles.length > 0 ? (
        <div className="pointer-events-none absolute right-0 top-20 max-w-sm p-4 font-mono text-[11px] leading-relaxed text-amber-300/90">
          {troubles.slice(-3).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      {/**
        * What the level just said, above the controls.
        *
        * In the middle-bottom rather than in a corner: this is the only part of
        * the HUD that reports something that *happened*, and a player looking
        * down the middle of the screen at a coin should not have to check a
        * corner to find out whether they got it.
        */}
      {said.length > 0 ? (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 text-center font-mono text-[11px] leading-relaxed">
          {said.map((line, index) => (
            <p
              key={line.id}
              // Older lines fade rather than vanish, so a burst reads as a
              // sequence instead of as one line flickering.
              style={{ opacity: 0.25 + (0.75 * (index + 1)) / said.length }}
              className="text-white"
            >
              {line.text}
            </p>
          ))}
        </div>
      ) : null}

      {/*
        The way in to the keys, not the keys.

        This used to spell out the whole control scheme, and it was a second copy
        of a list nobody was maintaining: it never mentioned dance, and it could
        not mention the level's own bindings at all, because `player.keys` is
        different for every document. `./controls` generates that list from the
        document, so the only thing left worth saying in the corner is where to
        find it - and "click to look", which is the one instruction you need
        *before* you can press anything.
      */}
      <div className="pointer-events-none absolute bottom-0 left-0 p-4 font-mono text-[11px] leading-relaxed text-white/50">
        <p>{t.clickToLook}</p>
      </div>
    </>
  )
}

/**
 * The clock, top and centre.
 *
 * Centre because it is the one number on this HUD a player is *watching* rather
 * than checking: health lives in the corner because you glance at it when
 * something hurts, and a race time is the thing you are trying to make smaller
 * for the whole of the run. Top rather than bottom so it is not fighting the
 * ticker in the middle of the screen.
 *
 * The colours are the marks' own - `./marks.tsx` draws a start in lime and a
 * finish in amber - so the line that ended the run and the number it produced
 * are the same colour. A player who has seen one should not have to learn the
 * other.
 */
function Clock({ run }: { run: Run }) {
  const t = xpDict(useLocale()).hud
  /**
   * A run that beat the previous best, said rather than implied.
   *
   * `finishes > 1` and nothing else: a first run is the best by default and
   * saying so is telling somebody they beat nobody. Comparing `time` against
   * `best` is the honest test - `stepRun` has already folded this run into the
   * best, so equality means this run *is* it.
   */
  /**
   * Only while it is counting.
   *
   * Not before the start line and not after the finish, which is a deliberate
   * change from the first version and the right one: a clock reading `0.00` is a
   * clock somebody assumes is broken, and a clock frozen on a finished time is
   * the result pretending to still be a readout - the result has its own place
   * on the screen, and saying it twice in two sizes invites the question of
   * which one is live.
   *
   * It also means the HUD of a course is *empty* until you set off, which is
   * what a course looks like when nothing has happened yet.
   */
  if (run.phase !== 'running') return null

  return (
    <div>
      <p className="text-3xl leading-none text-white">{formatRunTime(run.time)}</p>

      {/* The best, while there is a run to measure against it. */}
      {run.best !== null ? (
        <p className="mt-1 text-[11px] text-white/40">
          {fill(t.best, { time: formatRunTime(run.best) })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The countdown and the score, while a match is being played.
 *
 * Every part of it is conditional, and that is the design rather than caution: a
 * mode with no time limit has no countdown to show and a course scores nothing,
 * so the honest rendering of `parkour` with no limits is *nothing at all* - the
 * run clock below is the whole story. A readout that showed `0` and `—` would be
 * telling somebody about two rules the level does not have, which is the same
 * mistake `vitals` avoids by only appearing when a document gives you health.
 */
/**
 * Everybody's kills, in the order the arbiter's numbers put them.
 *
 * ---------------------------------------------------------------------------
 * Only once it is a game
 * ---------------------------------------------------------------------------
 * Nothing at all until there are two people, and nothing until somebody has
 * scored. A board of one row saying "you: 0" is a scoreboard for a game that is
 * not happening, and it would appear in every room the moment anybody opened
 * one - including the ones nobody is playing a mode in.
 *
 * Sides, when the level has them, are summed above the individual rows rather
 * than instead of them: "who is winning" and "how am I doing" are two different
 * questions and a player asks both. `teamTotals` is empty for a level with no
 * team spawns, which is most of them, and empty draws nothing.
 *
 * Somebody who has left is dimmed rather than dropped. Their kills happened.
 */
function Board({ standings }: { standings: readonly Standing[] }) {
  if (standings.length < 2 || standings.every((row) => row.kills === 0)) return null
  const totals = teamTotals(standings)

  return (
    /*
     * Named for a spec, like `phase` and `seat` are.
     *
     * The alternative is a regex over the whole screen, and the reason that is
     * not good enough is what this block *is*: the sides are the document's own
     * team names and the rows are whatever the roster called people, so "did the
     * score appear" written as a pattern is really "did these two players happen
     * to land on different sides with the names I expected". A spec that only
     * passes when the teams come out one apiece is a spec that fails for a
     * reason that is not the code.
     */
    <div data-testid="standings" className="mt-2 text-sm">
      {totals.length > 1 ? (
        <p className="mb-1 text-white">
          {totals.map((total, at) => (
            <span key={total.side}>
              {at > 0 ? <span className="text-white/40"> · </span> : null}
              <span style={{ color: teamColour(total.side) }}>{total.side}</span> {total.kills}
            </span>
          ))}
        </p>
      ) : null}

      {standings.map((row) => (
        <p key={row.id} className={row.here ? 'text-white/70' : 'text-white/35'}>
          {/* Struck through rather than removed. A name that disappears reads
              as somebody leaving, and being knocked out of a match is the one
              thing in it a player most wants to still be able to see. */}
          <span className={`${row.mine ? 'text-white' : ''} ${row.out ? 'line-through opacity-50' : ''}`}>
            {row.name}
          </span>{' '}
          <span className="tabular-nums">{row.kills}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * Whose go it is, said in two words.
 *
 * Under the board rather than beside it, because it is the same question the
 * board answers — how is this going — and a board game's answer to *why can I
 * not do anything* has to be somewhere the player is already looking.
 *
 * **Your own turn is named as yours**, which is the whole value of the line: an
 * account id resolved to a name tells you it is Anna's go, and "your turn" is
 * the only version of that sentence anybody acts on. A name we do not have is
 * left as *somebody*: the standings carry everybody the arbiter has scored, and
 * a table can be taking turns in a level that keeps no score at all.
 */
function Turn({
  turn,
  standings,
  seats,
}: {
  turn: string
  standings: readonly Standing[]
  seats?: Readonly<Record<string, string>>
}) {
  const t = xpDict(useLocale()).hud
  const who = standings.find((row) => row.id === turn)
  /**
   * The colour first, because it is the only thing anybody at the table can see.
   *
   * A name answers *who* and the board answers *which pieces*, and between two
   * strangers in a public room the second is the one that lets you play: "red's
   * turn" is actionable by everybody looking at it, and "Anna's turn" is
   * actionable by whoever knows which one Anna is. So the colour leads and the
   * name follows it when we have one.
   */
  const seat = seats ? Object.keys(seats).find((name) => seats[name] === turn) : undefined

  return (
    <p className="mt-2 text-base">
      {seat ? (
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: teamColour(seat) }}
        >
          {seat}
        </span>
      ) : null}
      {who?.mine ? (
        <span className="text-white">
          {seat ? ' — ' : ''}
          {t.yourTurn}
        </span>
      ) : (
        <span className="text-white/70">
          {seat ? ' — ' : ''}
          {/*
            The whole phrase, not a name and a suffix. English makes a
            possessive out of the name and German puts the person in front of a
            verb — "Anna ist am Zug" — so `{name}'s turn` is not a sentence that
            survives being cut in two.
          */}
          {fill(t.theirTurn, { name: who?.name ?? t.somebody })}
        </span>
      )}
    </p>
  )
}

/**
 * What you can do, as things you can press.
 *
 * ---------------------------------------------------------------------------
 * The keys existed and the actions did not
 * ---------------------------------------------------------------------------
 * A level binds `R`, `E`, `F`, a phase decides which of them are live, and the
 * enforcement is silent - a key that is not live quietly does nothing. On a
 * phone there were thumb buttons; on a desktop there was a sentence, and on a
 * headset there was a line of text. Three surfaces, three different answers to
 * the same question, and two of them unpressable.
 *
 * One row, everywhere. The letter is the key, the word is what it does, and the
 * whole thing is a button - so *reading* the controls and *using* them are the
 * same act, and a player who never learns the keyboard never has to.
 *
 * ---------------------------------------------------------------------------
 * Why it dispatches a keystroke rather than calling in
 * ---------------------------------------------------------------------------
 * The runtime hears keys on `window`, and one path in is what keeps a tap and a
 * press identical - including the tap-versus-hold decision in `pressBuffer`,
 * which a second entry point would have to reimplement and would get subtly
 * wrong. `pointerdown` and `pointerup` map to `keydown` and `keyup`, so holding
 * the button carries a piece exactly as holding the key does.
 */
/**
 * ---------------------------------------------------------------------------
 * And why the dash carries a dial
 * ---------------------------------------------------------------------------
 * A key that is live and does nothing is the one thing this row exists to stop
 * happening, and a cooldown is exactly that for three seconds at a time. So the
 * wait is drawn where the press is: the chip dims and a small clock face empties
 * beside the word, which answers *how much longer* without anybody reading a
 * number. See ./cooling - the arc is a CSS variable an animation frame writes, so
 * a row of buttons is not re-rendered sixty times a second to move it.
 */
function Actions({
  live,
  cooling,
}: {
  live: readonly { does: string; label: string; code: string }[]
  cooling?: { readonly current: Cooling | null }
}) {
  const send = (type: 'keydown' | 'keyup', code: string) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))

  /*
    One loop for the whole row, however many keys the document bound: the ref goes
    on the row and each chip names itself with `COOL_KEY`. A ref per chip would
    need a hook per chip, and what a level binds is not known until it opens.
  */
  const row = useCooling(cooling)

  return (
    <div ref={row} className="pointer-events-auto flex flex-wrap gap-1.5">
      {live.map((one) => (
        <button
          key={one.does}
          {...{ [COOL_KEY]: one.does }}
          type="button"
          title={one.does}
          style={coolingDim}
          onPointerDown={(event) => {
            event.preventDefault()
            send('keydown', one.code)
          }}
          onPointerUp={() => send('keyup', one.code)}
          onPointerLeave={(event) => {
            // Only when it is actually held: leaving with the button up would
            // fire a release nobody performed, and put down a piece mid-carry.
            if (event.buttons !== 0) send('keyup', one.code)
          }}
          className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/45 px-2 py-1 backdrop-blur-sm transition hover:border-white/45 hover:bg-black/60 active:bg-white/15"
        >
          <span className="rounded bg-white/15 px-1 font-mono text-[10px] leading-4 text-white">
            {one.label}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/75">
            {one.does}
          </span>
          {/* Always in the row rather than mounted when the wait starts: a chip
              that grew by fourteen pixels on every press would shuffle the
              buttons beside it, and an empty ring is invisible anyway - which is
              also why every chip carries one rather than only the ones a
              document put a wait on. */}
          <CoolRing className="size-3.5 shrink-0 text-white" />
        </button>
      ))}
    </div>
  )
}

/**
 * A die that landed, in the middle of the screen, for a moment.
 *
 * ---------------------------------------------------------------------------
 * Because a roll is an announcement
 * ---------------------------------------------------------------------------
 * The number has always been in the corner readout, which is where the person
 * who threw it looks and nowhere anybody else does. At a real table the throw is
 * the loudest thing that happens in a turn - everybody stops and looks - and a
 * board game where three players quietly miss each other's dice is three players
 * who cannot follow the game.
 *
 * Keyed on the counter rather than the face, because two fours in a row are two
 * throws: a banner watching the number alone would sit still through the second
 * one. And it fades on its own rather than waiting to be dismissed, because the
 * number stays in the corner - this is the *event*, not the record.
 */
function Rolled({ rolled }: { rolled: { seat: string | null; face: number; at: number } }) {
  /**
   * The throw this banner has finished with, rather than a flag saying *gone*.
   *
   * Two pieces of state that have to agree - "which throw" and "is it over" -
   * are one piece of state that can disagree, and the effect that kept them in
   * step had to write both on the way in. Holding the *counter* instead means
   * arriving is nothing but a new prop and leaving is one write.
   */
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDone(rolled.at), 2600)
    return () => clearTimeout(timer)
  }, [rolled.at])

  if (done === rolled.at) return null

  return (
    <div
      // Above the middle rather than on it: the middle is where the board is,
      // and a number over the square somebody is about to move to is a number
      // in the way.
      className="pointer-events-none absolute left-1/2 top-[28%] -translate-x-1/2 text-center font-mono"
    >
      <div className="text-7xl leading-none text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.95)]">
        {rolled.face}
      </div>
      {/*
        Named in words under the number, rather than a colour swatch above it.
        "red rolled 4" is a sentence somebody reads from across a table without
        having to know which of the four ellipses is whose - and it is the same
        line the level's own log carries, so the announcement and the record
        agree.
      */}
      {rolled.seat ? (
        <div className="mt-1 text-sm">
          <span
            className="uppercase tracking-[0.2em]"
            style={{ color: teamColour(rolled.seat) }}
          >
            {rolled.seat}
          </span>
          <span className="text-white/70"> rolled {rolled.face}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The room deciding, while it decides.
 *
 * Numbered rather than clickable, because the pointer is locked while you are
 * playing: a panel you click is a panel that takes the camera away from
 * whoever is still shooting at you. The numbers are `voteView`'s own order,
 * which is also the order the key handler reads - one function, one order.
 *
 * A spectator sees it and cannot use it. That is deliberate: watching the room
 * decide is most of what being out is, and hiding the vote would make
 * elimination feel like a disconnection.
 */
function VotePanel({ vote, standings }: { vote: OpenVote; standings: readonly Standing[] }) {
  const t = xpDict(useLocale()).hud
  // Re-read once a second, which is all a countdown in whole seconds needs.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(every)
  }, [])

  const view = voteView({ vote, standings, me: standings.find((row) => row.mine)?.id, now })
  if (!view) return null

  return (
    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
        {fill(t.vote, { n: view.left })}
      </p>
      <ul className="mt-2 space-y-0.5">
        {view.options.map((option, at) => (
          <li key={option.id} className={option.ours ? 'text-amber-300' : 'text-white/70'}>
            <span className="text-white/40">{at + 1}</span> {option.name}
            {/* A zero is not drawn: an empty column of noughts reads as a
                scoreboard, and this is a list of people rather than a table. */}
            {option.votes > 0 ? <span className="tabular-nums"> · {option.votes}</span> : null}
          </li>
        ))}
      </ul>
      {/* Said once, at the bottom, rather than beside every row. */}
      {view.may ? null : <p className="mt-2 text-[11px] text-white/35">{t.youAreOut}</p>}
    </div>
  )
}

function Scoreboard({ match }: { match: Match }) {
  const t = xpDict(useLocale()).hud
  /**
   * A countdown, and it goes red at ten seconds.
   *
   * Not a flash and not a sound. The last ten seconds are the only part of a
   * match clock anybody actually reads, and a colour is the cheapest way to say
   * so that does not compete with whatever is happening on the screen.
   */
  const late = match.remaining !== null && match.remaining <= 10

  return (
    <div>
      {/* The countdown, and only while there is something to count down to. A
          clock stopped on zero under a full-time banner is the same number said
          twice. */}
      {match.remaining !== null && match.phase === 'playing' ? (
        <p className={`text-3xl leading-none ${late ? 'text-rose-300' : 'text-white'}`}>
          {formatRunTime(match.remaining)}
        </p>
      ) : null}

      {/* The score, once there is one or once the mode is a race to a number.
          Before either, a zero is a number about nothing. */}
      {match.score > 0 && match.phase === 'playing' ? (
        <p className="mt-1 text-sm text-white/70">
          {fill(match.score === 1 ? t.pointOne : t.pointMany, { n: match.score })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The whistle.
 *
 * The one thing on this HUD that is allowed to be in the middle of the screen,
 * because it is the only one that means *stop looking at the game*. Everything
 * else here is read while playing; this is read instead of playing.
 *
 * It says why rather than just that it is over. "full time" and "score limit"
 * are different endings and a player who has just lost cares a great deal which
 * one it was - and on a course the result is the run time, which is a number the
 * clock above has been showing all along and would otherwise vanish behind a
 * banner at the moment it finally mattered.
 */
function FullTime({
  match,
  run,
  sided,
}: {
  match: Match | null
  run: Run | null
  /** Whether this level has sides at all, so a missing winner can mean a draw. */
  sided: boolean
}) {
  const dict = xpDict(useLocale())
  const t = dict.hud
  const finished = run?.phase === 'finished'
  if (!match?.ending && !finished) return null

  /**
   * What the run or the match came to.
   *
   * The run's time wins when there is one, because on a course that *is* the
   * result - the score is incidental and the clock is what somebody was trying
   * to make smaller for the whole of it.
   */
  const result = finished && run
    ? formatRunTime(run.time)
    : match && match.score > 0
      ? fill(match.score === 1 ? t.pointOne : t.pointMany, { n: match.score })
      : null

  /**
   * A draw, said rather than left blank.
   *
   * Only when the level actually had sides: no winner on a level with none is
   * not a draw, it is a level where the question does not arise. Told apart by
   * whether anything is keeping team totals at all, because a result screen
   * that shows nothing where a winner goes reads as the game having failed to
   * work out who won.
   */
  const drawn = sided && match?.ending != null && match.winner === undefined

  /** A new personal best, said rather than implied. A first run beat nobody. */
  const beat = finished && run !== null && run.finishes > 1 && run.time === run.best

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 text-center font-mono tabular-nums">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
        {match?.ending ? describeEnding(match.ending, dict.endings) : t.finished}
      </p>
      {match?.winner ? (
        <p className="mt-2 text-3xl leading-none" style={{ color: teamColour(match.winner) }}>
          {match.winner}
        </p>
      ) : null}
      {drawn ? <p className="mt-2 text-3xl leading-none text-white/70">{t.draw}</p> : null}
      {result ? <p className="mt-2 text-5xl leading-none text-amber-300">{result}</p> : null}
      {/* The way out of a finished match, said where the result is rather than
          in the control strip at the bottom. A player reading "full time" is
          looking here, and an instruction they have to go and find is an
          instruction most of them will not. */}
      {beat ? <p className="mt-2 text-[11px] text-amber-200/80">{t.newBest}</p> : null}
      {/* And the best, once there is a previous one to have beaten. */}
      {run?.best !== undefined && run.best !== null && !beat && run.time !== run.best ? (
        <p className="mt-2 text-[11px] text-white/40">
          {fill(t.best, { time: formatRunTime(run.best) })}
        </p>
      ) : null}
      {/* The way out of a finished match, said where the result is rather than
          in the control strip at the bottom. A player reading "full time" is
          looking here, and an instruction they have to go and find is an
          instruction most of them will not. */}
      {match ? (
        <p className="mt-3 text-[11px] tracking-wide text-white/40">{t.playAgain}</p>
      ) : null}
    </div>
  )
}


/**
 * The level's own numbers, top left, and **the first one large**.
 *
 * Away from the clock and the score in the middle, because those are the
 * *match's* facts and these are the *level's* - and a die roll appearing under
 * a scoreboard reads as part of the score. Top left is where a level with no
 * mode has nothing else, which is most of the levels that declare data.
 *
 * ---------------------------------------------------------------------------
 * Why the first one is the big one
 * ---------------------------------------------------------------------------
 * A row of same-sized numbers is a row you have to read. The board game rolls a
 * die and then everybody at the table has to see what it says from across the
 * room - that is not a readout, it is an announcement, and an announcement in
 * 14px grey is one people ask each other about instead of looking at.
 *
 * Declaration order decides which one, and that is not a guess: it is the rule
 * `player.keys` already sets, where document order decides which face button a
 * binding lands on in a headset and which order the thumb buttons are drawn in
 * on a phone. A level that declares `dice` first is saying the roll is the
 * thing to look at, and it does not need a second field on `XpField` to say so
 * again. `vr-hud.ts` reads it the same way, so the panel and the page lead with
 * the same number.
 */
function Tally({
  tally,
  seat,
  phase,
  says,
  round,
}: {
  tally: readonly { label: string; value: number }[]
  seat?: string
  phase?: string | null
  says?: string | null
  /** `2 / 3` while a run goes round, and absent when it does not. */
  round?: { at: number; of: number }
}) {
  const [lead, ...rest] = tally

  return (
    <div className="font-mono tabular-nums">
      {/*
        Which round, above the phase.

        Only when a run has more than one, which is what makes it worth a line:
        "round 1 of 1" is a fact about a document rather than news for a player.
        Above the phase because it changes less often than the phase does and
        more often than the seat - the strip reads top to bottom from the
        slowest thing to the fastest.
      */}
      {round ? (
        <div
          data-testid="round"
          className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/50"
        >
          round {round.at} / {round.of}
        </div>
      ) : null}
      {/* Above the numbers, because it does not change and they do: it is the
          one line here that answers a question you ask once. Drawn in the side's
          own colour, which is the same table `rings.tsx` reads - so the word and
          the ring under your feet cannot disagree. */}
      {phase ? (
        // Above the seat, because it changes and the seat does not: the one line
        // here that answers "and now?" rather than "who am I".
        <div
          data-testid="phase"
          className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/70"
        >
          {phase}
        </div>
      ) : null}
      {seat ? (
        <div
          data-testid="seat"
          className="mb-2 text-[10px] uppercase tracking-[0.18em]"
          style={{ color: teamColour(seat) }}
        >
          you · {seat}
        </div>
      ) : null}
      {/*
        What to do, under the phase name and above the numbers.
        ---------------------------------------------------------------------
        The phase says *where you are* in one word and this says *what that
        means*, so they belong together and in that order. Above the score
        because a number you are watching is a thing you already understand;
        this is for the moment you do not.
      */}
      {says ? (
        <div className="mb-2 max-w-[15rem] text-[11px] leading-snug text-white/85">{says}</div>
      ) : null}
      {lead ? (
        <div className="mb-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{lead.label}</div>
          <div
            // The one hook the end-to-end spec has on the level's own state.
            // On the *value* rather than the row, so an assertion reads a
            // number and not a label glued to one.
            data-testid={`tally-${lead.label.replace(/\s+/g, '-')}`}
            className="text-4xl leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          >
            {lead.value}
          </div>
        </div>
      ) : null}
      <div className="space-y-0.5">
        {rest.map((field) => (
          <div key={field.label} className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
              {field.label}
            </span>
            <span
              data-testid={`tally-${field.label.replace(/\s+/g, '-')}`}
              className="text-sm text-white/90"
            >
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
