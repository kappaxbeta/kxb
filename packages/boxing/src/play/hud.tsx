'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { MAX_HEALTH, MAX_STAMINA, ROUNDS } from '../rules/fight'
import type { Fight, Verdict } from '../rules/fight'
import { CONTROLS } from './keys'
import { useWords } from './words-context'
import { say } from './words'

/**
 * What the player reads while they are being punched.
 *
 * ---------------------------------------------------------------------------
 * Ordinary DOM, over the canvas, on purpose
 * ---------------------------------------------------------------------------
 * Not drawn in the scene. A health bar in three dimensions is a health bar that
 * has to be re-implemented for text layout, that cannot be selected or read by
 * a screen reader, and that costs a draw call to say a number. The runtime this
 * borrows the idea from does the same thing for the same reason.
 *
 * ---------------------------------------------------------------------------
 * Fed by a snapshot, not by the fight
 * ---------------------------------------------------------------------------
 * `Fight` is mutated in place sixty times a second - that is what makes the
 * simulation cheap - and React cannot see a mutation. So the frame loop lifts
 * the handful of numbers this needs into state at a much lower rate. Ten times
 * a second is plenty for a bar and a clock, and it is the difference between
 * this component rendering ten times a second and six hundred.
 */

export interface Readout {
  /**
   * Whether the other client is actually running, as `BoxingSession.connected`
   * answers it.
   *
   * Published on the HUD as `data-connected` for the same reason `data-gap` is:
   * it is the single fact that decides whether anything happens at all, and it
   * is invisible. A fight stuck in the walkout looks identical whether the cause
   * is a clock, a roster or a packet that never arrived - and the first question
   * worth asking is always this one.
   */
  connected: boolean
  phase: Fight['phase']
  round: number
  clock: number
  red: { name: string; health: number; stamina: number; downs: number }
  blue: { name: string; health: number; stamina: number; downs: number }
  cards: Fight['cards']
  verdict: Verdict | null
  mine: 'red' | 'blue'
  /** Who has said they are ready, and which body each was given. */
  ready: { red: boolean; blue: boolean }
  characters: { red: string; blue: string }
  /**
   * Metres between the two fighters, published for one reason: it is the only
   * number that decides whether a punch can land, and it is invisible.
   *
   * A health bar going down proves a hit; nothing on screen distinguishes *out
   * of range* from *blocked* from *the input never arrived*, and those are three
   * different bugs. `scripts/boxing-probe.mjs` reads it off `data-gap` below and
   * walks in until it is inside `reach` before it throws anything - which is the
   * difference between a probe that tests the game and one that tests whether a
   * boxer happened to be standing close enough.
   */
  gap: number
}

export function readoutOf(fight: Fight, mine: 'red' | 'blue', connected = false): Readout {
  return {
    connected,
    phase: fight.phase,
    round: fight.round,
    clock: fight.clock,
    red: side(fight.red),
    blue: side(fight.blue),
    cards: fight.cards,
    verdict: fight.verdict,
    mine,
    ready: { red: fight.red.ready, blue: fight.blue.ready },
    characters: { red: fight.red.character, blue: fight.blue.character },
    gap: Math.abs(fight.red.x - fight.blue.x),
  }
}

const side = (boxer: Fight['red']) => ({
  name: boxer.name,
  health: boxer.health,
  stamina: boxer.stamina,
  downs: boxer.downsThisRound,
})

/** `1:04`, and never `1:-1` - the clock is allowed to go a frame past zero. */
function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function Corner({
  fighter,
  corner,
  colour,
  align,
  you,
}: {
  fighter: Readout['red']
  /**
   * Which corner this is, published as `data-corner`.
   *
   * The bars are *labelled* by name, which is what a screen reader needs and
   * what a person reads. It is also not a key: two fighters can share a name -
   * see the note in `../net/session.ts` - and a caller that addressed them by
   * name would read the same bar twice without noticing. This is the stable
   * handle, and `scripts/boxing-probe.mjs` uses it for exactly that reason.
   */
  corner: 'red' | 'blue'
  colour: string
  align: 'left' | 'right'
  you: boolean
}) {
  const t = useWords()
  const health = Math.max(0, Math.min(1, fighter.health / MAX_HEALTH))
  const stamina = Math.max(0, Math.min(1, fighter.stamina / MAX_STAMINA))
  const right = align === 'right'

  return (
    <div className={`flex-1 ${right ? 'text-right' : 'text-left'}`} data-corner={corner}>
      <div
        className={`flex items-baseline gap-2 ${right ? 'flex-row-reverse' : 'flex-row'}`}
      >
        <span className="truncate text-sm font-medium text-white">{fighter.name}</span>
        {you ? (
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
            {t.seat.you}
          </span>
        ) : null}
        {/*
          A dot per knockdown this round. Not a number: three is the most there
          can be before the round is stopped, and three dots is read at a glance
          in a way "downs: 2" is not.
        */}
        {fighter.downs > 0 ? (
          <span className="flex gap-0.5" aria-label={say(t.aria.downs, { n: fighter.downs })}>
            {Array.from({ length: fighter.downs }, (_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            ))}
          </span>
        ) : null}
      </div>

      <div
        className="mt-1.5 h-3 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/10"
        role="meter"
        aria-valuenow={Math.round(fighter.health)}
        aria-valuemin={0}
        aria-valuemax={MAX_HEALTH}
        aria-label={say(t.aria.health, { name: fighter.name })}
      >
        <div
          className="h-full transition-[width] duration-200 ease-out"
          style={{
            width: `${health * 100}%`,
            backgroundColor: colour,
            marginLeft: right ? 'auto' : undefined,
          }}
        />
      </div>

      {/*
        Stamina under health and thinner, because it is the bar you watch and
        health is the bar you lose by. Amber rather than a second red: the two
        mean different things and a player glancing down has to tell them apart
        without reading a label.
      */}
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/5"
        role="meter"
        aria-valuenow={Math.round(fighter.stamina)}
        aria-valuemin={0}
        aria-valuemax={MAX_STAMINA}
        aria-label={say(t.aria.stamina, { name: fighter.name })}
      >
        <div
          className="h-full bg-amber-400/80 transition-[width] duration-100"
          style={{ width: `${stamina * 100}%`, marginLeft: right ? 'auto' : undefined }}
        />
      </div>
    </div>
  )
}

/**
 * The big word in the middle of the screen.
 *
 * ---------------------------------------------------------------------------
 * Why a game needs one
 * ---------------------------------------------------------------------------
 * Everything that decides this match happens somewhere the player is not
 * looking. The bell is a number in the corner going from 0:01 to 1:00; a
 * knockdown is a bar reaching zero and a sprite falling over at the far side of
 * the ring; the end of a round is both at once. A player watching their own
 * fighter - which is what a player does - misses all of it and then finds the
 * fight has moved on without them.
 *
 * So the four moments that change what you should be doing say so, once, in the
 * middle, where the fight is. Nothing else does: a callout for every landed
 * punch would be a screen nobody can see through, and the punches are already
 * legible in the bars and the bodies.
 */
export function Callout({ say }: { say: { text: string; sub?: string; at: number } | null }) {
  if (!say) return null
  return (
    <div
      // Keyed on the time as well as the words, so the same call twice - two
      // knockdowns in a round - replays the animation rather than sitting there.
      key={`${say.text}:${say.at}`}
      className="boxing-callout pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center"
      role="status"
    >
      <p className="font-pixel text-[clamp(2rem,9vw,4.5rem)] uppercase leading-none tracking-[0.06em] text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
        {say.text}
      </p>
      {say.sub ? (
        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-white/70">{say.sub}</p>
      ) : null}
    </div>
  )
}

export function Hud({
  readout,
  onAgain,
}: {
  readout: Readout
  /** Ask for a rematch, or take it back. */
  onAgain: (want: boolean) => void
}) {
  const t = useWords()
  const { phase, round, clock, verdict } = readout

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6"
      data-gap={readout.gap.toFixed(2)}
      data-phase={phase}
      data-connected={readout.connected ? 'yes' : 'no'}
      data-mine={readout.mine}
      data-clock={readout.clock.toFixed(2)}
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-4">
        <Corner
          fighter={readout.red}
          corner="red"
          colour="#ef4444"
          align="left"
          you={readout.mine === 'red'}
        />

        <div className="shrink-0 text-center">
          <div className="font-mono text-2xl font-semibold tabular-nums text-white sm:text-3xl">
            {clockOf(clock)}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/50">
            {phase === 'lobby'
              ? t.phase.lobby
              : phase === 'between'
                ? t.phase.rest
                : phase === 'walkout'
                  ? t.phase.walkout
                  : say(t.phase.round, { n: round, total: ROUNDS })}
          </div>
        </div>

        <Corner
          fighter={readout.blue}
          corner="blue"
          colour="#3b82f6"
          align="right"
          you={readout.mine === 'blue'}
        />
      </div>

      <div className="pointer-events-none mx-auto w-full max-w-3xl">
        {verdict ? (
          <Result
            verdict={verdict}
            mine={readout.mine}
            again={onAgain}
            ready={readout.ready[readout.mine]}
            opponentReady={readout.ready[readout.mine === 'red' ? 'blue' : 'red']}
          />
        ) : (
          <Controls />
        )}
      </div>
    </div>
  )
}

function Controls() {
  const t = useWords()
  return (
    <div className="boxing-keys flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-white/45">
      {CONTROLS.map(([key, what]) => (
        <span key={key} className="whitespace-nowrap">
          <kbd className="rounded border border-white/15 bg-white/5 px-1 font-mono text-[10px] text-white/70">
            {key}
          </kbd>{' '}
          {t.keys[what]}
        </span>
      ))}
    </div>
  )
}

function Result({
  verdict,
  mine,
  again,
  ready,
  opponentReady,
}: {
  verdict: Verdict
  mine: 'red' | 'blue'
  /** Ask for another. The same consent the lobby takes - see `restart`. */
  again: (want: boolean) => void
  ready: boolean
  opponentReady: boolean
}) {
  const t = useWords()
  const won = verdict.winner === mine
  const totals = verdict.cards.reduce(
    (sum, card) => ({ red: sum.red + card.red, blue: sum.blue + card.blue }),
    { red: 0, blue: 0 },
  )

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-white/10 bg-black/75 px-5 py-4 text-center backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
        {t.how[verdict.how]}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">
        {verdict.winner === null ? t.result.draw : won ? t.result.youWin : t.result.youLose}
      </p>
      {/*
        The cards, whether or not it went to them. A knockout in round two still
        has a card for round one, and showing it is what makes the scoring
        legible - most players will never otherwise learn that a knockdown is
        worth two points.
      */}
      {verdict.cards.length > 0 ? (
        <p className="mt-2 font-mono text-xs tabular-nums text-white/60">
          {totals.red} &ndash; {totals.blue}
          <span className="ml-2 text-white/35">
            {verdict.cards.map((card) => `${card.red}-${card.blue}`).join('  ')}
          </span>
        </p>
      ) : null}

      {/*
        Another one, agreed the same way the first was.

        Both corners have to ask, which is why this says what the other one has
        done rather than just sitting there: a button you have pressed that has
        not started anything is a button you press again.
      */}
      <button
        type="button"
        onClick={() => again(!ready)}
        className={`pointer-events-auto mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          ready
            ? 'bg-white/15 text-white/70 hover:bg-white/20'
            : 'bg-white text-neutral-900 hover:bg-white/90'
        }`}
      >
        {ready ? t.result.waiting : t.result.again}
      </button>
      {opponentReady && !ready ? (
        <p className="mt-2 text-[11px] text-white/50">{t.result.theyWantAnother}</p>
      ) : null}
    </div>
  )
}

/**
 * Before the bell: who is here, who has said yes, and a link to bring somebody.
 *
 * ---------------------------------------------------------------------------
 * Why a fight waits to be agreed to
 * ---------------------------------------------------------------------------
 * It used to start the instant a second client appeared. That is fine for a
 * level you wander into and wrong for this: a boxing match is decided in its
 * first ten seconds, and arriving three seconds late to your own is arriving
 * knocked down. So the walkout starts on consent rather than on arrival.
 *
 * ---------------------------------------------------------------------------
 * The fighter is assigned, not chosen
 * ---------------------------------------------------------------------------
 * A picker was the obvious next thing and is the wrong one *here*, for a reason
 * that is about the frame data rather than the interface: the two characters
 * are identical to fight with. `moves.ts` averages its reaches across both packs
 * precisely so the body you are given cannot decide the match. A picker would
 * therefore be a screen that asks a question with no wrong answer, in front of
 * somebody who came to fight.
 *
 * What is worth showing is *which one you got*, so the two of you can tell each
 * other apart in the ring. The corner decides it, and the corner is decided by
 * player id - see `../net/session.ts`.
 */
export function Lobby({
  readout,
  onReady,
  invite,
  connected,
}: {
  readout: Readout
  onReady: (ready: boolean) => void
  /** The URL that brings somebody into *this* fight. */
  invite: string
  /** Whether the other client is actually running. See `BoxingSession.connected`. */
  connected: boolean
}) {
  const t = useWords()
  const mine = readout.mine
  const theirs = mine === 'red' ? 'blue' : 'red'
  const iAmReady = readout.ready[mine]

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950/85 p-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">{t.lobby.beforeTheBell}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          {connected ? t.lobby.bothHere : t.lobby.waitingSomebody}
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Seat
            name={readout[mine].name}
            character={readout.characters[mine]}
            colour={mine === 'red' ? '#ef4444' : '#3b82f6'}
            ready={readout.ready[mine]}
            you
          />
          <Seat
            name={connected ? readout[theirs].name : t.lobby.empty}
            character={connected ? readout.characters[theirs] : null}
            colour={theirs === 'red' ? '#ef4444' : '#3b82f6'}
            ready={connected && readout.ready[theirs]}
          />
        </div>

        <button
          type="button"
          onClick={() => onReady(!iAmReady)}
          className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
            iAmReady
              ? 'bg-white/15 text-white/70 hover:bg-white/20'
              : 'bg-white text-neutral-900 hover:bg-white/90'
          }`}
        >
          {iAmReady ? t.lobby.ready : t.lobby.imReady}
        </button>

        {/*
          The invite is shown even when both corners are full, because a match
          that has not started yet is one somebody can still be swapped into -
          and because a link you have to leave the page to find is a link nobody
          sends.
        */}
        <Invite url={invite} />
      </div>
    </div>
  )
}

function Seat({
  name,
  character,
  colour,
  ready,
  you = false,
}: {
  name: string
  character: string | null
  colour: string
  ready: boolean
  you?: boolean
}) {
  const t = useWords()
  return (
    <div
      className="rounded-xl border px-3 py-3 text-left transition"
      style={{
        borderColor: ready ? colour : 'rgb(255 255 255 / 0.1)',
        background: ready ? `${colour}1a` : 'transparent',
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
        <span className="truncate text-sm font-medium text-white">{name}</span>
        {you ? <span className="text-[10px] uppercase text-white/40">{t.seat.you}</span> : null}
      </div>
      <p className="mt-1 font-mono text-[11px] capitalize text-white/45">
        {character ?? '—'}
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: ready ? colour : 'rgb(255 255 255 / 0.35)' }}>
        {ready ? t.seat.ready : t.seat.notReady}
      </p>
    </div>
  )
}

/**
 * A link that brings somebody into this fight.
 *
 * `navigator.clipboard` where there is one, and a selectable box either way -
 * the API needs a secure context and a permission, and neither is guaranteed.
 * A copy button that silently does nothing is worse than no button, so the URL
 * itself is always there to be read.
 */
function Invite({ url }: { url: string }) {
  const t = useWords()
  const [copied, setCopied] = useCopied()

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{t.lobby.invite}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/60"
        />
        <button
          type="button"
          className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-white/70 transition hover:bg-white/10"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? t.lobby.copied : t.lobby.copy}
        </button>
      </div>
    </div>
  )
}

/** A flag that goes back down on its own, so "copied" is not permanent. */
function useCopied(): readonly [boolean, (next: boolean) => void] {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  return [copied, setCopied] as const
}

/**
 * This tab is not the one you are looking at.
 *
 * ---------------------------------------------------------------------------
 * Why a whole screen for this
 * ---------------------------------------------------------------------------
 * A browser gives a hidden tab no `requestAnimationFrame`. Not a slow one -
 * none. So a fight opened in two tabs of the same window has exactly one
 * running client, and the other is frozen mid-stance.
 *
 * That is bad on its own and much worse here, because of who decides a punch
 * landed. The defender does - see `../rules/fight.ts` - so a frozen opponent
 * cannot be hit *at all*. The player who is looking at their screen walks in,
 * feels the other body, throws everything they have and lands none of it.
 *
 * It reads as broken collision. It was reported as broken collision twice. It is
 * a browser doing exactly what it is specified to do, and nothing anywhere said
 * so - which is what this screen is for.
 */
export function Backgrounded() {
  const t = useWords()
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
      <div className="max-w-sm text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{t.hidden.paused}</p>
        <h2 className="mt-1 text-lg font-medium text-white">{t.hidden.heading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{t.hidden.body}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/60">{t.hidden.comeBack}</p>
      </div>
    </div>
  )
}

/**
 * Whether this document is hidden, as a hook.
 *
 * `visibilitychange` rather than `blur`: a window that has lost focus but is
 * still on screen keeps its frame loop, and telling that player their fight was
 * paused would be a lie that covers a running game.
 */
export function useHidden(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof document === 'undefined') return () => {}
      document.addEventListener('visibilitychange', notify)
      return () => document.removeEventListener('visibilitychange', notify)
    },
    () => (typeof document !== 'undefined' ? document.hidden : false),
    () => false,
  )
}

/**
 * The other fighter has stopped sending.
 *
 * ---------------------------------------------------------------------------
 * Freezing without saying so is the worst of the three options
 * ---------------------------------------------------------------------------
 * A client that has not heard from its opponent for `HEARD_FOR` seconds stops
 * stepping the fight - it has to, because the defender decides whether a punch
 * landed and a fight against somebody who is not there is a fight against a
 * statue that cannot be hit.
 *
 * What it did *not* do was mention it. The round clock stopped, both fighters
 * stood still, and every key did nothing: indistinguishable from the game
 * having crashed, and reported as exactly that.
 *
 * Nothing is paused *for* the other player here - they are gone, and this is
 * their absence being drawn rather than a state anybody chose.
 */
export function Waiting({ name, silence }: { name: string; silence: number }) {
  const t = useWords()
  /**
   * A blip is a chip; an absence is a screen.
   *
   * ---------------------------------------------------------------------------
   * One threshold was one too few
   * ---------------------------------------------------------------------------
   * The first version drew the full panel the moment `connected()` went false,
   * which is `HEARD_FOR` - three seconds. On a good connection that is an
   * absence. On a phone it is *weather*: a Samsung on mobile data cycled in and
   * out roughly every nine seconds, and every cycle blacked out the fight,
   * announced that somebody was gone, and took it back.
   *
   * The pause underneath is not in question - the defender decides whether a
   * punch landed, so a fight against a client that is not sending is a fight
   * against a statue. What was wrong was shouting about it. So a short gap gets
   * a chip in the corner, which is honest and ignorable, and only a real
   * absence takes the screen.
   */
  const gone = silence >= LOST_FOR

  if (!gone) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center">
        <p className="rounded-full border border-amber-400/30 bg-black/70 px-3 py-1 font-mono text-[11px] text-amber-200/90 backdrop-blur">
          {t.away.reconnecting}
        </p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="max-w-sm text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{t.away.paused}</p>
        <h2 className="mt-1 text-lg font-medium text-white">{say(t.away.waitingFor, { name })}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          {say(t.away.silence, { n: Math.round(silence) })}
        </p>
      </div>
    </div>
  )
}

/**
 * Silence long enough to be worth a screen rather than a chip.
 *
 * Well over `HEARD_FOR`, deliberately: that number is when the *simulation* has
 * to stop, and this is when a person should be told. Tying them together is what
 * made a phone's ordinary hiccup look like an opponent walking out.
 */
const LOST_FOR = 8
