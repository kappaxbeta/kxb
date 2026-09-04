'use client'

/**
 * "The purse moved" - as a browser event, so a number drawn in one place can be
 * told about a coin spent in another.
 *
 * ---------------------------------------------------------------------------
 * The problem this exists for
 * ---------------------------------------------------------------------------
 * `PurseRail` reads the balance once when it mounts and never again, and the
 * note beside it argues that honestly: `requireTenant` writes cookies, so a
 * polled server action re-renders the page around whatever is on it - and
 * around a live canvas that means tearing the scene down. Somebody paying you
 * while you are looking not updating the number was "the honest cost of not
 * polling".
 *
 * That cost was small when the purse changed in one place. It is not small now.
 * The café is the mint, the rail sits beside it, and a shift changes the
 * balance every few seconds - so the rail spent the whole session showing
 * whatever the number was when the page loaded. Two numbers for one purse on
 * one screen, which reads as a bug because it is one.
 *
 * ---------------------------------------------------------------------------
 * A signal, not a poll
 * ---------------------------------------------------------------------------
 * Nothing here fetches anything or runs on a timer. Whoever *causes* a movement
 * says so; whoever *draws* the number listens and re-reads once. No round trip
 * happens unless a coin actually moved, so the canvas is never re-rendered on a
 * schedule and the failure the original note was avoiding cannot come back.
 *
 * A window event rather than a React context, because the two ends are in
 * different trees: the rail is in the space layout and the café is a canvas
 * mounted inside a route under it, and threading a provider between them would
 * mean every future earner has to be inside it too.
 *
 * ---------------------------------------------------------------------------
 * In `src/app`, not `src/domain`
 * ---------------------------------------------------------------------------
 * It started next to the rest of the economy and the lint rule was right to
 * refuse it: `src/domain` is not browser code, and this is nothing but browser
 * code. There is no rule here and no decision about money - only a way for two
 * parts of one page to agree on a number that has already been decided
 * elsewhere.
 */

const MOVED = 'kxb:purse-moved'

/**
 * Say what the balance now is.
 *
 * ---------------------------------------------------------------------------
 * The number travels with the signal, and that is the whole design
 * ---------------------------------------------------------------------------
 * The first version of this carried no number and listeners re-read from the
 * server. That was wrong in exactly the way the original note predicted: a
 * café shift moves the purse every few seconds, each movement triggered a
 * `readPurse`, and `requireTenant` writes cookies - so every customer served
 * re-rendered the page **around a live canvas**. The café stuttered.
 *
 * So the number comes with the event. A scene that changed the balance already
 * knows what it is - it is drawing it - and passing it costs nothing. No fetch,
 * no server action, no re-render of anything but the one number.
 *
 * `coins` may be omitted by a caller that genuinely does not know (a transfer
 * confirmed by a server action, say). Listeners then re-read, which is the slow
 * path and is fine because those are the rare ones - somebody pressing a button
 * once, never a scene running at sixty frames a second.
 */
export function notePurseMoved(coins?: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MOVED, { detail: { coins } }))
}

/**
 * Be told. Returns the unsubscribe, for an effect's cleanup.
 *
 * `coins` is the new balance when the caller knew it, and `undefined` when it
 * did not - in which case the listener has to go and look. Keeping the two
 * apart is what stops the common case (a scene) from costing a round trip and
 * lets the rare case (a button) stay correct.
 */
export function onPurseMoved(run: (coins: number | undefined) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handle = (event: Event) => {
    const detail = (event as CustomEvent<{ coins?: number }>).detail
    run(typeof detail?.coins === 'number' ? detail.coins : undefined)
  }

  window.addEventListener(MOVED, handle)
  return () => window.removeEventListener(MOVED, handle)
}
