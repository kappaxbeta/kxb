/**
 * `@kxb/maumau/wire` - what goes over `XpSocket`, which is almost nothing.
 *
 * ---------------------------------------------------------------------------
 * One message, and it carries no game state at all
 * ---------------------------------------------------------------------------
 * `@kxb/boxing/wire` has five message types on three schedules, and it needs
 * every one of them: a jab is seventy milliseconds of startup, so a punch on
 * the 8Hz clock arrives after it has finished, and the whole game lives inside
 * one tick of the transport.
 *
 * This game has no such problem and must not pretend to. **Nothing here is
 * continuous**, so there is nothing to interpolate, nothing to predict and
 * nothing to reconcile. And the state that changes is *secret*, so it could not
 * go over this socket even if it were convenient: `XpSocket.send` goes to the
 * whole topic and `XpHost` says so in as many words - there is no such thing as
 * a private broadcast.
 *
 * So the only message is a **nudge**:
 *
 * | | when | what it carries |
 * |---|---|---|
 * | `MOVED` | the moment anybody's ask is agreed | a revision number, and nothing else |
 *
 * A client that hears it calls `XpArbiter.view()` and is told what *it* is
 * allowed to know. The card that was played, the hand it came from, whose turn
 * it is now - none of that is on the wire, and a future version of this file
 * that helpfully included the card "so the animation can start early" would be
 * the moment this game stopped keeping a secret.
 *
 * ---------------------------------------------------------------------------
 * The revision is what makes it safe to ignore
 * ---------------------------------------------------------------------------
 * Two nudges crossing, a nudge arriving after the view it was announcing, a
 * nudge lost entirely - all three happen, and all three are the same bug if the
 * message means "something changed, apply it". It does not mean that. It means
 * *the table is at least at revision N*, and a client that has already seen N
 * or better throws it away. Late, duplicated and out-of-order are then all the
 * same case, which is the property `@kxb/xp`'s `net/sharing.ts` calls sending
 * the whole picture rather than a delta - here reduced to its smallest form,
 * because the picture is not ours to send.
 *
 * ---------------------------------------------------------------------------
 * ...and a lost nudge is covered by a slow poll, not by a retry
 * ---------------------------------------------------------------------------
 * `XpSocket` promises nothing about delivery, by design. A card game whose only
 * signal was a broadcast that can be dropped is a card game that hangs on
 * somebody's turn with no error anywhere. So `./session.ts` also re-reads on a
 * slow timer - see `POLL_SECONDS` there - and the nudge is what makes it *feel*
 * immediate rather than what makes it work.
 */

export const MOVED = 'maumau:moved'

/**
 * The table has moved on. Re-read your view.
 *
 * `at` is the authority's own revision, taken from the `Outcome` of the ask
 * that caused it - never a clock. Two hosts' clocks are unrelated numbers (the
 * mistake `@kxb/boxing/wire` documents at length about `since`), and a
 * revision is the one number in this game that every client agrees about
 * because exactly one thing writes it.
 */
export interface Moved {
  at: number
}

export function readMoved(payload: unknown): Moved | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  /**
   * A real number, bounded, and not merely `typeof === 'number'`.
   *
   * `NaN` compares false against everything, so a `NaN` revision is a nudge
   * that is never newer than what we hold and never older either - a client
   * that stops updating without erroring. The same argument `@kxb/boxing/wire`
   * makes about a `NaN` position, arriving at a much smaller message.
   */
  if (typeof wire.at !== 'number' || !Number.isFinite(wire.at) || wire.at < 0) return null
  return { at: wire.at }
}
