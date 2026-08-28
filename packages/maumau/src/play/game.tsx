'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { XpHost, XpPlayer } from '@kxb/xp/host'
import { ownerOf } from '@kxb/xp/owning'

import { rankOf, type Card, type Suit } from '../rules/cards'
import { MAX_PLAYERS, MIN_PLAYERS, readHouse, type House } from '../rules/house'
import { owesMau, playableIn, seatOf, type Seen } from '../rules/table'
import { finishOf, type FinishId } from '../art/deck'
import { joinMaumau, type MaumauSession, type Pending } from '../net/session'
import type { Watched } from '../net/arbiter'
import { Banner, Hand, Middle, Seats, Wish } from './table'
import { EN, WORDS, say, type Tongue, type Words } from './words'

/**
 * Mau-Mau for two to four, over an `XpHost`.
 *
 * ---------------------------------------------------------------------------
 * What this file is and is not
 * ---------------------------------------------------------------------------
 * The host half, and only that. Every rule lives in `@kxb/maumau` and runs
 * behind an authority; this reads a `Watched`, draws it, and calls back. If
 * something here is deciding whether a card may be played, it is in the wrong
 * file - the one exception being `playableIn`, which greys out cards and is
 * explicitly a *prediction of a refusal* rather than a decision.
 *
 * Everything from outside arrives as a prop. This names no app, imports no
 * `@/` and knows no URL, which is what makes "lift `packages/maumau` out and
 * drop it in another project" a true sentence rather than an aspiration.
 *
 * ---------------------------------------------------------------------------
 * The view lives in React state, unlike the fight
 * ---------------------------------------------------------------------------
 * `@kxb/boxing`'s game keeps its whole fight in a ref and lifts a snapshot out
 * ten times a second, because `stepFight` mutates the same object sixty times a
 * second and putting that in `useState` would be six hundred renders to move a
 * boxer sideways.
 *
 * There is nothing to be careful about here. A table changes when somebody
 * plays a card - a few times a minute - and every change is a whole new picture
 * from the authority. So it goes straight into state, and the render is the
 * whole of the drawing.
 *
 * ---------------------------------------------------------------------------
 * A jack is two taps, and the first one is local
 * ---------------------------------------------------------------------------
 * The one piece of genuinely local state below is `wishing`: the jack you have
 * tapped and not yet named a suit for. It is local because nothing has happened
 * yet - no ask has been made, the authority has not been told, and cancelling
 * puts the card back with nobody the wiser.
 *
 * That is the line this file keeps: local state for what a player is *in the
 * middle of doing*, and nothing at all for what they have done.
 *
 * ---------------------------------------------------------------------------
 * The table seats you, and any member deals
 * ---------------------------------------------------------------------------
 * `FrameProps.started` has three states, and the useful thing to know about
 * them here is that **none of them is a reason to draw nothing**.
 *
 * The version before this one read `null` as *you are not in a battle* and drew
 * a sentence saying so. That was wrong twice over. A match room reports `null`
 * in more situations than "there is no room" - which is how a cartridge opened
 * inside a real battle got the sentence instead of the game. And even where it
 * is literally true, refusing is the wrong answer: there is a topic, so there
 * is an instance, so there is an authority holding the deck. Everything needed
 * to play is already there.
 *
 * So the table is always drawn, and `started` decides only how the hand begins:
 *
 * | `started` | what happens |
 * |---|---|
 * | `null` / `false` | seated on arrival; the table deals when everybody is ready |
 * | `true` | seated, and the whistle deals for them |
 *
 * **The deal is not the host's, it is the table's.** A match room draws no
 * ready panel and no whistle for a framed XP - see `xp-match-room.tsx`, *"a
 * cartridge runs its own lobby, so this room no longer draws Join red and Join
 * blue"* - so a game that waited for one would wait for ever.
 *
 * ---------------------------------------------------------------------------
 * Sitting down is arriving; saying ready is not
 * ---------------------------------------------------------------------------
 * Nobody presses *join*. The room already decided who is in this match, and
 * making somebody take a second seat inside a game they are already in is the
 * step the match room removed for exactly this reason: *"arriving is taking a
 * seat, which is also what it feels like"*.
 *
 * Ready is the opposite, and is deliberately kept: it is the one moment where
 * somebody says *I am looking at the screen*. A hand dealt to a tab that is
 * still loading is a hand where the first player is already timing out, and the
 * cards are secret - you cannot glance over and see what they missed. So the
 * seats fill themselves and the hand waits for the people in them.
 *
 * **Who deals is an election with no messages in it** - `ownerOf`, the lowest
 * player id, the same rule `@kxb/xp/owning` argues for and boxing uses for the
 * round clock. It decides which client sends the `deal` once the table is
 * ready, so four clients do not send four.
  */

export interface MaumauGameProps {
  /**
   * Everything this game cannot supply for itself.
   *
   * `arbiter` is not optional in practice: the whole game is behind it. A host
   * without one draws a sentence saying so rather than dealing on a client -
   * see `../net/arbiter.ts`, and `needs: ['arbiter']` in the app's registry,
   * which is what makes the refusal arrive before this component loads.
   */
  host: XpHost
  /** The room. Everybody handed the same string is at the same table. */
  topic: string
  /** Where this game's own files are served from, with no trailing slash. */
  assets: string
  /** Whether something behind the game should show through. */
  transparent?: boolean
  /**
   * Whether the *platform* has already decided the match is on.
   *
   * Three states, and all three are handled - see `FrameProps.started`. `null`
   * means run our own lobby; `false` means somebody else has one and it has not
   * started; `true` means go. Boxing learned this the hard way, with two lobbies
   * drawn over each other, neither listening to the other.
   */
  started?: boolean | null
  /** The reader's language. The app passes this; see `./words.ts`. */
  tongue?: Tongue
  /**
   * Which deck art. `kaykit` by default; `pixel` for Kenney's.
   *
   * A prop and *not* a house rule, which is the distinction `../art/deck.ts`
   * argues at length: the house is pinned by the authority and a second player
   * who disagrees is refused, because a table has to be playing one game. Two
   * players looking at two different card backs are still playing the same
   * hand, so the arbiter never hears about this.
   */
  finish?: FinishId
  /** ...or a whole dictionary, for a host with a third language of its own. */
  words?: Words
  /**
   * The document's `frame.settings`, which for this game is the house rules.
   *
   * Read here rather than trusted: the authority reads them again and pins
   * whichever arrives first. See `../rules/house.ts` for why a card game may
   * have settings when a fighting game may not.
   */
  settings?: unknown
  /** What the *room* decided. `scoreLimit` is hands, not points. */
  match?: { timeLimit: number | null; scoreLimit: number | null }
}

export function MaumauGame({
  host,
  topic,
  assets,
  transparent = true,
  started = null,
  tongue,
  finish: finishId,
  words: given,
  settings,
  match,
}: MaumauGameProps) {
  const words = given ?? (tongue ? WORDS[tongue] : EN)

  const [session, setSession] = useState<MaumauSession | null>(null)
  /**
   * Everything the session holds, copied out on every change.
   *
   * A `MaumauSession` is a mutable handle with getters on it, so putting *it*
   * in state says nothing to React - it is the same object before and after.
   * The first version bumped a counter instead and read through the handle
   * during render, which worked and was wrong in a way the linter is right
   * about: every memo then had to list the counter as a dependency it did not
   * use, and a render could read a different value than the one that caused it.
   *
   * A flat copy of the four things this file draws is honest and is what makes
   * every dependency array below a real one. It is four fields a few times a
   * minute, which is not a cost worth avoiding.
   */
  const [snapshot, setSnapshot] = useState<{
    view: Watched | null
    pending: Pending
    refusal: { why: string; message: string } | null
    peers: XpPlayer[]
  }>({ view: null, pending: null, refusal: null, peers: [] })
  const [wishing, setWishing] = useState<Card | null>(null)
  const [mau, setMau] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)

  const house = useMemo(() => readHouse(settings, MAX_PLAYERS), [settings])
  /**
   * The prop wins, and the document is the fallback.
   *
   * Both are allowed to say it because they answer at different times: a
   * cartridge names the look it was authored with, and a host embedding this
   * game somewhere with its own art direction overrides it. `finishOf` falls
   * back to the default for anything it does not recognise rather than
   * refusing - a look is not a thing worth failing to start over.
   */
  const finish = useMemo(
    () =>
      finishOf(
        finishId ??
          (typeof settings === 'object' && settings !== null
            ? (settings as { finish?: unknown }).finish
            : undefined),
      ),
    [finishId, settings],
  )

  /**
   * Join once, and leave on the way out.
   *
   * `alive` rather than only the cleanup, because `joinMaumau` is asynchronous:
   * a component that unmounts while the join is in flight would otherwise set
   * state on a dead tree and, worse, leave a session holding a socket and an
   * interval that nothing has a reference to any more.
   */
  useEffect(() => {
    let alive = true
    let joined: MaumauSession | null = null

    joinMaumau({
      host,
      topic,
      onChange: (live) =>
        setSnapshot({
          view: live.view,
          pending: live.pending,
          refusal: live.refusal,
          peers: live.peers(),
        }),
    })
      .then((next) => {
        if (!alive) {
          next.leave()
          return
        }
        joined = next
        setSession(next)
      })
      .catch((reason: unknown) => {
        if (alive) setJoining(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      alive = false
      joined?.leave()
    }
  }, [host, topic])

  const { view, peers } = snapshot
  const seen: Seen | null = view?.seen ?? null
  const busy = snapshot.pending !== null

  /**
   * A name for an id, off the socket's roster.
   *
   * The roster and the seats are two different lists on purpose: the seats are
   * the authority's, and the names are the room's. Somebody who has closed
   * their tab still holds a seat - see `MaumauSession.leave` - and falling back
   * to a truncated id means their cards are still labelled rather than sitting
   * behind a blank.
   */
  const names = useCallback(
    (id: string) => peers.find((peer) => peer.id === id)?.name ?? id.slice(0, 8),
    [peers],
  )

  const playable = useMemo(() => (seen ? playableIn(seen) : []), [seen])

  const sitting = Boolean(view?.seats.includes(session?.me.id ?? ''))

  /**
   * Sit down and deal on the whistle, without anybody pressing anything.
   *
   * Guarded on `pending` as well as on the state it is trying to reach, because
   * an ask is a round trip and this effect re-runs on every view: without it,
   * four clients each fire a `sit` a dozen times while the first one is still
   * in flight. The authority answers the repeats harmlessly - a seat is taken
   * once however many times you ask - but they are a dozen round trips nobody
   * needed.
   */
  const dealer = view ? ownerOf(view.seats) : null
  const everybodyReady = Boolean(
    view &&
      view.seats.length >= MIN_PLAYERS &&
      view.seats.every((seat) => view.ready.includes(seat)),
  )

  useEffect(() => {
    // Unconditional on `started`: arriving is what seats you. See the header.
    if (!session || busy) return
    if (!sitting) {
      void session.sit(house)
      return
    }
    /**
     * A whistle says ready on your behalf.
     *
     * A room that has already started is a room where nobody should have to
     * press anything - the platform has said go. Where there is no whistle,
     * which for a framed XP is every match room, the button in the lobby is
     * how it gets said.
     */
    if (started === true && view && !view.ready.includes(session.me.id)) {
      void session.ready()
      return
    }
    if (!everybodyReady) return
    /**
     * The first hand, and every hand after it.
     *
     * A finished hand is not re-dealt out from under the table, because `ready`
     * is spent by the deal that used it - so the end of a hand leaves nobody
     * ready and this does nothing until everybody has said so again. That gate
     * is what lets the table look at who won for as long as it likes.
     *
     * It is also the fix for *Deal again* not working: that button asked for a
     * deal directly and was refused with *not everybody is ready*, which the
     * end-of-hand panel had nowhere to draw.
     */
    if ((seen === null || seen.phase === 'over') && dealer === session.me.id) {
      void session.deal()
    }
  }, [started, session, busy, sitting, seen, view, dealer, house, everybodyReady])
  const mine = seen ? seatOf(seen) === seen.me : false
  const over = seen?.phase === 'over'

  /**
   * Whether Mau can be said at all right now, and whether it has been armed.
   *
   * Derived rather than reset, which is the fix for a real bug as well as for a
   * lint rule. The declaration is only meaningful on the card that takes you to
   * one, so a toggle left switched on across a turn where you were made to draw
   * four would be a promise about a hand you no longer have - and an effect
   * that reset it would run *after* a render in which it was still true.
   *
   * `armed` is what every caller uses, so the stale value simply cannot be
   * read. `../rules/table.ts` recomputes `said` from the hand for the same
   * reason on the authority's side.
   */
  const canSayMau = Boolean(seen && seen.house.mau && seen.hand.length === 2 && mine && !over)
  const armed = mau && canSayMau
  /**
   * Down to one card and it has not been said.
   *
   * Drawn whether or not it is your turn, because by definition it is not: the
   * card is down and play has moved on. This is the button that was missing -
   * the only way to say Mau was to arm a toggle *before* playing, and a player
   * who forgot had no way back.
   */
  const owed = Boolean(seen && owesMau(seen))

  /**
   * How many hands win the sitting, from the room rather than from the game.
   *
   * `null` means one hand and stop, which is the honest default: a game whose
   * length is part of its design should not invent a mapping for a number
   * nobody set. See `FrameProps.match`.
   */
  const target = match?.scoreLimit ?? null

  const play = useCallback(
    async (card: Card) => {
      if (!session) return
      /**
       * A jack is held back for its suit; everything else goes straight out.
       *
       * The check is the rank and not `playable`, because a jack is playable on
       * almost anything - which is exactly why it is the card that needs a
       * second tap.
       */
      if (rankOf(card) === 'J') {
        setWishing(card)
        return
      }
      await session.play(card, undefined, armed)
      // Said once, on the card it was true of. See `armed`.
      setMau(false)
    },
    [session, armed],
  )

  const wish = useCallback(
    async (suit: Suit) => {
      if (!session || !wishing) return
      const card = wishing
      setWishing(null)
      await session.play(card, suit, armed)
      setMau(false)
    },
    [session, wishing, armed],
  )

  if (joining) {
    return <Middle_Message text={joining} transparent={transparent} />
  }
  if (!session || !view) {
    return <Middle_Message text={words.lobby.asking} transparent={transparent} />
  }
  if (!host.arbiter) {
    return <Middle_Message text={words.lobby.noDealer} transparent={transparent} />
  }

  const seats = view.seats
  const full = seats.length >= MAX_PLAYERS
  const enough = seats.length >= MIN_PLAYERS


  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden ${
        transparent ? 'bg-transparent' : 'bg-neutral-950'
      } text-white`}
    >
      {wishing ? <Wish words={words} onPick={wish} onCancel={() => setWishing(null)} /> : null}

      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">
          {words.title}
        </h2>
        <Score seen={seen} words={words} names={names} target={target} />
      </header>

      {seen ? (
        <>
          <div className="shrink-0 px-4 pt-4">
            <Seats
              seen={seen}
              finish={finish}
              assets={assets}
              words={words}
              names={names}
              busy={busy}
              onCatch={(who) => void session.accuse(who)}
            />
          </div>

          {/*
            `min-h-0`, and it is the whole reason the Mau button could not be
            found.

            A flex child's default `min-height: auto` refuses to shrink below
            its content, so this middle section kept its full height inside a
            frame that has a fixed one - and the footer, which is the hand and
            the button above it, was pushed past the bottom edge. It was drawn,
            it was in the DOM, and it was off the screen.
          */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
            <Middle
              seen={seen}
              finish={finish}
              assets={assets}
              words={words}
              busy={busy}
              canDraw={mine && !over}
              onDraw={() => void session.draw()}
            />
            <Banner seen={seen} words={words} names={names} refusal={refusalOf(snapshot.refusal, words)} busy={busy} />
          </div>

          {over ? (
            <Over
              seen={seen}
              words={words}
              names={names}
              busy={busy}
              ready={view.ready}
              seats={view.seats}
              onReady={(want) => void session.ready(want)}
              refusal={refusalOf(snapshot.refusal, words)}
            />
          ) : (
            <footer className="shrink-0 pb-5">
              {/*
                The Mau toggle sits above the hand and appears only on the turn
                it can be used - two cards, about to be one. A button that is
                always there is a button somebody presses at the wrong moment
                and then wonders why nothing happened.
              */}
              {/*
                Two ways to say it, drawn in the two moments they belong to.

                Owing it comes first and is the loud one: the card is already
                down, somebody can catch you, and this is a race. Arming it
                beforehand is the quiet one for a player who saw it coming - a
                toggle above the hand, no urgency, no race.
              */}
              {owed ? (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={() => void session.sayMau()}
                    disabled={busy}
                    /*
                      Solid amber with near-black on it, which is the one
                      treatment this project reserves for the urgent action:
                      `xp-match-room.tsx` dresses the whistle exactly this way
                      (`bg-amber-400 text-black hover:bg-amber-300`). Saying Mau
                      is the same kind of thing - a couple of seconds, and
                      somebody else is racing you for it - so it borrows the
                      same clothes rather than inventing a louder set.

                      `motion-safe:` on the pulse. The urgency is real, but a
                      reader who has asked for less movement has asked for less
                      movement, and the colour is already carrying it.
                    */
                    className="rounded-full bg-amber-400 px-8 py-2.5 text-base font-bold uppercase tracking-widest text-black shadow-lg shadow-amber-400/30 transition motion-safe:animate-pulse hover:bg-amber-300 disabled:opacity-50"
                  >
                    {words.table.sayMau}
                  </button>
                </div>
              ) : canSayMau ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setMau((armed) => !armed)}
                    aria-pressed={armed}
                    className={`rounded-full px-5 py-2 text-sm font-bold uppercase tracking-widest transition ${
                      armed
                        ? 'bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/50'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {words.table.sayMau}
                  </button>
                </div>
              ) : null}

              <Hand
                seen={seen}
                playable={playable}
                finish={finish}
                assets={assets}
                words={words}
                busy={busy}
                yours={mine}
                onPlay={(card) => void play(card)}
              />
            </footer>
          )}
        </>
      ) : (
        <Lobby
          words={words}
          names={names}
          seats={seats}
          house={view.house ?? house}
          me={session.me}
          sitting={sitting}
          ready={view.ready}
          everybodyReady={everybodyReady}
          onReady={(want) => void session.ready(want)}
          full={full}
          enough={enough}
          busy={busy}
          /*
            Always. Nothing else in a match room offers a way to start a framed
            game, so if this table does not deal, nothing does. See the header.
          */
          own
          refusal={refusalOf(snapshot.refusal, words)}
          onSit={() => void session.sit(house)}
          onStand={() => void session.stand()}
          onDeal={() => void session.deal()}
        />
      )}
    </div>
  )
}

/** A refusal, in the reader's language. See `say` in `./words.ts`. */
const refusalOf = (
  refusal: { why: string; message: string } | null,
  words: Words,
) => (refusal ? { why: refusal.why, message: say(words, refusal.message) } : null)

/** One sentence, centred, for the states where there is nothing else to draw. */
function Middle_Message({ text, transparent }: { text: string; transparent: boolean }) {
  return (
    <div
      className={`grid h-full w-full place-items-center px-6 text-center text-sm text-white/50 ${
        transparent ? 'bg-transparent' : 'bg-neutral-950'
      }`}
    >
      {text}
    </div>
  )
}

/**
 * Who is sitting down, and the two buttons that change it.
 *
 * Drawn from `seats` - the authority's list - rather than from the socket
 * roster, because being in the room and being at the table are different things
 * and this panel is about the second. The roster supplies the names and nothing
 * else.
 */
function Lobby({
  words,
  names,
  seats,
  house,
  me,
  sitting,
  ready,
  everybodyReady,
  onReady,
  full,
  enough,
  busy,
  own,
  refusal,
  onSit,
  onStand,
  onDeal,
}: {
  words: Words
  names: (id: string) => string
  seats: string[]
  house: House
  me: XpPlayer
  sitting: boolean
  ready: string[]
  everybodyReady: boolean
  onReady: (want: boolean) => void
  full: boolean
  enough: boolean
  busy: boolean
  own: boolean
  refusal: { why: string; message: string } | null
  onSit: () => void
  onStand: () => void
  onDeal: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-lg font-medium">
          {full
            ? words.lobby.full
            : seats.length <= 1
              ? seats.includes(me.id)
                ? words.lobby.alone
                : words.lobby.waiting
              : words.lobby.ready}
        </p>
        <p className="mt-1 text-xs uppercase tracking-widest text-white/35">
          {seats.length} / {MAX_PLAYERS}
        </p>
      </div>

      <ul className="flex flex-wrap justify-center gap-2">
        {seats.map((seat) => {
          const said = ready.includes(seat)
          return (
            <li
              key={seat}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                said ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-white/60'
              }`}
            >
              {/*
                A tick as well as a colour: "who are we waiting for" is the
                question this list exists to answer, and answering it only in
                green answers it for fewer people.
              */}
              <span aria-hidden>{said ? '✓' : '·'}</span>
              {names(seat)}
            </li>
          )
        })}
      </ul>

      {seats.length > 0 ? (
        <p className="text-xs uppercase tracking-widest text-white/35">
          {words.lobby.readyCount} {ready.length} / {seats.length}
        </p>
      ) : null}

      {refusal ? (
        <p role="status" className="rounded-full bg-rose-500/15 px-4 py-1.5 text-sm text-rose-200">
          {refusal.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {sitting ? (
          <>
            <button
              type="button"
              onClick={() => onReady(!ready.includes(me.id))}
              disabled={busy}
              aria-pressed={ready.includes(me.id)}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
                ready.includes(me.id)
                  ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/50'
                  : 'bg-white text-neutral-900 hover:bg-white/90'
              }`}
            >
              {ready.includes(me.id) ? words.lobby.notReady : words.lobby.imReady}
            </button>
            <button
              type="button"
              onClick={onStand}
              disabled={busy}
              className="rounded-full px-5 py-2.5 text-sm text-white/50 transition hover:text-white disabled:opacity-40"
            >
              {words.lobby.stand}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSit}
            disabled={busy || full}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-40"
          >
            {words.lobby.sit}
          </button>
        )}

        {/*
          The deal is ours only when nobody outside is running a lobby. A battle
          room has its own whistle, and a second start button beside it is the
          exact failure `FrameProps.started` was given a third state to prevent.
        */}
        {/*
          The deal, once the table is ready. Drawn only then rather than drawn
          disabled: a disabled button is a thing somebody presses and learns
          nothing from, and the seat list above is already saying who is being
          waited for.
        */}
        {own && sitting && enough && everybodyReady ? (
          <button
            type="button"
            onClick={onDeal}
            disabled={busy}
            className="rounded-full bg-emerald-400/20 px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-emerald-100 ring-1 ring-emerald-300/50 transition hover:bg-emerald-400/30 disabled:opacity-40"
          >
            {words.lobby.deal}
          </button>
        ) : null}
      </div>

      {sitting && enough && !everybodyReady ? (
        <p className="text-xs text-white/35">{words.lobby.waitingForReady}</p>
      ) : null}

      <p className="text-[11px] uppercase tracking-widest text-white/25">
        {house.deck === 'full' ? '52' : '32'} · {house.hand}
      </p>
    </div>
  )
}

/**
 * The end of a hand, and the way into the next one.
 *
 * The way in is *ready*, not *deal*, and that is the correction. This panel
 * used to offer a Deal again button that asked the authority directly - and got
 * *not everybody is ready* back every time, because the deal that started this
 * hand spent everybody's. The button did nothing and said nothing.
 *
 * Saying ready is the honest control: it is the thing this player can actually
 * do, and the hand starts on its own when the last person says it.
 */
function Over({
  seen,
  words,
  names,
  busy,
  ready,
  seats,
  onReady,
  refusal,
}: {
  seen: Seen
  words: Words
  names: (id: string) => string
  busy: boolean
  ready: string[]
  seats: string[]
  onReady: (want: boolean) => void
  refusal: { why: string; message: string } | null
}) {
  const won = seen.winner === seen.me
  const said = ready.includes(seen.me)

  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-8 text-center">
      <p className={`text-xl font-semibold ${won ? 'text-emerald-300' : 'text-white/80'}`}>
        {won ? words.over.youWon : `${words.over.won} ${names(seen.winner ?? '')}`}
      </p>

      {refusal ? (
        <p role="status" className="rounded-full bg-rose-500/15 px-4 py-1.5 text-sm text-rose-200">
          {refusal.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onReady(!said)}
        disabled={busy}
        aria-pressed={said}
        className={`rounded-full px-6 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
          said
            ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/50'
            : 'bg-white text-neutral-900 hover:bg-white/90'
        }`}
      >
        {said ? words.lobby.notReady : words.lobby.dealAgain}
      </button>

      <p className="text-xs uppercase tracking-widest text-white/35">
        {words.lobby.readyCount} {ready.length} / {seats.length}
      </p>
    </div>
  )
}

/**
 * The running score, in hands won.
 *
 * Only drawn once somebody has won one, because a row of zeroes before the
 * first hand is noise - and only drawn at all when there is more than one hand
 * to play for, which `target` says.
 */
function Score({
  seen,
  words,
  names,
  target,
}: {
  seen: Seen | null
  words: Words
  names: (id: string) => string
  target: number | null
}) {
  const wins = Object.entries(seen?.wins ?? {}).filter(([, count]) => count > 0)
  if (wins.length === 0) return null

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
      {wins.map(([seat, count]) => (
        <span key={seat}>
          <span className="text-white/70">{names(seat)}</span> {count}
          {target ? `/${target}` : ''}
        </span>
      ))}
      <span className="uppercase tracking-widest text-white/25">{words.over.hands}</span>
    </p>
  )
}
