/**
 * `@kxb/maumau/net` - one table, played over an `XpHost`.
 *
 * ---------------------------------------------------------------------------
 * The whole loop, in four lines
 * ---------------------------------------------------------------------------
 * 1. Ask the authority for something (`XpArbiter.ask`).
 * 2. If it agreed, nudge everybody on the socket (`MOVED`).
 * 3. On a nudge - or on the slow timer, or after our own ask - re-read
 *    (`XpArbiter.view`).
 * 4. Hand the caller what came back and let it draw.
 *
 * There is no simulation on this side. `../rules/table.ts` never runs in a
 * client at all except to grey out cards you cannot play, and that call is a
 * *prediction of a refusal* rather than a prediction of an outcome - if it is
 * wrong, the authority refuses and the view corrects the screen.
 *
 * That is a much smaller thing than `@kxb/boxing/net` and it is not a
 * simplification of the same design. Boxing predicts because it must: a
 * fighting game that waited a round trip for its own punch would be unplayable.
 * A card game does not have that problem, and buying responsiveness with
 * prediction here would cost the one thing this game cannot spend - the
 * authority being the only place a rule is decided.
 *
 * ---------------------------------------------------------------------------
 * Optimism is refused here, deliberately
 * ---------------------------------------------------------------------------
 * The project's habit is `useOptimistic` and snappy local state, and this is
 * the file that must not have it. A played card leaves your hand and lands in
 * the middle of a table four people are looking at; drawing it as done and
 * rolling it back when the authority disagrees would be a card that appears on
 * the discard pile and then un-appears - in front of everybody, in a game where
 * whether that card was played is the entire question.
 *
 * What the caller gets instead is `pending`: which ask is in flight, so the
 * card can be dimmed and the button disabled without anything being claimed.
 * `XpVerdict`'s three refusals are the reason that is enough - `lost` means
 * *we do not know*, and there is no honest optimistic rendering of that.
 */

import type { XpHost, XpPlayer, XpRefusal, XpSocket } from '@kxb/xp/host'

import type { Card, Suit } from '../rules/cards'
import { MIN_PLAYERS, readHouse, type House } from '../rules/house'
import type { Move } from '../rules/table'
import { DEAL, LEAVE, MOVE, READY, SIT, askTable, watch, type Outcome, type Watched } from './arbiter'
import { MOVED, readMoved } from './wire'

/**
 * How often to re-read without being told to.
 *
 * The floor under a lost nudge, and it is deliberately slow. `XpSocket`
 * promises nothing about delivery, so *something* has to catch the dropped
 * message; what must not happen is that catching it becomes the mechanism. At
 * four seconds a lost nudge is a pause somebody notices and shrugs at, and the
 * cost is one round trip per player per four seconds - which for a game that
 * turns every few seconds is nothing, and is exactly the trade
 * `docs/xp/server-authority.md` §4.1 describes as *"the speed a card game
 * turns, not sixty times a second"*.
 */
export const POLL_SECONDS = 4

/** What is in flight, so a caller can dim the right thing. */
export type Pending = 'sit' | 'ready' | 'deal' | 'move' | 'leave' | null

export interface MaumauSession {
  /** Who is at this keyboard. */
  readonly me: XpPlayer
  /**
   * The last thing the authority told us, or null before the first read.
   *
   * Replaced wholesale on every read rather than merged, which is what makes a
   * dropped nudge harmless: there is no accumulated local state for a missing
   * message to have left inconsistent.
   */
  readonly view: Watched | null
  /** Which ask is in flight. Null when nothing is. */
  readonly pending: Pending
  /**
   * Why the last ask did not happen, or null.
   *
   * Kept on the session rather than returned and forgotten, because the message
   * has to survive long enough to be drawn - and because `lost` is the one that
   * matters: an action nobody answered is unresolved, and the player has to be
   * told that rather than shown a table that quietly did not change.
   */
  readonly refusal: { why: XpRefusal; message: string } | null

  /**
   * Everybody on the topic, us included, whether or not they have taken a seat.
   *
   * "Us included" is what `XpSocket.peers` promises and what the realtime host
   * does. The memory host filters itself out, which is a disagreement between
   * the SDK's two implementations rather than something a game should have an
   * opinion about - so this composes the roster itself and is right on both.
   */
  peers(): XpPlayer[]

  sit(house?: Partial<House>): Promise<boolean>
  /** Say you are looking at the screen, or take it back. */
  ready(want?: boolean): Promise<boolean>
  deal(): Promise<boolean>
  play(card: Card, wish?: Suit, mau?: boolean): Promise<boolean>
  draw(): Promise<boolean>
  /** Say it after the card is down. See `Move`. */
  sayMau(): Promise<boolean>
  accuse(who: string): Promise<boolean>
  stand(): Promise<boolean>

  /** Re-read now, without being nudged. */
  refresh(): Promise<void>
  leave(): void
}

export interface MaumauOptions {
  host: XpHost
  topic: string
  /**
   * Called whenever anything the caller draws has changed.
   *
   * One callback for the whole session rather than an event stream, because
   * unlike a fight there are no *events* here - only a new picture. A renderer
   * that wanted to animate the card that moved compares the view it has against
   * the view it is given, which is a thing it can do and the wire cannot help
   * it with.
   */
  onChange?: (session: MaumauSession) => void
  /** Seconds. Injected so a test does not take four of them. */
  now?: () => number
}

export async function joinMaumau(options: MaumauOptions): Promise<MaumauSession> {
  const { host, topic, onChange } = options

  const me = (await host.identity.current()) ?? { id: 'anonymous', name: 'Anonymous' }

  /**
   * The socket is joined even though nothing important travels on it.
   *
   * Two things come off it that nothing else provides: the nudge, and the
   * roster. The roster is what lets a lobby say "three people are here, two of
   * them are sitting down" - which is a fact about the *room*, not about the
   * table, and the authority has no idea about it.
   */
  const socket: XpSocket = await host.network.join(topic)

  let view: Watched | null = null
  let pending: Pending = null
  let refusal: { why: XpRefusal; message: string } | null = null
  /** The highest revision we have been told about, heard or read. */
  let at = -1
  let alive = true
  /**
   * The handle, assigned once everything it names exists.
   *
   * `let` and nullable rather than a `const` at the bottom, so that `changed`
   * can ask whether it is there yet - see the note on that function.
   */
  let handle: MaumauSession | null = null

  /**
   * Tell the caller something moved.
   *
   * `handle` and not `session`, and the difference is the bug this comment
   * exists for: a `const` read before its initialiser has run throws rather
   * than being `undefined`, so a guard of `if (session)` would throw on the
   * guard. A `let` that starts as `null` can be *tested*, which is what makes
   * the one call that arrives during setup - see the note on the declarations
   * below - harmless instead of fatal.
   *
   * Dropping that call costs nothing: the caller is handed the session by the
   * promise this function returns, and reads everything on it then.
   */
  const changed = () => {
    if (alive && handle) onChange?.(handle)
  }

  async function refresh(): Promise<void> {
    const next = await watch(host)
    if (!alive) return
    view = next
    changed()
  }

  /**
   * Make an ask, and turn the verdict into a screen.
   *
   * Every ask in this file goes through here, which is what keeps the three
   * outcomes from being handled three different ways in six places. The nudge
   * is sent **only when the authority agreed**: broadcasting on a refusal would
   * have three other clients re-read a table that did not move, and on `lost`
   * it would announce something that may not have happened.
   */
  async function ask(kind: Exclude<Pending, null>, action: string, payload?: unknown) {
    pending = kind
    refusal = null
    changed()

    const verdict = await askTable<Outcome>(host, action, payload)
    if (!alive) return false

    pending = null

    if (!verdict.ok) {
      refusal = { why: verdict.why, message: verdict.message }
      /**
       * A stale ask re-reads; a refused one does not.
       *
       * `refused` means the rules said no, and the view we are holding is the
       * one those rules were applied to - re-reading would spend a round trip
       * to be told the same thing. `stale` means the table moved underneath us,
       * which is precisely a view worth replacing.
       */
      if (verdict.why === 'stale') await refresh()
      else changed()
      return false
    }

    at = Math.max(at, verdict.outcome.at)
    socket.send(MOVED, { at: verdict.outcome.at })
    await refresh()
    return true
  }

  function sit(house: Partial<House> = {}) {
    /**
     * Read on the way out as well as on the way in.
     *
     * The authority reads it again and is the one that decides - this is not a
     * check. It is so that what a client *believes* it asked for is the same
     * object the authority pins, rather than a partial that reaches
     * `readHouse` with a different set of defaults on the far side.
     */
    /**
     * Read against the smallest table, matching what the authority does.
     *
     * A client that clamped to the five-seat cap would ask for a smaller hand
     * than the player chose, and the authority - which clamps at the deal, when
     * it knows how many turned up - would never see the larger number. See
     * `maumauArbiter`'s `SIT`.
     */
    return ask('sit', SIT, readHouse(house, MIN_PLAYERS))
  }

  /**
   * Declarations rather than `const` arrows, every one of them.
   *
   * Hoisting is the point. The handle below is referenced by `changed`, which
   * is reached during *setup* - `socket.onPeers` calls its handler
   * synchronously with the room as it is now, so the very act of subscribing
   * fires one before this function has finished running. Anything the handle
   * names has to exist by then, and a `const` does not.
   *
   * That is not hypothetical and it is not something the tests found: the
   * memory socket announces inside `join`, before the caller can subscribe, so
   * it never fires that first call. The realtime one does - see `onPeers` in
   * `src/app/xp/_hosts/realtime.ts`, which is deliberate and documented there -
   * and the result was `Cannot access 'session' before initialization` on the
   * only host anybody actually plays on.
   */
  function ready(want = true) {
    return ask('ready', READY, { ready: want })
  }

  function deal() {
    return ask('deal', DEAL)
  }

  function stand() {
    return ask('leave', LEAVE)
  }

  function move(what: Move) {
    return ask('move', MOVE, what)
  }

  function play(card: Card, wish?: Suit, mau?: boolean) {
    return move({ kind: 'play', card, ...(wish ? { wish } : {}), ...(mau ? { mau } : {}) })
  }

  function draw() {
    return move({ kind: 'draw' })
  }

  function sayMau() {
    return move({ kind: 'mau' })
  }

  function accuse(who: string) {
    return move({ kind: 'catch', who })
  }

  /**
   * Somebody moved. Re-read - unless we already know at least this much.
   *
   * The revision test is what makes a duplicated or late nudge free, and it is
   * also what stops the common four-player case from being four round trips per
   * move: our own ask already refreshed and already recorded the revision, so
   * the nudge we hear back from nobody (the memory and realtime sockets both
   * decline to echo the sender) and the nudges the *other* three hear each cost
   * exactly one read.
   */
  const offMoved = socket.on(MOVED, (payload) => {
    const moved = readMoved(payload)
    if (!moved || moved.at <= at) return
    at = moved.at
    void refresh()
  })

  const offPeers = socket.onPeers(() => changed())

  /**
   * The floor under a dropped nudge. See `POLL_SECONDS`.
   *
   * `setInterval` and not a chain of timeouts, because a read that takes longer
   * than the interval should not stack: the guard is `pending`, which skips a
   * poll while an ask is already in flight and about to refresh anyway.
   */
  const timer = setInterval(() => {
    if (pending === null) void refresh()
  }, POLL_SECONDS * 1000)

  function leave(): void {
    alive = false
    clearInterval(timer)
    offMoved()
    offPeers()
    /**
     * The socket goes; the seat does not.
     *
     * Standing up is `stand()`, which is a deliberate act somebody takes. A tab
     * closing is not one - a reload, a tunnel, a phone locking - and giving up
     * a seat and a hand of cards on a dropped connection would mean a hand
     * ending because somebody went through a tunnel. They come back to their
     * cards.
     */
    socket.leave()
  }

  handle = {
    me,
    get view() {
      return view
    },
    get pending() {
      return pending
    },
    get refusal() {
      return refusal
    },
    peers: () => {
      const others = socket.peers().filter((peer) => peer.id !== me.id)
      return [me, ...others]
    },
    sit,
    ready,
    deal,
    play,
    draw,
    sayMau,
    accuse,
    stand,
    refresh,
    leave,
  }


  await refresh()
  return handle
}
